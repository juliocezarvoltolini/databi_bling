import { IFindResponse as ProdutoBling } from 'bling-erp-api/lib/entities/produtos/interfaces/find.interface';
import { APICollection, ImportServiceBase, PagedImportServiceBase, PaginacaoType } from '../import.interface';
import { Produto } from 'src/app/produto/entities/produto.entity';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { ProdutoService } from 'src/app/produto/produto.service';
import { FornecedorBlingService } from '../fornecedor/fornecedor-bling.service';
import { firstValueFrom } from 'rxjs';
import { logger } from 'src/logger/winston.logger';
import { BlingApiService } from '../../bling-api.service';
import { ProdutoCategoriaBlingService } from './categoria-produto-bling.service';
import {
  ProdutoCategoriaOpcao,
  ProdutoCategoriaRelacao,
} from 'src/app/produto/entities/produto-categoria.entity';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProdutoBlingService extends ImportServiceBase<Produto, ProdutoBling> {
  async getById(Id: number): Promise<Produto> {
    logger.info(`[ProdutoBlingService] Selecionando produto Id(${Id})`);
    const produtos = await firstValueFrom(this.produtoService.find({ idOriginal: Id.toFixed(0) }));
    if (produtos) {
      logger.info(`[ProdutoBlingService] Encontrou produto no banco de dados.`);
      return produtos[0];
    }

    let produtoBling: ProdutoBling;
    const produtoCached = await this.getCachedEntity(Id);
    if (produtoCached) {
      logger.info(`[ProdutoBlingService] Encontrou produto no cache`);
      produtoBling = produtoCached.entity;
    } else {
      produtoBling = await (await this.blingService.getBling()).produtos.find({ idProduto: Id });
      logger.info(`[ProdutoBlingService] Salvando produto no cache`);
      await this.saveCachedEntity(Id.toFixed(0), produtoBling);
    }

    return this.createProduto(null, produtoBling);
  }

  private async createProduto(produto: Produto, produtoBling: ProdutoBling): Promise<Produto> {
    const update = produto ? true : false;
    logger.info(`[ProdutoBlingService] ${update ? 'Atualizando' : 'Criando'} Produto`)
    const fornecedorP = this.fornecedorService.getById(produtoBling.data.fornecedor.id);
    const marcaP = this.produtoCategoriaOpcaoService.getMarcaAsOpcao(produtoBling.data.marca);
    const categoriaP = this.produtoCategoriaOpcaoService.getById(produtoBling.data.categoria.id);
    const variacoesP = this.produtoCategoriaOpcaoService.getVariacoesAsOpcoes(
      produtoBling.data.variacao?.nome,
    );
    const produtoPaiP = this.getById(produtoBling.data?.variacao?.produtoPai?.id);

    const [fornecedor, marca, categoria, variacoes, produtoPai] = await Promise.all([
      fornecedorP,
      marcaP,
      categoriaP,
      variacoesP,
      produtoPaiP,
    ]);
    if (!produto) produto = new Produto();
    produto.identificador = produtoBling.data.codigo;
    produto.idOriginal = produtoBling.data.id.toFixed(0);
    produto.descricao = produtoBling.data.nome;
    produto.descricaoCurta = produtoBling.data.descricaoCurta ?? '';
    produto.formato = produtoBling.data.formato;
    produto.fornecedor = fornecedor;
    produto.gtin = produtoBling.data.gtin;
    produto.gtinEmbalagem = produtoBling.data.gtinEmbalagem;
    produto.situacao = produtoBling.data.situacao === 'A' ? 1 : 0;
    produto.observacoes = produtoBling.data.observacoes;
    produto.urlImagem = produtoBling.data.imagemURL ?? '';
    produto.valorCusto = produtoBling.data.fornecedor ? produtoBling.data.fornecedor.precoCusto : 0;
    produto.valorPreco = produtoBling.data.preco;
    produto.produtoPai = produtoPai;
    produto.categoriasOpcao = [];

    if (categoria) {
      produto.categoriasOpcao = produto.categoriasOpcao.concat(
        this.criarRelacao(produto, categoria),
      );
    }
    if (marca) {
      produto.categoriasOpcao = produto.categoriasOpcao.concat(this.criarRelacao(produto, marca));
    }
    if (variacoes) {
      produto.categoriasOpcao = produto.categoriasOpcao.concat(
        this.criarRelacao(produto, variacoes),
      );
    }
    if (!update) return firstValueFrom(this.produtoService.create(produto));
    else {
      await this.produtoService.repository.update(produto.id, produto);
      return produto;
    }
  }

  private criarRelacao(
    produto: Produto,
    opcao: ProdutoCategoriaOpcao | ProdutoCategoriaOpcao[],
  ): ProdutoCategoriaRelacao[] {
    const criar = (opcao: ProdutoCategoriaOpcao, produto: Produto) => {
      const relacao = new ProdutoCategoriaRelacao();
      relacao.produto = produto;
      relacao.produtoCategoriaOpcao = opcao;
      return relacao;
    };
    if (Array.isArray(opcao)) {
      const relacoes = opcao.map((op) => criar(op, produto));
      return relacoes;
    }
    return [criar(opcao, produto)];
  }

  constructor(
    responseLogService: ResponseLogService,
    private produtoService: ProdutoService,
    private blingService: BlingApiService,
    private fornecedorService: FornecedorBlingService,
    private produtoCategoriaOpcaoService: ProdutoCategoriaBlingService,
  ) {
    super(responseLogService, 'produto');
  }
}

@Injectable()
export class ProdutoBlingPagedService extends PagedImportServiceBase<Produto, ProdutoBling> {

  constructor(controleImportacaoService: ControleImportacaoService,
    private readonly blingService: BlingApiService,
    private produtoBlingService: ProdutoBlingService) {
    super('produto', controleImportacaoService, PaginacaoType.INDEX, produtoBlingService);
  }
  async searchPage(searchParameters?: Record<string, any>): Promise<APICollection<ProdutoBling>> {
    const bling = await this.blingService.getBling();
    const pagina = await bling.produtos.get(searchParameters);
    return pagina;
  }
  readAndSave(blingEntity: Partial<ProdutoBling['data']>): Promise<Produto> {
    return this.produtoBlingService.getById(blingEntity.id);
  }

}