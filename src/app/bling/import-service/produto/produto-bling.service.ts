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
import { ProdutoCategoriaOpcao } from 'src/app/produto/entities/produto-categoria.entity';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { AppMath } from 'src/shared/util/operacoes-matematicas/app-math-operations';
import { RoundingModes } from 'src/shared/util/operacoes-matematicas/big-decimal-operations.copy';
import { obterDataAnterior } from 'src/shared/util/date/date.utils';

enum StrategyGetById {
  CACHE_15_DIAS = 'cache_15_dias',
  NORMAL = 'normal',
  ESTOQUE = 'estoque',
}

@Injectable()
export class ProdutoBlingService extends ImportServiceBase<Produto, ProdutoBling> {
  public async getByIdForce(Entity?: Partial<ProdutoBling['data']>) {
    return this.getByIdInternal(StrategyGetById.CACHE_15_DIAS, Entity);
  }

  async getById(Entity?: Partial<ProdutoBling['data']>): Promise<Produto> {
    return this.getByIdInternal(StrategyGetById.NORMAL, Entity);
  }

  private async getByIdInternal(strategy: StrategyGetById, Entity: Partial<ProdutoBling['data']>) {
    let buscouProdutoNaAPI = false;
    logger.info(`[ProdutoBlingService] Selecionando produto Id(${Entity.id})`);
    const produtos = await firstValueFrom(
      this.produtoService.find({ idOriginal: Entity.id.toFixed(0) }),
    );

    let produto: Produto;

    if (produtos.length > 0) {
      if (strategy in [StrategyGetById.CACHE_15_DIAS, StrategyGetById.ESTOQUE]) {
        produto = produtos[0];
      } else {
        logger.info(
          `[ProdutoBlingService] Encontrou produto no banco de dados.${produtos[0].id}-${produtos[0].descricao}`,
        );
        return produtos[0];
      }
    }

    let produtoBling: ProdutoBling;
    const produtoCached = await this.getCachedEntity(Entity.id);
    const quinzeDiasAtras = obterDataAnterior(15);
    if (
      produtoCached &&
      produtoCached.cache.atualizadoEm &&
      produtoCached.cache.atualizadoEm > quinzeDiasAtras &&
      strategy === StrategyGetById.CACHE_15_DIAS
    ) {
      logger.info(
        `[ProdutoBlingService] Encontrou produto no cache ${produtoCached.cache.idOriginal}`,
      );
      produtoBling = produtoCached.entity;
    } else {
      const blingService = await this.blingService.getBling();
      try {
        produtoBling = await blingService.produtos.find({ idProduto: Entity.id }); //Está acontecendo o erro nesta linha
        buscouProdutoNaAPI = true;
      } catch (error) {
        logger.error(
          `[ProdutoBlingService] Não foi possível consultar o produto ${Entity.id} na API do Bling`,
          error,
        );
        throw error;
      }

      logger.info(
        `[ProdutoBlingService] Salvando produto no cache ${produtoBling.data.id}-${produtoBling.data.nome}`,
      );
      if (produtoCached)
        await this.saveCachedEntity(Entity.id.toFixed(0), produtoBling, produtoCached.cache);
      else await this.saveCachedEntity(Entity.id.toFixed(0), produtoBling);
    }

    return this.createProduto(produto, produtoBling, buscouProdutoNaAPI, strategy);
  }

