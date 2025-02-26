import { lastValueFrom } from 'rxjs';
import { BlingService } from 'src/app/bling-service/service/bling-service';
import {
  getItensRestantes,
  updateDateOfSearchParameters,
} from 'src/app/bling-service/utils/bling-utils';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';

export class BlingCollection<Entity extends { id: number }> {
  data: Partial<Entity>[];
}

export enum PaginacaoType {
  DATE = 'date',
  INDEX = 'index',
}

export interface ImportacaoService<Entity, BlingEntity extends { id: number }> {
  start(): Promise<void>;
  selectEntity(Id: number): Promise<Entity>;
  searchPage(searchParameters: Record<string, any>): Promise<BlingCollection<BlingEntity>>;
  readAndSave(blingEntity: Partial<BlingEntity>): Promise<Entity>;
}

export abstract class ImportacaoServiceBase<Entity, BlingEntity extends { id: number }>
  implements ImportacaoService<Entity, BlingEntity>
{
  private controle: ControleImportacao;

  async start(): Promise<void> {
    await this.getControle();

    let searchParameters: Record<string, any> = this.controle.parametros ?? {};
    searchParameters['pagina'] = this.controle.pagina;
    searchParameters['limite'] = 100;

    //Atualizando as propriedades que são do tipo 'date' se houverem.
    searchParameters = updateDateOfSearchParameters(searchParameters, this.controle.data);

    const lista = await this.searchPage(searchParameters);

    //Irá pegar os itens que ainda não foram processados
    const itensRestantes = getItensRestantes(lista, this.controle.ultimoIndexProcessado);

    for (const item of itensRestantes) {
      await this.readAndSave(item);
      await this.updateIndexOfControle();
    }

    switch (this.paginacaoType) {
      case PaginacaoType.DATE:
        await this.updateDateOfControle();
        break;
      case PaginacaoType.INDEX:
        this.updatePageOfControle();
        break;
      default:
        throw new Error('Tipo de paginação desconhecido.');
    }

    //Se a página possuir 100 itens, executa a função novamente para consultar se existem próximas páginas.
    if (itensRestantes.length == 100) return this.start();
    return;
  }

  abstract selectEntity(Id: number): Promise<Entity>;
  abstract searchPage(searchParameters: Record<string, any>): Promise<BlingCollection<BlingEntity>>;
  abstract readAndSave(blingEntity: Partial<BlingEntity>): Promise<Entity>;

  constructor(
    private readonly entity: string,
    private readonly blingService: BlingService,
    private readonly controleService: ControleImportacaoService,
    private paginacaoType: PaginacaoType,
  ) {}

  private async getControle(): Promise<ControleImportacao> {
    this.controle = new ControleImportacao();
    this.controle.tabela = this.entity;
    this.controle = await lastValueFrom(this.controleService.findOne(this.controle));
    if (!this.controle) {
      this.controle = new ControleImportacao();
      this.controle.tabela = this.entity;
      this.controle.pagina = 1;
      this.controle.ultimoIndexProcessado = -1;
      this.controle.data = new Date(2022, 0, 10);
      this.controle = await lastValueFrom(this.controleService.create(this.controle));
      return this.controle;
    }
  }

  protected async updateIndexOfControle(): Promise<void> {
    this.updateControle('index');
  }

  protected async updatePageOfControle(): Promise<void> {
    this.updateControle('pagina');
  }

  protected async updateDateOfControle(): Promise<void> {
    this.updateControle('date');
  }

  protected async updateControle(paginaOuItem: 'pagina' | 'index' | 'date'): Promise<void> {
    if (paginaOuItem == 'index') {
      this.controle.ultimoIndexProcessado += 1;
    } else if (paginaOuItem == 'pagina') {
      this.controle.pagina += 1;
      this.controle.ultimoIndexProcessado = -1;
    } else {
      this.controle.pagina = 1;
      this.controle.ultimoIndexProcessado = -1;
      // Lógica para atualizar a data
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Ajusta para meia-noite

      const lastDate = new Date(this.controle.data + 'T00:00:00');
      lastDate.setHours(0, 0, 0, 0); // Ajusta para meia-noite

      if (lastDate < today) {
        // Se a data de controle for anterior a hoje, atualize para o próximo dia
        lastDate.setDate(lastDate.getDate() + 1);
        this.controle.data = lastDate;
        console.log(`[updateControle] Atualizando data para ${lastDate}`);
      }
    }
    await lastValueFrom(this.controleService.update(this.controle.id, this.controle));
    return;
  }
}
