import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { ImportServiceBase } from '../import.interface';
import { IFindResponse as CategoriaBling } from 'bling-erp-api/lib/entities/categoriasProdutos/interfaces/find.interface';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ProdutoCategoria,
  ProdutoCategoriaOpcao,
} from 'src/app/produto/entities/produto-categoria.entity';
import { BlingApiService } from '../../bling-api.service';
import { ProdutoCategoriaOpcaoService } from 'src/app/produto/produto-categoria-opcao.service';
import { ProdutoCategoriaTipo } from 'src/app/produto/entities/produto.types';
import { logger } from 'src/logger/winston.logger';

@Injectable()
export class ProdutoCategoriaBlingService extends ImportServiceBase<
  ProdutoCategoriaOpcao,
  CategoriaBling
> {
  async getById(Entity?: Partial<CategoriaBling['data']>): Promise<ProdutoCategoriaOpcao> {
    logger.info(`[ProdutoCategoriaBlingService] Selecionando categoria Id(${Entity.id})`);
    const categoriaCached = await this.getCachedEntity(Entity.id);
    let categoriaBling: CategoriaBling;
    if (categoriaCached) categoriaBling = categoriaCached.entity;
    else {
      logger.info(`[ProdutoCategoriaBlingService] Vai buscar categoria Id(${Entity.id}) na API`);
      categoriaBling = await (
        await this.blingService.getBling()
      ).categoriasProdutos.find({
        idCategoriaProduto: Entity.id,
      }).then((value) => value, (err) => {
        logger.error(`Categoria ${JSON.stringify(Entity)} não encontrada.`)
        return null;
      });
      logger.info(
        `[ProdutoCategoriaBlingService] Salvando categoria no cache ${categoriaBling.data.id}-${categoriaBling.data.descricao}`,
      );
      this.saveCachedEntity(Entity.id.toFixed(0), categoriaBling);
    }
    let opcao = null;
    try {
      opcao = await this.getOpcao(categoriaBling.data.descricao, 'CATEGORIA', 'C');
    } catch (error) {
      logger.error(`[ProdutoCategoriaBlingService] Erro ao criar categoria ${error}`);
      throw error;
    }

    return opcao;
  }

  public async getMarcaAsOpcao(marca: string): Promise<ProdutoCategoriaOpcao> {
    if (!marca) return null;
    else {
      const nome = marca.toLocaleUpperCase();
      const opcao = await this.getOpcao(nome, 'MARCA', 'C');
      return opcao;
    }
  }
  public async getVariacoesAsOpcoes(variacoes: string): Promise<ProdutoCategoriaOpcao[]> {
    if (!variacoes) return [];
    else {
      const nomes: string[] = [];
      const valores: string[] = [];

      variacoes.split(';').forEach((value) => {
        const [nome, valor] = value.split(':');
        if (nome && valor) {
          nomes.push(nome.toLocaleUpperCase());
          valores.push(valor.toLocaleUpperCase());
        }
      });

      const opcoesP: Promise<ProdutoCategoriaOpcao>[] = [];

      for (let i = 0; i < nomes.length; i++) {
        opcoesP.push(this.getOpcao(valores[i], nomes[i], 'V'));
      }

      const opcoes: ProdutoCategoriaOpcao[] = await Promise.all(opcoesP);

      return opcoes;
    }
  }

  async getOpcao(
    nomeOpcao: string,
    nomeProdutoCategoria: string,
    tipoProdutoCategoria: ProdutoCategoriaTipo,
  ): Promise<ProdutoCategoriaOpcao> {
    const categoriaRespository = this.dataSource.getRepository(ProdutoCategoria);
    const opcoesP = this.categoriaOpcaoService.repository.find({
      where: {
        nome: nomeOpcao,
        produtoCategoria: { nome: nomeProdutoCategoria, tipo: tipoProdutoCategoria },
      },
    });

    const categoriaP = categoriaRespository.findOne({
      where: { nome: nomeProdutoCategoria, tipo: tipoProdutoCategoria },
    });

    const [opcoes, categoria] = await Promise.all([opcoesP, categoriaP]);

    //Se encontrou devolve a opção
    if (opcoes.length > 0) return opcoes[0];

    //Se não encontrou, cria a opção e a categoria
    const opcao = new ProdutoCategoriaOpcao();
    opcao.nome = nomeOpcao;
    if (!categoria) {
      const categoriaNova = new ProdutoCategoria();
      categoriaNova.nome = nomeProdutoCategoria;
      categoriaNova.tipo = tipoProdutoCategoria;
      opcao.produtoCategoria = categoriaNova;
    } else {
      opcao.produtoCategoria = categoria;
    }

    return this.categoriaOpcaoService.repository.save(opcao);
  }

  constructor(
    responseLogService: ResponseLogService,
    @Inject('DATA_SOURCE') private dataSource: DataSource,
    private blingService: BlingApiService,
    private categoriaOpcaoService: ProdutoCategoriaOpcaoService,
  ) {
    super(responseLogService, 'categoria');
  }
}
