import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as VendedoresBling } from 'bling-erp-api/lib/entities/vendedores/interfaces/get.interface';
import { IFindResponse as VendedorBling } from 'bling-erp-api/lib/entities/vendedores/interfaces/find.interface';

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
import { Vendedor } from 'src/vendedor/entities/vendedor.entity';
import { PessoaImportacao } from '../pessoa-importacao';
import { fork } from 'child_process';
import { VendedorComissao } from 'src/vendedor/entities/vendedor-comissao.entity';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class VendedorImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private pessoaImportacao: PessoaImportacao,
  ) {
    this.tabela = 'vendedor';
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
          logger.info(`Item processado com sucesso. ID:${value.id} - NOME: ${value.pessoa.nome}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(blingService: Bling, controle: ControleImportacao): Observable<Vendedor> {
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

  private buscarPagina(pagina: number, blingService: Bling): Observable<VendedoresBling> {
    logger.info(`Buscando página ${pagina}`);
    return from(blingService.vendedores.get({ pagina: pagina, limite: 100 })).pipe(
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

  private buscarItem(id: number, blingService: Bling): Observable<VendedorBling> {
    return from(blingService.vendedores.find({ idVendedor: id })).pipe(
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

  private buscarESalvar(id: number, blingService: Bling): Observable<Vendedor> {
    return this.buscarItem(id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(modeloBling: VendedorBling, blingService: Bling): Observable<Vendedor> {
    const repo = this.dataSource.getRepository(Vendedor);
    logger.info(`Salvando`);
    return this.selecionaOuAssina(repo, modeloBling, blingService).pipe(
      switchMap((vendedor) => {
        if (vendedor.id) return of(vendedor);
        else return from(repo.save(vendedor));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<Vendedor>,
    modeloBling: VendedorBling,
    blingService: Bling,
  ): Observable<Vendedor> {
    return from(
      repo.find({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      switchMap((consulta) => {
        if (consulta.length > 0) {
          logger.info('Encontrou o vendedor')
          return of(consulta[0]);
        } else {
          return this.criarVendedor(modeloBling, blingService);
        }
      }),
    );
  }

  private criarVendedor(modeloBling: VendedorBling, blingService: Bling): Observable<Vendedor> {
    let repo = this.dataSource.getRepository(Vendedor);
    return forkJoin({
      pessoa: this.pessoaImportacao.seleciona(modeloBling.data.contato.id, blingService),
      vendedor: from(repo.findOne({ where: { idOriginal: modeloBling.data.id.toFixed(0) } })),
    }).pipe(
      switchMap((values) => {
        if (!values.vendedor) {
          values.vendedor = new Vendedor();
          values.vendedor.pessoa = values.pessoa;
          values.vendedor.idOriginal = modeloBling.data.id.toFixed(0);
        }

        if (!values.vendedor.comissao) values.vendedor.comissao = [];

        if (modeloBling.data.comissoes.length > 0) {
          if (values.vendedor.comissao.length === 0) {
            values.vendedor.comissao.push(new VendedorComissao());
          }
          values.vendedor.comissao[0].percentualComissao = modeloBling.data.comissoes[0].aliquota;
          values.vendedor.comissao[0].percentualDesconto =
            modeloBling.data.comissoes[0].descontoMaximo;
        }

        values.vendedor.situacao = 1

        return of(values.vendedor);
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<Vendedor> {
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(Vendedor);
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
