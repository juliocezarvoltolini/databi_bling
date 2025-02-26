import { Module } from '@nestjs/common';
import { PessoaService } from './pessoa.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  controllers: [],
  providers: [PessoaService],
  exports: [PessoaService],
})
export class PessoaModule {}
