import { Injectable, OnModuleInit } from '@nestjs/common';

import { PagedImportServiceBase } from './import.interface';
import { PessoaBlingPagedService } from './pessoa/pessoa-bling.service';
import { logger } from 'src/logger/winston.logger';

@Injectable()
export class BlingObservable implements OnModuleInit {
  private subscriptions: PagedImportServiceBase<any, any>[] = [];
  constructor(private readonly clienteBlingService: PessoaBlingPagedService) {
    this.subscriptions.push(clienteBlingService);
  }

  async onModuleInit() {
    logger.info('BlingObservable started');
    this.clienteBlingService.start();
    // for (const subscription of this.subscriptions) {
    //   await subscription.start();
    // }
  }
}
