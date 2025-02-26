import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Bling from 'bling-erp-api';
import { IGetResponse as PessoaBling } from 'bling-erp-api/lib/entities/contatos/interfaces/get.interface';
import { IFindResponse as PessoasBling } from 'bling-erp-api/lib/entities/contatos/interfaces/find.interface';
import { DataSource, Repository } from 'typeorm';
import { logger } from 'src/logger/winston.logger';
import { Pessoa } from 'src/app/pessoa/entities/pesssoa.entity';
import { PessoaEndereco } from 'src/app/pessoa/entities/pessoa-endereco.entity';
import { IUF } from 'src/shared/types/uf.types';
import { Fornecedor } from 'src/app/fornecedor/entities/fornecedor.entity';
import { ControleImportacao } from 'src/app/controle-importacao/entities/controle-importacao.entity';
import { AuthBlingService } from 'src/app/integracao/bling/auth-bling.service';

const REQUEST_LIMIT_MESSAGE =
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.';
const TIMER_DELAY_MS = 15000;

@Injectable()
export class PessoaImportacao implements OnModuleInit {
  private tabela: string;

  constructor(
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    private readonly service: AuthBlingService,
  ) {
    this.tabela = 'pessoa';
  }

  onModuleInit() {
    // this.iniciar();
  }

  async iniciar() {
    try {
      const controle = await this.buscarControle();
      const acessToken = await this.service.getAcessToken();
      const blingService = new Bling(acessToken);

      await this.processarPagina(blingService, controle);
      logger.info(`[PessoaImportacao] Processamento iniciado.`);
    } catch (err) {
      logger.error('[PessoaImportacao] Erro inesperado: ' + err.message);
    }
  }

