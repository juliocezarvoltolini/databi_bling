import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import Bling from 'bling-erp-api';
import { IFindResponse } from 'bling-erp-api/lib/entities/produtos/interfaces/find.interface';
import { IGetResponse } from 'bling-erp-api/lib/entities/produtos/interfaces/get.interface';
import {
    catchError,
    concatMap,
    firstValueFrom,
    forkJoin,
    from,
    interval,
    map,
    Observable,
    of,
    switchMap,
    tap,
    timer,
} from 'rxjs';
import { IUF } from 'src/common/types/uf.types';
import { Assigned } from 'src/common/util/object/object.util';
import { ControleImportacaoService } from 'src/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { Fornecedor } from 'src/fornecedor/entities/fornecedor.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { logger } from 'src/logger/winston.logger';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { ProdutoCategoria, ProdutoCategoriaOpcao, ProdutoCategoriaRelacao } from 'src/produto/entities/produto-categoria.entity';
import { Produto } from 'src/produto/entities/produto.entity';
import { ProdutoService } from 'src/produto/produto.service';
import { VendedorComissao } from 'src/vendedor/entities/vendedor-comissao.entity';
import { DataSource, QueryFailedError, SelectQueryBuilder } from 'typeorm';


@Injectable()
export class ProdutoImportacao implements OnModuleInit {
    private blingService: Bling;

    constructor(
        private readonly service: AuthBlingService,
        private readonly produtoService: ProdutoService,
        private readonly controleImportacaoService: ControleImportacaoService,
        @Inject('DATA_SOURCE') private dataSource: DataSource,
    ) { }

    onModuleInit() {
        this.iniciar();
    }

    async iniciar() {
        let controleImportacao: ControleImportacao;
        this.controleImportacaoService
            .find({ tabela: 'produto' })
            .pipe(
                switchMap((consulta) => {
                    if (consulta.length > 0) {
                        controleImportacao = consulta[0];
                        console.log('Pesquisou e encontrou no banco: ', consulta);
                    } else {
                        controleImportacao = new ControleImportacao();
                        controleImportacao.tabela = 'produto';
                        controleImportacao.pagina = 0;
                    }

                    controleImportacao.pagina = controleImportacao.pagina + 1;
                    console.log('VAI PESQUISAR PÁGINA ', controleImportacao.pagina);
                    return this.execute(controleImportacao.pagina);
                }),
            )
            .subscribe({
                next: (value: Produto) => {
                    logger.info(
                        `Item processado com sucesso. ID:${value.id} - NOME: ${value.descricao}`,
                    );
                },
                error: (err) => {
                    if (err.name == 'zero') {
                        console.log('Todas as páginas foram consluídas.');
                    } else {
                        console.error('Erro durante o processamento:', err);
                    }
                },
                complete: () => {
                    console.log(
                        `Página ${controleImportacao.pagina} processada com sucesso.`,
                    );
                    this.controleImportacaoService.repository
                        .save(controleImportacao)
                        .then(
                            (ret) => this.iniciar(), // Processa a próxima página
                        );
                },
            });
    }

    execute(contador: number, timeout: number = 1000): Observable<Produto | Produto[]> {
        try {
            return from(this.service.getAcessToken()).pipe(
                switchMap((token) => {
                    this.blingService = new Bling(token);
                    logger.info('Criou o serviço Bling.');

                    return timer(timeout).pipe(
                        switchMap(() => {
                            return from(
                                this.blingService.produtos.get({ pagina: contador }),
                            ).pipe(
                                switchMap((response) => {
                                    if (response.data.length > 0) {
                                        return this.SalvarResposta(response);
                                    } else {
                                        const erro = new Error(
                                            'Não há mais contatos para processar.',
                                        );
                                        erro.name = 'zero';
                                        throw erro;
                                    }
                                }),
                                catchError((err) => {
                                    if (err.name === 'zero') {
                                        throw err;
                                    } else {
                                        console.log(err);
                                        return timer(10000).pipe(
                                            switchMap(() => {
                                                return this.execute(contador);
                                            }),
                                        );
                                    }
                                }),
                            );
                        }),
                    );
                }),
            );
        } catch (error) {
            console.error('Erro durante a execução:', error);
        }
    }

    private RemoverCategorias(produto: Produto) {
        this.dataSource.getRepository(ProdutoCategoriaRelacao)
            .createQueryBuilder('r')
            .delete()
            .where('r.id_produto = :id_produto', { id_produto: produto.id })
            .execute();
    }

    private SalvarResposta(response: IGetResponse) {
        return from(response.data).pipe(
            // Processa cada item serializadamente
            concatMap((item) =>
                timer(500).pipe(
                    // Adiciona um atraso de 500ms entre cada item
                    switchMap(() =>
                        this.getProdutoFromAPI(item.id),
                    ),
                    switchMap((response) => {

                        return this.mapearProduto(response).pipe(
                            switchMap(produto => {
                                return this.Salvar(produto);

                            }));

                    }),
                ),
            ),
        );
    }

    private getProdutoFromAPI(id: number): Observable<IFindResponse> {
        return from(this.blingService.produtos.find({ idProduto: id }));
    }

