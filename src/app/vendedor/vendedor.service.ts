import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { Vendedor } from './entities/vendedor.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class VendedorService extends BaseService<Vendedor> {

    constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
        super(dataSource.getRepository(Vendedor))
    }
}
