import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as PlanosContaBling } from 'bling-erp-api/lib/entities/categoriasReceitasDespesas/interfaces/get.interface';
import { IFindResponse as PlanoContaBling } from 'bling-erp-api/lib/entities/categoriasReceitasDespesas/interfaces/find.interface';

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
import { PlanoConta } from 'src/app/conta/plano-conta/entities/plano-conta.entity';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/app/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';
import { PlanoContaTipo } from 'src/app/conta/plano-conta/entities/plano-conta.types';
import { logger } from 'src/logger/winston.logger';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class PlanoContaImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
  ) {
    this.tabela = 'plano_conta';
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

  private buscarPagina(pagina: number, blingService: Bling): Observable<PlanosContaBling> {
    logger.info(`Buscando página ${pagina}`);
    return from(blingService.categoriasReceitasDespesas.get({ pagina: pagina, limite: 100 })).pipe(
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

  private buscarItem(id: number, blingService: Bling): Observable<PlanoContaBling> {
    return from(blingService.categoriasReceitasDespesas.find({ idCategoria: id })).pipe(
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

  private buscarESalvar(id: number, blingService: Bling): Observable<PlanoConta> {
    return this.buscarItem(id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(modeloBling: PlanoContaBling, blingService: Bling): Observable<PlanoConta> {
    const repo = this.dataSource.getRepository(PlanoConta);
    logger.info(`Salvando`);
    return this.selecionaOuAssina(repo, modeloBling).pipe(
      mergeMap((planoConta) => {
        if (planoConta.id) return of(planoConta);
        else
          return forkJoin({
            planoConta: of(planoConta),
            planoContaPai: modeloBling.data.idCategoriaPai
              ? this.buscarESalvar(modeloBling.data.idCategoriaPai, blingService)
              : of(null),
          }).pipe(
            switchMap((value) => {
              if (value.planoContaPai) {
                planoConta.planoContaPai = value.planoContaPai;
              }
              return from(repo.save(planoConta));
            }),
          );
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<PlanoConta>,
    modeloBling: PlanoContaBling,
  ): Observable<PlanoConta> {
    return from(
      repo.find({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      map((consulta) => {
        if (consulta.length > 0) {
          return consulta[0];
        } else {
          const planoConta = new PlanoConta();
          planoConta.idOriginal = modeloBling.data.id.toFixed(0);
          planoConta.descricao = modeloBling.data.descricao;
          planoConta.tipo = this.determinarTipoConta(modeloBling.data.tipo);
          return planoConta;
        }
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<PlanoConta> {
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(PlanoConta);
      return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
        switchMap((planoConta) => {
          if (!planoConta) {
            return timer(TIMER_DELAY_MS).pipe(
              switchMap(() => this.buscarESalvar(idOriginal, blingService)),
            );
          } else return of(planoConta);
        }),
      );
    }
  }

  private determinarTipoConta(tipo: number): PlanoContaTipo {
    switch (tipo) {
      case 1:
        return PlanoContaTipo.DESPESA;
      case 2:
        return PlanoContaTipo.RECEITA;
      default:
        return PlanoContaTipo.RECEITA_E_DESPESA;
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