  async processarPagina(blingService: Bling, controle: ControleImportacao): Promise<void> {
    try {
      const lista = await this.buscarPagina(controle, blingService);
      const itensRestantes =
        lista.data.length > 0 ? lista.data.slice(controle.ultimoIndexProcessado + 1) : [];

      for (const contaBling of itensRestantes) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        await this.buscarESalvar(contaBling.id, blingService);
        controle.ultimoIndexProcessado += 1;
        await this.atualizarControle(controle, 'index');
      }

      await this.finalizarProcessamento(controle);
    } catch (err) {
      logger.error('[PessoaImportacao] Erro inesperado: ' + err.message);
    }
  }

  async finalizarProcessamento(controle: ControleImportacao): Promise<void> {
    logger.info(`[PessoaImportacao] Completou a página ${controle.pagina}.`);
    if (controle.ultimoIndexProcessado == 99) {
      logger.info(`[PessoaImportacao] Próxima página.`);
      await this.atualizarControle(controle, 'pagina');
      await this.iniciar();
    } else {
      logger.info(`[PessoaImportacao] Busca finalizada.`);
    }
  }

  async buscarPagina(controle: ControleImportacao, blingService: Bling): Promise<PessoaBling> {
    try {
      logger.info(`[PessoaImportacao] Buscando página ${controle.pagina}`);
      return await blingService.contatos.get({ pagina: controle.pagina, limite: 100 });
    } catch (err) {
      if (err.message === REQUEST_LIMIT_MESSAGE) {
        logger.info(`
          [PessoaImportacao] Irá pesquisar novamente a página ${controle}. Aguardando ${TIMER_DELAY_MS} ms`);
        await new Promise((resolve) => setTimeout(resolve, TIMER_DELAY_MS));
        return this.buscarPagina(controle, blingService);
      } else {
        throw new Error(`
          [PessoaImportacao] Não foi possível pesquisar a página ${controle}. Motivo: ${err.message}`);
      }
    }
  }

  async buscarItem(id: number, blingService: Bling): Promise<PessoasBling> {
    try {
      logger.info(`[PessoaImportacao] Buscando item ${id}`);
      return await blingService.contatos.find({ idContato: id });
    } catch (err) {
      if (err.message === REQUEST_LIMIT_MESSAGE) {
        logger.info(`
          [PessoaImportacao] Irá pesquisar novamente o item ${id}. Aguardando ${TIMER_DELAY_MS} ms`);
        await new Promise((resolve) => setTimeout(resolve, TIMER_DELAY_MS));
        return this.buscarItem(id, blingService);
      } else {
        throw new Error(`
          [PessoaImportacao] Não foi possível pesquisar o id ${id}. Motivo: ${err.message}`);
      }
    }
  }

  async buscarESalvar(id: number, blingService: Bling): Promise<Pessoa> {
    const planoContaBling = await this.buscarItem(id, blingService);
    return this.salvarItem(planoContaBling);
  }

  async salvarItem(modeloBling: PessoasBling): Promise<Pessoa> {
    const repo = this.dataSource.getRepository(Pessoa);
    logger.info(`
      [PessoaImportacao] Salvando ${this.tabela} ${modeloBling.data.id} - ${modeloBling.data.nome}`);
    return this.selecionaOuAssina(repo, modeloBling);
  }

  async selecionaOuAssina(repo: Repository<Pessoa>, modeloBling: PessoasBling): Promise<Pessoa> {
    let pessoa = await repo.findOne({
      where: { idOriginal: modeloBling.data.id.toFixed(0) },
      relations: ['enderecos'],
    });

    if (!pessoa) {
      pessoa = new Pessoa();
      pessoa.idOriginal = modeloBling.data.id.toFixed(0);
    } else {
      logger.info('[PessoaImportacao] Encontrou a pessoa');
    }

    // Atualize ou preencha os dados de 'pessoa' conforme o modeloBling
    pessoa.identificador = modeloBling.data.codigo;
    pessoa.nome = modeloBling.data.nome;
    pessoa.fantasia = modeloBling.data.fantasia;
    pessoa.inscricaoEstadual = modeloBling.data.ie;
    pessoa.indicadorInscricaoEstadual = modeloBling.data.indicadorIe;
    pessoa.numeroDocumento = modeloBling.data.numeroDocumento || null;
    pessoa.rg = modeloBling.data.rg || null;
    pessoa.email = modeloBling.data.email;
    pessoa.orgaoEmissor = modeloBling.data.orgaoEmissor;
    pessoa.situacao = modeloBling.data.situacao === 'A' ? 1 : 0;

    if (modeloBling.data.tipo === 'F') {
      pessoa.tipoPessoa = 'F';
      pessoa.sexo = modeloBling.data.dadosAdicionais?.sexo;
      pessoa.dataNascimento = this.toDate(modeloBling.data.dadosAdicionais.dataNascimento);
      pessoa.naturalidade = modeloBling.data.dadosAdicionais?.naturalidade;
    } else {
      pessoa.tipoPessoa = 'J';
    }

    const cep = (modeloBling.data.endereco.geral.cep as string).replace(/\D/g, '').trim();
    const municipio = (modeloBling.data.endereco.geral.municipio as string).trim();
    const uf = (modeloBling.data.endereco.geral.uf as string).trim();

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
      endereco.bairro = modeloBling.data.endereco.geral.bairro;
      endereco.municipio = municipio;
      endereco.uf = uf as IUF;
      endereco.complemento = modeloBling.data.endereco.geral.complemento;
      endereco.numero = modeloBling.data.endereco.geral.numero;
    }

    return repo.save(pessoa);
  }

  async seleciona(idOriginal: number, blingService: Bling): Promise<Pessoa> {
    if (!idOriginal) return null;
    const repo = this.dataSource.getRepository(Pessoa);
    let pessoa = await repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } });

    if (!pessoa) {
      await new Promise((resolve) => setTimeout(resolve, TIMER_DELAY_MS));
      pessoa = await this.buscarESalvar(idOriginal, blingService);
    }

    return pessoa;
  }

  async selecionaFornecedor(idOriginal: number, blingService: Bling): Promise<Fornecedor> {
    if (!idOriginal) return null;
    const repo = this.dataSource.getRepository(Pessoa);
    const query = this.dataSource
      .createQueryBuilder(Fornecedor, 'f')
      .innerJoin(Pessoa, 'p', 'f.id_pessoa = p.id')
      .where('p.id_original = :id', { id: idOriginal });
    const repoFornecedor = this.dataSource.getRepository(Fornecedor);

    let pessoa = await repo.findOne({ where: { idOriginal: idOriginal.toFixed(0) } });

    if (!pessoa) {
      await new Promise((resolve) => setTimeout(resolve, TIMER_DELAY_MS));
      pessoa = await this.buscarESalvar(idOriginal, blingService);
    }

    let fornecedor = await query.getOne();

    if (!fornecedor) {
      fornecedor = new Fornecedor();
      fornecedor.pessoa = pessoa;
      fornecedor.situacao = 1;
    }

    if (!fornecedor.id) {
      fornecedor = await repoFornecedor.save(fornecedor);
    }

    return fornecedor;
  }

  async buscarControle(): Promise<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);
    let controle = await repo.findOne({ where: { tabela: this.tabela } });

    if (!controle) {
      controle = this.criarNovoControle();
    }

    return repo.save(controle);
  }

  toDate(dateAsString: string): Date {
    if (dateAsString != '0000-00-00') return new Date(`${dateAsString}T00:00:00`);
    else return null;
  }

  criarNovoControle(): ControleImportacao {
    const controle = new ControleImportacao();
    controle.tabela = this.tabela;
    controle.ultimoIndexProcessado = -1;
    controle.pagina = 1;
    return controle;
  }

  async atualizarControle(
    controle: ControleImportacao,
    paginaOuItem: 'pagina' | 'index',
  ): Promise<ControleImportacao> {
    const repo = this.dataSource.getRepository(ControleImportacao);

    if (paginaOuItem == 'index') {
      controle.ultimoIndexProcessado += 1;
    } else {
      controle.pagina += 1;
      controle.ultimoIndexProcessado = -1;
    }

    return repo.save(controle);
  }
}
