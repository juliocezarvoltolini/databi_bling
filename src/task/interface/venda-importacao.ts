import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import Bling from 'bling-erp-api';
import { IFindResponse } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/find.interface';
import { IGetResponse } from 'bling-erp-api/lib/entities/pedidosVendas/interfaces/get.interface';
import {
  catchError,
  concatMap,
  firstValueFrom,
  forkJoin,
  from,
  interval,
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
import { IUF } from 'src/common/types/uf.types';
import { Assigned } from 'src/common/util/object/object.util';
import { AppMath } from 'src/common/util/operacoes-matematicas/app-math-operations';
import { ControleImportacaoService } from 'src/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/controle-importacao/entities/controle-importacao.entity';
import { Empresa } from 'src/empresa/entities/empresa.entity';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { logger } from 'src/logger/winston.logger';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { Produto } from 'src/produto/entities/produto.entity';
import { Venda } from 'src/venda/entities/venda.entity';
import { VendaService } from 'src/venda/venda.service';
import { Vendedor } from 'src/vendedor/entities/vendedor.entity';
import { DataSource, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { ImportCliente } from './task.interface';
import { VendedorImportacao } from './vendedor-importacao';
import { Item } from 'src/venda/item/entities/item.entity';
import { Pagamento } from 'src/venda/pagamento/entities/pagamento.entity';
import { FormaPagamento } from 'src/forma-pagamento/entities/forma-pagamento.entity';

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
  }
}

class Totalizadores {
  subtotal: number;
  desconto: number;
  total: number;
}

@Injectable()
export class ProdutoImportacao implements OnModuleInit {
  private blingService: Bling;

  constructor(
    private readonly service: AuthBlingService,
    private readonly vendaService: VendaService,
    private readonly controleImportacaoService: ControleImportacaoService,
    private readonly importCliente: ImportCliente,
    private readonly vendedorImportacao: VendedorImportacao,
    @Inject('DATA_SOURCE') private dataSource: DataSource,
  ) { }

