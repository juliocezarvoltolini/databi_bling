import { Module } from '@nestjs/common';
import { ProdutoService } from './produto.service';
import { DataBaseModule } from 'src/data-base/data-base.module';

@Module({
  imports: [DataBaseModule],
  providers: [ProdutoService],
  exports: [ProdutoService]
})
export class ProdutoModule {}
