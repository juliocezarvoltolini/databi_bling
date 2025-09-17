import { Venda } from 'src/app/venda/entities/venda.entity';
import {
  APICollection,
  ImportServiceBase,
  PagedImportServiceBase,
  PaginacaoType,
} from '../import.interface';
import { IFindResponse as VendaBling } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/find.interface';
import { Inject, Injectable } from '@nestjs/common';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { ProdutoBlingService } from '../produto/produto-bling.service';
import { PessoaBlingService } from '../pessoa/pessoa-bling.service';
import { VendedorBlingService } from '../vendedor/vendedor-bling.service';
import { dateBlingToDate } from '../../utils/bling-utils';
import { Empresa } from 'src/app/empresa/entities/empresa.entity';
import { Item } from 'src/app/venda/item/entities/item.entity';
import { DataSource } from 'typeorm';
import { AppMath } from 'src/shared/util/operacoes-matematicas/app-math-operations';
import { RoundingModes } from 'src/shared/util/operacoes-matematicas/big-decimal-operations.copy';
import { Produto } from 'src/app/produto/entities/produto.entity';
import { VendaPagamento } from 'src/app/venda/pagamento/entities/venda-pagamento.entity';
import { FormaPagamentoBlingService } from '../forma-pagamento/forma-pagamento-bling.service';
import { logger } from 'src/logger/winston.logger';
import { BlingApiService } from '../../bling-api.service';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { subtrairMeses } from 'src/shared/util/date/date.utils';

class Totalizadores {
  subtotal: number;
  desconto: number;
  descontoRateado: number;
  total: number;

  constructor() {
    this.subtotal = 0;
    this.desconto = 0;
    this.descontoRateado = 0;
    this.total = 0;
  }
}

@Injectable()
export class VendaBlingService extends ImportServiceBase<Venda, VendaBling> {
  constructor(
    responseLogService: ResponseLogService,
    private produtoBlingService: ProdutoBlingService,
    private pessoaBlingService: PessoaBlingService,
    private vendedorBlingService: VendedorBlingService,
    private formaPagamentoBlingService: FormaPagamentoBlingService,
    private blingService: BlingApiService,
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
  ) {
    super(responseLogService, 'venda');
  }

  async getById(Entity?: Partial<VendaBling['data']>): Promise<Venda> {
    logger.info(`[VendaBlingService] Selecionando venda Id(${Entity.id})`);
    const vendaRepository = this.dataSource.getRepository(Venda);
    let alterouTotal = false;

    const vendas = await vendaRepository.find({ where: { idOriginal: Entity.id.toFixed(0) } });
    let venda: Venda = null;

    if (Entity && vendas.length > 0) {
      const newStatusVenda = Entity.situacao.id == 9 ? 'F' : 'C';
      const descontoBling = Entity.totalProdutos - Entity.total;
      const descontoTotalVenda = AppMath.sum(
        vendas[0].desconto_valor || 0,
        vendas[0].desconto_rateado_valor || 0,
      );
      const alterouDesconto = Math.abs(descontoBling - descontoTotalVenda) > 0.01;
      alterouTotal = Math.abs(Entity.total - vendas[0].total) > 0.01;


      if (
        vendas[0].estado == newStatusVenda &&
        !alterouTotal &&
        !alterouDesconto
      ) {
        logger.info(`[VendaBlingService] Encontrou a venda no banco de dados sem alterações.`);
        return vendas[0];
      } else {
        venda = vendas[0];
        logger.info(
          `[VendaBlingService] Venda ${Entity.id} possui alterações: total=${alterouTotal}, desconto=${alterouDesconto}`,
        );
      }
    }

    const cache = await this.getCachedEntity(Entity.id);

    const vendaBling = await (
      await this.blingService.getBling()
    ).pedidosVendas.find({ idPedidoVenda: Entity.id });

    logger.info(`[VendaBlingService] Salvando venda no cache`);
    await this.saveCachedEntity(Entity.id.toFixed(0), vendaBling, cache ? cache.cache : null);

    return this.createVenda(venda, vendaBling);
  }

