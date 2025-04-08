import { IFindResponse as FormaPagamentoBling } from 'bling-erp-api/lib/entities/formasDePagamento/interfaces/find.interface';
import { ImportServiceBase } from '../import.interface';
import { FormaPagamento } from 'src/app/forma-pagamento/entities/forma-pagamento.entity';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { FormaPagamentoService } from 'src/app/forma-pagamento/forma-pagamento.service';
import { firstValueFrom } from 'rxjs';
import { logger } from 'src/logger/winston.logger';
import { BlingApiService } from '../../bling-api.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FormaPagamentoBlingService extends ImportServiceBase<
  FormaPagamento,
  FormaPagamentoBling
> {
  async getById(Entity?: Partial<FormaPagamentoBling['data']>): Promise<FormaPagamento> {
    logger.info(`[FormaPagamentoBlingService] Selecionando ID(${Entity.id})`);
    const formasPagamento = await firstValueFrom(
      this.formaPagamentoService.find({ idOriginal: Entity.id.toFixed(0) }),
    );

    if (formasPagamento) {
      return formasPagamento[0];
    }

    const formaPagamentoCached = await this.getCachedEntity(Entity.id);
    let formaPagamentoBling: FormaPagamentoBling;
    if (formaPagamentoCached) {
      formaPagamentoBling = formaPagamentoCached.entity;
    } else {
      const bling = await this.blingService.getBling();
      formaPagamentoBling = await bling.formasDePagamento.find({ idFormaPagamento: Entity.id });
      this.saveCachedEntity(Entity.id.toFixed(0), formaPagamentoBling);
    }

    const formaPagamento = new FormaPagamento();
    formaPagamento.idOriginal = formaPagamentoBling.data.id.toFixed(0);
    formaPagamento.nome = formaPagamentoBling.data.descricao;
    formaPagamento.finalidade = formaPagamentoBling.data.finalidade;
    formaPagamento.tipoPagamento = formaPagamentoBling.data.tipoPagamento;
    formaPagamento.situacao = formaPagamentoBling.data.situacao;
    formaPagamento.bandeiraCartao = formaPagamentoBling.data.dadosCartao
      ? formaPagamentoBling.data.dadosCartao.bandeira
      : null;
    formaPagamento.taxaAliquota = formaPagamentoBling.data.taxas.aliquota;
    formaPagamento.taxaValor = formaPagamentoBling.data.taxas.valor;

    return firstValueFrom(this.formaPagamentoService.create(formaPagamento));
  }

  constructor(
    responseLogService: ResponseLogService,
    private formaPagamentoService: FormaPagamentoService,
    private blingService: BlingApiService,
  ) {
    super(responseLogService, 'forma-pagamento');
  }
}
