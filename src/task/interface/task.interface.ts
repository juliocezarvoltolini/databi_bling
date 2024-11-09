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
import { IUF } from 'src/common/types/uf.types';
import { Assigned } from 'src/common/util/object/object.util';
import { ControleImportacaoService } from 'src/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { logger } from 'src/logger/winston.logger';
import { PessoaEndereco } from 'src/pessoa/entities/pessoa-endereco.entity';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { PessoaService } from 'src/pessoa/pessoa.service';
import { ProdutoService } from 'src/produto/produto.service';
import { setTimeout } from 'timers/promises';
import { DataSource, QueryFailedError, SelectQueryBuilder } from 'typeorm';

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
    @Inject('DATA_SOURCE') private dataSource: DataSource,
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
          logger.info(
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
                    return this.SalvarResposta(response);
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

  private RemoverEndereco(pessoa: Pessoa): Observable<any> {
    let enderecos = pessoa.enderecos.map((end) => {
      return end.id;
    });
    if (enderecos.length > 0)
      return from(
        this.dataSource.manager.getRepository(PessoaEndereco).delete(enderecos),
      );
    else return of(null);
  }

  private SalvarResposta(response: IGetResponse) {
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

            return this.Salvar(pessoa);
          }),
        ),
      ),
    );
  }

  private Salvar(pessoa: Pessoa): Observable<Pessoa> {
    return from(this.pessoaService.repository.save(pessoa)).pipe(
      catchError((err) => {
        logger.warn(`Erro ao persitir entidade Pessoa(DOC:${pessoa.numeroDocumento} / 
          RG:${pessoa.rg} / idOriginal:${pessoa.idOriginal}). Motivo: ${err.message}` );
        if (
          err.message.includes('duplicate key') ||
          err.message.includes(
            'duplicar valor da chave viola a restrição de unicidade',
          )
        ) {
          const pessoaFilter = this.criarFiltroPessoa(pessoa);

          return from(pessoaFilter.getMany()).pipe(
            switchMap((consulta) => {
              if (consulta.length > 0) {
                pessoa.id = consulta[0].id;
                logger.info('Salvar novamente com id ', pessoa.id);

                if (consulta[0].enderecos)
                  if (consulta[0].enderecos.length > 0) {
                    this.RemoverEndereco(consulta[0]).subscribe();
                  }

                // Certifique-se de que os endereços estão associados corretamente
                if (pessoa.enderecos?.length > 0) {
                  pessoa.enderecos = pessoa.enderecos.map((end) => {
                    end.pessoa = pessoa; // Associa o endereço à pessoa
                    return end;
                  });
                }

                // Salva novamente com a referência correta
                return this.Salvar(pessoa);
              } else {
                return of(pessoa);
              }
            }),
          );
        }
        // Para outros erros, apenas retorna a pessoa sem alteração
        return of(pessoa);
      }),
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
    const cep = (contato.endereco.geral.cep as string)
      .replace(/\D/g, '')
      .trim();
    const municipio = (contato.endereco.geral.municipio as string).trim();
    const uf = (contato.endereco.geral.uf as string).trim();

    if (municipio.length > 0 && uf.length > 0) {
      const endereco = new PessoaEndereco();
      endereco.cep = cep;
      endereco.bairro = contato.endereco.geral.bairro;
      endereco.municipio = municipio;
      endereco.uf = uf as IUF;
      endereco.complemento = contato.endereco.geral.complemento;
      endereco.numero = contato.endereco.geral.numero;

      pessoa.enderecos = [endereco];
    } else {
      pessoa.enderecos = [];
    }

    return pessoa;
  }

  private;
  criarFiltroPessoa(pessoa: Pessoa): SelectQueryBuilder<Pessoa> {
    let select = this.pessoaService.repository
      .createQueryBuilder('p')
      .orWhere('p.id_original = :idOriginal', {
        idOriginal: pessoa.idOriginal,
      });
    if (pessoa.numeroDocumento && pessoa.numeroDocumento.length > 0) {
      select.orWhere('p.numero_documento = :numeroDocumento', {
        numeroDocumento: pessoa.numeroDocumento,
      });
    }

    if (pessoa.rg && pessoa.rg.length > 0) {
      select.orWhere('p.rg = :rg', { rg: pessoa.rg });
    }

    return select;
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
