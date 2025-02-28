import { lastValueFrom } from 'rxjs';
import {
  getItensRestantes,
  updateDateOfSearchParameters,
} from 'src/app/bling-service/utils/bling-utils';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { ResponseLog } from 'src/app/response-log/entities/response-log.entity';
import { ResponseLogService } from 'src/app/response-log/response-log.service';

export class BlingCollection<BlingEntity extends { id: number }> {
  data: Partial<BlingEntity>[];
}

export enum PaginacaoType {
  DATE = 'date',
  INDEX = 'index',
}

export interface ImportService<Entity, BlingEntity extends { id: number }> {
  selectEntity(Id: number): Promise<Entity>;
  getCachedEntity(id: number, entity: string): Promise<{ cache: ResponseLog; entity: BlingEntity }>;
  saveCachedEntity(
    entity: string,
    id: string,
    blingEntity: BlingEntity,
    response?: ResponseLog,
  ): Promise<void>;
}

export abstract class ImportacaoServiceBase<Entity, BlingEntity extends { id: number }>
  implements ImportService<Entity, BlingEntity>
{
  constructor(private readonly responseLogService: ResponseLogService) {}
  async saveCachedEntity(
    entity: string,
    id: string,
    blingEntity: BlingEntity,
    response?: ResponseLog,
  ): Promise<void> {
    if (!response) {
      response = new ResponseLog();
      response.idOriginal = id;
      response.nomeInformacao = entity;
      response.response = JSON.stringify(blingEntity);
      response.data = new Date();
    } else {
      response.response = JSON.stringify(blingEntity);
      response.data = new Date();
    }
    if (response.id) {
      await lastValueFrom(this.responseLogService.update(response.id, response));
      return;
    }
    await lastValueFrom(this.responseLogService.create(response));
    return;
  }

  async getCachedEntity(
    id: number,
    entity: string,
  ): Promise<{ cache: ResponseLog; entity: BlingEntity }> {
    const response = await lastValueFrom(
      this.responseLogService.find({ idOriginal: id.toFixed(0), nomeInformacao: entity }),
    );
    const [first] = response;
    if (!first) return null;
    return { cache: first, entity: JSON.parse(first.response) };
  }

  abstract selectEntity(Id: number): Promise<Entity>;
}

export interface PagedImportService<Entity, BlingEntity extends { id: number }> {
  start(): Promise<void>;
  searchPage(searchParameters: Record<string, any>): Promise<BlingCollection<BlingEntity>>;
  readAndSave(blingEntity: Partial<BlingEntity>): Promise<Entity>;
}

export abstract class PagedImportServiceBase<Entity, BlingEntity extends { id: number }>
  implements PagedImportService<Entity, BlingEntity>
{
  private controle: ControleImportacao;

  abstract searchPage(searchParameters: Record<string, any>): Promise<BlingCollection<BlingEntity>>;
  abstract readAndSave(blingEntity: Partial<BlingEntity>): Promise<Entity>;

  constructor(
    private readonly entity: string,
    private readonly controleService: ControleImportacaoService,
    private paginacaoType: PaginacaoType,
  ) {}

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
