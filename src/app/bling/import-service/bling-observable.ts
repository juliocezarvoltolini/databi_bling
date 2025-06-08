import { Injectable, OnModuleInit } from '@nestjs/common';
import { PagedImportServiceBase } from './import.interface';
import { PessoaBlingPagedService } from './pessoa/pessoa-bling.service';
import { logger } from 'src/logger/winston.logger';
import { ProdutoBlingPagedService, ProdutoBlingService } from './produto/produto-bling.service';
import { VendaBlingPagedService } from './venda/venda-bling.service';
import { NfeBlingPagedService } from './nfe/nfe-bling.service';
import { ConfigService } from '@nestjs/config';
import { EstoqueBlingServicePaged } from './produto/estoque-bling.service';
@Injectable()
export class BlingObservable implements OnModuleInit {
  // private readonly FIVE_HOURS = 5 * 60 * 60 * 1000;
  private readonly FIVE_HOURS;
  private readonly RETRY_DELAY = 2 * 60 * 1000;
  private subscriptions: PagedImportServiceBase<any, any>[] = [];
  private isRunning = false;

  constructor(
    private readonly clienteBlingService: PessoaBlingPagedService,
    private readonly produtoBlingPagedService: ProdutoBlingPagedService,
    private readonly produtoBlingService: ProdutoBlingService,
    private readonly vendaBlingService: VendaBlingPagedService,
    private readonly nfeBlingService: NfeBlingPagedService,
    private readonly configService: ConfigService,
    private readonly estoqueBlingService: EstoqueBlingServicePaged, // EstoqueBlingService,
  ) {
    // this.subscriptions.push(produtoBlingPagedService);
    this.subscriptions.push(vendaBlingService);
    this.subscriptions.push(nfeBlingService);
    this.subscriptions.push(estoqueBlingService);
    this.FIVE_HOURS = this.configService.get<number>('INTERVALO_SERVICO_BLING', 5) * 60 * 60 * 1000;
  }

  async onModuleInit() {
    logger.info('🟢 BlingObservable iniciado');
    this.executeImport().then(() => this.scheduleNextRun());
  }

  private scheduleNextRun() {
    setTimeout(async () => {
      if (this.isRunning) {
        logger.warn(
          `⚠️ [BlingObservable] Execução ignorada, pois ainda há uma em andamento: ${this.now()}`,
        );
        return this.scheduleNextRun(); // Reagenda mesmo que não execute
      }

      logger.info('='.repeat(80));
      logger.info(`⏰ [BlingObservable] Execução programada iniciando: ${this.now()}`);
      await this.executeImport();
      this.scheduleNextRun(); // Garante que só agende novamente após o fim
    }, this.FIVE_HOURS);
  }

  private async executeImport() {
    this.isRunning = true;

    logger.info('='.repeat(80));
    logger.info('🔄 [BlingObservable] Iniciando ciclo de importação...');

    for (const subscription of this.subscriptions) {
      await this.tryStart(subscription);
    }

    const nextRun = new Date(Date.now() + this.FIVE_HOURS);
    logger.info(`🕒 [BlingObservable] Próxima execução programada para: ${this.format(nextRun)}`);
    logger.info('✅ [BlingObservable] Ciclo finalizado.');
    logger.info('='.repeat(80));

    this.isRunning = false;
  }

  private async tryStart(service: PagedImportServiceBase<any, any>) {
    const nome = service.constructor.name;

    try {
      logger.info(`🚀 [BlingObservable] Iniciando: ${nome}`);
      await service.start();
      logger.info(`✅ [BlingObservable] Execução concluída: ${nome}`);
    } catch (error) {
      logger.error(`❌ [BlingObservable] Erro ao iniciar ${nome}`, error);

      const retryTime = new Date(Date.now() + this.RETRY_DELAY);
      logger.warn(
        `⏳ [BlingObservable] Tentando novamente ${nome} em 2 minutos (${this.format(retryTime)})`,
      );

      setTimeout(async () => {
        logger.info(`🔁 [BlingObservable] Retry iniciado: ${nome} - ${this.now()}`);
        await this.tryStart(service);
      }, this.RETRY_DELAY);
    }
  }

  private format(date: Date): string {
    return date.toLocaleString('pt-BR', { timeZone: 'America/Araguaina' });
  }

  private now(): string {
    return this.format(new Date());
  }
}