  private async createVenda(venda: Venda, response: VendaBling): Promise<Venda> {
    const vendaBling = response.data;

    // Usar transação para garantir consistência dos dados
    return await this.dataSource.transaction(async (manager) => {
      if (!venda) venda = new Venda();

      venda.idOriginal = vendaBling.id.toFixed(0);
      venda.dataEmissao = dateBlingToDate(vendaBling.data);
      venda.dataSaida = dateBlingToDate(vendaBling.dataSaida);

      venda.empresa = new Empresa();
      venda.identificador = response.data.numero.toFixed(0);
      venda.empresa.id = 1;
      venda.estado = response.data.situacao.id == 9 ? 'F' : 'C';
      venda.outrasDespesas = vendaBling.outrasDespesas;
      venda.frete = vendaBling.transporte.frete;
      venda.total = vendaBling.total;

      const [vendedorP, pessoaP, itensP, PagamentosP] = [
        this.vendedorBlingService.getById(vendaBling.vendedor),
        this.pessoaBlingService.getById(vendaBling.contato),
        this.createItens(venda, vendaBling),
        this.createPagamentos(vendaBling.parcelas, vendaBling, venda),
      ];

      const [vendedor, pessoa, itens] = await Promise.all([
        vendedorP,
        pessoaP,
        itensP,
        PagamentosP,
      ]);

      venda.vendedor = vendedor;
      venda.pessoa = pessoa;
      venda.subtotalProdutos = itens.totalizadores.subtotal;
      venda.desconto_valor = itens.totalizadores.desconto;
      venda.desconto_percentual = 0;
      const descontoTotal = AppMath.sum(
        itens.totalizadores.descontoRateado,
        itens.totalizadores.desconto,
      );
      if (descontoTotal > 0) {
        venda.desconto_percentual = AppMath.divide(descontoTotal, itens.totalizadores.subtotal);
      }
      venda.desconto_rateado_valor = itens.totalizadores.descontoRateado;

      const vendaRepo = manager.getRepository(Venda);
      venda = await vendaRepo.save(venda);

      logger.info(
        `[VendaBlingService] Venda ${vendaBling.id} salva com sucesso. Itens: ${venda.itens?.length || 0}, Pagamentos: ${venda.pagamentos?.length || 0}`,
      );

      return venda;
    });
  }

  private async createItens(
    venda: Venda,
    vendaBling: VendaBling['data'],
  ): Promise<{ itens: Item[]; totalizadores: Totalizadores }> {
    const itensBling = [...vendaBling.itens].sort((a, b) => a.id - b.id);
    const idsMantidos = vendaBling.itens.map((item) => item.id.toFixed(0));

    if (!venda.itens) venda.itens = [];

    const itensMatidos = venda.itens.filter((item) => idsMantidos.includes(item.idOriginal));
    const itensParaDeletar = venda.itens.filter((item) => !idsMantidos.includes(item.idOriginal));

    venda.itens.sort((a, b) => a.idOriginal.localeCompare(b.idOriginal));

    // Deletar itens removidos explicitamente do banco de dados
    if (itensParaDeletar.length > 0) {
      const itemRepo = this.dataSource.getRepository(Item);
      await itemRepo.remove(itensParaDeletar);
      logger.info(
        `[VendaBlingService] Venda ${vendaBling.id}: removidos ${itensParaDeletar.length} itens do banco`,
      );
    }

    //Eles conseguem remover itens de vendas que já foram fechadas.
    //Então é necessário excluir os itens que não estão na resposta da API do Bling
    venda.itens.splice(0, venda.itens.length, ...itensMatidos);

    const totalizadores = new Totalizadores();

    for (const itemBling of itensBling) {
      const produto = await this.produtoBlingService.getById(itemBling.produto);
      const item = this.createItem(itemBling, produto, venda, venda.itens);

      this.acumularTotalizadores(item, totalizadores);
    }

    this.ajustarDescontoVenda(vendaBling, venda.itens, totalizadores);

    return { itens: venda.itens, totalizadores };
  }

