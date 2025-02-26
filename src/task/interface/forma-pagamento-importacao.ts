import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as FormasPagamentoBling } from 'bling-erp-api/lib/entities/formasDePagamento/interfaces/get.interface';
import { IFindResponse as FormaPagamentoBling } from 'bling-erp-api/lib/entities/formasDePagamento/interfaces/find.interface';

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
import { AuthBlingService } from 'src/app/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';
import { logger } from 'src/logger/winston.logger';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { FormaPagamento } from 'src/app/forma-pagamento/entities/forma-pagamento.entity';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class FormaPagamentoImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
  ) {
    this.tabela = 'forma_pagamento';
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
          logger.info(`Item processado com sucesso. ID:${value.id} - NOME: ${value.descricao}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(blingService: Bling, controle: ControleImportacao): Observable<any> {
    return this.buscarPagina(controle.pagina, blingService).pipe(
      switchMap((lista) => {
        const itensRestantes =
          lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : [];
        return from(itensRestantes);
      }),
      concatMap((planoBling) =>
        timer(350).pipe(switchMap(() => this.buscarESalvar(planoBling.id, blingService))),
      ),
      tap(() => {
        let index = controle.ultimoIndexProcessado + 1;
        logger.info(`INDEX ${index}`);
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
      logger.info(`Busca finalizada.`);
    }
  }

  private buscarPagina(pagina: number, blingService: Bling): Observable<FormasPagamentoBling> {
    logger.info(`Buscando página ${pagina}`);
    return from(blingService.formasDePagamento.get({ pagina: pagina, limite: 100 })).pipe(
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(
            `Irá pesquisar novamente a página ${pagina}. Aguardando ${TIMER_DELAY_MS} ms`,
          );
          return timer(TIMER_DELAY_MS).pipe(
            switchMap(() => this.buscarPagina(pagina, blingService)),
          );
        } else {
          throw new Error(`Não foi possível pesquisar a página ${pagina}. Motivo: ${err.message} `);
        }
      }),
    );
  }

  private buscarItem(id: number, blingService: Bling): Observable<FormaPagamentoBling> {
    return from(blingService.formasDePagamento.find({ idFormaPagamento: id })).pipe(
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

  private buscarESalvar(id: number, blingService: Bling): Observable<FormaPagamento> {
    return this.buscarItem(id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(
    modeloBling: FormaPagamentoBling,
    blingService: Bling,
  ): Observable<FormaPagamento> {
    const repo = this.dataSource.getRepository(FormaPagamento);
    logger.info(`Salvando`);
    return this.selecionaOuAssina(repo, modeloBling).pipe(
      mergeMap((portador) => {
        if (portador.id) return of(portador);
        else return from(repo.save(portador));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<FormaPagamento>,
    modeloBling: FormaPagamentoBling,
  ): Observable<FormaPagamento> {
    return from(
      repo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      map((formaPagamento) => {
        if (!formaPagamento) {
          formaPagamento = new FormaPagamento();
        }

        formaPagamento.idOriginal = modeloBling.data.id.toFixed(0);
        formaPagamento.nome = modeloBling.data.descricao;
        formaPagamento.finalidade = modeloBling.data.finalidade;
        formaPagamento.tipoPagamento = modeloBling.data.tipoPagamento;
        formaPagamento.situacao = modeloBling.data.situacao;
        formaPagamento.bandeiraCartao = modeloBling.data.dadosCartao
          ? modeloBling.data.dadosCartao.bandeira
          : null;
        formaPagamento.taxaAliquota = modeloBling.data.taxas.aliquota;
        formaPagamento.taxaValor = modeloBling.data.taxas.valor;
        return formaPagamento;
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<FormaPagamento> {
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(FormaPagamento);
      return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
        switchMap((forma) => {
          if (!forma) {
            return timer(TIMER_DELAY_MS).pipe(
              switchMap(() => this.buscarESalvar(idOriginal, blingService)),
            );
          } else return of(forma);
        }),
      );
    }
  }

  private buscarControle(): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);
    return from(repo.find({ where: { tabela: this.tabela } })).pipe(
      map((consulta) => (consulta.length > 0 ? consulta[0] : this.criarNovoControle())),
      switchMap((controle) => from(repo.save(controle))),
    );
  }

  private criarNovoControle(): ControleImportacao {
    const controle = new ControleImportacao();
    controle.tabela = this.tabela;
    controle.ultimoIndexProcessado = -1;
    controle.pagina = 1;
    return controle;
  }

  private atualizarControle(
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
