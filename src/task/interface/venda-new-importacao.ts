import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as VendasBling } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/get.interface';
import { IFindResponse as VendaBling } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/find.interface';

import {
  catchError,
  concatMap,
  EMPTY,
  forkJoin,
  from,
  map,
  mergeAll,
  mergeMap,
  Observable,
  of,
  reduce,
  switchMap,
  tap,
  timer,
  toArray,
} from 'rxjs';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';
import { logger } from 'src/logger/winston.logger';
import { FormaPagamentoImportacao } from './forma-pagamento-importacao';
import { PessoaImportacao } from '../pessoa-importacao';
import { Venda } from 'src/venda/entities/venda.entity';
import { VendedorImportacao } from './vendedor-importacao';
import { FormaPagamento } from 'src/forma-pagamento/entities/forma-pagamento.entity';
import { Item } from 'src/venda/item/entities/item.entity';
import { VendaPagamento } from 'src/venda/pagamento/entities/venda-pagamento.entity';
import { Produto } from 'src/produto/entities/produto.entity';
import { ProdutoImportacao } from './produto-importacao';
import { Empresa } from 'src/empresa/entities/empresa.entity';
import { ResponseLog } from 'src/response-log/entities/response-log.entity';
import { response } from 'express';
import { AppMath } from 'src/common/util/operacoes-matematicas/app-math-operations';
import { RoundingModes } from 'src/common/util/operacoes-matematicas/big-decimal-operations.copy';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';

const ERROS = ['Não foi possível realizar a chamada HTTP: get', 'O limite de requisições por segundo foi atingido, tente novamente mais tarde.']
const TIMER_DELAY_MS = 15000;

class ItemBling {
  id: number;
  codigo?: string;
  unidade?: string;
  quantidade: number;
  desconto?: number;
  valor: number;
  aliquotaIPI?: number;
  descricao: string;
  descricaoDetalhada?: string;
  produto?: {
    id: number;
  };
  comissao?: {
    base?: number;
    aliquota?: number;
    valor?: number;
  };
}

class PagamentoBling {
  id: number;
  dataVencimento: string;
  valor: number;
  observacoes?: string;
  formaPagamento: {
    id: number;
  };
}

class Totalizadores {
  subtotal: number;
  desconto: number;
  descontoRateado: number;
  total: number;

  constructor() {
    this.subtotal = 0.00;
    this.desconto = 0.00;
    this.descontoRateado = 0.00;
    this.total = 0.00;
  }
}

