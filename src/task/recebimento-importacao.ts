import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as ContasReceberBling } from 'bling-erp-api/lib/entities/contasReceber/interfaces/get.interface';
import { IFindResponse as ContaReceberBling } from 'bling-erp-api/lib/entities/contasReceber/interfaces/find.interface';

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


import { PlanoContaImportacao } from './plano-conta-importacao';
import { PessoaImportacao } from './pessoa-importacao';
import { PortadorImportacao } from './portador-importacao';
import { ResponseLog } from 'src/app/response-log/entities/response-log.entity';
import { Borderos } from 'bling-erp-api/lib/entities/borderos';
import { IFindSuccessResponse as Bordero } from 'bling-erp-api/lib/entities/borderos/interfaces/find.interface';
import { response } from 'express';
import { AppMath } from 'src/shared/util/operacoes-matematicas/app-math-operations';
import { FormaPagamentoImportacao } from './interface/forma-pagamento-importacao';
import { ContaReceber } from 'src/app/conta/conta-receber/entities/conta-receber.entity';
import { Recebimento } from 'src/app/conta/conta-receber/recebimento/entities/recebimento.entity';
import { contaReceberSituacao } from 'src/app/conta/conta-receber/entities/conta-receber.types';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

const ERROS = ['Não foi possível realizar a chamada HTTP: get', 'O limite de requisições por segundo foi atingido, tente novamente mais tarde.', 'Não foi possível realizar a chamada HTTP']

