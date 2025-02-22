import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as PessoaBling } from 'bling-erp-api/lib/entities/contatos/interfaces/get.interface';
import { IFindResponse as PessoasBling } from 'bling-erp-api/lib/entities/contatos/interfaces/find.interface';

import {
  catchError,
  concatMap,
  EMPTY,
  forkJoin,
  from,
  map,
  Observable,
  of,
  switchMap,
  tap,
  timer,
} from 'rxjs';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';
import { logger } from 'src/logger/winston.logger';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { PessoaEndereco } from 'src/pessoa/entities/pessoa-endereco.entity';
import { IUF } from 'src/common/types/uf.types';
import { Fornecedor } from 'src/fornecedor/entities/fornecedor.entity';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class PessoaImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
  ) {
    this.tabela = 'pessoa';
  }

  onModuleInit() {
    // this.iniciar();
  }

  private iniciar() {
    let controle: ControleImportacao;
    let blingService: Bling;

    forkJoin({
      controle: this.buscarControle(),
      acessToken: from(this.service.getAcessToken()),
    })
      .pipe(
        switchMap((values) => {
          blingService = new Bling(values.acessToken);
          controle = values.controle;
          return this.processarPagina(blingService, controle);
        }),
      )
      .subscribe({
        next: (value) => {
          logger.info(`[PessoaImportacao] Item processado com sucesso. ID:${value.id} - NOME: ${value.nome}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('[PessoaImportacao] Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(blingService: Bling, controle: ControleImportacao): Observable<Pessoa> {
    return this.buscarPagina(controle, blingService).pipe(
      switchMap((lista) => {
        const itensRestantes =
          lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : EMPTY;
        logger.info(`[PessoaImportacao] Página ${controle.pagina} Regitros: ${lista.data.length}`);
        return from(itensRestantes);
      }),
      concatMap((contaBling) =>
        timer(350).pipe(concatMap(() => this.buscarESalvar(contaBling.id, blingService))),
      ),
      tap(() => {
        let index = controle.ultimoIndexProcessado + 1;
        logger.info(`[PessoaImportacao] INDEX ${index}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`[PessoaImportacao] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[PessoaImportacao] Próxima página.`);
      this.atualizarControle(controle, 'pagina')
        .pipe(map(() => this.iniciar()))
        .subscribe();
    } else {
      logger.info(`[PessoaImportacao] Busca finalizada.`);
    }
  }

  private buscarPagina(controle: ControleImportacao, blingService: Bling): Observable<PessoaBling> {
    logger.info(`[PessoaImportacao] Buscando página ${controle.pagina}`);
    return from(
      blingService.contatos.get({
        pagina: controle.pagina,
        limite: 100,
      }),
    ).pipe(
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(
            `[PessoaImportacao] Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`,
          );
          return timer(TIMER_DELAY_MS).pipe(
            switchMap(() => this.buscarPagina(controle, blingService)),
          );
        } else {
          throw new Error(
            `[PessoaImportacao] Não foi possível pesquisar a página ${controle}. Motivo: ${err.message} `,
          );
        }
      }),
    );
  }

  buscarItem(id: number, blingService: Bling): Observable<PessoasBling> {
    logger.info(`[PessoaImportacao] Buscando item ${id}`);
    return from(blingService.contatos.find({ idContato: id })).pipe(
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(`[PessoaImportacao] Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
          return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, blingService)));
        } else {
          throw new Error(`[PessoaImportacao] Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `);
        }
      }),
      // tap((value => {
      //   console.log('Pessoa: ' + JSON.stringify(value))
      // }))
    );
  }

  buscarESalvar(id: number, blingService: Bling): Observable<Pessoa> {
    return this.buscarItem(id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  salvarItem(modeloBling: PessoasBling, blingService: Bling): Observable<Pessoa> {
    const repo = this.dataSource.getRepository(Pessoa);
    logger.info(`[PessoaImportacao] Salvando ${this.tabela} ${modeloBling.data.id} - ${modeloBling.data.nome}`);
    return this.selecionaOuAssina(repo, modeloBling).pipe(
      switchMap((conta) => {
        if (conta.id) return of(conta);
        else return from(repo.save(conta));
      }),
    );
  }

  selecionaOuAssina(repo: Repository<Pessoa>, modeloBling: PessoasBling): Observable<Pessoa> {
    return from(
      repo.findOne({
        where: { idOriginal: modeloBling.data.id.toFixed(0) },
        relations: ['enderecos'],
      }),
    ).pipe(
      switchMap((pessoa) => {
        if (!pessoa) {
          pessoa = new Pessoa();
          pessoa.idOriginal = modeloBling.data.id.toFixed(0);
        } else {
          logger.info('[PessoaImportacao] Encontrou a pessoa');
        }

        // Atualize ou preencha os dados de 'pessoa' conforme o modeloBling
        pessoa.identificador = modeloBling.data.codigo;
        pessoa.nome = modeloBling.data.nome;
        pessoa.fantasia = modeloBling.data.fantasia;
        pessoa.inscricaoEstadual = modeloBling.data.ie;
        pessoa.indicadorInscricaoEstadual = modeloBling.data.indicadorIe;
        pessoa.numeroDocumento = modeloBling.data.numeroDocumento || null;
        pessoa.rg = modeloBling.data.rg || null;
        pessoa.email = modeloBling.data.email;
        pessoa.orgaoEmissor = modeloBling.data.orgaoEmissor;
        pessoa.situacao = modeloBling.data.situacao === 'A' ? 1 : 0;

        if (modeloBling.data.tipo === 'F') {
          pessoa.tipoPessoa = 'F';
          pessoa.sexo = modeloBling.data.dadosAdicionais?.sexo;
          pessoa.dataNascimento = this.toDate(modeloBling.data.dadosAdicionais.dataNascimento);
          pessoa.naturalidade = modeloBling.data.dadosAdicionais?.naturalidade;
        } else {
          pessoa.tipoPessoa = 'J';
        }

        const cep = (modeloBling.data.endereco.geral.cep as string).replace(/\D/g, '').trim();
        const municipio = (modeloBling.data.endereco.geral.municipio as string).trim();
        const uf = (modeloBling.data.endereco.geral.uf as string).trim();

        if (municipio.length > 0 && uf.length > 0) {
          let endereco: PessoaEndereco;

          if (pessoa.enderecos && pessoa.enderecos.length > 0) {
            // Atualiza o endereço existente
            endereco = pessoa.enderecos[0]; // Considerando apenas o primeiro endereço para simplificar
          } else {
            // Cria um novo endereço
            endereco = new PessoaEndereco();
            pessoa.enderecos = [endereco];
          }

          endereco.cep = cep;
          endereco.bairro = modeloBling.data.endereco.geral.bairro;
          endereco.municipio = municipio;
          endereco.uf = uf as IUF;
          endereco.complemento = modeloBling.data.endereco.geral.complemento;
          endereco.numero = modeloBling.data.endereco.geral.numero;
        }

        return from(repo.save(pessoa));
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<Pessoa> {
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(Pessoa);
      return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
        switchMap((pessoa) => {
          if (!pessoa) {
            return timer(TIMER_DELAY_MS).pipe(
              switchMap(() => this.buscarESalvar(idOriginal, blingService)),
            );
          } else return of(pessoa);
        }),
      );
    }
  }

  selecionaFornecedor(idOriginal: number, blingService: Bling): Observable<Fornecedor> {
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(Pessoa);
      const query = this.dataSource
        .createQueryBuilder(Fornecedor, 'f')
        .innerJoin(Pessoa, 'p', 'f.id_pessoa = p.id')
        .where('p.id_original = :id', { id: idOriginal });
      const repoFornecedor = this.dataSource.getRepository(Fornecedor);

      return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
        switchMap((pessoa) => {
          if (!pessoa) {
            return timer(TIMER_DELAY_MS).pipe(
              switchMap(() => this.buscarESalvar(idOriginal, blingService)),
            );
          } else return of(pessoa);
        }),
        switchMap((pessoa) => {
          return forkJoin({ fornecedor: from(query.getOne()), pessoa: of(pessoa) });
        }),
        switchMap((values) => {
          if (!values.fornecedor) {
            values.fornecedor = new Fornecedor();
            values.fornecedor.pessoa = values.pessoa;
            values.fornecedor.situacao = 1;
          }

          if (values.fornecedor.id) return of(values.fornecedor);
          else {
            return from(repoFornecedor.save(values.fornecedor));
          }
        }),
      );
    }
  }

  buscarControle(): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);
    return from(repo.find({ where: { tabela: this.tabela } })).pipe(
      switchMap((consulta) => of(consulta.length > 0 ? consulta[0] : this.criarNovoControle())),
      switchMap((controle) => from(repo.save(controle))),
    );
  }

  toDate(dateAsString: string): Date {
    if (dateAsString != '0000-00-00') return new Date(`${dateAsString}T00:00:00`);
    else return null;
  }

  criarNovoControle(): ControleImportacao {
    const controle = new ControleImportacao();
    controle.tabela = this.tabela;
    controle.ultimoIndexProcessado = -1;
    controle.pagina = 1;
    return controle;
  }

  atualizarControle(
    controle: ControleImportacao,
    paginaOuItem: 'pagina' | 'index',
  ): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);

    if (paginaOuItem == 'index') {
      controle.ultimoIndexProcessado += 1;
    } else {
      controle.pagina += 1;
      controle.ultimoIndexProcessado = -1;
    }
    return from(repo.save(controle));
  }
}
