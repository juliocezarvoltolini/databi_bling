import { Module } from '@nestjs/common';
import { AuthBlingService } from './auth-bling.service';
import { DataBaseModule } from 'src/data-base/data-base.module';
import { EmpresaModule } from 'src/app/empresa/empresa.module';
import { AuthModule } from 'src/auth-constants/auth-constants.module';
import { BlingApiService } from './bling-api.service';
import {
  PessoaBlingPagedService,
  PessoaBlingService,
} from './import-service/pessoa/pessoa-bling.service';
import { BlingObservable } from './import-service/bling-observable';
import { PessoaModule } from '../pessoa/pessoa.module';
import { ResponseLogModule } from '../response-log/response-log.module';
import { ControleImportacaoModule } from '../controle-importacao/controle-importacao.module';
import { ProdutoCategoriaBlingService } from './import-service/produto/categoria-produto-bling.service';
import { ProdutoBlingService } from './import-service/produto/produto-bling.service';

@Module({
  imports: [
    DataBaseModule,
    EmpresaModule,
    AuthModule,
    PessoaModule,
    ResponseLogModule,
    ControleImportacaoModule,
  ],
  providers: [
    AuthBlingService,
    BlingApiService,
    PessoaBlingService,
    PessoaBlingPagedService,
    BlingObservable,
    ProdutoCategoriaBlingService,
    ProdutoBlingService,
  ],
  exports: [AuthBlingService],
})
export class BlingModule {}
