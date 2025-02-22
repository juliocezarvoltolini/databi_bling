import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as CategoriasBling } from 'bling-erp-api/lib/entities/naturezasDeOperacoes/interfaces/get.interface';

import {
  catchError,
  concatMap,
  EMPTY,
  forkJoin,
  from,
  lastValueFrom,
  map,
  mergeMap,
  Observable,
  of,
  switchMap,
  tap,
  timer,
  toArray,
} from 'rxjs';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';
import { logger } from 'src/logger/winston.logger';
import { NfeCategoria } from 'src/nfe/nfe-categoria/entities/nfe-categoria.entity';
import ISituacao from 'bling-erp-api/lib/entities/@shared/types/situacao.type';
import { IPadrao } from 'bling-erp-api/lib/entities/naturezasDeOperacoes/types/padrao.type';
import { connect } from 'http2';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

class NaturezaOperacao {
  id?: number;
  situacao?: ISituacao;
  padrao?: IPadrao;
  descricao?: string;
}

@Injectable()
export class NfeCategoriaImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
  ) {
    this.tabela = 'nfe-categoria';
  }

  onModuleInit() {
    // this.iniciar();
  }

  

  private iniciar() {

    this.executar()
      .subscribe({
        next: (value) => {
          logger.info(`Item processado com sucesso. ID:${value.id} - NOME: ${value.descricao}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento().subscribe(),
        error: (err) => {
          console.log(err);
          logger.error('Erro inesperado: ' + err.message);
        },
      });
  }

  private executar(): Observable<NfeCategoria> {
 

    return forkJoin({
      controle: this.buscarControle(),
      acessToken: from(this.service.getAcessToken()),
    })
      .pipe(
        switchMap((values) => {
          let blingService = new Bling(values.acessToken);
          let controle = values.controle;
          return this.processarPagina(blingService, controle);
        })
      )
  }

  private processarPagina(
    blingService: Bling,
    controle: ControleImportacao,
  ): Observable<NfeCategoria> {
    return this.buscarPagina(controle.pagina, blingService).pipe(
      switchMap((lista) => {
        const itensRestantes =
          lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : [];
        return from(itensRestantes);
      }),
      concatMap((planoBling) =>
        timer(350).pipe(switchMap(() => this.buscarESalvar(planoBling, blingService))),
      ),
      tap(() => {
        let index = controle.ultimoIndexProcessado + 1;
        logger.info(`INDEX ${index}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento() {
    return this.buscarControle().pipe(
      map(controle => {
        logger.info(`Completou a página ${controle.pagina}.`);
        if (controle.ultimoIndexProcessado == 99) {
          logger.info(`Próxima página.`);
          this.atualizarControle(controle, 'pagina')
            .pipe(map(() => this.iniciar()))
            .subscribe();
        } else {
          logger.info(`Busca finalizada.`);
        }
      })
    )
   
  }

  private buscarPagina(pagina: number, blingService: Bling): Observable<CategoriasBling> {
    logger.info(`Buscando página ${pagina}`);
    return from(blingService.naturezasDeOperacoes.get({ pagina: pagina, limite: 100 })).pipe(
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

  private buscarItem(
    naturezasDeOperacoes: NaturezaOperacao,
    blingService: Bling,
  ): Observable<NaturezaOperacao> {
    return of(naturezasDeOperacoes);
    // return from(blingService.naturezasDeOperacoes.find({ idCategoria: id })).pipe(
    //   catchError((err) => {
    //     if (err.message === REQUEST_LIMIT_MESSAGE) {
    //       logger.info(`Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
    //       return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, blingService)));
    //     } else {
    //       throw new Error(`Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `);
    //     }
    //   }),
    // );
  }

  private buscarESalvar(
    naturezasDeOperacoes: NaturezaOperacao,
    blingService: Bling,
  ): Observable<NfeCategoria> {
    return this.buscarItem(naturezasDeOperacoes, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(modeloBling: NaturezaOperacao, blingService: Bling): Observable<NfeCategoria> {
    const repo = this.dataSource.getRepository(NfeCategoria);
    logger.info(`Salvando`);
    return this.selecionaOuAssina(repo, modeloBling).pipe(
      mergeMap((planoConta) => {
        if (planoConta.id) return of(planoConta)
          else return from(repo.save(planoConta));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<NfeCategoria>,
    modeloBling: NaturezaOperacao,
  ): Observable<NfeCategoria> {
    return from(
      repo.find({
        where: {
          idOriginal: modeloBling.id.toFixed(0),
        },
      }),
    ).pipe(
      map((consulta) => {
        if (consulta.length > 0) {
          return consulta[0];
        } else {
          const naturezaOperacao = new NfeCategoria();
          naturezaOperacao.idOriginal = modeloBling.id.toFixed(0);
          naturezaOperacao.descricao = modeloBling.descricao;
          return naturezaOperacao;
        }
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<NfeCategoria> {
    if (!idOriginal) return of(null);
  
    const repo = this.dataSource.getRepository(NfeCategoria);
  
    return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
      switchMap((naturezaOperacao) => {
        if (!naturezaOperacao) {
          // Espera o `executar` emitir todos os valores
          return this.executar().pipe(
            toArray(), // Coleta todos os valores emitidos em um array e aguarda a conclusão
            switchMap(() => this.seleciona(idOriginal, blingService)) // Reexecuta `seleciona`
          );
        }
  
        // Retorna o resultado encontrado
        return of(naturezaOperacao);
      })
    );
  }

  private buscarControle(): Observable<ControleImportacao> {
    logger.info('Buscar Controle')
    const repo = this.dataSource.getRepository(ControleImportacao);
    return from(repo.find({ where: { tabela: this.tabela } })).pipe(
      switchMap((consulta) => (consulta.length > 0 ? of(consulta[0]) : of(this.criarNovoControle()))),
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
