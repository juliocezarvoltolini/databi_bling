import { Venda } from "src/app/venda/entities/venda.entity";
import { ImportServiceBase } from "../import.interface";
import { IFindResponse as VendaBling } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/find.interface';
import { Inject, Injectable } from "@nestjs/common";
import { ResponseLogService } from "src/app/response-log/response-log.service";
import { ProdutoBlingService } from "../produto/produto-bling.service";
import { PessoaBlingService } from "../pessoa/pessoa-bling.service";
import { VendedorBlingService } from "../vendedor/vendedor-bling.service";
import { dateBlingToDate } from "../../utils/bling-utils";
import { Empresa } from "src/app/empresa/entities/empresa.entity";
import { Item } from "src/app/venda/item/entities/item.entity";
import { DataSource } from "typeorm";
import { AppMath } from "src/shared/util/operacoes-matematicas/app-math-operations";
import { RoundingModes } from "src/shared/util/operacoes-matematicas/big-decimal-operations.copy";

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
    constructor(responseLogService: ResponseLogService,
        private produtoBlingService: ProdutoBlingService,
        private pessoaBlingService: PessoaBlingService,
        private vendedorBlingService: VendedorBlingService,
        @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    ) {
        super(responseLogService, 'venda');
    }

    getById(Id: number): Promise<Venda> {
        throw new Error("Method not implemented.");
    }



    private async createVenda(venda: Venda, response: VendaBling): Promise<Venda> {
        const vendaBling = response.data;

        if (!venda) venda = new Venda();

        venda.idOriginal = vendaBling.id.toFixed(0);
        venda.dataEmissao = dateBlingToDate(vendaBling.data);
        venda.dataSaida = dateBlingToDate(vendaBling.dataSaida);

        venda.empresa = new Empresa();
        venda.empresa.id = 1;
        venda.estado = response.data.situacao.id == 9 ? 'F' : 'C';
        venda.outrasDespesas = vendaBling.outrasDespesas;
        venda.frete = vendaBling.transporte.frete;
        venda.total = vendaBling.total;

        const [vendedorP, pessoaP] = [
            this.vendedorBlingService.getById(vendaBling.vendedor.id),
            this.pessoaBlingService.getById(vendaBling.contato.id)
        ]

        const [vendedor, pessoa] = await Promise.all([vendedorP, pessoaP]);

        return null


    }

    private async createItens(
        vendaBling: VendaBling['data'],
        dataVenda: Date,
    ): Promise<{ itens: Item[]; totalizadores: Totalizadores }> {
        const itemRepo = this.dataSource.getRepository(Item);
        const totalizadores: Totalizadores = new Totalizadores();
        // Ordena os itensBling por id
        const itensBling = vendaBling.itens;

        const itens = await itemRepo.find({ where: { venda: { idOriginal: vendaBling.id.toFixed(0) } }, order: { idOriginal: "ASC" } });
        itensBling.sort((a, b) => a.id - b.id);

        if (itens.length > 0) itens.sort((a, b) => a.idOriginal.localeCompare(b.idOriginal));

        for (let index = 0; index < itensBling.length; index++) {

            const itenBling = itensBling[index];
            const produto = await this.produtoBlingService.getById(itenBling.produto.id);

            const existingItem = itens.find((itm) => itm.idOriginal === itenBling.id.toFixed(0));
            const item = existingItem || new Item();

            if (!existingItem) itens.push(item);

            let precoVenda = 0.0;

            //No item apenas desconto percentual
            precoVenda = itenBling.desconto
                ? itenBling.valor / (1 - itenBling.desconto / 100)
                : itenBling.valor;

            precoVenda = AppMath.round(precoVenda, 2, RoundingModes.HALF_DOWN);

            if (itenBling.desconto > 0) {
                let diferencaPreco = AppMath.sum(precoVenda, -produto.valorPreco);
                if (diferencaPreco < 0.0) diferencaPreco = AppMath.multiply(diferencaPreco, -1);
                //A empresa usa produtos "coringa", colocam o preço no ato da venda
                if (diferencaPreco < 0.3) precoVenda = produto.valorPreco;
            }

            item.identificador = itenBling.codigo;
            item.idOriginal = itenBling.id.toFixed(0);
            item.produto = produto;

            const subtotalItem = AppMath.multiply(precoVenda, itenBling.quantidade);

            item.valor = precoVenda;
            item.total = AppMath.multiply(itenBling.valor, itenBling.quantidade);

            item.desconto_percentual = itenBling.desconto || 0.0;
            item.desconto_valor = itenBling.desconto
                ? AppMath.sum(subtotalItem, -item.total)
                : 0.0;
            item.quantidade = itenBling.quantidade;
            item.unidade = itenBling.unidade;
            item.estado = 'A';
            item.data = dataVenda;

            totalizadores.desconto = AppMath.sum(totalizadores.desconto, item.desconto_valor);
            totalizadores.subtotal = AppMath.sum(
                totalizadores.subtotal,
                AppMath.multiply(precoVenda, itenBling.quantidade),
            );
            totalizadores.total = AppMath.sum(totalizadores.total, item.total);


        }

        return { itens, totalizadores }
    }



}