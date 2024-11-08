import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/service/service.abstract';
import { Produto } from './entities/produto.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class ProdutoService extends BaseService<Produto> {

    constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
        super(dataSource.getRepository(Produto))
    }
}
