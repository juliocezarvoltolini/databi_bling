import { Fornecedor } from 'src/app/fornecedor/entities/fornecedor.entity';
import { ImportServiceBase } from '../import.interface';
import { IFindResponse as FornecedorBling } from 'bling-erp-api/lib/entities/contatos/interfaces/find.interface';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { firstValueFrom } from 'rxjs';
import { logger } from 'src/logger/winston.logger';
import { PessoaBlingService } from '../pessoa/pessoa-bling.service';
import { FornecedorService } from 'src/app/fornecedor/fornecedor.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FornecedorBlingService extends ImportServiceBase<Fornecedor, FornecedorBling> {
  async getById(Entity?: Partial<FornecedorBling['data']>): Promise<Fornecedor> {
    const fornecedores = firstValueFrom(
      this.forncedorService.find({ pessoa: { idOriginal: Entity.id.toFixed(0) } }),
    );

    if (fornecedores) {
      logger.info(`[FornecedorBlingService] Encontrou o fornecedor`);
      return fornecedores[0];
    }
    const pessoa = await this.servicePessoaBling.getById(Entity);

    const fornecedor: Fornecedor = new Fornecedor();
    fornecedor.pessoa = pessoa;
    fornecedor.situacao = 1;

    return firstValueFrom(this.forncedorService.create(fornecedor));
  }

  constructor(
    private forncedorService: FornecedorService,
    protected readonly responseLogService: ResponseLogService,
    private readonly servicePessoaBling: PessoaBlingService,
  ) {
    super(responseLogService, 'fornecedor');
  }
}