  private createItem(
    itemBling: VendaBling['data']['itens'][0],
    produto: Produto,
    venda: Venda,
    itensExistentes: Item[],
  ): Item {
    const idOriginal = itemBling.id.toFixed(0);
    let item = itensExistentes.find((i) => i.idOriginal === idOriginal);

    if (!item) {
      item = new Item();
      venda.itens.push(item);
    }

    let precoVenda = 0.0;

    if (itemBling.valor > 0.0) {
      //Processo inverso para descobrir o valor do item.
      precoVenda = itemBling.desconto
        ? AppMath.round(
          itemBling.valor / (1 - itemBling.desconto / 100),
          2,
          RoundingModes.HALF_DOWN,
        )
        : itemBling.valor;
    } else {
      //Pode entrar aqui quando for concedido 100% de desconto sobre o item
      if (itemBling.desconto > 0) {
        precoVenda = produto.valorPreco;
      }
    }

    if (itemBling.desconto > 0) {
      //Eles usam produtos genéricos, então não tem como definir que o preço do cadastro de produtos é o preço unitário
      // do item da venda
      const diferencaPreco = Math.abs(AppMath.sum(precoVenda, -produto.valorPreco));
      if (diferencaPreco < 0.3) precoVenda = produto.valorPreco;
    }

    const subtotalItem = AppMath.multiply(precoVenda, itemBling.quantidade);
    const total = AppMath.multiply(itemBling.valor, itemBling.quantidade);
    const descontoValor = itemBling.desconto ? AppMath.sum(subtotalItem, -total) : 0.0;

    item.identificador = itemBling.codigo;
    item.idOriginal = idOriginal;
    item.produto = produto;
    item.valor = precoVenda;
    item.total = total;
    item.desconto_percentual = itemBling.desconto || 0.0;
    item.desconto_valor = descontoValor;
    item.quantidade = itemBling.quantidade;
    item.unidade = itemBling.unidade;
    item.estado = 'A';
    item.data = venda.dataEmissao;
    item.venda = venda;

    return item;
  }

  private acumularTotalizadores(item: Item, totalizadores: Totalizadores): void {
    totalizadores.desconto = AppMath.sum(totalizadores.desconto, item.desconto_valor);
    totalizadores.subtotal = AppMath.sum(
      totalizadores.subtotal,
      AppMath.multiply(item.valor, item.quantidade),
    );
    totalizadores.total = AppMath.sum(totalizadores.total, item.total);
  }

  private ajustarDescontoVenda(
    vendaBling: VendaBling['data'],
    itens: Item[],
    totalizadores: Totalizadores,
  ): void {
    if (vendaBling.desconto.valor <= 0.0) return;

    const valorLiquidoProduto = AppMath.sum([
      vendaBling.total,
      -vendaBling.transporte.frete,
      -vendaBling.outrasDespesas,
    ]);

    let descontoVenda = 0.0;

    if (vendaBling.desconto.unidade == 'REAL') descontoVenda = vendaBling.desconto.valor;
    else descontoVenda = AppMath.sum(totalizadores.total, -valorLiquidoProduto);

    if (descontoVenda <= 0.0) return;

    let restoDesconto = descontoVenda;

    totalizadores.descontoRateado = 0;
    totalizadores.total = 0;

    for (const [index, item] of itens.entries()) {
      const subtotalItem = AppMath.multiply(item.valor, item.quantidade);
      const razao = AppMath.divide(subtotalItem, totalizadores.subtotal);

      const isUltimo = index === itens.length - 1;
      const descontoRateado = isUltimo
        ? restoDesconto
        : Math.min(AppMath.multiply(razao, descontoVenda), restoDesconto);

      item.desconto_rateado_valor = descontoRateado;
      item.desconto_percentual = 0.0;
      const denominador = item.desconto_valor + descontoRateado + item.total;
      if (denominador > 0) {
        item.desconto_percentual = AppMath.divide(
          item.desconto_valor + descontoRateado,
          denominador,
        );
      }

      item.total = AppMath.sum(item.total, -descontoRateado);
      restoDesconto = AppMath.sum(restoDesconto, -descontoRateado);

      totalizadores.descontoRateado = AppMath.sum(totalizadores.descontoRateado, descontoRateado);
      totalizadores.total = AppMath.sum(totalizadores.total, item.total);
    }
  }

