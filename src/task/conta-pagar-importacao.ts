import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as ContasPagarBling } from 'bling-erp-api/lib/entities/contasPagar/interfaces/get.interface';
import { IFindResponse as ContaPagarBling } from 'bling-erp-api/lib/entities/contasPagar/interfaces/find.interface';

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
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/app/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';
import { logger } from 'src/logger/winston.logger';
import { ContaPagar } from 'src/app/conta/conta-pagar/entities/conta-pagar.entity';
import { contaPagarSituacao } from 'src/app/conta/conta-pagar/entities/conta-pagar.types';
import { FormaPagamentoImportacao } from './interface/forma-pagamento-importacao';
import { PlanoContaImportacao } from './plano-conta-importacao';
import { PessoaImportacao } from './pessoa-importacao';
import { PortadorImportacao } from './portador-importacao';
import { ResponseLog } from 'src/app/response-log/entities/response-log.entity';
import { IUpdateResponse } from 'bling-erp-api/lib/entities/contasPagar/interfaces/update.interface';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;


type ContasPagarItemArray = ContasPagarBling['data'][0]

@Injectable()
export class ContaPagarImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private formaPagamentoImportacao: FormaPagamentoImportacao,
    private portadorImportacao: PortadorImportacao,
    private planoContaImportacao: PlanoContaImportacao,
    private pessoaImportacao: PessoaImportacao,
  ) {
    this.tabela = 'conta_pagar';
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
          logger.info(`[ContaPagarImportacao] Item processado com sucesso. ID:${value.id} 
            - FORNECEDOR: ${value.pessoa.nome}
            - HISTÓRICO: ${value.historico}
            - DOCUMENTO: ${value.numeroDocumento}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('[ContaPagarImportacao] Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(
    blingService: Bling,
    controle: ControleImportacao,
  ): Observable<ContaPagar> {
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
        logger.info(`[ContaPagarImportacao] INDEX ${index} DATA ${controle.data}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`[ContaPagarImportacao] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[ContaPagarImportacao] Próxima página.`);
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
        logger.info('[ContaPagarImportacao] Atualizando data para ' + lastDate);
        controle.data = lastDate;
        this.atualizarControle(controle, 'date')
          .pipe(map(() => this.iniciar()))
          .subscribe();
      } else {
        logger.info(`[ContaPagarImportacao] Busca finalizada.`);
      }
    }
  }

  private buscarPagina(
    controle: ControleImportacao,
    blingService: Bling,
  ): Observable<ContasPagarBling> {
    logger.info(`[ContaPagarImportacao] Buscando página ${controle.pagina} / Data: ${controle.data}`);
    return timer(1000).pipe(
      switchMap(() =>
        from(
          blingService.contasPagar.get({
            pagina: controle.pagina,
            dataEmissaoInicial: controle.data,
            dataEmissaoFinal: controle.data,
            limite: 100,
          }),
        ).pipe(
          catchError((err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(
                `[ContaPagarImportacao] Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`,
              );
              return timer(TIMER_DELAY_MS).pipe(
                switchMap(() => this.buscarPagina(controle, blingService)),
              );
            } else {
              throw new Error(
                `[ContaPagarImportacao] Não foi possível pesquisar a página ${controle}. Motivo: ${err.message} `,
              );
            }
          }),
        ),
      ),
    );
  }

  private atualizarDocumentoDespesa(contaPagar: ContaPagarBling, blingService: Bling): Observable<IUpdateResponse> {
    return from(
      blingService.contasPagar.update(
        {
          idContaPagar: contaPagar.data.id,
          contato: { id: contaPagar.data.contato.id },
          valor: contaPagar.data.valor,
          vencimento: contaPagar.data.vencimento,
          numeroDocumento: contaPagar.data.id.toFixed(0)
        }
      )).pipe(
        catchError(
          (err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(`[ContaPagarImportacao] Irá salvar novamente o item ${contaPagar.data.id} com novo número de documento. Aguardando ${TIMER_DELAY_MS} ms`);
              return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.atualizarDocumentoDespesa(contaPagar, blingService)));
            } else {
              throw new Error(`[ContaPagarImportacao] Não foi possível pesquisar o id ${contaPagar.data.id}. Motivo: ${err.message} `);
            }
          }
        )
      )


  }

  private buscarItem(id: number, blingService: Bling): Observable<ContaPagarBling> {

    return from(blingService.contasPagar.find({ idContaPagar: id })).pipe(
      concatMap(conta => {
        if (conta.data.numeroDocumento.trim.length == 0) {
          return this.atualizarDocumentoDespesa(conta, blingService).pipe(
            map(() => {
              conta.data.numeroDocumento = conta.data.id.toFixed(0)
              return conta;
            }),
          )
        } else {
          return of(conta)
        }
      }),
      tap(conta => {
        const repoResponseLog = this.dataSource.getRepository(ResponseLog);
        repoResponseLog.findOne({ where: { idOriginal: conta.data.id.toFixed(0), nomeInformacao: 'conta_pagar' } })
          .then(responseLog => {
            if (!responseLog) {
              responseLog = new ResponseLog();
              responseLog.idOriginal = conta.data.id.toFixed(0);
              responseLog.nomeInformacao = 'conta_pagar';

            }
            responseLog.data = new Date();
            responseLog.response = JSON.stringify(conta);
            repoResponseLog.save(responseLog);
          });
      }),
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(`[ContaPagarImportacao] Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
          return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, blingService)));
        } else {
          throw new Error(`[ContaPagarImportacao] Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `);
        }
      }),
    );
  }

  private buscarESalvar(id: number, blingService: Bling): Observable<ContaPagar> {
    return this.buscarItem(id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(modeloBling: ContaPagarBling, blingService: Bling): Observable<ContaPagar> {
    const repo = this.dataSource.getRepository(ContaPagar);
    logger.info(`[ContaPagarImportacao] Salvando`);
    return this.selecionaOuAssina(repo, modeloBling, blingService).pipe(
      mergeMap((conta) => {
        return from(repo.save(conta));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<ContaPagar>,
    modeloBling: ContaPagarBling,
    blingService: Bling,
  ): Observable<ContaPagar> {
    return from(
      repo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      switchMap((conta) => {
        if (conta) {
          return of(conta);
        } else {
          return this.criarContaPagar(modeloBling, blingService);
        }
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<ContaPagar> {
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(ContaPagar);
      return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
        switchMap((portador) => {
          if (!portador) {
            return timer(TIMER_DELAY_MS).pipe(
              switchMap(() => this.buscarESalvar(idOriginal, blingService)),
            );
          } else return of(portador);
        }),
      );
    }
  }

  criarContaPagar(modeloBling: ContaPagarBling, blingService: Bling): Observable<ContaPagar> {
    return forkJoin({
      formaPagamento: this.formaPagamentoImportacao.seleciona(
        modeloBling.data.formaPagamento.id,
        blingService,
      ),
      portador: this.portadorImportacao.seleciona(modeloBling.data.portador.id, blingService),
      planoConta: this.planoContaImportacao.seleciona(modeloBling.data.categoria.id, blingService),
      pessoa: this.pessoaImportacao.seleciona(modeloBling.data.contato.id, blingService),
    }).pipe(
      switchMap((value) => {
        const conta = new ContaPagar();

        conta.idOriginal = modeloBling.data.id.toFixed(0);
        conta.dataCompetencia = this.toDate(modeloBling.data.competencia);
        conta.dataEmissao = this.toDate(modeloBling.data.dataEmissao);
        conta.dataVencimento = this.toDate(modeloBling.data.vencimento);
        conta.historico = modeloBling.data.historico;
        conta.numeroDocumento = modeloBling.data.numeroDocumento;
        conta.situacao = contaPagarSituacao[modeloBling.data.situacao];
        conta.valor = modeloBling.data.valor;
        conta.formaPagamento = value.formaPagamento;
        conta.pessoa = value.pessoa;
        conta.planoConta = value.planoConta;
        conta.portador = value.portador;

        return of(conta);
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
    if (dateAsString != '0000-00-00') return new Date(`${dateAsString}T00:00:00`);
    else return null;
  }

  private criarNovoControle(): ControleImportacao {
    const controle = new ControleImportacao();
    controle.tabela = this.tabela;
    controle.ultimoIndexProcessado = -1;
    controle.pagina = 1;
    controle.data = new Date(2024, 0, 1);
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
