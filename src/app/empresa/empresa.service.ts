import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { Empresa } from './entities/empresa.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class EmpresaService extends BaseService<Empresa> {
  constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
    super(dataSource.getRepository(Empresa));
  }
}
