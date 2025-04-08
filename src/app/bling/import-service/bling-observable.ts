import { Injectable, OnModuleInit } from '@nestjs/common';

import { PagedImportServiceBase } from './import.interface';
import { PessoaBlingPagedService } from './pessoa/pessoa-bling.service';
import { logger } from 'src/logger/winston.logger';
import { ProdutoBlingPagedService } from './produto/produto-bling.service';
import { VendaBlingPagedService } from './venda/venda-bling.service';

@Injectable()
export class BlingObservable implements OnModuleInit {
  private subscriptions: PagedImportServiceBase<any, any>[] = [];
  constructor(
    private readonly clienteBlingService: PessoaBlingPagedService,
    private readonly produtoBlingService: ProdutoBlingPagedService,
    private readonly vendaBlingService: VendaBlingPagedService,
  ) {
    this.subscriptions.push(produtoBlingService);
  }

  async onModuleInit() {
    logger.info('BlingObservable started');
    // this.clienteBlingService.start();
    try {
      this.vendaBlingService.start();
    } catch (error) {
      logger.error('Error starting VendaBlingService', error);
    }
    // for (const subscription of this.subscriptions) {
    //   await subscription.start();
    // }
  }
}
