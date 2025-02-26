import { TestingModule, Test } from '@nestjs/testing';
import { ControleImportacaoService } from './controle-importacao.service';

describe('ControleImportacaoService', () => {
  let service: ControleImportacaoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ControleImportacaoService],
    }).compile();

    service = module.get<ControleImportacaoService>(ControleImportacaoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
