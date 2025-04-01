import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { Fornecedor } from './entities/fornecedor.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class FornecedorService extends BaseService<Fornecedor> {
  constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
    super(dataSource.getRepository(Fornecedor));
  }
}
