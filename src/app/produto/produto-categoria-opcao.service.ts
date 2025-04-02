import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { ProdutoCategoriaOpcao } from './entities/produto-categoria.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class ProdutoCategoriaOpcaoService extends BaseService<ProdutoCategoriaOpcao> {
  constructor(@Inject('DATA_SOURCE') private readonly dataSource: DataSource) {
    super(dataSource.getRepository(ProdutoCategoriaOpcao));
  }
}
