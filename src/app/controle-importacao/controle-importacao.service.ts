import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { ControleImportacao } from './entities/controle-importacao.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class ControleImportacaoService extends BaseService<ControleImportacao> {
  constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
    super(dataSource.getRepository(ControleImportacao));
  }
}
