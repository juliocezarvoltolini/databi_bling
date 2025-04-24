import { Vendedor } from 'src/app/vendedor/entities/vendedor.entity';
import { ImportServiceBase } from '../import.interface';
import { IFindResponse as VendedorBling } from 'bling-erp-api/lib/entities/vendedores/interfaces/find.interface';
import { PessoaBlingService } from '../pessoa/pessoa-bling.service';
import { VendedorService } from 'src/app/vendedor/vendedor.service';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { BlingApiService } from '../../bling-api.service';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { logger } from 'src/logger/winston.logger';
import { VendedorComissao } from 'src/app/vendedor/entities/vendedor-comissao.entity';
import { Pessoa } from 'src/app/pessoa/entities/pesssoa.entity';

@Injectable()
export class VendedorBlingService extends ImportServiceBase<Vendedor, VendedorBling> {
  constructor(
    private readonly pessoaBlingService: PessoaBlingService,
    private readonly vendedorService: VendedorService,
    responseLogService: ResponseLogService,
    private readonly blingService: BlingApiService,
  ) {
    super(responseLogService, 'vendedor');
  }
  async getById(Entity?: Partial<VendedorBling['data']>): Promise<Vendedor> {
    if (Entity.id == 0) return null;
    const vendedores = await firstValueFrom(
      this.vendedorService.find({ idOriginal: Entity.id.toFixed(0) }),
    );
    if (vendedores.length > 0) {
      return vendedores[0];
    }

    const vendedorCahed = await this.getCachedEntity(Entity.id);
    let vendedorBling: VendedorBling;
    let pessoa: Pessoa;
    if (vendedorCahed) {
      logger.info(
        `[VendedorBlingService] Usando vendedor (${vendedorCahed.entity.data.id}) ${vendedorCahed.entity.data.contato.nome} do cache`,
      );
      vendedorBling = vendedorCahed.entity;
    } else {
      const bling = await this.blingService.getBling();
      const apiResponse = await bling.vendedores.find({ idVendedor: Entity.id });
      const pessoaResponse = await this.pessoaBlingService.getById({ id: apiResponse.data.contato.id });

      pessoa = pessoaResponse;
      vendedorBling = apiResponse;

      this.saveCachedEntity(apiResponse.data.id.toFixed(0), apiResponse);
    }

    const vendedor = new Vendedor();
    vendedor.pessoa = pessoa;
    vendedor.idOriginal = vendedorBling.data.id.toFixed(0);

    if (!vendedor.comissao) vendedor.comissao = [];

    if (vendedorBling.data.comissoes.length > 0) {
      if (vendedor.comissao.length === 0) {
        vendedor.comissao.push(new VendedorComissao());
      }
      vendedor.comissao[0].percentualComissao = vendedorBling.data.comissoes[0].aliquota;
      vendedor.comissao[0].percentualDesconto = vendedorBling.data.comissoes[0].descontoMaximo;
    }

    vendedor.situacao = 1;

    return this.vendedorService.repository.save(vendedor);
  }
}
