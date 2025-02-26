import { Module } from '@nestjs/common';
import { VendaService } from './venda.service';
import { ItemModule } from './item/item.module';
import { PagamentoModule } from './pagamento/pagamento.module';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  providers: [VendaService],
  imports: [ItemModule, PagamentoModule, DataBaseModule],
  exports: [VendaService],
})
export class VendaModule {}
