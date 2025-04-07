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

import { ImportCliente } from './task/interface/task.interface';

import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ControleImportacaoModule } from './app/controle-importacao/controle-importacao.module';
import { VendedorImportacao } from './task/interface/vendedor-importacao';
import { ResponseLogModule } from './app/response-log/response-log.module';
import { ContaModule } from './app/conta/conta.module';
import { PlanoContaImportacao } from './task/plano-conta-importacao';
import { PortadorImportacao } from './task/portador-importacao';
import { FormaPagamentoImportacao } from './task/interface/forma-pagamento-importacao';
import { FormaPagamentoModule } from './app/forma-pagamento/forma-pagamento.module';
import { PessoaImportacao } from './task/pessoa-importacao';
import { ContaPagarImportacao } from './task/conta-pagar-importacao';
import { NfeModule } from './app/nfe/nfe.module';
import { NfeCategoriaImportacao } from './task/nfe-categoria-importacao';
import { NfeImportacao } from './task/nfe-importacao';
import { ProdutoImportacao } from './task/interface/produto-importacao';
import { VendaNewImportacao } from './task/interface/venda-new-importacao';
import { PagamentoImportacao } from './task/pagamento-importacao';
import { RecebimentoImportacao } from './task/recebimento-importacao';
import { ContaReceberImportacao } from './task/conta-receber-importacao';
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
  providers: [
    AppService,
    Logger,
    ImportCliente,
    VendedorImportacao,
    ProdutoImportacao,
    FormaPagamentoImportacao,
    VendaNewImportacao,
    PlanoContaImportacao,
    PortadorImportacao,
    PessoaImportacao,
    ContaPagarImportacao,
    NfeCategoriaImportacao,
    NfeImportacao,
    PagamentoImportacao,
    ContaReceberImportacao,
    RecebimentoImportacao,
  ],
})
export class AppModule { }
