import { Module } from '@nestjs/common';
import { VendaService } from './venda.service';
import { ItemModule } from './item/item.module';
import { PagamentoModule } from './pagamento/pagamento.module';

@Module({
  providers: [VendaService],
  imports: [ItemModule, PagamentoModule]
})
export class VendaModule {}