  private async createPagamentos(
    pagamentosBling: VendaBling['data']['parcelas'],
    vendaBling: VendaBling['data'],
    venda: Venda,
  ): Promise<VendaPagamento[]> {
    // Ordena os itensBling por id

    pagamentosBling.sort((a, b) => a.id - b.id);
    const idsMatidos = pagamentosBling.map((pag) => pag.id.toFixed(0));

    if (!venda.pagamentos) venda.pagamentos = [];
    const pagamentosMantidos = venda.pagamentos.filter((pag) =>
      idsMatidos.includes(pag.idOriginal),
    );
    const pagamentosParaDeletar = venda.pagamentos.filter(
      (pag) => !idsMatidos.includes(pag.idOriginal),
    );
    venda.pagamentos.sort((a, b) => a.idOriginal.localeCompare(b.idOriginal));

    // Deletar pagamentos removidos explicitamente do banco de dados
    if (pagamentosParaDeletar.length > 0) {
      const pagamentoRepo = this.dataSource.getRepository(VendaPagamento);
      await pagamentoRepo.remove(pagamentosParaDeletar);
      logger.info(
        `[VendaBlingService] Venda ${vendaBling.id}: removidos ${pagamentosParaDeletar.length} pagamentos do banco`,
      );
    }

    //Podem haver pagamentos que precisam ser removidos
    venda.pagamentos.splice(0, venda.pagamentos.length, ...pagamentosMantidos);

    for (const pagamentoBling of pagamentosBling) {
      const formaPagamento = await this.formaPagamentoBlingService.getById(
        pagamentoBling.formaPagamento,
      );
      let pagamento = venda.pagamentos.find(
        (value) => value.idOriginal == pagamentoBling.id.toFixed(0),
      );

      if (!pagamento) {
        pagamento = new VendaPagamento();
        venda.pagamentos.push(pagamento);
      }
      pagamento.formaPagamento = formaPagamento;
      pagamento.idOriginal = pagamentoBling.id.toFixed(0);
      pagamento.dataVencimento = dateBlingToDate(pagamentoBling.dataVencimento);
      pagamento.dataEmissao = venda.dataEmissao;
      pagamento.observacao = pagamentoBling.observacoes;
      pagamento.valor = pagamentoBling.valor;
    }

    return venda.pagamentos;
  }
}

@Injectable()
export class VendaBlingPagedService extends PagedImportServiceBase<Venda, VendaBling> {
  constructor(
    controleImportacaoService: ControleImportacaoService,
    private readonly blingService: BlingApiService,
    private vendaBlingService: VendaBlingService,
  ) {
    super('venda', controleImportacaoService, PaginacaoType.DATE, vendaBlingService);
  }

  resetControle(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    //Toda segunda ou quinta feira vai buscar os últimos 4 meses.
    if (this.controle.atualizadoEm < today && [1, 4].includes(today.getDay())) {
      this.controle.data = subtrairMeses(this.controle.data, 4);
      this.controle.pagina = 0;
      this.controle.ultimoIndexProcessado = -1;
      logger.info(
        `[VendaBlingPagedService] Resetando controle de importação para os últimos 4 meses a partir de ${this.controle.data.toISOString()}`,
      );
    }
    return;
  }
  async searchPage(searchParameters?: Record<string, any>): Promise<APICollection<VendaBling>> {
    const bling = await this.blingService.getBling();
    const pagina = await bling.pedidosVendas.get(searchParameters);
    return pagina;
  }
  readAndSave(blingEntity: Partial<VendaBling['data']>): Promise<Venda> {
    return this.vendaBlingService.getById(blingEntity);
  }
}
