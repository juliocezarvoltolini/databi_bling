import { lastValueFrom } from 'rxjs';
import { getItensRestantes, updateDateOfSearchParameters } from 'src/app/bling/utils/bling-utils';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { ResponseLog } from 'src/app/response-log/entities/response-log.entity';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { logger } from 'src/logger/winston.logger';

export interface APIResponse<APIEntity extends { data: any }> {
  data: APIEntity['data'];
}

export class APICollection<APIEntity extends { data: any }> {
  data: Partial<APIEntity['data']>[];
}

export enum PaginacaoType {
  DATE = 'date',
  INDEX = 'index',
}

export interface ImportService<Entity, APIEntity extends APIResponse<APIEntity>> {
  getById(Entity: Partial<APIEntity['data']>): Promise<Entity>;
  getCachedEntity(id: number): Promise<{ cache: ResponseLog; entity: APIEntity }>;
  saveCachedEntity(id: string, blingEntity: APIEntity, response?: ResponseLog): Promise<void>;
}

export abstract class ImportServiceBase<Entity, APIEntity extends APIResponse<APIEntity>>
  implements ImportService<Entity, APIEntity>
{
  constructor(
    protected readonly responseLogService: ResponseLogService,
    protected readonly entity: string,
  ) {}
  async saveCachedEntity(
    id: string,
    blingEntity: APIEntity,
    response?: ResponseLog,
  ): Promise<void> {
    if (!response) {
      response = new ResponseLog();
      response.idOriginal = id;
      response.nomeInformacao = this.entity;
      response.response = JSON.stringify(blingEntity);
    } else {
      response.response = JSON.stringify(blingEntity);
    }

    await this.responseLogService.repository.save(response);
    return;
  }

  async getCachedEntity(id: number): Promise<{ cache: ResponseLog; entity: APIEntity }> {
    const response = await lastValueFrom(
      this.responseLogService.find({ idOriginal: id.toFixed(0), nomeInformacao: this.entity }),
    );
    const [first] = response;
    if (!first) return null;
    return { cache: first, entity: JSON.parse(first.response) };
  }

  abstract getById(Entity?: Partial<APIEntity['data']>): Promise<Entity>;
}

export interface PagedImportService<Entity, APIEntity extends APIResponse<APIEntity>> {
  start(): Promise<void>;
  searchPage(searchParameters?: Record<string, any>): Promise<APICollection<APIEntity>>;
  readAndSave(blingEntity: any): Promise<Entity>;
}