@Injectable()
export class VendaNewImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private formaPagamentoImportacao: FormaPagamentoImportacao,
    private pessoaImportacao: PessoaImportacao,
    private vendedorImportacao: VendedorImportacao,
    private produtoImportacao: ProdutoImportacao,
  ) {
    this.tabela = 'venda';
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
          logger.info(`[VendaNewImportacao] Item processado com sucesso. ID:${value.id} 
            - PESSOA: ${value.pessoa?.nome}`);
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('[VendaNewImportacao] Erro inesperado: ' + err.message);
        },
      });
  }

  private processarPagina(blingService: Bling, controle: ControleImportacao): Observable<Venda> {
    return this.buscarPagina(controle, blingService).pipe(
      switchMap((lista) => {
        const itensRestantes =
          lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : [];
        return from(itensRestantes);
      }),
      concatMap((contaBling) => {
        if (contaBling.total > 0) return timer(350).pipe(concatMap(() => this.buscarESalvar(contaBling.id, contaBling.situacao.id, blingService)))
        else return of(new Venda())
      }
      ),
      tap(() => {
        let index = controle.ultimoIndexProcessado + 1;
        logger.info(`[VendaNewImportacao] INDEX ${index} DATA ${controle.data}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`[VendaNewImportacao] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[VendaNewImportacao] Próxima página.`);
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
        logger.info('[VendaNewImportacao] Atualizando data para ' + lastDate);
        controle.data = lastDate;
        this.atualizarControle(controle, 'date')
          .pipe(map(() => this.iniciar()))
          .subscribe();
      } else {
        logger.info(`[VendaNewImportacao] Busca finalizada.`);
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

  private buscarPagina(controle: ControleImportacao, blingService: Bling): Observable<VendasBling> {
    logger.info(`[VendaNewImportacao] Buscando página ${controle.pagina} / Data: ${controle.data}`);
    return timer(1000).pipe(
      switchMap(() =>
        from(
          blingService.pedidosVendas.get({
            pagina: controle.pagina,
            dataInicial: this.toDateBling(controle.data),
            dataFinal: this.toDateBling(controle.data),
            idsSituacoes: [9, 12],
            limite: 100,
          }),
        ).pipe(
          catchError((err: Error) => {

            if (ERROS.filter(erro => err.message.includes(erro))) {
              logger.info(
                `[VendaNewImportacao] Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`,
              );
              return timer(TIMER_DELAY_MS).pipe(
                switchMap(() => this.buscarPagina(controle, blingService)),
              );
            } else {
              throw new Error(
                `[VendaNewImportacao] Não foi possível pesquisar a página ${controle}. Motivo: ${err.message} `,
              );
            }
          }),
        ),
      ),
    );
  }

  private buscarItem(id: number, situacao, blingService: Bling): Observable<VendaBling> {
    let responseLogRepo = this.dataSource.getRepository(ResponseLog);
    return from(responseLogRepo.findOne({ where: { idOriginal: id.toFixed(0), nomeInformacao: 'venda' } })).pipe(
      switchMap(responseLog => {
        if (responseLog && situacao == 9) {
          logger.info(`[VendaNewImportacao] Item ${id} encontrado no cache.`);

          return of(JSON.parse(responseLog.response));
        } else {
          return from(blingService.pedidosVendas.find({ idPedidoVenda: id })).pipe(
            tap(item => {
              responseLogRepo.findOne({ where: { idOriginal: id.toFixed(0), nomeInformacao: 'venda' } }).then(
                response => {
                  if (!response) {
                    responseLog = new ResponseLog();
                  }

                  responseLog.idOriginal = id.toFixed(0);
                  responseLog.nomeInformacao = 'venda';
                  responseLog.data = new Date();
                  responseLog.response = JSON.stringify(item);
                  responseLogRepo.save(responseLog);
                }
              )
            }),
            catchError((err) => {
              if (ERROS.filter(erro => err.message.includes(erro))) {
                logger.info(`[VendaNewImportacao] Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
                return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, situacao, blingService)));
              } else {
                throw new Error(`[VendaNewImportacao] Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `);
              }
            }),
          );
        }
      })
    )

  }

  private buscarESalvar(id: number, situacao: number, blingService: Bling): Observable<Venda> {
    return this.buscarItem(id, situacao, blingService).pipe(
      switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
    );
  }

  private salvarItem(modeloBling: VendaBling, blingService: Bling): Observable<Venda> {
    const repo = this.dataSource.getRepository(Venda);
    logger.info(`[VendaNewImportacao] Salvando ${modeloBling.data.id} - ${modeloBling.data.contato.nome} - ${modeloBling.data.total}`);
    return this.selecionaOuAssina(repo, modeloBling, blingService).pipe(
      mergeMap((venda) => {
        return from(repo.save(venda));
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<Venda>,
    modeloBling: VendaBling,
    blingService: Bling,
  ): Observable<Venda> {
    return from(
      repo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      switchMap((venda) => {
        return this.createVenda(venda, modeloBling, blingService);
      }),
    );
  }

  private createVenda(venda: Venda, response: VendaBling, blingService: Bling): Observable<Venda> {
    const res = response.data;

    if (!venda) venda = new Venda();

    venda.idOriginal = res.id.toFixed(0);
    venda.dataEmissao = this.toDate(res.data);
    venda.dataSaida = this.toDate(res.dataSaida);

    venda.empresa = new Empresa();
    venda.empresa.id = 1;
    venda.estado = response.data.situacao.id == 9 ? 'F' : 'C';
    venda.outrasDespesas = res.outrasDespesas;
    venda.frete = res.transporte.frete;

    venda.total = res.total;

    return forkJoin({
      vendedor: this.vendedorImportacao.seleciona(res.vendedor.id, blingService),
      pessoa: this.pessoaImportacao.seleciona(res.contato.id, blingService),
      itens: this.createItens(venda.itens, res.itens, venda.dataEmissao, blingService),
      pagamentos: this.createPagamentos(venda.pagamentos, res.parcelas, venda.dataSaida, blingService),
    }).pipe(
      switchMap((pesquisas) => {
        venda.identificador = res.numero.toFixed(0);
        venda.pessoa = pesquisas.pessoa;
        venda.vendedor = pesquisas.vendedor;
        venda.itens = pesquisas.itens.itens;
        venda.pagamentos = pesquisas.pagamentos;

        const valorLiquidoProduto = AppMath.sum([response.data.total, -(response.data?.outrasDespesas ?? 0.00), -(response.data?.transporte?.frete ?? 0.00)]);

        const valorDesconto = AppMath.sum([response.data.totalProdutos, -valorLiquidoProduto]);

        if (res.desconto.valor > 0) {
          let desconto = 0;

          if (res.desconto.unidade == 'PERCENTUAL') {
            desconto = valorDesconto;
          } else {
            desconto = res.desconto.valor;
          }
          this.distribuirDescontoSobreOsItens(venda.itens, desconto, pesquisas.itens.totalizadores);
        }
        //DESCONTO INCIDE APENAS SOBRE OS ITENS, NÃO É APLICADO SOBRE VALORES ACESSÓRIOS, COMO: frete, outrasDespesas
        venda.desconto_valor = pesquisas.itens.totalizadores.desconto;
        venda.desconto_rateado_valor = pesquisas.itens.totalizadores.descontoRateado;

        const descontoTotal = AppMath.sum(
          pesquisas.itens.totalizadores.desconto,
          pesquisas.itens.totalizadores.descontoRateado,
        );
        venda.desconto_percentual = AppMath.divide(
          descontoTotal,
          pesquisas.itens.totalizadores.subtotal,
        );
        // venda.subtotalProdutos = AppMath.sum([
        //   pesquisas.itens.totalizadores.subtotal,
        //   venda.outrasDespesas,
        //   venda.frete,
        // ]);
        venda.subtotalProdutos = pesquisas.itens.totalizadores.subtotal;
        return of(venda);
      }),
    );
  }

  private createItens(
    itens: Item[],
    itensBling: ItemBling[],
    data: Date,
    blingService: Bling,
  ): Observable<{ itens: Item[]; totalizadores: Totalizadores }> {
    const totalizadores: Totalizadores = new Totalizadores();

    // Ordena os itensBling por id
    itensBling.sort((a, b) => a.id - b.id);

    // Inicializa o array de itens se estiver vazio
    if (!itens) itens = [];
    if (itens.length > 0) itens.sort((a, b) => a.idOriginal.localeCompare(b.idOriginal));

    return from(itensBling).pipe(
      concatMap((itembling: ItemBling) =>
        this.produtoImportacao.seleciona(itembling.produto.id, blingService).pipe(
          switchMap((produto) => {
            let existingItem = itens.find((itm) => itm.idOriginal === itembling.id.toFixed(0));
            let newItem = existingItem || new Item();
            if (!existingItem) itens.push(newItem);

            let precoVenda = 0.00;

            // if (produto.valorPreco) precoVenda = produto.valorPreco;
            // else {
            precoVenda = itembling.desconto
              ? itembling.valor / (1 - itembling.desconto / 100)
              : itembling.valor;

            precoVenda = AppMath.round(precoVenda, 2, RoundingModes.HALF_DOWN);


            // }
            let diferencaPreco = AppMath.sum(precoVenda, -produto.valorPreco);
            if (diferencaPreco < 0.00) diferencaPreco = AppMath.multiply(diferencaPreco, -1);
            if (diferencaPreco < 0.10) precoVenda = produto.valorPreco;

            newItem.identificador = itembling.codigo;
            newItem.idOriginal = itembling.id.toFixed(0);
            newItem.produto = produto;


            let subtotalItem = AppMath.multiply(precoVenda, itembling.quantidade);

            newItem.valor = precoVenda;
            newItem.total = AppMath.multiply(itembling.valor, itembling.quantidade);

            newItem.desconto_percentual = itembling.desconto || 0.0;
            newItem.desconto_valor = itembling.desconto ? AppMath.sum(subtotalItem, -newItem.total) : 0.0;
            newItem.quantidade = itembling.quantidade;
            newItem.unidade = itembling.unidade;
            newItem.estado = 'A';
            newItem.data = data;

            totalizadores.desconto = AppMath.sum(totalizadores.desconto, newItem.desconto_valor);
            totalizadores.subtotal = AppMath.sum(totalizadores.subtotal, AppMath.multiply(precoVenda, itembling.quantidade));
            totalizadores.total = AppMath.sum(totalizadores.total, newItem.total);

            return of(newItem);
          }),
        ),
      ),
      toArray(),
      switchMap((itens) => {
        let retorno = {
          itens: itens,
          totalizadores: totalizadores,
        };

        return of(retorno);
      }),
    );
  }

  private distribuirDescontoSobreOsItens(
    itens: Item[],
    desconto: number,
    totalizadores: Totalizadores,
  ) {
    let resto = desconto;
    totalizadores.descontoRateado = 0.0;
    totalizadores.total = 0.0;

    itens.forEach((item, index) => {
      const subtotalItem = item.total;
      const proporcaoItem = AppMath.divide(subtotalItem, totalizadores.subtotal, 2, RoundingModes.HALF_UP);
      let descontoProporcional = AppMath.multiply(desconto, proporcaoItem, 2, RoundingModes.HALF_UP);

      if (index === itens.length - 1) descontoProporcional = resto;

      if (descontoProporcional > resto) descontoProporcional = resto;

      item.desconto_rateado_valor = descontoProporcional;
      item.total = AppMath.sum(item.total, -descontoProporcional);

      resto = AppMath.sum(resto, -descontoProporcional);

      totalizadores.descontoRateado = AppMath.sum(
        totalizadores.descontoRateado,
        item.desconto_rateado_valor,
      );

    });

    totalizadores.total = AppMath.sum(totalizadores.subtotal, totalizadores.descontoRateado);
  }

  private createPagamentos(
    pagamentos: VendaPagamento[],
    pagamentosBling: PagamentoBling[],
    data: Date,
    blingService: Bling
  ): Observable<VendaPagamento[]> {
    // Ordena os itensBling por id
    pagamentosBling.sort((a, b) => a.id - b.id);

    // Inicializa o array de itens se estiver vazio
    if (!pagamentos) pagamentos = [];
    if (pagamentos.length > 0) pagamentos.sort((a, b) => a.idOriginal.localeCompare(b.idOriginal));

    return from(pagamentosBling).pipe(
      mergeMap((pagamentoBling: PagamentoBling) => {

        return this.formaPagamentoImportacao.seleciona(pagamentoBling.formaPagamento.id, blingService).pipe(
          mergeMap((formaPagamento) => {
            let existingPagamento = pagamentos.find(
              (pag) => pag.idOriginal === pagamentoBling.id.toFixed(0),
            );
            let newPagamento = existingPagamento || new VendaPagamento();

            if (!existingPagamento) pagamentos.push(newPagamento);

            newPagamento.idOriginal = pagamentoBling.id.toFixed(0);
            newPagamento.formaPagamento = formaPagamento;
            newPagamento.dataVencimento = this.toDate(pagamentoBling.dataVencimento);
            if (data) newPagamento.dataEmissao = data;
            newPagamento.observacao = pagamentoBling.observacoes;
            newPagamento.valor = pagamentoBling.valor;

            return of(newPagamento);
          }),
        );
      }),
      toArray(),
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
