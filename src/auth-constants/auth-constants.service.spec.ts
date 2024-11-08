import { Test, TestingModule } from '@nestjs/testing';
import { AuthConstantsService } from './auth-constants.service';

describe('AuthService', () => {
  let service: AuthConstantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthConstantsService],
    }).compile();

    service = module.get<AuthConstantsService>(AuthConstantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
