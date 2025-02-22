import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataBaseModule } from './data-base/data-base.module';
import { PessoaModule } from './pessoa/pessoa.module';
import { VendedorModule } from './vendedor/vendedor.module';
import { FornecedorModule } from './fornecedor/fornecedor.module';
import { ProdutoModule } from './produto/produto.module';
import { VendaModule } from './venda/venda.module';
import { EmpresaModule } from './empresa/empresa.module';
import { ConfigModule } from '@nestjs/config';
import { Logger } from 'winston';
import { AuthModule } from './auth-constants/auth-constants.module';
import blingConstants from './integracao/bling/bling.constants';
import { AuthBlingService } from './integracao/bling/auth-bling.service';
import { ImportCliente } from './task/interface/task.interface';
import { BlingModule } from './integracao/bling/bling.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ControleImportacaoModule } from './controle-importacao/controle-importacao.module';
import { VendedorImportacao } from './task/interface/vendedor-importacao';
import { VendaImportacao } from './task/interface/venda-importacao';
import { ResponseLogModule } from './response-log/response-log.module';
import { ContaModule } from './conta/conta.module';
import { PlanoContaImportacao } from './task/plano-conta-importacao';
import { PortadorImportacao } from './task/portador-importacao';
import { FormaPagamentoImportacao } from './task/interface/forma-pagamento-importacao';
import { FormaPagamentoModule } from './forma-pagamento/forma-pagamento.module';
import { PessoaImportacao } from './task/pessoa-importacao';
import { ContaPagarImportacao } from './task/conta-pagar-importacao';
import { NfeModule } from './nfe/nfe.module';
import { NfeCategoriaImportacao } from './task/nfe-categoria-importacao';
import { NfeImportacao } from './task/nfe-importacao';
import { ProdutoImportacao } from './task/interface/produto-importacao';
import { VendaNewImportacao } from './task/interface/venda-new-importacao';
import { PagamentoImportacao } from './task/pagamento-importacao';
import { RecebimentoImportacao } from './task/recebimento-importacao';
import { ContaReceberImportacao } from './task/conta-receber-importacao';


@Module({
  imports: [
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
    ConfigModule.forRoot({
      isGlobal: true,
      load: [blingConstants],
    }),
    ScheduleModule.forRoot(),
    ControleImportacaoModule,
    ResponseLogModule,
    ContaModule,
    NfeModule
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
    RecebimentoImportacao
  ],
})
export class AppModule {}