    private Salvar(produto: Produto): Observable<Produto> {
        return from(this.produtoService.repository.save(produto)).pipe(
            catchError((err) => {
                logger.warn(`Erro ao persitir entidade Vendedor(NOME: ${produto?.descricao} / idOriginal:${produto.idOriginal}). Motivo: ${err.message}`);
                if (
                    err.message.includes('duplicate key') ||
                    err.message.includes(
                        'duplicar valor da chave viola a restrição de unicidade',
                    )
                ) {
                    const pessoaFilter = this.criarFiltroPessoa(produto);

                    return from(pessoaFilter.getMany()).pipe(
                        switchMap((consulta) => {
                            if (consulta.length > 0) {
                                produto.id = consulta[0].id;
                                logger.info('Salvar novamente com id ' + produto.id);

                                if (consulta[0].categoriasOpcao && consulta[0].categoriasOpcao.length > 0) {
                                    this.RemoverCategorias(consulta[0]);
                                }

                                // Salva novamente com a referência correta
                                return this.Salvar(produto);
                            } else {
                                return of(produto);
                            }
                        }),
                    );
                }
                // Para outros erros, apenas retorna a pessoa sem alteração
                return of(produto);
            }),
        );
    }


    private mapearProduto(response: IFindResponse): Observable<Produto> {
        const res = response.data;

        return forkJoin({
            fornecedor: this.salvarFornecedor(response.data.fornecedor.contato.id),
            variacao: response?.data.variacao ? this.salvarVariacao(response.data.variacao.nome) : null,
        }).pipe(switchMap(values => {
            const produto = new Produto();
            produto.idOriginal = res.id.toFixed(0);
            produto.descricao = res.nome;
            produto.descricaoCurta = res.descricaoCurta ?? '';
            produto.formato = res.formato;
            produto.fornecedor = values.fornecedor;
            produto.gtin = res.gtin;
            produto.gtinEmbalagem = res.gtinEmbalagem;
            produto.situacao = res.situacao === 'A' ? 1 : 0;
            produto.observacoes = res.observacoes;
            produto.urlImagem = res.imagemURL ?? '';
            produto.valorCusto = res.fornecedor ? res.fornecedor.precoCusto : 0;
            produto.valorPreco = res.preco;

            if (values.variacao) {
                produto.categoriasOpcao = [];
                const relacao = new ProdutoCategoriaRelacao();
                relacao.produtoCategoriaOpcao = values.variacao;
                produto.categoriasOpcao.push(relacao);
            }

            if (res.variacao) {
                return from(this.dataSource.getRepository(Produto)
                    .find({ where: { idOriginal: res.variacao.produtoPai.id.toFixed(0) }, loadEagerRelations: false }))
                    .pipe(switchMap(consulta => {
                        if (consulta.length > 0) {
                            return of(consulta[0])
                        } else {
                            return this.getProdutoFromAPI(res.variacao.produtoPai.id).pipe(
                                switchMap(response => {
                                    return this.mapearProduto(response)
                                        .pipe(switchMap(prod => {
                                            return this.Salvar(prod)
                                        }))
                                })
                            )
                        }
                    }))
                    .pipe(map(prod => {
                        produto.produtoPai = prod;
                        return produto;
                    }))
            } else {
                return of(produto);
            }
        }))

    }

    private salvarVariacao(variacao: string): Observable<ProdutoCategoriaOpcao> {
        const nome = variacao.split(':')[0];
        const valor = variacao.split(':')[1];
        const repoCategoria = this.dataSource.getRepository(ProdutoCategoria);

        return from(repoCategoria.find({ where: { nome: variacao }, relations: { opcoes: true }, order: { opcoes: { nome: 'ASC' } } }))
            .pipe(switchMap(values => {
                let categoria: ProdutoCategoria;
                let opcao: ProdutoCategoriaOpcao;

                let temCategoria = (values.length > 0);
                let temOpcao = false;
                if (temCategoria) {
                    categoria = values[0];
                    if (values[0].opcoes && values[0].opcoes.length > 0) {
                        let opcaoEncontrada = values[0].opcoes.find(opcao => opcao.nome === valor);
                        if (opcao) {
                            opcao = opcaoEncontrada;
                            temOpcao = true;
                        }
                    }
                }

                if (!temCategoria) {
                    categoria = new ProdutoCategoria();
                    categoria.nome = nome;
                    categoria.tipo = 'V';
                    categoria.opcoes = [];

                }
                if (!temOpcao) {
                    opcao = new ProdutoCategoriaOpcao();
                    opcao.nome = valor;
                    opcao.produtoCategoria = categoria;
                    categoria.opcoes.push(opcao)
                }

                return from(repoCategoria.save(categoria)).pipe(map(value => {
                    return value.opcoes.find(opcao => opcao.nome === valor)
                }));
            }))
    }

    private salvarFornecedor(idOriginalPessoa: number): Observable<Fornecedor> {
        const repository = this.dataSource.getRepository(Fornecedor);
        const repoPessoa = this.dataSource.getRepository(Pessoa);
        const query = repository
            .createQueryBuilder('f')
            .innerJoin(Pessoa, 'p', 'f.id_pessoa = p.id')
            .where('p.id_original = :id', { id: idOriginalPessoa });
        return from(query.getMany())
            .pipe(switchMap(consulta => {
                if (consulta.length > 0) {
                    return of(consulta[0])
                } else {
                    const fornecedor = new Fornecedor();
                    return from(repoPessoa.find({ where: { idOriginal: idOriginalPessoa.toFixed(0) } }))
                        .pipe(map(pessoas => {
                            if (pessoas.length > 0) {
                                fornecedor.pessoa = pessoas[0];
                                fornecedor.situacao = 1;
                                return fornecedor;
                            } else {
                                throw new Error('Não foi possível encontrar a Pessoa de idOriginal: ' + idOriginalPessoa.toFixed(0))
                            }
                        }))
                }
            }))
    }

    private criarFiltroPessoa(vendedor: Produto): SelectQueryBuilder<Produto> {
        let select = this.produtoService.repository
            .createQueryBuilder('v')
            .orWhere('v.id_original = :idOriginal', {
                idOriginal: vendedor.idOriginal,
            });

        return select;
    }
}

