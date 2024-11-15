import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import Bling from 'bling-erp-api';
import { IFindResponse } from 'bling-erp-api/lib/entities/formasDePagamento/interfaces/find.interface';
import { IGetResponse } from 'bling-erp-api/lib/entities/formasDePagamento/interfaces/get.interface';
import {
  catchError,
  concatMap,
  firstValueFrom,
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
import { FormaPagamento } from 'src/forma-pagamento/entities/forma-pagamento.entity';
import { FormaPagamentoService } from 'src/forma-pagamento/forma-pagamento.service';
import { AuthBlingService } from 'src/integracao/bling/auth-bling.service';
import { logger } from 'src/logger/winston.logger';
import { Pessoa } from 'src/pessoa/entities/pesssoa.entity';
import { VendedorComissao } from 'src/vendedor/entities/vendedor-comissao.entity';
import { Vendedor } from 'src/vendedor/entities/vendedor.entity';
import { VendedorService } from 'src/vendedor/vendedor.service';
import { DataSource, QueryFailedError, SelectQueryBuilder } from 'typeorm';

@Injectable()
export class VendedorImportacao implements OnModuleInit {
  private blingService: Bling;

  constructor(
    private readonly service: AuthBlingService,
    private readonly formaPagamentoService: FormaPagamentoService,
    private readonly controleImportacaoService: ControleImportacaoService,
    @Inject('DATA_SOURCE') private dataSource: DataSource,
  ) {}

  onModuleInit() {
    // this.iniciar();
  }

  async iniciar() {
    let controleImportacao: ControleImportacao;
    this.controleImportacaoService
      .find({ tabela: 'forma-pagamento' })
      .pipe(
        switchMap((consulta) => {
          if (consulta.length > 0) {
            controleImportacao = consulta[0];
            console.log('Pesquisou e encontrou no banco: ', consulta);
          } else {
            controleImportacao = new ControleImportacao();
            controleImportacao.tabela = 'forma-pagamento';
            controleImportacao.pagina = 0;
          }

          controleImportacao.pagina = controleImportacao.pagina + 1;
          console.log('VAI PESQUISAR PÁGINA ', controleImportacao.pagina);
          return this.execute(controleImportacao.pagina);
        }),
      )
      .subscribe({
        next: (value: FormaPagamento) => {
          logger.info(
            `Item processado com sucesso. ID:${value.id} - NOME: ${value.nome}`,
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

  execute(
    contador: number,
    timeout: number = 1000,
  ): Observable<FormaPagamento | FormaPagamento[]> {
    try {
      return from(this.service.getAcessToken()).pipe(
        switchMap((token) => {
          this.blingService = new Bling(token);
          logger.info('Criou o serviço Bling.');

          return timer(timeout).pipe(
            switchMap(() => {
              return from(
                this.blingService.formasDePagamento.get({ pagina: contador }),
              ).pipe(
                switchMap((response) => {
                  if (response.data.length > 0) {
                    return this.SalvarResposta(response);
                  } else {
                    const erro = new Error(
                      'Não há mais formas de pagamento para processar.',
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

  private SalvarResposta(response: IGetResponse) {
    return from(response.data).pipe(
      // Processa cada item serializadamente
      concatMap((item) =>
        timer(500).pipe(
          // Adiciona um atraso de 500ms entre cada item
          switchMap(() =>
            from(this.blingService.formasDePagamento.find({ idFormaPagamento: item.id })),
          ),
          switchMap((response) => {
            console.log(response);
            return this.mapearFormaPagamento(response).pipe(
              switchMap((forma) => {
                return this.Salvar(forma);
              }),
            );
          }),
        ),
      ),
    );
  }

  Salvar(formaPagamento: FormaPagamento): Observable<FormaPagamento> {
    return from(this.formaPagamentoService.repository.save(formaPagamento)).pipe(
      catchError((err) => {
        logger.warn(
          `Erro ao persitir entidade FormaPagamento(NOME: ${formaPagamento.nome} / idOriginal:${formaPagamento.idOriginal}). Motivo: ${err.message}`,
        );
        if (
          err.message.includes('duplicate key') ||
          err.message.includes(
            'duplicar valor da chave viola a restrição de unicidade',
          )
        ) {
          const pessoaFilter = this.criarFiltroFormaPagamento(formaPagamento);

          return from(pessoaFilter.getMany()).pipe(
            switchMap((consulta) => {
              if (consulta.length > 0) {
                formaPagamento.id = consulta[0].id;
                logger.info('Salvar novamente com id ' + formaPagamento.id);
                // Salva novamente com a referência correta
                return this.Salvar(formaPagamento);
              } else {
                return of(formaPagamento);
              }
            }),
          );
        }
        // Para outros erros, apenas retorna a pessoa sem alteração
        return of(formaPagamento);
      }),
    );
  }

  mapearFormaPagamento(
    forma: IFindResponse,
  ): Observable<FormaPagamento> {
   const formaPagamento = new FormaPagamento();
   formaPagamento.idOriginal = forma.data.id.toFixed(0);
   formaPagamento.nome = forma.data.descricao;
   formaPagamento.finalidade = forma.data.finalidade;
   formaPagamento.tipoPagamento = forma.data.tipoPagamento;
   formaPagamento.situacao = forma.data.situacao;
   formaPagamento.bandeiraCartao = forma.data.dadosCartao ? forma.data.dadosCartao.bandeira : null;
   formaPagamento.taxaAliquota = forma.data.taxas.aliquota;
   formaPagamento.taxaValor = forma.data.taxas.valor;
   return of(formaPagamento);
  }

  criarFiltroFormaPagamento(formaPagamento: FormaPagamento): SelectQueryBuilder<FormaPagamento> {
    let select = this.formaPagamentoService.repository
      .createQueryBuilder('f')
      .orWhere('f.id_original = :idOriginal', {
        idOriginal: formaPagamento.idOriginal,
      });

    return select;
  }
}
