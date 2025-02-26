import { Module } from '@nestjs/common';
import { DataBaseModule } from 'src/data-base/data-base.module';
import { ControleImportacaoService } from './controle-importacao.service';

@Module({
  imports: [DataBaseModule],
  providers: [ControleImportacaoService],
  exports: [ControleImportacaoService],
})
export class ControleImportacaoModule {}
