import { Module } from '@nestjs/common';
import { VendedorService } from './vendedor.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [VendedorService],
  exports: [VendedorService]
})
export class VendedorModule {}
