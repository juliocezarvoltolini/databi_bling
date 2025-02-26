import { Module } from '@nestjs/common';
import { PagamentoService } from './pagamento.service';

@Module({
  providers: [PagamentoService]
})
export class PagamentoModule {}
