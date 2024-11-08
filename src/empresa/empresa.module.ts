import { Module } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [EmpresaService],
  exports: [EmpresaService]
})
export class EmpresaModule {}
