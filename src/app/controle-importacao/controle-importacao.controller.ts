import { Controller, Get } from '@nestjs/common';
import { ControleImportacaoService } from './controle-importacao.service';
import { ControleImportacao } from './entities/controle-importacao.entity';
import { In } from 'typeorm';

@Controller('controle-importacao')
export class ControleImportacaoController {
  constructor(private readonly controleImportacaoService: ControleImportacaoService) {}

  @Get()
  findAll(): Promise<ControleImportacao[]> {
    return this.controleImportacaoService.repository.find({
      where: { tabela: In(['venda', 'nfe-entrada']) },
    });

    //tabela não é um array, mas preciso buscar todos os registros que tenham um ou outro usando o TypeORM
  }
}