  private async createProduto(
    produto: Produto,
    produtoBling: ProdutoBling,
    atualizarEstoque: boolean,
    strategyGetById: StrategyGetById,
  ): Promise<Produto> {
    const update = produto && produto.id == 0 ? true : false;
    logger.info(`[ProdutoBlingService] ${update ? 'Atualizando' : 'Criando'} Produto`);
    const fornecedorP = this.fornecedorService.getById(produtoBling.data.fornecedor.contato);

    let produtoPaiBling: Partial<ProdutoBling['data']> = null;
    let produtoPai: Produto = null;

    if (produtoBling.data.variacao) {
      produtoPaiBling = {
        id: produtoBling.data.variacao?.produtoPai.id,
      };

      produtoPai = await this.getByIdInternal(strategyGetById, produtoPaiBling);
    }

    const marcaP: Promise<ProdutoCategoriaOpcao> =
      produtoBling.data.marca.length > 0
        ? this.produtoCategoriaOpcaoService.getMarcaAsOpcao(produtoBling.data.marca)
        : Promise.resolve(null);
    const categoriaP: Promise<ProdutoCategoriaOpcao> = produtoBling.data.categoria
      ? this.produtoCategoriaOpcaoService.getById(produtoBling.data.categoria)
      : Promise.resolve(null);
    const variacoesP: Promise<ProdutoCategoriaOpcao[]> = produtoBling.data.variacao
      ? this.produtoCategoriaOpcaoService.getVariacoesAsOpcoes(produtoBling.data.variacao?.nome)
      : Promise.resolve(null);

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
    if (atualizarEstoque) {
      produto.saldoEstoque = produtoBling.data.estoque?.saldoVirtualTotal ?? 0;
    }

    produto.categorias = produto.categorias ?? [];
    produto.categorias.length = 0;

    if (categoria) produto.categorias.push(categoria);
    if (marca) produto.categorias.push(marca);
    if (variacoes) produto.categorias = produto.categorias.concat(variacoes);

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
    private produtoService: ProdutoService,
  ) {
    super('produto', controleImportacaoService, PaginacaoType.INDEX, produtoBlingService);
  }

  override async interromper(): Promise<boolean> {
    if (this.controle.terminouConsultaEm == null) return false;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ultimaConsulta = new Date(this.controle.terminouConsultaEm);
    ultimaConsulta.setHours(0, 0, 0, 0);
    return ultimaConsulta.getTime() == hoje.getTime();
  }

  async searchPage(searchParameters?: Record<string, any>): Promise<APICollection<ProdutoBling>> {
    const bling = await this.blingService.getBling();
    const pagina = await bling.produtos.get(searchParameters);
    return pagina;
  }
  readAndSave(blingEntity: Partial<ProdutoBling['data']>): Promise<Produto> {
    return this.produtoBlingService.getByIdForce(blingEntity);
  }

  async searchProdutosInativos(): Promise<void> {
    const clausula = this.produtoService.repository.create({ situacao: 0 });

    const quantidade = await this.produtoService.repository.count({
      where: clausula,
    });

    const take = 100;
    const paginas = AppMath.round(quantidade / take, 0, RoundingModes.CEILING);

    console.log(`Processando ${quantidade} produtos em ${paginas} páginas`);

    // CORRIGIDO: Remove o "- 1" para processar todas as páginas
    for (let paginaIndex = 0; paginaIndex < paginas; paginaIndex++) {
      const skip = paginaIndex * take;

      console.log(`Processando página ${paginaIndex + 1}/${paginas} (skip: ${skip})`);

      const produtos = await this.produtoService.repository.find({
        where: {
          fornecedor: IsNull(),
        },
        skip,
        take,
        order: { id: 'DESC' },
      });

      console.log(`Encontrados ${produtos.length} produtos nesta página`);

      // CORRIGIDO: Remove o "- 1" e usa nome diferente para variável
      for (let produtoIndex = 0; produtoIndex < produtos.length; produtoIndex++) {
        const produto = produtos[produtoIndex];
        console.log(
          `Processando produto ${produtoIndex + 1}/${produtos.length}: ID ${produto.idOriginal}`,
        );

        try {
          await this.produtoBlingService.getByIdForce({
            id: parseInt(produto.idOriginal),
          });
        } catch (error) {
          console.error(`Erro ao processar produto ${produto.idOriginal}:`, error);
          // Opcional: continuar processamento ou parar aqui
        }
      }
    }

    console.log('Processamento concluído');
  }
}
