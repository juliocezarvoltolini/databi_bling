import { Nfe } from "src/app/nfe/entities/nfe.entity";
import { APICollection, ImportServiceBase, PagedImportServiceBase, PaginacaoType } from "../import.interface";
import { IFindResponse as NotaBling } from 'bling-erp-api/lib/entities/nfes/interfaces/find.interface';
import { ISituacaoNfe } from "bling-erp-api/lib/entities/nfes/types/situacao.type";
import { ITipoNfe } from "bling-erp-api/lib/entities/nfes/types/tipo.type";
import { ResponseLogService } from "src/app/response-log/response-log.service";
import { PessoaBlingService } from "../pessoa/pessoa-bling.service";
import { Inject, Injectable } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { logger } from "src/logger/winston.logger";
import { BlingApiService } from "../../bling-api.service";
import { Pessoa } from "src/app/pessoa/entities/pesssoa.entity";
import { NfeCategoria } from "src/app/nfe/nfe-categoria/entities/nfe-categoria.entity";
import { dateBlingToDate } from "../../utils/bling-utils";
import { VendedorBlingService } from "../vendedor/vendedor-bling.service";
import { ControleImportacaoService } from "src/app/controle-importacao/controle-importacao.service";
import { Logger } from "winston";

@Injectable()
export class NFEBlingService extends ImportServiceBase<Nfe, NotaBling> {

    private nfeRepository: Repository<Nfe>;
    private nfeCategoriaRepo: Repository<NfeCategoria>;

    constructor(protected readonly responseLogService: ResponseLogService,
        private blingService: BlingApiService,
        private pessoaBlingService: PessoaBlingService,
        private vendedorBlingService: VendedorBlingService,
        @Inject('DATA_SOURCE') dataSource: DataSource
    ) {
        super(responseLogService, 'nfe-entrada');
        this.nfeRepository = dataSource.getRepository(Nfe);
        this.nfeCategoriaRepo = dataSource.getRepository(NfeCategoria);
    }


    async getById(Entity?: Partial<NotaBling['data']>): Promise<Nfe> {
        logger.info(`[NFEBlingService] Selecionando ID(${Entity.id})`);
        const nfes = await this.nfeRepository.find({ where: { idOriginal: Entity.id.toFixed(0) } });

        if (nfes.length > 0) {
            logger.info(`[NFEBlingService] Encontrou NFE (${nfes[0].id}) - ${nfes[0].pessoa.nome} - ${nfes[0].nfeCategoria.descricao}`)
            return nfes[0];
        } 

        let nfeCached = await this.getCachedEntity(Entity.id);
        let nfeBling: NotaBling = null;
        if (nfeCached) {
             nfeBling = nfeCached.entity
            logger.info(`[NFEBlingService] Encontrou NFE (${Entity.id}) no cache`);
        }
        else {
            const bling = await this.blingService.getBling();
            logger.info(`[NFEBlingService] Buscando NFE (${Entity.id}) na API`);
            const apiResponse = await bling.nfes.find({ idNotaFiscal: Entity.id });
            nfeBling = apiResponse;
            logger.info(`[NFEBlingService] Salvando cache NFE (${Entity.id})`);
            this.saveCachedEntity(Entity.id.toFixed(), apiResponse);
        }


        let nfe = await this.createNFE(null, nfeBling);
        logger.info(`[NFEBlingService] Salvando NFE (${nfeBling.data.id}) - ${nfe.pessoa.nome} - ${nfe.nfeCategoria.descricao}`)
        return this.nfeRepository.save(nfe);

    }

    async createNFE(nfe: Nfe, nfeBling: NotaBling): Promise<Nfe> {
        const pessoa = await this.pessoaBlingService.getById({ id: nfeBling.data.contato.id });
        const nfeCategorias = await this.nfeCategoriaRepo.find({ where: { idOriginal: nfeBling.data.naturezaOperacao.id.toFixed(0) } });
        const vendedor = await this.vendedorBlingService.getById({ id: nfeBling.data.vendedor.id });

        if (!nfe) nfe = new Nfe();
        nfe.idOriginal = nfeBling.data.id.toFixed(0);
        nfe.pessoa = pessoa;
        nfe.dataEmissao = dateBlingToDate(nfeBling.data.dataEmissao);
        nfe.dataOperacao = dateBlingToDate(nfeBling.data.dataOperacao);
        nfe.tipo = nfeBling.data.tipo;
        nfe.situacao = nfeBling.data.situacao;
        nfe.nfeCategoria = nfeCategorias[0];
        nfe.serie = nfeBling.data.serie;
        nfe.valor = nfeBling.data['valorNota'];
        nfe.vendedor = vendedor;
        nfe.chaveAcesso = nfeBling.data.chaveAcesso;
        nfe.xmlLink = nfeBling.data.xml;
        return nfe;

    }
}

@Injectable()
export class NfeBlingPagedService extends PagedImportServiceBase<Nfe, NotaBling> {

    constructor(
        controleImportacaoService: ControleImportacaoService,
        private readonly blingService: BlingApiService,
        private nfeBlingService: NFEBlingService,
    ) {
        super('nfe-entrada', controleImportacaoService, PaginacaoType.DATE, nfeBlingService);
    }


    async searchPage(searchParameters?: Record<string, any>): Promise<APICollection<NotaBling>> {
        const bling = await this.blingService.getBling();
        const pagina = await bling.nfes.get(searchParameters);
        return pagina;
    }
    readAndSave(blingEntity: any): Promise<Nfe> {
        return this.nfeBlingService.getById(blingEntity);
    }


}