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
  reduce,
  switchMap,
  tap,
  timer,
  toArray,
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
import { Pagamento } from 'src/app/conta/conta-pagar/pagamento/entities/pagamento.entity';
import { Borderos } from 'bling-erp-api/lib/entities/borderos';
import { IFindSuccessResponse as Bordero } from 'bling-erp-api/lib/entities/borderos/interfaces/find.interface';
import { response } from 'express';
import { AppMath } from 'src/shared/util/operacoes-matematicas/app-math-operations';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class PagamentoImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private formaPagamentoImportacao: FormaPagamentoImportacao,
    private portadorImportacao: PortadorImportacao,
    private planoContaImportacao: PlanoContaImportacao,
    private pessoaImportacao: PessoaImportacao,
  ) {
    this.tabela = 'pagamento';
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
          logger.info(`[Pagamento] Item processado com sucesso. ID:${value.id} 
            - FORNECEDOR: ${value.pessoa.nome}
            - HISTÓRICO: ${value.historico}
            - DOCUMENTO: ${value.numeroDocumento}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('[Pagamento] Erro inesperado: ' + err.message);
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
        timer(350).pipe(concatMap(() => this.buscarESalvar(contaBling, controle.data, blingService))),
      ),
      tap(() => {
        let index = controle.ultimoIndexProcessado + 1;
        logger.info(`[Pagamento] INDEX ${index} DATA ${controle.data}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`[Pagamento] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[Pagamento] Próxima página.`);
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
        logger.info('[Pagamento] Atualizando data para ' + lastDate);
        controle.data = lastDate;
        this.atualizarControle(controle, 'date')
          .pipe(map(() => this.iniciar()))
          .subscribe();
      } else {
        logger.info(`[Pagamento] Busca finalizada.`);
      }
    }
  }

  private buscarPagina(
    controle: ControleImportacao,
    blingService: Bling,
  ): Observable<ContasPagarBling> {
    logger.info(`[Pagamento] Buscando página ${controle.pagina} / Data: ${controle.data}`);
    return timer(1000).pipe(
      switchMap(() =>
        from(
          blingService.contasPagar.get({
            pagina: controle.pagina,
            dataPagamentoInicial: controle.data,
            dataPagamentoFinal: controle.data,
            limite: 100,
          }),
        ).pipe(
          catchError((err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(
                `[Pagamento] Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`,
              );
              return timer(TIMER_DELAY_MS).pipe(
                switchMap(() => this.buscarPagina(controle, blingService)),
              );
            } else {
              throw new Error(
                `[Pagamento] Não foi possível pesquisar a página ${controle}. Motivo: ${err.message} `,
              );
            }
          }),
        ),
      ),
    );
  }

  private atualizarDocumentoDespesa(contaPagar: ContaPagarBling, blingService: Bling): Observable<string> {
    logger.info('[Pagamento] Atualizando documento da conta ', contaPagar.data.id)
    return from(
      blingService.contasPagar.update(
        {
          idContaPagar: contaPagar.data.id,
          contato: { id: contaPagar.data.contato.id },
          valor: contaPagar.data.valor,
          vencimento: contaPagar.data.vencimento,
          dataEmissao: contaPagar.data.dataEmissao,
          competencia: contaPagar.data.competencia,
          numeroDocumento: contaPagar.data.id.toFixed(0)
        }
      )).pipe(
        map(() => contaPagar.data.id.toFixed(0)),
        catchError(
          (err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(`[ContaPagarImportacao] Irá salvar novamente o item ${contaPagar.data.id} com novo número de documento. Aguardando ${TIMER_DELAY_MS} ms`);
              return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.atualizarDocumentoDespesa(contaPagar, blingService)));
            } else {
              console.log(err)
              return "";
            }
          }
        )
      )


  }

  private buscarItem(id: number, blingService: Bling): Observable<ContaPagarBling> {

    return from(blingService.contasPagar.find({ idContaPagar: id })).pipe(
      concatMap(conta => {
        if (conta.data.numeroDocumento.trim().length == 0) {
          console.log(conta.data);
          return this.atualizarDocumentoDespesa(conta, blingService).pipe(
            map((documento) => {
              conta.data.numeroDocumento = documento
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

  private buscarESalvar(modeloSimplificadoBling: any, dataPagamento: Date, blingService: Bling): Observable<ContaPagar> {

    return this.buscarItem(modeloSimplificadoBling.id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService, dataPagamento)),
    );
  }

  private salvarItem(modeloBling: ContaPagarBling, blingService: Bling, dataPagamento: Date): Observable<ContaPagar> {
    const repo = this.dataSource.getRepository(ContaPagar);
    logger.info(`[Pagamento] Salvando`);
    return this.selecionaOuAssina(repo, modeloBling, blingService, dataPagamento).pipe(
      mergeMap((conta) => {
        return from(repo.save(conta));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<ContaPagar>,
    modeloBling: ContaPagarBling,
    blingService: Bling,
    dataPagamento: Date,
  ): Observable<ContaPagar> {
    return from(
      repo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      switchMap((conta) => {

        return this.criarContaPagar(conta, modeloBling, blingService);

      }),
      switchMap((conta) => {
        return this.criarPagamento(conta, dataPagamento, modeloBling.data.borderos, blingService);
      }),
    );
  }

  criarPagamento(contaPagar: ContaPagar, dataPagamento: Date, borderos: number[], blingService: Bling): Observable<ContaPagar> {
    return from(borderos).pipe(
      concatMap((id, index) => {
        // Adiciona atraso para as buscas subsequentes de bordero
        if (index > 0) return timer(330).pipe(switchMap(() => this.buscarBordero(id, blingService)));
        return this.buscarBordero(id, blingService);
      }),
      toArray(),
      map(borderos => {
        // Filtra e soma os valores dos registros válidos
        let totalValor: number[] = [];
        let portadorId = null;

        const limiteValor = AppMath.multiply(contaPagar.valor, 1.11, 2);

        borderos.forEach(bordero => {
          if (this.toDateBling(bordero.data.data) === this.toDateBling(dataPagamento)) {
            bordero.data.pagamentos.forEach(pag => {
              if (pag.numeroDocumento === contaPagar.numeroDocumento && pag.contato.id.toFixed(0) == contaPagar.pessoa.idOriginal) {
                totalValor.push(pag.valorPago);
                portadorId = bordero.data.portador.id;
              }
            });
          }
        });

        // Retorna um único registro com o portador e o valor total
        return { portador: portadorId, valorPago: totalValor };
      }),
      switchMap(bordero => {
        contaPagar.pagamentos = contaPagar.pagamentos || [];
        let pagamentos: Pagamento[] = [];

        bordero.valorPago.forEach(valorPago => {
          let pagamento = contaPagar.pagamentos.find(pagamento =>
            pagamento.dataPagamento === dataPagamento && pagamento.valor === valorPago
          );

          if (!pagamento) {
            pagamento = new Pagamento();
            pagamento.dataPagamento = dataPagamento;
            pagamento.valor = valorPago;
            pagamento.contaPagar = contaPagar;
            pagamentos.push(pagamento);
          }

        })

        if (pagamentos.length > 0) {
          if (bordero.portador) {
            return this.portadorImportacao.seleciona(bordero.portador, blingService).pipe(
              map(portador => {
                pagamentos.forEach(pag => pag.portador = portador);
                contaPagar.pagamentos = contaPagar.pagamentos.concat(pagamentos);
                return contaPagar;
              }),
            );
          } else {
            contaPagar.pagamentos = contaPagar.pagamentos.concat(pagamentos);
          }
        }

        return of(contaPagar);
      })
    );
  }



  criarContaPagar(conta: ContaPagar, modeloBling: ContaPagarBling, blingService: Bling): Observable<ContaPagar> {
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
        if (!conta) conta = new ContaPagar();

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

  toDate(dateAsString: string): Date {
    if (dateAsString != '0000-00-00') return new Date(`${dateAsString}T00:00:00`);
    else return null;
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


  buscarBordero(id: number, blingService: Bling): Observable<Bordero> {
    const repoResponseLog = this.dataSource.getRepository(ResponseLog);

    return from(repoResponseLog.findOne({
      where: { idOriginal: id.toString(), nomeInformacao: 'bordero' }
    })).pipe(
      switchMap(responseLog => {
        if (responseLog) {
          return of(JSON.parse(responseLog.response));
        }

        return from(blingService.borderos.find({ idBordero: id })).pipe(
          switchMap(bordero => {
            const newResponseLog = new ResponseLog();
            newResponseLog.idOriginal = id.toString();
            newResponseLog.nomeInformacao = 'bordero';
            newResponseLog.data = new Date();
            newResponseLog.response = JSON.stringify(bordero);

            return from(repoResponseLog.save(newResponseLog)).pipe(
              map(() => bordero)
            );
          }),
          catchError((err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(`[Pagamento] Irá pesquisar novamente o bordero ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
              return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarBordero(id, blingService)));
            } else {
              throw new Error(`[Pagamento] Não foi possível pesquisar o bordero ${id}. Motivo: ${err.message} `);
            }
          }),
        );
      })
    );
  }

}