  onModuleInit() {
    this.iniciar();
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
            console.log(`Todas as páginas foram concluídas para a data ${controleImportacao.data.toLocaleDateString()}`);
            controleImportacao.data.setDate(controleImportacao.data.getDate() + 1);
            controleImportacao.pagina = 0;
            controleImportacao.ultimoIndexProcessado = -1;

            this.controleImportacaoService.repository.save(controleImportacao).then(
              (ret) => this.iniciar(), // Processa a próxima página
            );
          } else {
            console.error('Erro durante o processamento:', err);
          }
        },
        complete: () => {
          controleImportacao.ultimoIndexProcessado = -1;
          console.log(`Página ${controleImportacao.pagina} processada com sucesso.`);
          this.controleImportacaoService.repository.save(controleImportacao).then(
            (ret) => this.iniciar(), // Processa a próxima página
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
                }),
              ).pipe(
                switchMap((response) => {
                  if (response.data.length > 0) {
                    return this.SalvarResposta(response, contador);
                  } else {
                    const erro = new Error('Não há mais contatos para processar.');
                    erro.name = 'zero';
                    return throwError(() => erro);
                  }
                }),
                catchError((err) => {
                  if (err.name === 'zero') {
                    return throwError(() => err);
                  } else {
                    console.log('===============', err);
                    return timer(15000).pipe(
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
    return from(
      this.dataSource
        .getRepository(Venda)
        .createQueryBuilder('v')
        .delete()
        .where('v.id_venda = :id_venda', { id_venda: venda.id })
        .execute(),
    );
  }

  private SalvarResposta(
    response: IGetResponse,
    controleImportacao: ControleImportacao,
  ): Observable<Venda> {
    const itensRestantes = response.data.slice(controleImportacao.ultimoIndexProcessado + 1);
    return from(itensRestantes).pipe(
      // Processa cada item serializadamente
      concatMap((item) =>
        timer(1000).pipe(
          // Adiciona um atraso de 1000ms entre cada item
          switchMap(() => this.getVendaFromAPI(item.id)),
          switchMap((vendaCompleta) => {

            return this.mapearVenda(vendaCompleta).pipe(
              switchMap((venda) => {
                return this.Salvar(venda).pipe(
                  tap((value) => {
                    this.AtualizarContadorRegistroProcessado(controleImportacao);
                  }),
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
      catchError((err) => {
        logger.warn(
          `Erro ao persitir entidade Venda(NOME: ${venda?.pessoa.nome} / idOriginal:${venda.idOriginal}). Motivo: ${err.message}`,
        );
        if (
          err.message.includes('duplicate key') ||
          err.message.includes('duplicar valor da chave viola a restrição de unicidade')
        ) {
          const vendaCriteria = this.criarFiltroVenda(venda);

          return from(vendaCriteria.getMany()).pipe(
            switchMap((consulta) => {
              if (consulta.length > 0) {
                venda.id = consulta[0].id;
                logger.info('Salvar novamente com id ' + venda.id);

                if (consulta[0].itens && consulta[0].itens.length > 0) {
                  this.RemoverItens(consulta[0]).pipe(
                    switchMap(() => {
                      return this.Salvar(venda);
                    }),
                  );
                } // Salva novamente com a referência correta
                else return this.Salvar(venda);
              } else {
                return of(venda);
              }
            }),
          );
        }
        // Para outros erros, apenas retorna a pessoa sem alteração
        return of(venda);
      }),
    );
  }

  async registrarPessoa(id: number): Promise<Pessoa> {
    let pessoa = new Pessoa();
    pessoa.idOriginal = id.toFixed(0);
    let retorno: Pessoa;
    logger.info(`Consultando contato(${id})`)
    const consulta = await this.importCliente.criarFiltroPessoa(pessoa).getMany()
    if (consulta.length > 0) {
      retorno = consulta[0]
    }

    if (!retorno) {
      try {
        let response = this.blingService.contatos.find({ idContato: id });
        const pessoa = this.importCliente.mapearContatoParaPessoa(response);
        retorno = await firstValueFrom(this.importCliente.Salvar(pessoa))
      } catch (error) {
        logger.warn(`Erro ao buscar contato(${id}). Motivo: ${error.message}`)
        logger.info(`Aguardando 1 segundo para consulta novamente o contato(${id})`)
        let esperar = () => new Promise((resolve) => setTimeout(resolve, 1000));
        await esperar();
        retorno = await this.registrarPessoa(id);
      }

    }
    return retorno;
  }

  async registrarVendedor(id: number): Promise<Vendedor> {
    let vendedor = new Vendedor();
    vendedor.idOriginal = id.toFixed(0);
    let retorno: Vendedor = null;
    logger.info(`Consultando vendedor(${id})`)
    const consulta = await this.vendedorImportacao.criarFiltroVendedor(vendedor).getMany()
    if (consulta.length > 0) {
      retorno = consulta[0]
    }

    if (!retorno) {
      try {
        const response = await this.blingService.vendedores.find({ idVendedor: id });
        const vendedor = await firstValueFrom(this.vendedorImportacao.mapearContatoParaPessoa(response));
        retorno = await firstValueFrom(this.vendedorImportacao.Salvar(vendedor))
      } catch (error) {
        logger.warn(`Erro ao buscar vendedor(${id}). Motivo: ${error.message}`)
        logger.info(`Aguardando 1 segundo para consulta novamente o vendedor(${id})`)
        let esperar = () => new Promise((resolve) => setTimeout(resolve, 1000));
        await esperar();
        retorno = await this.registrarVendedor(id);
      }

    }
    return retorno;
  }

  private mapearItens(itens: ItemBling[], data: Date): Observable<{ itens: Item[], totalizadores: Totalizadores }> {
    const totalizadores: Totalizadores = new Totalizadores();
    return from(itens).pipe(
      mergeMap((value, index) => {
        const repo = this.dataSource.getRepository(Produto);
        return forkJoin({
          produto: from(repo.findOne({ where: { idOriginal: value.id.toFixed(0) } })),
          item: of(value),
          index: of(index)
        })

      })

    ).pipe(
      reduce((acc: Item[], value, index) => {
        const item = new Item();
        item.produto = value.produto;
        item.desconto_percentual = value.item.desconto;
        item.desconto_valor = AppMath.sum(value.produto.valorPreco, -value.item.valor);
        totalizadores.desconto = AppMath.sum(item.desconto_valor, totalizadores.desconto);
        totalizadores.subtotal = AppMath.sum(AppMath.multiply(value.produto.valorPreco, value.item.quantidade), totalizadores.subtotal);
        totalizadores.total = AppMath.sum(value.item.valor, totalizadores.total);
        item.valor = value.item.valor;
        item.quantidade = value.item.quantidade;
        item.unidade = value.item.unidade;
        item.estado = 'A';
        item.data = data;
        acc[value.index] = item;
        return acc
      }, []),
      switchMap(itens => {
        return of({ itens, totalizadores })
      })
    )
  }

  private distribuirDescontoSobreOsItens(itens: Item[], desconto: number, totalizadores: Totalizadores) {
    let resto = desconto;
    itens.forEach(item => {
      let subtotal = AppMath.multiply(item.quantidade, item.valor);
      let proporcao = AppMath.divide(subtotal, totalizadores.subtotal);
      let descontoItem = AppMath.multiply(proporcao, desconto);
      if (descontoItem > resto) {
        descontoItem = resto;
      }

      item.desconto_valor = AppMath.sum(item.desconto_valor, descontoItem);
      item.desconto_percentual = AppMath.divide(item.desconto_percentual, subtotal);
      item.desconto_percentual = AppMath.multiply(item.desconto_percentual, 100);
      item.total = AppMath.sum(subtotal, -item.desconto_valor);

      totalizadores.desconto = AppMath.sum(totalizadores.desconto, descontoItem);
      totalizadores.total = AppMath.sum(totalizadores.total, -descontoItem);
    })
  }

  private mapearPagamentos(pagBling: PagamentoBling[], data: Date): Observable<Pagamento[]>{
    return from(pagBling).pipe(
      concatMap((pag, index) => {
        const repo = this.dataSource.getRepository(FormaPagamento);
        return forkJoin({
          forma: repo.findOne({where: {idOriginal: pag.id.toFixed(0)}}),
          pag: of(pag),
          index: of(index)
      })
      }),
      concatMap(values => {
        const pagamento = new Pagamento();
        pagamento.idOriginal = values.pag.id.toFixed(0);
        pagamento.formaPagamento = values.forma;
        pagamento.dataVencimento = new Date(values.pag.dataVencimento);
        pagamento.dataEmissao = data;
        pagamento.observacao = values.pag.observacoes;
        pagamento.valor = values.pag.valor;

        return of(pagamento)
      }),
      toArray()
    )
  }

  private mapearVenda(response: IFindResponse): Observable<Venda> {
    const res = response.data;
    const venda = new Venda();
    venda.idOriginal = res.id.toFixed(0);
    venda.dataEmissao = new Date(res.data);
    venda.dataSaida = new Date(res.dataSaida);
    venda.empresa = new Empresa();
    venda.empresa.id = 1;
    venda.estado = 'F';
    venda.outrasDespesas = res.outrasDespesas;
    venda.frete = res.transporte.frete;

    venda.total = res.total;

    return forkJoin({
      vendedor: res.vendedor.id > 0 ? from(this.registrarVendedor(res.vendedor.id)) : of(null),
      pessoa: res.contato.id > 0 ? from(this.registrarPessoa(res.contato.id)) : of(null),
      itens: this.mapearItens(res.itens, venda.dataSaida),
      pagamentos: this.mapearPagamentos(res.parcelas, venda.dataSaida)
    }).pipe(
      map(pesquisas => {
        venda.pessoa = pesquisas.pessoa;
        venda.vendedor = pesquisas.vendedor;
        venda.itens = pesquisas.itens.itens;
        venda.pagamentos = pesquisas.pagamentos;

        if (res.desconto.valor > 0) {
          let desconto = 0;
          if (res.desconto.unidade == 'PERCENTUAL') {
            desconto = AppMath.multiply((res.desconto.valor / 100), pesquisas.itens.totalizadores.total);
          } else {
            desconto = res.desconto.valor;
          }
          this.distribuirDescontoSobreOsItens(venda.itens, desconto, pesquisas.itens.totalizadores);
        }
        //DESCONTO INCIDE APENAS SOBRE OS ITENS, NÃO É APLICADO SOBRE VALORES ACESSÓRIOS, COMO: frete, outrasDespesas
        venda.desconto_valor = pesquisas.itens.totalizadores.desconto;
        venda.desconto_percentual = AppMath.divide(venda.desconto_valor, pesquisas.itens.totalizadores.subtotal);
        venda.subtotal = AppMath.sum([pesquisas.itens.totalizadores.subtotal, venda.outrasDespesas, venda.frete]);
        return venda;
      })

    )

  }


  private criarFiltroVenda(venda: Venda): SelectQueryBuilder<Venda> {
    let select = this.vendaService.repository
      .createQueryBuilder('v')
      .orWhere('v.id_original = :idOriginal', {
        idOriginal: venda.idOriginal,
      });

    return select;
  }
}
