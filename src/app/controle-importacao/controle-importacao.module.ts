import { Module } from '@nestjs/common';
import { DataBaseModule } from 'src/data-base/data-base.module';
import { ControleImportacaoService } from './controle-importacao.service';
import { ControleImportacaoController } from './controle-importacao.controller';

@Module({
  imports: [DataBaseModule],
  providers: [ControleImportacaoService],
  controllers: [ControleImportacaoController],
  exports: [ControleImportacaoService],
})
export class ControleImportacaoModule {}
