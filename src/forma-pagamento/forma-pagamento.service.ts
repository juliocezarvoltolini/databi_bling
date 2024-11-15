import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/service/service.abstract';
import { FormaPagamento } from './entities/forma-pagamento.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class FormaPagamentoService extends BaseService<FormaPagamento> {
    constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
        super(dataSource.getRepository(FormaPagamento));
    }
}
