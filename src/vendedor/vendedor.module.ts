import { Module } from '@nestjs/common';
import { VendedorService } from './vendedor.service';

@Module({
  providers: [VendedorService],
  exports: [VendedorService]
})
export class VendedorModule {}
