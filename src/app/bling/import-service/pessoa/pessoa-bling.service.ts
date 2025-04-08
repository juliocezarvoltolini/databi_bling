import { Pessoa } from 'src/app/pessoa/entities/pesssoa.entity';
import {
  APICollection,
  ImportServiceBase,
  PagedImportServiceBase,
  PaginacaoType,
} from '../import.interface';
import { IFindResponse as PessoaBling } from 'bling-erp-api/lib/entities/contatos/interfaces/find.interface';
import { ResponseLogService } from 'src/app/response-log/response-log.service';
import { PessoaService } from 'src/app/pessoa/pessoa.service';
import { logger } from 'src/logger/winston.logger';
import { PessoaEndereco } from 'src/app/pessoa/entities/pessoa-endereco.entity';
import { IUF } from 'src/shared/types/uf.types';
import { lastValueFrom } from 'rxjs';
import { ControleImportacaoService } from 'src/app/controle-importacao/controle-importacao.service';
import { Injectable } from '@nestjs/common';
import { dateBlingToDate } from 'src/app/bling/utils/bling-utils';
import { BlingApiService } from 'src/app/bling/bling-api.service';

@Injectable()
export class PessoaBlingService extends ImportServiceBase<Pessoa, PessoaBling> {
  async getById(Entity?: Partial<PessoaBling['data']>): Promise<Pessoa> {
    const pessoas = this.servicePessoa.find({ idOriginal: Entity.id.toFixed(0) });
    if (pessoas) {
      logger.info('[ClienteBlingService] Encontrou a pessoa');
      return pessoas[0];
    }

    const bling = await this.serviceBling.getBling();
    let pessoaBling: PessoaBling;
    const pessoaCached = await this.getCachedEntity(Entity.id);
    if (pessoaCached) {
      logger.info(
        `[ClienteBlingService] Usando pessoa (${pessoaCached.entity.data.id}) ${pessoaCached.entity.data.nome} do cache`,
      );
      pessoaBling = pessoaCached.entity;
    } else {
      pessoaBling = await bling.contatos.find({ idContato: Entity.id });
      this.saveCachedEntity(Entity.id.toFixed(0), pessoaBling);
    }

    logger.info(
      `[ClienteBlingService] Salvando pessoa (${pessoaBling.data.id}) ${pessoaBling.data.nome}`,
    );

    const pessoa = new Pessoa();
    pessoa.idOriginal = pessoaBling.data.id.toFixed(0);

    // Atualize ou preencha os dados de 'pessoa' conforme o pessoaBling
    pessoa.identificador = pessoaBling.data.codigo;
    pessoa.nome = pessoaBling.data.nome;
    pessoa.fantasia = pessoaBling.data.fantasia;
    pessoa.inscricaoEstadual = pessoaBling.data.ie;
    pessoa.indicadorInscricaoEstadual = pessoaBling.data.indicadorIe;
    pessoa.numeroDocumento = pessoaBling.data.numeroDocumento || null;
    pessoa.rg = pessoaBling.data.rg || null;
    pessoa.email = pessoaBling.data.email;
    pessoa.orgaoEmissor = pessoaBling.data.orgaoEmissor;
    pessoa.situacao = pessoaBling.data.situacao === 'A' ? 1 : 0;

    if (pessoaBling.data.tipo === 'F') {
      pessoa.tipoPessoa = 'F';
      pessoa.sexo = pessoaBling.data.dadosAdicionais?.sexo;
      pessoa.dataNascimento = dateBlingToDate(pessoaBling.data.dadosAdicionais.dataNascimento);
      pessoa.naturalidade = pessoaBling.data.dadosAdicionais?.naturalidade;
    } else {
      pessoa.tipoPessoa = 'J';
    }

    const cep = (pessoaBling.data.endereco.geral.cep as string).replace(/\D/g, '').trim();
    const municipio = (pessoaBling.data.endereco.geral.municipio as string).trim();
    const uf = (pessoaBling.data.endereco.geral.uf as string).trim();

    if (municipio.length > 0 && uf.length > 0) {
      let endereco: PessoaEndereco;

      if (pessoa.enderecos && pessoa.enderecos.length > 0) {
        // Atualiza o endereço existente
        endereco = pessoa.enderecos[0]; // Considerando apenas o primeiro endereço para simplificar
      } else {
        // Cria um novo endereço
        endereco = new PessoaEndereco();
        pessoa.enderecos = [endereco];
      }

      endereco.cep = cep;
      endereco.bairro = pessoaBling.data.endereco.geral.bairro;
      endereco.municipio = municipio;
      endereco.uf = uf as IUF;
      endereco.complemento = pessoaBling.data.endereco.geral.complemento;
      endereco.numero = pessoaBling.data.endereco.geral.numero;
    }

    return lastValueFrom(this.servicePessoa.create(pessoa));
  }

  constructor(
    protected readonly responseLogService: ResponseLogService,
    private readonly servicePessoa: PessoaService,
    private readonly serviceBling: BlingApiService,
  ) {
    super(responseLogService, 'pessoa');
  }
}

@Injectable()
export class PessoaBlingPagedService extends PagedImportServiceBase<Pessoa, PessoaBling> {
  constructor(
    private readonly clienteBlingService: PessoaBlingService,
    controleImportacaoService: ControleImportacaoService,
    private readonly blingService: BlingApiService,
  ) {
    super('pessoa', controleImportacaoService, PaginacaoType.INDEX, clienteBlingService);
  }

  async searchPage(searchParameters?: Record<string, any>): Promise<APICollection<PessoaBling>> {
    const bling = await this.blingService.getBling();
    const pagina = await bling.contatos.get(searchParameters);
    return pagina;
  }

  readAndSave(blingEntity: Partial<PessoaBling['data']>): Promise<Pessoa> {
    return this.clienteBlingService.getById(blingEntity);
  }
}
