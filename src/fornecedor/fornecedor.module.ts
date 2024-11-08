import { Module } from '@nestjs/common';
import { FornecedorService } from './fornecedor.service';

@Module({
  providers: [FornecedorService]
})
export class FornecedorModule {}
