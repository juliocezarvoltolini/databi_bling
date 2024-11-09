import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import Bling from 'bling-erp-api';
import { IGetResponse } from 'bling-erp-api/lib/entities/contatos/interfaces/get.interface';
import {
  catchError,
  concatMap,
  firstValueFrom,
  from,
  interval,
  map,
  Observable,
  of,
  switchMap,
  tap,
  timer,
} from 'rxjs';
import { ControleImportacaoService } from 'src/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { logger } from 'src/logger/winston.logger';
import { PessoaEndereco } from 'src/pessoa/entities/pessoa-endereco.entity';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { PessoaService } from 'src/pessoa/pessoa.service';
import { ProdutoService } from 'src/produto/produto.service';
import { setTimeout } from 'timers/promises';
import { QueryFailedError } from 'typeorm';

interface ITaskResult<T> {
  retorno: T;
  task: ITask<T>;
}

export interface ITask<T> {
  taskName: string;
  execute(): Observable<ITaskResult<T>>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) =>
    (setTimeout as unknown as (handler: () => void, timeout: number) => number)(
      resolve,
      ms,
    ),
  );
}

@Injectable()
export class ImportCliente implements OnModuleInit {
  private blingService: Bling;

  constructor(
    private readonly service: AuthBlingService,
    private readonly pessoaService: PessoaService,
    private readonly controleImportacaoService: ControleImportacaoService,
  ) {}

  onModuleInit() {
    this.iniciar();
  }

  async iniciar() {
    let controleImportacao: ControleImportacao;
    this.controleImportacaoService
      .find({ tabela: 'pessoa' })
      .pipe(
        switchMap((consulta) => {
          if (consulta.length > 0) {
            controleImportacao = consulta[0];
            console.log('Pesquisou e encontrou no banco: ', consulta);
          } else {
            controleImportacao = new ControleImportacao();
            controleImportacao.tabela = 'pessoa';
            controleImportacao.pagina = 0;
          }

          controleImportacao.pagina = controleImportacao.pagina + 1;
          console.log('VAI PESQUISAR PÁGINA ', controleImportacao.pagina);
          return this.execute(controleImportacao.pagina);
        }),
      )
      .subscribe({
        next: (value: Pessoa) => {
          console.log(
            `Item processado com sucesso. ID:${value.id} - NOME: ${value.nome}`,
          );
        },
        error: (err) => {
          if (err.name == 'zero') {
            console.log('Todas as páginas foram consluídas.');
          } else {
            console.error('Erro durante o processamento:', err);
          }
        },
        complete: () => {
          console.log(
            `Página ${controleImportacao.pagina} processada com sucesso.`,
          );
          this.controleImportacaoService.repository
            .save(controleImportacao)
            .then(
              (ret) => this.iniciar(), // Processa a próxima página
            );
        },
      });
  }

  execute(contador: number): Observable<Pessoa | Pessoa[]> {
    try {
      return from(this.service.getAcessToken()).pipe(
        switchMap((token) => {
          this.blingService = new Bling(token);
          console.log('Criou o serviço Bling.');

          return timer(1000).pipe(
            switchMap(() => {
              return from(
                this.blingService.contatos.get({ pagina: contador }),
              ).pipe(
                switchMap((response) => {
                  if (response.data.length > 0) {
                    return this.Salvar(response);
                  } else {
                    const erro = new Error(
                      'Não há mais contatos para processar.',
                    );
                    erro.name = 'zero';
                    throw erro;
                  }
                }),
                catchError((err) => {
                  if (err.name === 'zero') {
                    throw err;
                  } else {
                    console.log(err);
                    return timer(10000).pipe(
                      switchMap(() => {
                        return this.execute(contador);
                      }),
                    );
                  }
                }),
              );
            }),
          );
        }),
      );
    } catch (error) {
      console.error('Erro durante a execução:', error);
    }
  }

  private Salvar(response: IGetResponse) {
    return from(response.data).pipe(
      // Processa cada item serializadamente
      concatMap((item) =>
        timer(500).pipe(
          // Adiciona um atraso de 500ms entre cada item
          switchMap(() =>
            from(this.blingService.contatos.find({ idContato: item.id })),
          ),
          switchMap((response) => {
            const contato = response.data;
            const pessoa = this.mapearContatoParaPessoa(contato);

            return from(this.pessoaService.create(pessoa)).pipe(
              catchError((err) => {
                console.log(
                  '=======================Ocorreu um erro ',
                  err.message,
                );
                if (
                  err.message.includes('duplicate key') ||
                  err.message.includes(
                    'duplicar valor da chave viola a restrição de unicidade',
                  )
                ) {
                  // Trata erros de chave duplicada
                  const pessoaFilter = this.criarFiltroPessoa(pessoa);
                  return this.pessoaService.find(pessoaFilter).pipe(
                    switchMap((consulta) => {
                      if (consulta.length > 0) {
                        pessoa.id = consulta[0].id;
                      }
                      pessoa.enderecos = [];
                      return of(pessoa); // Continua o fluxo
                    }),
                  );
                }
                // Para outros erros, apenas retorna a pessoa sem alteração
                return of(pessoa);
              }),
            );
          }),
        ),
      ),
    );
  }

