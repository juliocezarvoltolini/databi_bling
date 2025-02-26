import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IFindResponse } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/find.interface';
import { IGetResponse } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/get.interface';
import {
  catchError,
  concatMap,
  forkJoin,
  from,
  map,
  mergeMap,
  Observable,
  of,
  reduce,
  switchMap,
  tap,
  throwError,
  timer,
  toArray,
} from 'rxjs';
import { AppMath } from 'src/shared/util/operacoes-matematicas/app-math-operations';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { Empresa } from 'src/app/empresa/entities/empresa.entity';
import { AuthBlingService } from 'src/app/integracao/bling/auth-bling.service';
import { logger } from 'src/logger/winston.logger';
import { Produto } from 'src/app/produto/entities/produto.entity';
import { Venda } from 'src/app/venda/entities/venda.entity';
import { VendaService } from 'src/app/venda/venda.service';
import { DataSource } from 'typeorm';
import { ImportCliente } from './task.interface';
import { Item } from 'src/app/venda/item/entities/item.entity';
import { VendaPagamento } from 'src/app/venda/pagamento/entities/venda-pagamento.entity';
import { FormaPagamento } from 'src/app/forma-pagamento/entities/forma-pagamento.entity';
import { VendedorImportacao } from './vendedor-importacao';
import { PessoaImportacao } from '../pessoa-importacao';
import { ProdutoImportacao } from './produto-importacao';

class ItemBling {
  id: number;
  codigo?: string;
  unidade?: string;
  quantidade: number;
  desconto?: number;
  valor: number;
  aliquotaIPI?: number;
  descricao: string;
  descricaoDetalhada?: string;
  produto?: {
    id: number;
  };
  comissao?: {
    base?: number;
    aliquota?: number;
    valor?: number;
  };
}

class PagamentoBling {
  id: number;
  dataVencimento: string;
  valor: number;
  observacoes?: string;
  formaPagamento: {
    id: number;
  };
}

class Totalizadores {
  subtotal: number;
  desconto: number;
  total: number;
}

@Injectable()
export class VendaImportacao implements OnModuleInit {
  private blingService: Bling;

  constructor(
    private readonly service: AuthBlingService,
    private readonly vendaService: VendaService,
    private readonly controleImportacaoService: ControleImportacaoService,
    private readonly importCliente: ImportCliente,
    private readonly importProduto: ProdutoImportacao,
    private readonly vendedorImportacao: VendedorImportacao,
    private pessoaImportacao: PessoaImportacao,
    @Inject('DATA_SOURCE') private dataSource: DataSource,
  ) {}

  onModuleInit() {
    // this.iniciar();
  }

  async iniciar() {
    let controleImportacao: ControleImportacao;
    this.controleImportacaoService
      .find({ tabela: 'venda' })
      .pipe(
        switchMap((consulta) => {
          if (consulta.length > 0) {
            controleImportacao = consulta[0];
            console.log('Pesquisou e encontrou no banco: ', consulta);
          } else {
            controleImportacao = new ControleImportacao();
            controleImportacao.tabela = 'venda';
            controleImportacao.pagina = 0;
            controleImportacao.ultimoIndexProcessado = -1;
            controleImportacao.data = new Date(2024, 9, 1);
          }

          controleImportacao.pagina = controleImportacao.pagina + 1;
          console.log('VAI PESQUISAR PÁGINA ', controleImportacao.pagina);
          return this.execute(controleImportacao);
        }),
      )
      .subscribe({
        next: (value: Venda) => {
          logger.info(`Item processado com sucesso. ID:${value.id} - NOME: ${value.pessoa.nome}`);
        },
        error: (err) => {
          if (err.name == 'zero') {
            console.log('DATA ANTES: ', controleImportacao.data);
            const novaData = new Date(controleImportacao.data);
            novaData.setDate(novaData.getDate() + 1);
            controleImportacao.data = novaData;
            console.log('DATA DEPOIS: ', controleImportacao.data);
            console.log(`Todas as páginas foram concluídas para a data ${controleImportacao.data}`);
            // controleImportacao.data.setDate(controleImportacao.data.getDate() + 1);
            console.log('DATA DEPOIS: ', controleImportacao.data);
            controleImportacao.pagina = 0;
            controleImportacao.ultimoIndexProcessado = -1;
            this.controleImportacaoService.repository
              .createQueryBuilder('c')
              .update()
              .set({ data: () => 'data + 1', pagina: 0, ultimoIndexProcessado: -1 })
              .where('tabela = :tabela', { tabela: 'venda' })
              .execute()
              .then(
                () => this.iniciar(), // Processa a próxima página
              );

            // this.controleImportacaoService.repository.save(controleImportacao, {}).then(
            //   (ret) => this.iniciar(), // Processa a próxima página
            // );
          } else {
            console.error('Erro durante o processamento:', err);
          }
        },
        complete: () => {
          controleImportacao.ultimoIndexProcessado = -1;
          console.log(`Página ${controleImportacao.pagina} processada com sucesso.`);
          this.controleImportacaoService.repository.save(controleImportacao).then(
            () => this.iniciar(), // Processa a próxima página
          );
        },
      });
  }

