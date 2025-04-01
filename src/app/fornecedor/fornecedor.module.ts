import { Module } from '@nestjs/common';
import { FornecedorService } from './fornecedor.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [FornecedorService],
})
export class FornecedorModule {}
