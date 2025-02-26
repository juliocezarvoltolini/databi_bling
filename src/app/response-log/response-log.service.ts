import { Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/shared/service/service.abstract';
import { ResponseLog } from './entities/response-log.entity';
import { DataSource } from 'typeorm';
import { Observable } from 'rxjs';

@Injectable()
export class ResponseLogService extends BaseService<ResponseLog> {
  constructor(@Inject('DATA_SOURCE') dataSource: DataSource) {
    super(dataSource.getRepository(ResponseLog));
  }

  save(idOriginal: string, nomeInformacao: string, response: string): Observable<ResponseLog> {
    const responseLog = new ResponseLog();
    responseLog.idOriginal = idOriginal;
    responseLog.nomeInformacao = nomeInformacao;
    responseLog.response = response;
    return this.create(responseLog);
  }
}
