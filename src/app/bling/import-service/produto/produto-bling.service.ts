import { IFindResponse as ProdutoBling } from 'bling-erp-api/lib/entities/produtos/interfaces/find.interface';
import {
  APICollection,
  ImportServiceBase,
  PagedImportServiceBase,
  PaginacaoType,
} from '../import.interface';
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
  async getById(Entity?: Partial<ProdutoBling['data']>): Promise<Produto> {
    logger.info(`[ProdutoBlingService] Selecionando produto Id(${Entity.id})`);
    const produtos = await firstValueFrom(
      this.produtoService.find({ idOriginal: Entity.id.toFixed(0) }),
    );
    if (produtos.length > 0) {
      logger.info(
        `[ProdutoBlingService] Encontrou produto no banco de dados.${produtos[0].id}-${produtos[0].descricao}`,
      );
      return produtos[0];
    }

    let produtoBling: ProdutoBling;
    const produtoCached = await this.getCachedEntity(Entity.id);
    if (produtoCached) {
      logger.info(
        `[ProdutoBlingService] Encontrou produto no cache ${produtoCached.cache.idOriginal}`,
      );
      produtoBling = produtoCached.entity;
    } else {
      const blingService = await this.blingService.getBling();
      try {
        produtoBling = await blingService.produtos.find({ idProduto: Entity.id }); //Está acontecendo o erro nesta linha
      } catch (error) {
        logger.error(
          `[ProdutoBlingService] Não foi possível consultar o produto ${Entity.id} na API do Bling`,
          error,
        );
        throw error;
      }

      logger.info(
        `[ProdutoBlingService] Salvando produto no cache${produtoBling.data.id}-${produtoBling.data.nome}`,
      );
      await this.saveCachedEntity(Entity.id.toFixed(0), produtoBling);
    }

    return this.createProduto(null, produtoBling);
  }

  private async createProduto(produto: Produto, produtoBling: ProdutoBling): Promise<Produto> {
    const update = produto ? true : false;
    logger.info(`[ProdutoBlingService] ${update ? 'Atualizando' : 'Criando'} Produto`);
    const fornecedorP = this.fornecedorService.getById(produtoBling.data.fornecedor);

    const marcaP =
      produtoBling.data.marca.length > 0
        ? this.produtoCategoriaOpcaoService.getMarcaAsOpcao(produtoBling.data.marca)
        : Promise.resolve(null);
    const categoriaP = produtoBling.data.categoria
      ? this.produtoCategoriaOpcaoService.getById(produtoBling.data.categoria)
      : Promise.resolve(null);
    const variacoesP = produtoBling.data.variacao
      ? this.produtoCategoriaOpcaoService.getVariacoesAsOpcoes(produtoBling.data.variacao?.nome)
      : Promise.resolve(null);

    let produtoPaiBling: Partial<ProdutoBling['data']> = null;
    let produtoPai: Produto = null;

    if (produtoBling.data.variacao) {
      produtoPaiBling = {
        id: produtoBling.data.variacao?.produtoPai.id,
      };

      produtoPai = await this.getById(produtoPaiBling);
    }

    const [fornecedor, marca, categoria, variacoes] = await Promise.all([
      fornecedorP,
      marcaP,
      categoriaP,
      variacoesP,
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
    try {
      return this.produtoService.repository.save(produto);
    } catch (error) {
      logger.error(
        `[ProdutoBlingService] Erro ao ${update ? 'atualizar' : 'criar'} produto`,
        error,
      );
      throw error;
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
  constructor(
    controleImportacaoService: ControleImportacaoService,
    private readonly blingService: BlingApiService,
    private produtoBlingService: ProdutoBlingService,
  ) {
    super('produto', controleImportacaoService, PaginacaoType.INDEX, produtoBlingService);
  }
  async searchPage(searchParameters?: Record<string, any>): Promise<APICollection<ProdutoBling>> {
    const bling = await this.blingService.getBling();
    const pagina = await bling.produtos.get(searchParameters);
    return pagina;
  }
  readAndSave(blingEntity: Partial<ProdutoBling['data']>): Promise<Produto> {
    return this.produtoBlingService.getById(blingEntity);
  }
}
