import { Module } from '@nestjs/common';
import { FormaPagamentoService } from './forma-pagamento.service';

@Module({
  providers: [FormaPagamentoService]
})
export class FormaPagamentoModule {}