export abstract class PagedImportServiceBase<Entity, APIEntity extends APIResponse<APIEntity>>
  implements PagedImportService<Entity, APIEntity>
{
  protected controle: ControleImportacao;
  private searchParametersCopy: Record<string, any>;

  abstract searchPage(searchParameters?: Record<string, any>): Promise<APICollection<APIEntity>>;
  abstract readAndSave(blingEntity: any): Promise<Entity>;

  constructor(
    private readonly entity: string,
    private readonly controleService: ControleImportacaoService,
    private paginacaoType: PaginacaoType,
    protected readonly importService: ImportService<Entity, APIEntity>,
  ) {}

  async start(): Promise<void> {
    logger.info(`[PagedImportService] Iniciando importação da entidade ${this.entity}`);
    await this.getControle();

    this.controle.iniciouConsultaEm = new Date();
    this.controle.terminouConsultaEm = null;

    let searchParameters: Record<string, any> = this.controle.parametros ?? {};
    searchParameters['pagina'] = this.controle.pagina;
    searchParameters['limite'] = 100;

    //Atualizando as propriedades que são do tipo 'date' se houverem.
    searchParameters = updateDateOfSearchParameters(searchParameters, this.controle.data);

    logger.info(`[PagedImportService] Buscando na API`);
    let lista = null;
    try {
      lista = await this.searchPage(searchParameters);
    } catch (error) {
      logger.error(`[PagedImportService] [${this.entity}] Erro ao buscar na API: ${error}`);
      throw error;
    }

    //Irá pegar os itens que ainda não foram processados
    const itensRestantes = getItensRestantes(lista, this.controle.ultimoIndexProcessado);

    for (const item of itensRestantes) {
      logger.info(`[PagedImportService] Processando item`);
      try {
        await this.readAndSave(item);
      } catch (error) {
        logger.error(`[PagedImportService] Erro ao processar [${this.entity}]`, error);
        throw error;
      }
      try {
        await this.updateIndexOfControle();
      } catch (error) {
        logger.error(`[PagedImportService] Erro ao atualizar controle.`, error);
        throw error;
      }
    }

    this.controle.terminouConsultaEm = new Date();

    let temProximaPagina = false;
    switch (this.paginacaoType) {
      case PaginacaoType.DATE:
        temProximaPagina = await this.updateDateOfControle();
        break;
      case PaginacaoType.INDEX:
        temProximaPagina = await this.updatePageOfControle();
        break;
      default:
        throw new Error('Tipo de paginação desconhecido.');
    }

    //Se a página possuir 100 itens, executa a função novamente para consultar se existem próximas páginas.

    if (temProximaPagina) {
      logger.info(`[PagedImportService] Tem próxima página!`);
      return this.start();
    }
    logger.info(`[PagedImportService] Não tem próxima página!`);
    return;
  }

  private async getControle(): Promise<ControleImportacao> {
    this.controle = new ControleImportacao();
    this.searchParametersCopy = this.controle.parametros ?? {};
    this.controle.tabela = this.entity;
    const controles = await lastValueFrom(this.controleService.find(this.controle));
    this.controle = controles[0] ?? null;
    if (!this.controle) {
      this.controle = new ControleImportacao();
      this.controle.tabela = this.entity;
      this.controle.pagina = 1;
      this.controle.ultimoIndexProcessado = -1;
      this.controle.data = new Date(2022, 0, 10);
      this.controle = await lastValueFrom(this.controleService.create(this.controle));
      return this.controle;
    }

    this.controle.ultimoIndexProcessado = -1;

    return this.controle;
  }

  protected async updateIndexOfControle(): Promise<boolean> {
    return await this.updateControle('index');
  }

  protected async updatePageOfControle(): Promise<boolean> {
    return await this.updateControle('pagina');
  }

  protected async updateDateOfControle(): Promise<boolean> {
    return await this.updateControle('date');
  }

  protected async updateControle(paginaOuItem: 'pagina' | 'index' | 'date'): Promise<boolean> {
    let atualizado = false;
    if (paginaOuItem == 'index') {
      this.controle.ultimoIndexProcessado += 1;
      logger.info(
        `[updateControle] Atualizando índice para ${this.controle.ultimoIndexProcessado}`,
      );
      atualizado = true;
    } else if (paginaOuItem == 'pagina') {
      if (this.controle.ultimoIndexProcessado == 99) {
        this.controle.pagina += 1;
        this.controle.ultimoIndexProcessado = -1;
        logger.info(`[updateControle] Atualizando página para ${this.controle.pagina}`);
        atualizado = true;
      }
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Ajusta para meia-noite

      const lastDate = new Date(this.controle.data + 'T00:00:00');
      lastDate.setHours(0, 0, 0, 0); // Ajusta para meia-noite

      if (this.controle.ultimoIndexProcessado == 99) {
        return this.updateControle('pagina');
      } else if (this.controle.ultimoIndexProcessado < 99 && lastDate < today) {
        // Se a data de controle for anterior a hoje, atualize para o próximo dia
        this.controle.pagina = 1;
        this.controle.ultimoIndexProcessado = -1;
        lastDate.setDate(lastDate.getDate() + 1);
        this.controle.data = lastDate;
        logger.info(`[updateControle] Atualizando data para ${lastDate}`);
        atualizado = true;
      }
    }
    if (!atualizado) return false;
    logger.info(`[updateControle] Atualizando.`);
    await this.controleService.repository.update(this.controle.id, {
      pagina: this.controle.pagina,
      data: this.controle.data,
      ultimoIndexProcessado: this.controle.ultimoIndexProcessado,
      iniciouConsultaEm: this.controle.iniciouConsultaEm,
      terminouConsultaEm: this.controle.terminouConsultaEm,
    });
    return true;
  }
}
