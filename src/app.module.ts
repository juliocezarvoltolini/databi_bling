import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataBaseModule } from './data-base/data-base.module';
import { PessoaModule } from './pessoa/pessoa.module';
import { VendedorModule } from './vendedor/vendedor.module';
import { FornecedorModule } from './fornecedor/fornecedor.module';
import { ProdutoModule } from './produto/produto.module';
import { FormaPagamentoModule } from './forma-pagamento/forma-pagamento.module';
import { VendaModule } from './venda/venda.module';
import { EmpresaModule } from './empresa/empresa.module';
import { ConfigModule } from '@nestjs/config';
import { Logger } from 'winston';
import { AuthModule } from './auth-constants/auth-constants.module';
import blingConstants from './integracao/bling/bling.constants';
import { AuthBlingService } from './integracao/bling/auth-bling.service';
import { ImportCliente, TesteTask } from './task/interface/task.interface';
import { BlingModule } from './integracao/bling/bling.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { ControleImportacaoModule } from './controle-importacao/controle-importacao.module';

@Module({
  imports: [DataBaseModule,
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
      load: [blingConstants]
    }),
    ScheduleModule.forRoot(),
    ControleImportacaoModule
  ],
  controllers: [AppController],
  providers: [AppService, Logger, TesteTask, ImportCliente],
})
export class AppModule { }
