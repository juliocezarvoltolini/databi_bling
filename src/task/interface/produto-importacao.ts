import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as ProdutosBling } from 'bling-erp-api/lib/entities/produtos/interfaces/get.interface';
import { IFindResponse as ProdutoBling } from 'bling-erp-api/lib/entities/produtos/interfaces/find.interface';

import {
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  mergeMap,
  Observable,
  of,
  switchMap,
  tap,
  timer,
  toArray,
} from 'rxjs';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/app/integracao/bling/auth-bling.service';
import { DataSource, Repository } from 'typeorm';

import { logger } from 'src/logger/winston.logger';
import { Produto } from 'src/app/produto/entities/produto.entity';
import { PessoaImportacao } from '../pessoa-importacao';
import {
  ProdutoCategoria,
  ProdutoCategoriaOpcao,
  ProdutoCategoriaRelacao,
} from 'src/app/produto/entities/produto-categoria.entity';
import { ProdutoCategoriaTipo } from 'src/app/produto/entities/produto.types';
import { ResponseLog } from 'src/app/response-log/entities/response-log.entity';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class ProdutoImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
    private pessoaImportacao: PessoaImportacao,
  ) {
    this.tabela = 'produto';
  }

  onModuleInit() {
    // this.iniciar();
  }

  private iniciar() {
    let controle: ControleImportacao;
    let blingService: Bling;

    forkJoin({
      controle: this.buscarControle(),
      acessToken: from(this.service.getAcessToken()),
    })
      .pipe(
        switchMap((values) => {
          blingService = new Bling(values.acessToken);
          controle = values.controle;
          return this.processarPagina(blingService, controle);
        }),
      )
      .subscribe({
        next: (value) => {
          logger.info(
            `[ProdutoImportacao] ${this.tabela.toUpperCase()} processado com sucesso. 
            - ID: ${value.id} 
            - ID ORIGINAL: ${value.idOriginal}
            - NOME: ${value.descricao}
            - FORMATO: ${value.formato}`,
          );
          logger.info(`======================================================================`);
        },
        complete: () => this.finalizarProcessamento(controle),
        error: (err) => {
          console.log(err);
          logger.error('[ProdutoImportacao] Erro inesperado: ' + err.message);
        },
      });
  }

  //TO DO: Carry out the necessary validations required by Prettier
  private processarPagina(blingService: Bling, controle: ControleImportacao): Observable<Produto> {
    return this.buscarPagina(controle.pagina, blingService).pipe(
      switchMap((lista) => {
        const itensRestantes =
          lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : [];
        return from(itensRestantes);
      }),
      concatMap((planoBling) =>
        timer(350).pipe(switchMap(() => this.buscarESalvar(planoBling.id, blingService))),
      ),
      tap(() => {
        const index = controle.ultimoIndexProcessado + 1;
        logger.info(`INDEX ${index}`);
        this.atualizarControle(controle, 'index');
      }),
    );
  }

  private finalizarProcessamento(controle: ControleImportacao) {
    logger.info(`[ProdutoImportacao] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[ProdutoImportacao] Próxima página.`);
      this.atualizarControle(controle, 'pagina')
        .pipe(map(() => this.iniciar()))
        .subscribe();
    } else {
      logger.info(`[ProdutoImportacao] Busca finalizada.`);
    }
  }

  private buscarPagina(pagina: number, blingService: Bling): Observable<ProdutosBling> {
    logger.info(`[ProdutoImportacao] Buscando página ${pagina}`);
    return from(blingService.produtos.get({ pagina: pagina, limite: 100 })).pipe(
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(
            `[ProdutoImportacao] Irá pesquisar novamente a página ${pagina}. Aguardando ${TIMER_DELAY_MS} ms`,
          );
          return timer(TIMER_DELAY_MS).pipe(
            switchMap(() => this.buscarPagina(pagina, blingService)),
          );
        } else {
          throw new Error(
            `[ProdutoImportacao] Não foi possível pesquisar a página ${pagina}. Motivo: ${err.message} `,
          );
        }
      }),
    );
  }

  private buscarItem(id: number, blingService: Bling): Observable<ProdutoBling> {
    return from(blingService.produtos.find({ idProduto: id })).pipe(
      catchError((err) => {
        if (err.message === REQUEST_LIMIT_MESSAGE) {
          logger.info(
            `[ProdutoImportacao] Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`,
          );
          return timer(TIMER_DELAY_MS).pipe(switchMap(() => this.buscarItem(id, blingService)));
        } else {
          throw new Error(
            `[ProdutoImportacao] Não foi possível pesquisar o id ${id}. Motivo: ${err.message} `,
          );
        }
      }),
    );
  }

  private buscarESalvar(id: number, blingService: Bling): Observable<Produto> {
    if (!id) return of(null);
    else
      return this.buscarItem(id, blingService).pipe(
        switchMap((planoContaBling) => this.salvarItem(planoContaBling, blingService)),
      );
  }

  private salvarItem(modeloBling: ProdutoBling, blingService: Bling): Observable<Produto> {
    const repo = this.dataSource.getRepository(Produto);
    logger.info(
      `[ProdutoImportacao] Salvando ${modeloBling.data.id} - ${modeloBling.data.nome} - ${modeloBling.data.formato}`,
    );
    return this.selecionaOuAssina(repo, modeloBling, blingService).pipe(
      switchMap((produto) => {
        return from(repo.save(produto));
      }),
    );
  }

  private saveResponseLog(modeloBling: ProdutoBling) {
    const responseLogRepo = this.dataSource.getRepository(ResponseLog);
    from(
      responseLogRepo.findOne({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
          nomeInformacao: 'produto',
        },
      }),
    ).pipe(
      map((response) => {
        if (!response) response = new ResponseLog();
        response.idOriginal = modeloBling.data.id.toFixed(0);
        response.nomeInformacao = 'produto';
        response.response = JSON.stringify(modeloBling);

        responseLogRepo.save(response);
      }),
    );
  }

  private selecionaOuAssina(
    repo: Repository<Produto>,
    modeloBling: ProdutoBling,
    blingService: Bling,
  ): Observable<Produto> {
    this.saveResponseLog(modeloBling);
    return from(
      repo.find({
        where: {
          idOriginal: modeloBling.data.id.toFixed(0),
        },
      }),
    ).pipe(
      switchMap((consulta) => {
        if (consulta.length > 0) {
          return this.criarProduto(consulta[0], modeloBling, blingService);
        } else {
          return this.criarProduto(null, modeloBling, blingService);
        }
      }),
    );
  }

  private getOpcao(
    categoriaName: string,
    opcaoName: string,
    categoriaTipo: ProdutoCategoriaTipo = 'V',
  ): Observable<ProdutoCategoriaOpcao> {
    const categoriaRepo = this.dataSource.getRepository(ProdutoCategoria);
    return from(
      categoriaRepo.find({
        where: { nome: categoriaName },
        relations: { opcoes: true },
        order: { opcoes: { nome: 'ASC' } },
      }),
    ).pipe(
      switchMap((categorias) => {
        const [categoriaEncontrada] = categorias;
        const opcaoEncontrada = categoriaEncontrada?.opcoes?.find((o) => o.nome === opcaoName);

        let categoria: ProdutoCategoria;

        // Verifica se a categoria e a opção já existem
        if (categoriaEncontrada) {
          categoria = categoriaEncontrada;
          if (opcaoEncontrada) {
            return of(opcaoEncontrada); // Retorna a opção já existente
          }
        } else {
          // Cria nova categoria
          categoria = new ProdutoCategoria();
          categoria.nome = categoriaName;
          categoria.tipo = categoriaTipo;
          categoria.opcoes = [];
        }

        // Cria nova opção
        const opcao = new ProdutoCategoriaOpcao();
        opcao.nome = opcaoName;
        opcao.produtoCategoria = categoria;
        categoria.opcoes.push(opcao);

        return from(categoriaRepo.save(categoria)).pipe(
          switchMap((value) => {
            return of(value.opcoes.find((opcao) => opcao.nome === opcaoName));
          }),
          catchError((err) => {
            logger.error(
              `[ProdutoImportacao] Não foi possível salvar a categoria. Motivo: ${err.message}`,
            );
            return of(null);
          }),
        );
      }),
    );
  }

  private getVariacao(variacao: string): Observable<ProdutoCategoriaOpcao[]> {
    if (!variacao) return of([]);
    else {
      const nomes: string[] = [];
      const valores: string[] = [];

      variacao.split(';').forEach((value) => {
        const [nome, valor] = value.split(':');
        if (nome && valor) {
          nomes.push(nome.toLocaleUpperCase());
          valores.push(valor.toLocaleUpperCase());
        }
      });

      return from(nomes).pipe(
        mergeMap((nome, index) => {
          return this.getOpcao(nome, valores[index]);
        }),
        toArray(),
      );
    }
  }

  getCategoria(id: number, blingService: Bling): Observable<ProdutoCategoriaOpcao> {
    if (id === 0) {
      return of(null);
    } else {
      const logServiceRepo = this.dataSource.getRepository(ResponseLog);
      return from(
        logServiceRepo.findOne({
          where: {
            idOriginal: id.toFixed(0),
            nomeInformacao: 'categoria',
          },
        }),
      )
        .pipe(
          switchMap((responseLog) => {
            if (!responseLog) {
              return from(blingService.categoriasProdutos.find({ idCategoriaProduto: id })).pipe(
                switchMap((value) => {
                  const responseLog: ResponseLog = {
                    id: null,
                    idOriginal: id.toFixed(0),
                    nomeInformacao: 'categoria',
                    response: JSON.stringify(value),
                    data: new Date(),
                  };
                  return logServiceRepo.save(responseLog);
                }),
              );
            } else return of(responseLog);
          }),
        )
        .pipe(
          switchMap((responseLog) => {
            const object = JSON.parse(responseLog.response);
            const categoria: string = object.data.descricao;
            return this.getOpcao('CATEGORIA', categoria.toUpperCase(), 'C');
          }),
        );
    }
  }

  private criarProduto(
    produto: Produto,
    modeloBling: ProdutoBling,
    blingService: Bling,
  ): Observable<Produto> {
    return forkJoin({
      fornecedor: this.pessoaImportacao.selecionaFornecedor(
        modeloBling.data.fornecedor.contato.id,
        blingService,
      ),
      variacoes: this.getVariacao(modeloBling.data?.variacao?.nome),
      marca:
        modeloBling.data.marca.length > 0
          ? this.getOpcao('MARCA', modeloBling.data.marca.toUpperCase(), 'C')
          : of(null),
      categoria: this.getCategoria(modeloBling.data.categoria.id, blingService),
      produtoPai: this.buscarESalvar(modeloBling.data?.variacao?.produtoPai?.id, blingService),
    }).pipe(
      switchMap((consultas) => {
        if (!produto) produto = new Produto();
        produto.identificador = modeloBling.data.codigo;
        produto.idOriginal = modeloBling.data.id.toFixed(0);
        produto.descricao = modeloBling.data.nome;
        produto.descricaoCurta = modeloBling.data.descricaoCurta ?? '';
        produto.formato = modeloBling.data.formato;
        produto.fornecedor = consultas.fornecedor;
        produto.gtin = modeloBling.data.gtin;
        produto.gtinEmbalagem = modeloBling.data.gtinEmbalagem;
        produto.situacao = modeloBling.data.situacao === 'A' ? 1 : 0;
        produto.observacoes = modeloBling.data.observacoes;
        produto.urlImagem = modeloBling.data.imagemURL ?? '';
        produto.valorCusto = modeloBling.data.fornecedor
          ? modeloBling.data.fornecedor.precoCusto
          : 0;
        produto.valorPreco = modeloBling.data.preco;

        if (!produto.categoriasOpcao) produto.categoriasOpcao = [];

        const mergeRelacoes = (
          relacoes: ProdutoCategoriaRelacao[],
          opcoes: ProdutoCategoriaOpcao[],
        ): ProdutoCategoriaRelacao[] => {
          if (!opcoes) return [];

          if (!opcoes[0]) return [];

          const novasRelacoes = opcoes.map((opcao) => {
            const relacao = new ProdutoCategoriaRelacao();
            relacao.produtoCategoriaOpcao = opcao;
            return relacao;
          });

          novasRelacoes.map((nrel) => {
            const encontrado = relacoes.find(
              (value) =>
                value.produtoCategoriaOpcao.nome === nrel.produtoCategoriaOpcao.nome &&
                value.produtoCategoriaOpcao.produtoCategoria.nome ===
                  nrel.produtoCategoriaOpcao.produtoCategoria.nome,
            );

            if (!encontrado) relacoes.push(nrel);
          });

          return relacoes;
        };

        mergeRelacoes(produto.categoriasOpcao, [consultas.categoria]);
        mergeRelacoes(produto.categoriasOpcao, [consultas.marca]);
        mergeRelacoes(produto.categoriasOpcao, consultas.variacoes);

        if (consultas.produtoPai) produto.produtoPai = consultas.produtoPai;

        return of(produto);
      }),
    );
  }

  seleciona(idOriginal: number, blingService: Bling): Observable<Produto> {
    logger.info(`[ProdutoImportacao] Seleciona ${idOriginal}`);
    if (!idOriginal) return of(null);
    else {
      const repo = this.dataSource.getRepository(Produto);
      return from(repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } })).pipe(
        switchMap((produto) => {
          if (!produto) {
            return timer(200).pipe(switchMap(() => this.buscarESalvar(idOriginal, blingService)));
          } else return of(produto);
        }),
      );
    }
  }

  private buscarControle(): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);
    return from(repo.find({ where: { tabela: this.tabela } })).pipe(
      map((consulta) => (consulta.length > 0 ? consulta[0] : this.criarNovoControle())),
      switchMap((controle) => from(repo.save(controle))),
    );
  }

  private criarNovoControle(): ControleImportacao {
    const controle = new ControleImportacao();
    controle.tabela = this.tabela;
    controle.ultimoIndexProcessado = -1;
    controle.pagina = 1;
    return controle;
  }

  private atualizarControle(
    controle: ControleImportacao,
    paginaOuItem: 'pagina' | 'index',
  ): Observable<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);

    if (paginaOuItem == 'index') {
      controle.ultimoIndexProcessado += 1;
    } else {
      controle.pagina += 1;
      controle.ultimoIndexProcessado = -1;
    }
    return from(repo.save(controle));
  }
}
