import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as NotasBling } from 'bling-erp-api/lib/entities/nfes/interfaces/get.interface';
import { IFindResponse as NotaBling } from 'bling-erp-api/lib/entities/nfes/interfaces/find.interface';

import {
  catchError,
  concatMap,
  EMPTY,
  forkJoin,
  from,
  map,
  mergeMap,
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
import { FormaPagamentoImportacao } from './interface/forma-pagamento-importacao';
import { PessoaImportacao } from './pessoa-importacao';
import { NfeCategoriaImportacao } from './nfe-categoria-importacao';
import { Nfe } from 'src/nfe/entities/nfe.entity';
import { VendedorImportacao } from './interface/vendedor-importacao';
import { Vendedor } from 'src/vendedor/entities/vendedor.entity';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class NfeImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private formaPagamentoImportacao: FormaPagamentoImportacao,
    private pessoaImportacao: PessoaImportacao,
    private nfeCategoriaImportacao: NfeCategoriaImportacao,
    private vendedorImportacao: VendedorImportacao,
  ) {
    this.tabela = 'nfe-entrada';
  }

  onModuleInit() {
    //  this.iniciar();
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
          logger.info(`Item processado com sucesso. ID:${value.id} 
            - Nome: ${value.pessoa.nome}
            - Tipo: ${value.tipo}
            - Situacao: ${value.situacao}
            - Natureza: ${value.nfeCategoria.descricao}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(blingService: Bling, controle: ControleImportacao): Observable<Nfe> {
    return this.buscarPagina(controle, blingService).pipe(
      switchMap((lista) => {
        const itensRestantes =
          lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : [];
        return from(itensRestantes);
      }),
      concatMap((contaBling) =>
        timer(350).pipe(concatMap(() => this.buscarESalvar(contaBling.id, blingService))),
      ),
      tap(() => {
        let index = controle.ultimoIndexProcessado + 1;
        logger.info(`INDEX ${index} DATA ${controle.data}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`Próxima página.`);
      this.atualizarControle(controle, 'pagina')
        .pipe(map(() => this.iniciar()))
        .subscribe();
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let lastDate = new Date(controle.data + 'T00:00:00');
      lastDate.setHours(0, 0, 0, 0);
      if (lastDate < today) {
        lastDate.setDate(lastDate.getDate() + 1);
        logger.info('Atualizando data para ' + lastDate);
        controle.data = lastDate;
        this.atualizarControle(controle, 'date')
          .pipe(map(() => this.iniciar()))
          .subscribe();
      } else {
        logger.info(`Busca finalizada.`);
      }
    }
  }

  private toDateBling(date: Date | string): string {
    let dateInstance: Date;
    if (date instanceof Date) {
      dateInstance = date;
    } else {
      dateInstance = new Date(`${date}T00:00:01`);
    }

    const year = dateInstance.getUTCFullYear();
    const month = String(dateInstance.getUTCMonth() + 1).padStart(2, '0'); // UTCMonth é 0-indexado
    const day = String(dateInstance.getUTCDate()).padStart(2, '0'); // getDate() para dia do mês

    const dateString = `${year}-${month}-${day}`;
    return dateString;
  }

  private buscarPagina(controle: ControleImportacao, blingService: Bling): Observable<NotasBling> {
    logger.info(`Buscando página ${controle.pagina} / Data: ${controle.data}`);
    return timer(1000).pipe(
      switchMap(() =>
        from(
          blingService.nfes.get({
            pagina: controle.pagina,
            tipo: this.tabela === 'nfe-entrada' ? 0 : 1,
            dataEmissaoInicial: `${this.toDateBling(controle.data)} 00:00:01`,
            dataEmissaoFinal: `${this.toDateBling(controle.data)} 23:59:59`,
            limite: 100,
          }),
        ).pipe(
          catchError((err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(
                `Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`,
              );
              return timer(TIMER_DELAY_MS).pipe(
                switchMap(() => this.buscarPagina(controle, blingService)),
              );
            } else {
              throw new Error(
                `Não foi possível pesquisar a página ${JSON.stringify(controle)}. Motivo: ${err.message} `,
              );
            }
          }),
        ),
      ),
    );
  }

  private buscarItem(id: number, blingService: Bling): Observable<NotaBling> {
    return from(blingService.nfes.find({ idNotaFiscal: id })).pipe(
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(`Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
          return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, blingService)));
        } else {
          throw new Error(`Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `);
        }
      }),
    );
  }

  private buscarESalvar(id: number, blingService: Bling): Observable<Nfe> {
    return this.buscarItem(id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(modeloBling: NotaBling, blingService: Bling): Observable<Nfe> {
    const repo = this.dataSource.getRepository(Nfe);
    logger.info(`Salvando`);
    return this.selecionaOuAssina(repo, modeloBling, blingService).pipe(
      mergeMap((conta) => {
        return from(repo.save(conta));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<Nfe>,
    modeloBling: NotaBling,
    blingService: Bling,
  ): Observable<Nfe> {
    return from(
      repo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(switchMap((conta) => this.criarNFE(conta, modeloBling, blingService)));
  }

  criarNFE(nfe: Nfe, modeloBling: NotaBling, blingService: Bling): Observable<Nfe> {
    return forkJoin({
      pessoa: this.pessoaImportacao.seleciona(modeloBling.data.contato.id, blingService),
      nfeCategoria: this.nfeCategoriaImportacao.seleciona(
        modeloBling.data.naturezaOperacao.id,
        blingService,
      ),
      vendedor: this.vendedorImportacao.seleciona(modeloBling.data.vendedor.id, blingService),
    }).pipe(
      switchMap((value) => {
        if (!nfe) nfe = new Nfe();
        nfe.idOriginal = modeloBling.data.id.toFixed(0);
        nfe.pessoa = value.pessoa;
        nfe.dataEmissao = this.toDate(modeloBling.data.dataEmissao);
        nfe.dataOperacao = this.toDate(modeloBling.data.dataOperacao);
        nfe.tipo = modeloBling.data.tipo;
        nfe.situacao = modeloBling.data.situacao;
        nfe.nfeCategoria = value.nfeCategoria;
        nfe.serie = modeloBling.data.serie;
        nfe.valor = modeloBling.data['valorNota'];
        nfe.vendedor = value.vendedor;
        nfe.chaveAcesso = modeloBling.data.chaveAcesso;
        nfe.xmlLink = modeloBling.data.xml;
        return of(nfe);
      }),
    );
  }

  private buscarControle(): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);
    return from(repo.find({ where: { tabela: this.tabela } })).pipe(
      map((consulta) => (consulta.length > 0 ? consulta[0] : this.criarNovoControle())),
      switchMap((controle) => from(repo.save(controle))),
    );
  }

  toDate(dateAsString: string): Date {
    if (dateAsString.length === 10) {
      if (dateAsString != '0000-00-00') return new Date(`${dateAsString}T00:00:00`);
      else return null;
    } else if (dateAsString.length === 19) {
      if (dateAsString != '0000-00-00 00:00:00') {
        let [primeiraParte, segundaParte] = dateAsString.split(' ');
        return new Date(`${primeiraParte}T${segundaParte}`);
      } else {
        return null;
      }
    }
  }

  private criarNovoControle(): ControleImportacao {
    const controle = new ControleImportacao();
    controle.tabela = this.tabela;
    controle.ultimoIndexProcessado = -1;
    controle.pagina = 1;
    controle.data = new Date(2023, 0, 1);
    return controle;
  }

  private atualizarControle(
    controle: ControleImportacao,
    paginaOuItem: 'pagina' | 'index' | 'date',
  ): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);

    if (paginaOuItem == 'index') {
      controle.ultimoIndexProcessado += 1;
    } else if (paginaOuItem == 'pagina') {
      controle.pagina += 1;
      controle.ultimoIndexProcessado = -1;
    } else {
      controle.pagina = 1;
      controle.ultimoIndexProcessado = -1;
    }
    return from(repo.save(controle));
  }
}