  execute(contador: ControleImportacao, timeout: number = 1000): Observable<Venda | Venda[]> {
    try {
      return from(this.service.getAcessToken()).pipe(
        switchMap((token) => {
          this.blingService = new Bling(token);
          logger.info('Criou o serviço Bling.');

          return timer(timeout).pipe(
            switchMap(() => {
              return from(
                this.blingService.pedidosVendas.get({
                  pagina: contador.pagina,
                  dataInicial: contador.data,
                  dataFinal: contador.data,
                  idsSituacoes: [9],
                }),
              ).pipe(
                switchMap((response) => {
                  if (response.data.length > 0) {
                    return this.SalvarResposta(response, contador, this.blingService);
                  } else {
                    const erro = new Error('Não há mais contatos para processar.');
                    erro.name = 'zero';
                    return throwError(() => erro);
                  }
                }),
                catchError((err: Error) => {
                  if (err.name === 'zero') {
                    return throwError(() => err);
                  } else {
                    console.error('===============', err);
                    return timer(30000).pipe(
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

  private RemoverItens(venda: Venda): Observable<any> {
    console.log('TESTE');
    const item = this.dataSource.getRepository(Item).delete({ venda: { id: venda.id } });
    const pagamento = this.dataSource
      .getRepository(VendaPagamento)
      .delete({ venda: { id: venda.id } });

    const retorno = Promise.all([item, pagamento]);

    console.log('TESTE');

    // Certifique-se de que tanto item quanto pagamento sejam Observables válidos
    return from(retorno);
  }

  private SalvarResposta(
    response: IGetResponse,
    controleImportacao: ControleImportacao,
    blingService: Bling,
  ): Observable<Venda> {
    const itensRestantes = response.data.slice(controleImportacao.ultimoIndexProcessado + 1);
    return from(itensRestantes).pipe(
      // Processa cada item serializadamente
      concatMap((item) =>
        timer(1000).pipe(
          // Adiciona um atraso de 1000ms entre cada item
          switchMap(() => this.getVendaFromAPI(item.id)),
          switchMap((vendaCompleta) => {
            return this.mapearVenda(vendaCompleta, blingService).pipe(
              switchMap((venda) => {
                return this.Salvar(venda).pipe(
                  tap(() => {
                    this.AtualizarContadorRegistroProcessado(controleImportacao);
                  }),
                );
              }),
              catchError((error: Error) => {
                return throwError(
                  () =>
                    new Error(
                      `Erro ao mapear a venda. ID:${vendaCompleta.data.id}. Motivo: ${error.message}. Stack: ${error.stack}`,
                    ),
                );
              }),
            );
          }),
        ),
      ),
    );
  }

  private AtualizarContadorRegistroProcessado(controleImportacao: ControleImportacao) {
    controleImportacao.ultimoIndexProcessado++;
    logger.info('Atualizando controle.');
    this.controleImportacaoService.repository
      .createQueryBuilder('c')
      .update()
      .set({
        ultimoIndexProcessado: () => 'ultimo_index_processado + 1',
      })
      .where('tabela = :tabela', {
        tabela: controleImportacao.tabela,
      })
      .execute();
  }

  private getVendaFromAPI(id: number): Observable<IFindResponse> {
    return from(this.blingService.pedidosVendas.find({ idPedidoVenda: id })).pipe(
      catchError((value) => {
        if (
          value.message ===
          'O limite de requisições por segundo foi atingido, tente novamente mais tarde.'
        ) {
          logger.info('Vai tentar novamente em 30 segundos');
          return timer(15000).pipe(switchMap(() => this.getVendaFromAPI(id)));
        } else {
          throw value;
        }
      }),
    );
  }

  private Salvar(venda: Venda): Observable<Venda> {
    return from(this.vendaService.repository.save(venda)).pipe(
      switchMap((value) => {
        return of(value);
      }),
      catchError((err) => {
        logger.warn(
          `Erro ao persitir entidade Venda(NOME: ${venda?.pessoa.nome} / idOriginal:${venda.idOriginal}). Motivo: ${err.message}`,
        );
        if (
          err.message.includes('duplicate key') ||
          err.message.includes('duplicar valor da chave viola a restrição de unicidade')
        ) {
          return this.criarFiltroVenda(venda).pipe(
            switchMap((consulta) => {
              if (consulta.length > 0) {
                venda.id = consulta[0].id;
                logger.info('Salvar novamente com id ' + venda.id);

                if (consulta[0].itens && consulta[0].itens.length > 0) {
                  console.log('EXCLUIU 1');

                  return this.RemoverItens(consulta[0]).pipe(
                    switchMap(() => {
                      console.log('EXCLUIU 2');
                      return this.Salvar(venda);
                    }),
                  );
                } // Salva novamente com a referência correta
                else {
                  console.log('--------------------------');
                  return this.Salvar(venda);
                }
              } else {
                return of(venda);
              }
            }),
          );
        } else {
          console.log(err);
          throwError(() => err);
        }
        // Para outros erros, apenas retorna a pessoa sem alteração
      }),
    );
  }

  private encontrarProduto(id: number): Observable<Produto> {
    const repo = this.dataSource.getRepository(Produto);
    return from(repo.findOne({ where: { idOriginal: id.toFixed(0) } })).pipe(
      switchMap((value) => {
        if (!value) {
          return this.importProduto.seleciona(id, this.blingService);
        } else return of(value);
      }),
    );
  }

  private mapearItens(
    itens: ItemBling[],
    data: Date,
  ): Observable<{ itens: Item[]; totalizadores: Totalizadores }> {
    const totalizadores: Totalizadores = new Totalizadores();
    return from(itens)
      .pipe(
        mergeMap((value, index) => {
          return forkJoin({
            produto: this.encontrarProduto(value.produto.id),
            item: of(value),
            index: of(index),
          });
        }),
      )
      .pipe(
        reduce((acc: Item[], value) => {
          const item = new Item();
          let precoVenda =
            value.produto.valorPreco > 0.0
              ? value.produto.valorPreco
              : AppMath.divide(value.item.valor, value.item.quantidade);

          //TEM PRODUTOS QUE O PREÇO DE VENDA É IGUAL A ZERO
          //SE HOUVER DESCONTO, PRECISO ENCONTRAR O PREÇO SEM DESCONTO
          if (value.item.desconto > 0 && value.produto.valorPreco == 0.0) {
            precoVenda = AppMath.divide(precoVenda, AppMath.sum(1, -(value.item.desconto / 100)));
          }

          item.idOriginal = value.item.id.toFixed(0);
          item.produto = value.produto;
          item.desconto_percentual = value.item.desconto;
          item.desconto_valor = AppMath.sum(precoVenda, -value.item.valor);

          totalizadores.desconto = AppMath.sum(item.desconto_valor, totalizadores.desconto);
          totalizadores.subtotal = AppMath.sum(
            AppMath.multiply(precoVenda, value.item.quantidade),
            totalizadores.subtotal,
          );
          totalizadores.total = AppMath.sum(value.item.valor, totalizadores.total);
          item.valor = precoVenda;
          item.total = value.item.valor;
          item.quantidade = value.item.quantidade;
          item.unidade = value.item.unidade;
          item.estado = 'A';
          item.data = data;
          acc[value.index] = item;
          return acc;
        }, []),
        switchMap((itens) => {
          return of({ itens, totalizadores });
        }),
      );
  }

  private distribuirDescontoSobreOsItens(
    itens: Item[],
    desconto: number,
    totalizadores: Totalizadores,
  ) {
    let resto = desconto;
    itens.forEach((item, index) => {
      const subtotal = AppMath.multiply(item.quantidade, item.valor);
      const proporcao = AppMath.divide(subtotal, totalizadores.subtotal, 10);
      let descontoItem = AppMath.multiply(proporcao, desconto);
      if (descontoItem > resto || index == itens.length - 1) {
        descontoItem = resto;
      }

      if (descontoItem > 0.0) {
        item.desconto_valor = AppMath.sum(item.desconto_valor, descontoItem);
        item.desconto_percentual = AppMath.divide(item.desconto_valor, subtotal, 4);
        item.desconto_percentual = AppMath.multiply(item.desconto_percentual, 100);
        item.total = AppMath.sum(subtotal, -item.desconto_valor);
      }

      resto = AppMath.sum(resto, -descontoItem);

      totalizadores.desconto = AppMath.sum(totalizadores.desconto, descontoItem);
      totalizadores.total = AppMath.sum(totalizadores.total, -descontoItem);
    });
  }

  private mapearPagamentos(pagBling: PagamentoBling[], data: Date): Observable<VendaPagamento[]> {
    return from(pagBling).pipe(
      concatMap((pag, index) => {
        const repo = this.dataSource.getRepository(FormaPagamento);
        return forkJoin({
          forma: repo.findOne({ where: { idOriginal: pag.id.toFixed(0) } }),
          pag: of(pag),
          index: of(index),
        });
      }),
      concatMap((values) => {
        const pagamento = new VendaPagamento();
        pagamento.idOriginal = values.pag.id.toFixed(0);
        pagamento.formaPagamento = values.forma;
        if (values.pag.dataVencimento != '0000-00-00')
          pagamento.dataVencimento = new Date(`${values.pag.dataVencimento}T00:00:00`);
        if (data) pagamento.dataEmissao = data;
        pagamento.observacao = values.pag.observacoes;
        pagamento.valor = values.pag.valor;

        return of(pagamento);
      }),
      toArray(),
    );
  }

  private mapearVenda(response: IFindResponse, blingService: Bling): Observable<Venda> {
    const res = response.data;
    const venda = new Venda();
    venda.idOriginal = res.id.toFixed(0);
    if (res.data != '0000-00-00') venda.dataEmissao = new Date(`${res.data}T00:00:00`);
    if (res.dataSaida != '0000-00-00') venda.dataSaida = new Date(`${res.dataSaida}T00:00:00`);
    venda.empresa = new Empresa();
    venda.empresa.id = 1;
    venda.estado = 'F';
    venda.outrasDespesas = res.outrasDespesas;
    venda.frete = res.transporte.frete;

    venda.total = res.total;

    return forkJoin({
      vendedor: this.vendedorImportacao.seleciona(res.vendedor.id, blingService),
      pessoa: this.pessoaImportacao.seleciona(res.contato.id, blingService),
      itens: this.mapearItens(res.itens, venda.dataSaida),
      pagamentos: this.mapearPagamentos(res.parcelas, venda.dataSaida),
    }).pipe(
      map((pesquisas) => {
        venda.pessoa = pesquisas.pessoa;
        venda.vendedor = pesquisas.vendedor;
        venda.itens = pesquisas.itens.itens;
        venda.pagamentos = pesquisas.pagamentos;

        if (res.desconto.valor > 0) {
          let desconto = 0;
          logger.info(`Desconto encontrado na venda PERCENTUAL: ${res.desconto.valor}`);
          if (res.desconto.unidade == 'PERCENTUAL') {
            desconto = AppMath.multiply(
              res.desconto.valor / 100,
              pesquisas.itens.totalizadores.total,
            );
            logger.info(`Desconto encontrado na venda CALCULADO: ${desconto}`);
          } else {
            desconto = res.desconto.valor;
          }
          this.distribuirDescontoSobreOsItens(venda.itens, desconto, pesquisas.itens.totalizadores);
        }
        //DESCONTO INCIDE APENAS SOBRE OS ITENS, NÃO É APLICADO SOBRE VALORES ACESSÓRIOS, COMO: frete, outrasDespesas
        venda.desconto_valor = pesquisas.itens.totalizadores.desconto;
        venda.desconto_percentual = AppMath.divide(
          venda.desconto_valor,
          pesquisas.itens.totalizadores.subtotal,
        );
        venda.subtotalProdutos = AppMath.sum([
          pesquisas.itens.totalizadores.subtotal,
          venda.outrasDespesas,
          venda.frete,
        ]);
        return venda;
      }),
    );
  }

  private criarFiltroVenda(venda: Venda): Observable<Venda[]> {
    return from(this.vendaService.find({ idOriginal: venda.idOriginal }));
  }
}