  private mapearContatoParaPessoa(contato: any): Pessoa {
    const pessoa = new Pessoa();

    if (contato.tipo === 'F') {
      pessoa.tipoPessoa = 'F';
      pessoa.sexo = contato?.dadosAdicionais.sexo;
      if (contato.dadosAdicionais.dataNascimento !== '0000-00-00') {
        const partes = contato?.dadosAdicionais.dataNascimento.split('-');
        pessoa.dataNascimento = new Date(
          parseInt(partes[0]),
          parseInt(partes[1]) - 1,
          parseInt(partes[2]),
        );
      }
      pessoa.naturalidade = contato?.dadosAdicionais.naturalidade;
    } else {
      pessoa.tipoPessoa = 'J';
    }

    pessoa.idOriginal = contato.id + '';
    pessoa.nome = contato.nome;
    pessoa.fantasia = contato.fantasia;
    pessoa.inscricaoEstadual = contato.ie;
    pessoa.indicadorInscricaoEstadual = contato.indicadorIe;
    pessoa.numeroDocumento = contato.numeroDocumento;
    pessoa.numeroDocumento =
      pessoa.numeroDocumento.length == 0 ? null : pessoa.numeroDocumento;
    pessoa.rg = contato.rg;
    pessoa.rg = pessoa.rg.length === 0 ? null : pessoa.rg;
    pessoa.email = contato.email;
    pessoa.orgaoEmissor = contato.orgaoEmissor;
    pessoa.situacao = contato.situacao === 'A' ? 1 : 0;

    const endereco = new PessoaEndereco();
    endereco.cep = contato.endereco.geral.cep;
    endereco.bairro = contato.endereco.geral.bairro;
    endereco.municipio = contato.endereco.geral.municipio;
    endereco.uf = contato.endereco.geral.uf;
    endereco.complemento = contato.endereco.geral.complemento;
    endereco.numero = contato.endereco.geral.numero;

    pessoa.enderecos = [endereco];

    return pessoa;
  }

  private criarFiltroPessoa(pessoa: Pessoa): any {
    const pessoaFilter: any = {};
    if (pessoa.numeroDocumento?.length > 0) {
      pessoaFilter['numeroDocumento'] = pessoa.numeroDocumento;
    }
    if (pessoa.rg?.length > 0) {
      pessoaFilter['rg'] = pessoa.rg;
    }
    return pessoaFilter;
  }
}

// @Injectable()
// export class ImportProdutos {
//     private blingService: Bling;
//     constructor(private readonly service: AuthBlingService) {

//     }

//     async execute() {
//         const token = await this.service.getAcessToken()
//         this.blingService = new Bling(token);
//         let repeat = true;
//         let contador = 1;
//         while (repeat) {
//             const response = await this.blingService.produtos.get({ pagina: contador });
//             response.data.forEach(() => {

//             })
//             contador++;
//         }

//     }

// }

@Injectable()
export class TesteTask {
  taskName: string;

  constructor(private readonly service: AuthBlingService) {
    console.log('criou');
  }
  // @Interval(5000)
  async execute() {
    this.service.getAcessToken().then(
      (value) => {
        console.log('DEU CERTO: ', value);
      },
      (error) => {
        console.log('Erro: ', error);
      },
    );
  }
}

export class ManagerTask {
  private observable: Observable<ITaskResult<any>>;

  constructor(private readonly tasks: ITask<any>[]) {
    this.tasks = [];
  }

  addTask(task: ITask<any>) {
    this.tasks.push(task);
  }

  start(): Observable<any> {
    this.observable = interval(60000).pipe(
      switchMap(() => {
        return from(this.tasks).pipe(
          concatMap((task) => {
            return task.execute().pipe(
              catchError((error) => {
                throw {
                  taskName: task.taskName,
                  message: error.message,
                  stack: error.stack,
                };
              }),
            );
          }),
        );
      }),
    );

    this.observable.subscribe({
      next: (value) => {
        logger.log('info', 'Tarefa %s concluída com sucesso.', [
          value.task.taskName,
        ]);
      },
      error: (erro) => {
        logger.error(
          `Falha ao executar a tarefa ${erro.taskName}: ${erro.message}`,
          {
            stack: erro.stack,
          },
        );
      },
    });

    return this.observable;
  }
}
