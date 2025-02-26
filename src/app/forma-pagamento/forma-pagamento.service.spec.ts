import { Test, TestingModule } from '@nestjs/testing';
import { FormaPagamentoService } from './forma-pagamento.service';

describe('FormaPagamentoService', () => {
  let service: FormaPagamentoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FormaPagamentoService],
    }).compile();

    service = module.get<FormaPagamentoService>(FormaPagamentoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
