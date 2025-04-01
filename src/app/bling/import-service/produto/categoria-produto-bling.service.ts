import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { ImportServiceBase } from '../import.interface';
import { IFindResponse as CategoriaBling } from 'bling-erp-api/lib/entities/categoriasProdutos/interfaces/find.interface';
import { Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProdutoCategoria, ProdutoCategoriaOpcao } from 'src/app/produto/entities/produto-categoria.entity';
import { BlingApiService } from '../../bling-api.service';

export class ProdutoCategoriaBlingService extends ImportServiceBase<
  ProdutoCategoriaOpcao,
  CategoriaBling
> {
  async getById(Id: number): Promise<ProdutoCategoriaOpcao> {
    const categoriaRepository = this.dataSource.getRepository(ProdutoCategoriaOpcao);
    const opcaoRepository = this.dataSource.getRepository(ProdutoCategoriaOpcao);
    const categoriaCached = await this.getCachedEntity(Id);
    let categoriaBling: CategoriaBling;
    if (categoriaCached) categoriaBling = categoriaCached.entity;
    else {
      categoriaBling = await (
        await this.blingService.getBling()
      ).categoriasProdutos.find({
        idCategoriaProduto: Id,
      });

      this.saveCachedEntity(Id.toFixed(0), categoriaBling);
    }

    opcaoRepository.createQueryBuilder('pco').innerJoin(ProdutoCategoria, 'pc', 'pco.')

    const categorias = categoriaRepository.find({
      where: { nome: categoriaBling.data.descricao },
      relations: {
        produtoCategoria: true,
      },
      order: {
        nome: 'ASC',
      },
    });

    return null;
  }

  constructor(
    responseLogService: ResponseLogService,
    @Inject('DATA_SOURCE') private dataSource: DataSource,
    private blingService: BlingApiService,
  ) {
    super(responseLogService, 'categoria');
  }
}
