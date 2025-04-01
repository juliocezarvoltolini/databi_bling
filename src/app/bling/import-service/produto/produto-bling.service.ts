import { IFindResponse as ProdutoBling } from 'bling-erp-api/lib/entities/produtos/interfaces/find.interface';
import { ImportServiceBase } from '../import.interface';
import { Produto } from 'src/app/produto/entities/produto.entity';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { ProdutoService } from 'src/app/produto/produto.service';
import { PessoaBlingService } from '../pessoa/pessoa-bling.service';
import { VendedorBlingService } from '../vendedor/vendedor-bling.service';
import { FornecedorBlingService } from '../fornecedor/fornecedor-bling.service';
import { firstValueFrom } from 'rxjs';
import { logger } from 'src/logger/winston.logger';
import Bling from 'bling-erp-api';
import { BlingApiService } from '../../bling-api.service';
import { ProdutoCategoriaOpcao } from 'src/app/produto/entities/produto-categoria.entity';

export class ProdutoBlingService extends ImportServiceBase<Produto, ProdutoBling> {
  async getById(Id: number): Promise<Produto> {
    logger.info(`[ProdutoBlingService] Selecionando produto Id(${Id})`);
    const produtos = await firstValueFrom(this.produtoService.find({ idOriginal: Id.toFixed(0) }));
    if (produtos) return produtos[0];

    let produtoBling: ProdutoBling;
    const produtoCached = await this.getCachedEntity(Id);
    if (produtoCached) {
      logger.info(`[ProdutoBlingService] Encontrou produto no cache`);
      produtoBling = produtoCached.entity;
    } else {
      produtoBling = await (await this.blingService.getBling()).produtos.find({ idProduto: Id });
      this.saveCachedEntity(Id.toFixed(0), produtoBling);
    }
  }

  private createProduto(produtoBling: ProdutoBling): Promise<Produto> {return null}

  constructor(
    responseLogService: ResponseLogService,
    private produtoService: ProdutoService,
    private blingService: BlingApiService,
    private fornecedorService: FornecedorBlingService,
  ) {
    super(responseLogService, 'produto');
  }
}
