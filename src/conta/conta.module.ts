import { Module } from '@nestjs/common';
import { ContaReceberModule } from './conta-receber/conta-receber.module';
import { ContaPagarModule } from './conta-pagar/conta-pagar.module';


@Module({
  imports: [ContaReceberModule, ContaPagarModule]
})
export class ContaModule {}
