import { Test, TestingModule } from '@nestjs/testing';
import { ResponseLogService } from './response-log.service';

describe('ResponseLogService', () => {
  let service: ResponseLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseLogService],
    }).compile();

    service = module.get<ResponseLogService>(ResponseLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
