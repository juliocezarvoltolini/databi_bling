import { Produto } from 'src/app/produto/entities/produto.entity';
import {
  APICollection,
  ImportServiceBase,
  PagedImportServiceBase,
  PaginacaoType,
} from '../import.interface';
import { IGetBalancesResponse as EstoqueBling } from 'bling-erp-api/lib/entities/estoques/interfaces/get-balances.interface';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { ProdutoService } from 'src/app/produto/produto.service';
import { BlingApiService } from '../../bling-api.service';
import { logger } from 'src/logger/winston.logger';
import { ProdutoBlingService } from './produto-bling.service';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EstoqueBlingService extends ImportServiceBase<
  Produto,
  { data: EstoqueBling['data'][0] }
> {
  async getById(Entity?: Partial<EstoqueBling['data'][0]>): Promise<Produto> {
    const estoque = Entity;
    const produto = await this.produtoBlingService.getById({ id: estoque.produto.id });

    produto.saldoEstoque = estoque.saldoVirtualTotal;

    await this.produtoService.repository.update(produto.id, {
      saldoEstoque: estoque.saldoVirtualTotal,
    });
    logger.info(
      `[EstoqueBlingService] Atualizando produto ${produto.id} - ${produto.descricao} com saldo de estoque: ${estoque.saldoVirtualTotal}`,
    );

    return null;
  }

  constructor(
    responseLogService: ResponseLogService,
    private produtoService: ProdutoService,
    private blingService: BlingApiService,
    private produtoBlingService: ProdutoBlingService,
  ) {
    super(responseLogService, 'estoque');
  }
}

@Injectable()
export class EstoqueBlingServicePaged extends PagedImportServiceBase<
  Produto,
  { data: EstoqueBling['data'][0] }
> {
  constructor(
    controleImportacaoService: ControleImportacaoService,
    private readonly blingService: BlingApiService,
    private estoqueBlingService: EstoqueBlingService,
    private produtoService: ProdutoService,
  ) {
    super('estoque', controleImportacaoService, PaginacaoType.INDEX, estoqueBlingService);
  }

  override async resetControle(): Promise<void> {
    if (!this.controle.terminouConsultaEm) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const ultimaConsulta = new Date(this.controle.terminouConsultaEm);
    ultimaConsulta.setHours(0, 0, 0, 0);

    if (ultimaConsulta < hoje) {
      this.controle.data = null;
      this.controle.pagina = 0;
      this.controle.ultimoIndexProcessado = -1;
      logger.info(`[EstoqueBlingPagedService] Controle resetado em ${hoje.toDateString()}`);
    }
  }
  override async interromper(): Promise<boolean> {
    if (this.controle.terminouConsultaEm == null) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ultimaConsulta = new Date(this.controle.terminouConsultaEm);
    ultimaConsulta.setHours(0, 0, 0, 0);
    return ultimaConsulta.getTime() == hoje.getTime();
  }

  async searchPage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    searchParameters?: Record<string, any>,
  ): Promise<APICollection<{ data: EstoqueBling['data'][0] }>> {
    const produtos = await this.produtoService.repository.find({
      where: { situacao: 1 },
      take: 100,
      skip: (this.controle.pagina == 0 ? 1 : this.controle.pagina - 1) * 100,
      order: { id: 'ASC' },
    });

    const bling = await this.blingService.getBling();
    logger.info(
      `[EstoqueBlingServicePaged] Buscando saldos de estoque para ${produtos.length} produtos na página ${this.controle.pagina}`,
    );
    const estoques = await bling.estoques.getBalances({
      idsProdutos: produtos.map((p) => parseInt(p.idOriginal)),
    });
    return estoques;
  }
  readAndSave(blingEntity: EstoqueBling['data'][0]): Promise<Produto> {
    return this.estoqueBlingService.getById(blingEntity);
  }
}
