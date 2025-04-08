import Bling from 'bling-erp-api';
import { AuthBlingService } from './auth-bling.service';
import { Injectable, Scope } from '@nestjs/common';

const ERROS = [
  'Não foi possível realizar a chamada HTTP: get',
  'O limite de requisições por segundo foi atingido, tente novamente mais tarde.',
];

@Injectable({ scope: Scope.DEFAULT })
export class BlingApiService {
  private bling: Bling;
  private lastRequest: Date;
  private acessToken: string;

  constructor(private readonly authBlingService: AuthBlingService) {}

  public async getBling(): Promise<Bling> {
    const updatedAcessoToken = await this.authBlingService.getAccessToken();
    if (this.acessToken != updatedAcessoToken) {
      this.bling = new Bling(updatedAcessoToken);
      this.acessToken = updatedAcessoToken;
    }

    if (this.lastRequest && new Date().getTime() - this.lastRequest.getTime() < 350) {
      return new Promise((resolve) => {
        setTimeout(() => {
          this.lastRequest = new Date();
          resolve(this.bling);
        }, 1000);
      });
    } else {
      this.lastRequest = new Date();
      return this.bling;
    }
  }
}