@Injectable()
export class RecebimentoImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private formaPagamentoImportacao: FormaPagamentoImportacao,
    private portadorImportacao: PortadorImportacao,
    private planoContaImportacao: PlanoContaImportacao,
    private pessoaImportacao: PessoaImportacao,
  ) {
    this.tabela = 'recebimento';
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
          logger.info(`[Recebimento] Item processado com sucesso. ID:${value.id} 
            - FORNECEDOR: ${value.pessoa.nome}
            - HISTÓRICO: ${value.historico}
            - DOCUMENTO: ${value.numeroDocumento}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('[Recebimento] Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(
    blingService: Bling,
    controle: ControleImportacao,
  ): Observable<ContaReceber> {
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
        logger.info(`[Recebimento] INDEX ${index} DATA ${controle.data}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`[Recebimento] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[Recebimento] Próxima página.`);
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
        logger.info('[Recebimento] Atualizando data para ' + lastDate);
        controle.data = lastDate;
        this.atualizarControle(controle, 'date')
          .pipe(map(() => this.iniciar()))
          .subscribe();
      } else {
        logger.info(`[Recebimento] Busca finalizada.`);
      }
    }
  }

  private buscarPagina(
    controle: ControleImportacao,
    blingService: Bling,
  ): Observable<ContasReceberBling> {
    logger.info(`[Recebimento] Buscando página ${controle.pagina} / Data: ${controle.data}`);
    return timer(1000).pipe(
      switchMap(() =>
        from(
          blingService.contasReceber.get({
            pagina: controle.pagina,
            dataInicial: controle.data,
            dataFinal: controle.data,
            tipoFiltroData: 'R',
            limite: 100,
          }),
        ).pipe(
          catchError((err) => {
            if (ERROS.filter(erro => err.message.includes(erro))) {
              logger.info(
                `[Recebimento] Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`,
              );
              return timer(TIMER_DELAY_MS).pipe(
                switchMap(() => this.buscarPagina(controle, blingService)),
              );
            } else {
              throw new Error(
                `[Recebimento] Não foi possível pesquisar a página ${controle}. Motivo: ${err.message} `,
              );
            }
          }),
        ),
      ),
    );
  }

  private atualizarDocumentoReceita(contaReceberBling: ContaReceberBling, blingService: Bling): Observable<any> {
    logger.info('[Recebimento] Atualizando documento da conta ', contaReceberBling.data.id)
    return from(
      blingService.contasReceber.update(
        {
          idContaReceber: contaReceberBling.data.id,
          contato: { id: contaReceberBling.data.contato.id },
          valor: contaReceberBling.data.valor,
          vencimento: contaReceberBling.data.vencimento,
          dataEmissao: contaReceberBling.data.dataEmissao,
          competencia: contaReceberBling.data.competencia,
          numeroDocumento: contaReceberBling.data.id.toFixed(0)
        }
      )).pipe(
        catchError(
          (err) => {
            if (err.message === REQUEST_LIMIT_MESSAGE) {
              logger.info(`[Recebimento] Irá salvar novamente o item ${contaReceberBling.data.id} com novo número de documento. Aguardando ${TIMER_DELAY_MS} ms`);
              return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.atualizarDocumentoReceita(contaReceberBling, blingService)));
            } else {
              console.log(err)
              throw new Error(`[Recebimento] Não foi possível atualizar o id ${contaReceberBling.data.id}. Motivo: ${err.message} `);
            }
          }
        )
      )


  }

  private buscarItem(id: number, blingService: Bling): Observable<ContaReceberBling> {

    return from(blingService.contasReceber.find({ idContaReceber: id })).pipe(
      concatMap(conta => {
        if (conta.data.numeroDocumento.trim().length == 0) {
          console.log(conta.data);
          return this.atualizarDocumentoReceita(conta, blingService).pipe(
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
        repoResponseLog.findOne({ where: { idOriginal: conta.data.id.toFixed(0), nomeInformacao: 'conta_receber' } })
          .then(responseLog => {
            if (!responseLog) {
              responseLog = new ResponseLog();
              responseLog.idOriginal = conta.data.id.toFixed(0);
              responseLog.nomeInformacao = 'conta_receber';

            }
            responseLog.data = new Date();
            responseLog.response = JSON.stringify(conta);
            repoResponseLog.save(responseLog);
          });
      }),
      catchError((err) => {
        if (ERROS.filter(erro => err.message.includes(erro))) {
          logger.info(`[ContaReceberImportacao] Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
          return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, blingService)));
        } else {
          throw new Error(`[ContaReceberImportacao] Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `);
        }
      }),
    );
  }

  private buscarESalvar(modeloSimplificadoBling: any, dataPagamento: Date, blingService: Bling): Observable<ContaReceber> {

    return this.buscarItem(modeloSimplificadoBling.id, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService, dataPagamento)),
    );
  }

  private salvarItem(modeloBling: ContaReceberBling, blingService: Bling, dataPagamento: Date): Observable<ContaReceber> {
    const repo = this.dataSource.getRepository(ContaReceber);
    logger.info(`[Recebimento] Salvando`);
    return this.selecionaOuAssina(repo, modeloBling, blingService, dataPagamento).pipe(
      mergeMap((conta) => {
        return from(repo.save(conta));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<ContaReceber>,
    modeloBling: ContaReceberBling,
    blingService: Bling,
    dataPagamento: Date,
  ): Observable<ContaReceber> {
    return from(
      repo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      switchMap((conta) => {

        return this.criarContaReceber(conta, modeloBling, blingService);

      }),
      switchMap((conta) => {
        return this.criarRecebimento(conta, dataPagamento, modeloBling.data.borderos, blingService);
      }),
    );
  }

  criarRecebimento(contaReceber: ContaReceber, dataRecebimento: Date, borderos: number[], blingService: Bling): Observable<ContaReceber> {
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

        borderos.forEach(bordero => {
          if (this.toDateBling(bordero.data.data) === this.toDateBling(dataRecebimento)) {
            bordero.data.pagamentos.forEach(pag => {
              if (pag.numeroDocumento === contaReceber.numeroDocumento && pag.contato.id.toFixed(0) == contaReceber.pessoa.idOriginal) {
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
        contaReceber.recebimentos = contaReceber.recebimentos || [];
        let pagamentos: Recebimento[] = [];

        bordero.valorPago.forEach(valorPago => {
          let recebimento = contaReceber.recebimentos.find(Recebimento =>
            Recebimento.dataPagamento === dataRecebimento && Recebimento.valor === valorPago
          );

          if (!recebimento) {
            recebimento = new Recebimento();
            recebimento.dataPagamento = dataRecebimento;
            recebimento.valor = valorPago;
            recebimento.contaReceber = contaReceber;
            pagamentos.push(recebimento);
          }

        })

        if (pagamentos.length > 0) {
          if (bordero.portador) {
            return this.portadorImportacao.seleciona(bordero.portador, blingService).pipe(
              map(portador => {
                pagamentos.forEach(pag => pag.portador = portador);
                contaReceber.recebimentos = contaReceber.recebimentos.concat(pagamentos);
                return contaReceber;
              }),
            );
          } else {
            contaReceber.recebimentos = contaReceber.recebimentos.concat(pagamentos);
          }
        }

        return of(contaReceber);
      })
    );
  }



  criarContaReceber(conta: ContaReceber, modeloBling: ContaReceberBling, blingService: Bling): Observable<ContaReceber> {
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
        if (!conta) conta = new ContaReceber();

        conta.idOriginal = modeloBling.data.id.toFixed(0);
        conta.dataCompetencia = this.toDate(modeloBling.data.competencia);
        conta.dataEmissao = this.toDate(modeloBling.data.dataEmissao);
        conta.dataVencimento = this.toDate(modeloBling.data.vencimento);
        conta.historico = modeloBling.data.historico;
        conta.numeroDocumento = modeloBling.data.numeroDocumento;
        conta.situacao = contaReceberSituacao[modeloBling.data.situacao];
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
            if (ERROS.filter(erro => err.message.includes(erro))) {
              logger.info(`[Recebimento] Irá pesquisar novamente o bordero ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
              return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarBordero(id, blingService)));
            } else {
              throw new Error(`[Recebimento] Não foi possível pesquisar o bordero ${id}. Motivo: ${err.message} `);
            }
          }),
        );
      })
    );
  }

}
