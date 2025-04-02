import { Module } from '@nestjs/common';
import { ProdutoService } from './produto.service';
import { DataBaseModule } from 'src/data-base/data-base.module';
import { ProdutoCategoriaOpcaoService } from './produto-categoria-opcao.service';

@Module({
  imports: [DataBaseModule],
  providers: [ProdutoService, ProdutoCategoriaOpcaoService],
  exports: [ProdutoService, ProdutoCategoriaOpcaoService],
})
export class ProdutoModule {}
