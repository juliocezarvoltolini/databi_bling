import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import Bling from 'bling-erp-api';
import { IFindResponse } from 'bling-erp-api/lib/entities/vendedores/interfaces/find.interface';
import { IGetResponse } from 'bling-erp-api/lib/entities/vendedores/interfaces/get.interface';
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
    private readonly vendedorService: VendedorService,
    private readonly controleImportacaoService: ControleImportacaoService,
    @Inject('DATA_SOURCE') private dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.iniciar();
  }

  async iniciar() {
    let controleImportacao: ControleImportacao;
    this.controleImportacaoService
      .find({ tabela: 'vendedor' })
      .pipe(
        switchMap((consulta) => {
          if (consulta.length > 0) {
            controleImportacao = consulta[0];
            console.log('Pesquisou e encontrou no banco: ', consulta);
          } else {
            controleImportacao = new ControleImportacao();
            controleImportacao.tabela = 'vendedor';
            controleImportacao.pagina = 0;
          }

          controleImportacao.pagina = controleImportacao.pagina + 1;
          console.log('VAI PESQUISAR PÁGINA ', controleImportacao.pagina);
          return this.execute(controleImportacao.pagina);
        }),
      )
      .subscribe({
        next: (value: Vendedor) => {
          logger.info(
            `Item processado com sucesso. ID:${value.id} - NOME: ${value.pessoa.nome}`,
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
  ): Observable<Vendedor | Vendedor[]> {
    try {
      return from(this.service.getAcessToken()).pipe(
        switchMap((token) => {
          this.blingService = new Bling(token);
          logger.info('Criou o serviço Bling.');

          return timer(timeout).pipe(
            switchMap(() => {
              return from(
                this.blingService.vendedores.get({ pagina: contador }),
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

  private RemoverComissoes(vendedor: Vendedor): Observable<any> {
    let comissoes = vendedor.comissao.map((end) => {
      return end.id;
    });
    if (comissoes.length > 0)
      return from(
        this.dataSource.manager
          .getRepository(VendedorComissao)
          .delete(comissoes),
      );
    else return of(null);
  }

  private SalvarResposta(response: IGetResponse) {
    return from(response.data).pipe(
      // Processa cada item serializadamente
      concatMap((item) =>
        timer(500).pipe(
          // Adiciona um atraso de 500ms entre cada item
          switchMap(() =>
            from(this.blingService.vendedores.find({ idVendedor: item.id })),
          ),
          switchMap((response) => {
            console.log(response);
            return this.mapearContatoParaPessoa(response).pipe(
              switchMap((vendedor) => {
                return this.Salvar(vendedor);
              }),
            );
          }),
        ),
      ),
    );
  }

  private Salvar(vendedor: Vendedor): Observable<Vendedor> {
    return from(this.vendedorService.repository.save(vendedor)).pipe(
      catchError((err) => {
        logger.warn(
          `Erro ao persitir entidade Vendedor(NOME: ${vendedor?.pessoa.nome} / idOriginal:${vendedor.idOriginal}). Motivo: ${err.message}`,
        );
        if (
          err.message.includes('duplicate key') ||
          err.message.includes(
            'duplicar valor da chave viola a restrição de unicidade',
          )
        ) {
          const pessoaFilter = this.criarFiltroPessoa(vendedor);

          return from(pessoaFilter.getMany()).pipe(
            switchMap((consulta) => {
              if (consulta.length > 0) {
                vendedor.id = consulta[0].id;
                logger.info('Salvar novamente com id ' + vendedor.id);

                if (consulta[0].comissao && consulta[0].comissao.length > 0) {
                  this.RemoverComissoes(consulta[0]).subscribe();
                }

                // Certifique-se de que os endereços estão associados corretamente
                if (vendedor.comissao?.length > 0) {
                  vendedor.comissao = vendedor.comissao.map((com) => {
                    com.vendedor = vendedor; // Associa o endereço à pessoa
                    return com;
                  });
                }

                // Salva novamente com a referência correta
                return this.Salvar(vendedor);
              } else {
                return of(vendedor);
              }
            }),
          );
        }
        // Para outros erros, apenas retorna a pessoa sem alteração
        return of(vendedor);
      }),
    );
  }

  private mapearContatoParaPessoa(
    contato: IFindResponse,
  ): Observable<Vendedor> {
    return from(
      this.dataSource
        .getRepository(Pessoa)
        .find({
          where: { idOriginal: contato.data.contato.id.toFixed(0) },
          loadEagerRelations: false,
        }),
    ).pipe(
      switchMap((value) => {
        const vendedor = new Vendedor();
        const pessoa = value[0];
        vendedor.idOriginal = contato.data.id.toFixed(0);
        vendedor.pessoa = pessoa;
        vendedor.situacao = 1;
        vendedor.comissao = [];
        if (contato.data.comissoes && contato.data.comissoes.length > 0) {
          contato.data.comissoes.forEach((com) => {
            const comissao = new VendedorComissao();
            comissao.percentualComissao = com.aliquota;
            comissao.percentualDesconto = com.descontoMaximo;
            vendedor.comissao.push(comissao);
          });
        }
        console.log('Vendedor:', vendedor);
        return of(vendedor);
      }),
    );
  }

  private criarFiltroPessoa(vendedor: Vendedor): SelectQueryBuilder<Vendedor> {
    let select = this.vendedorService.repository
      .createQueryBuilder('v')
      .orWhere('v.id_original = :idOriginal', {
        idOriginal: vendedor.idOriginal,
      });

    return select;
  }
}
