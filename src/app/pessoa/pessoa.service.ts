import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { Pessoa } from './entities/pesssoa.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class PessoaService extends BaseService<Pessoa> {
    constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
        super(dataSource.getRepository(Pessoa))
    }
}
