import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/service/service.abstract';
import { Venda } from './entities/venda.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class VendaService extends BaseService<Venda> {

    constructor(@Inject('DATA_SOURCE') dataSource: DataSource){
        super(dataSource.getRepository(Venda))
    }
}
