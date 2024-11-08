import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/service/service.abstract';
import { AuthConstants } from './entities/auth-constants.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthConstantsService extends BaseService<AuthConstants> {
    
    constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
        super(dataSource.getRepository(AuthConstants))
    }

}
