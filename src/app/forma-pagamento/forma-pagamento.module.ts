import { Module } from '@nestjs/common';
import { FormaPagamentoService } from './forma-pagamento.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [FormaPagamentoService],
  exports: [FormaPagamentoService],
})
export class FormaPagamentoModule {}
