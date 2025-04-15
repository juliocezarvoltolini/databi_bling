import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataBaseModule } from './data-base/data-base.module';
import { PessoaModule } from './app/pessoa/pessoa.module';
import { VendedorModule } from './app/vendedor/vendedor.module';
import { FornecedorModule } from './app/fornecedor/fornecedor.module';
import { ProdutoModule } from './app/produto/produto.module';
import { VendaModule } from './app/venda/venda.module';
import { EmpresaModule } from './app/empresa/empresa.module';
import { ConfigModule } from '@nestjs/config';
import { Logger } from 'winston';
import { AuthModule } from './auth-constants/auth-constants.module';

import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ControleImportacaoModule } from './app/controle-importacao/controle-importacao.module';

import { ResponseLogModule } from './app/response-log/response-log.module';
import { ContaModule } from './app/conta/conta.module';

import { FormaPagamentoModule } from './app/forma-pagamento/forma-pagamento.module';

import { NfeModule } from './app/nfe/nfe.module';

import { BlingModule } from './app/bling/bling.module';
import blingConstants from './app/bling/bling.constants';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [blingConstants],
    }),
    LoggerModule,
    DataBaseModule,
    HttpModule,
    PessoaModule,
    VendedorModule,
    FornecedorModule,
    ProdutoModule,
    FormaPagamentoModule,
    VendaModule,
    EmpresaModule,
    AuthModule,
    BlingModule,

    ScheduleModule.forRoot(),
    ControleImportacaoModule,
    ResponseLogModule,
    ContaModule,
    NfeModule,
  ],
  controllers: [AppController],
  providers: [AppService, Logger],
})
export class AppModule {}
