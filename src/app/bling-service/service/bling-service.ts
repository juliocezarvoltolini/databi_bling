import Bling from 'bling-erp-api';
import { AuthBlingService } from '../../integracao/bling/auth-bling.service';

export class BlingService {
  private bling: Bling;
  private lastRequest: Date;
  private acessToken: string;

  constructor(private readonly authBlingService: AuthBlingService) {}

  public async getBling(): Promise<Bling> {
    const updatedAcessoToken = await this.authBlingService.getAcessToken();

    if (this.acessToken != updatedAcessoToken) {
      this.bling = new Bling(updatedAcessoToken);
      this.acessToken = updatedAcessoToken;
    }

    if (this.lastRequest && new Date().getTime() - this.lastRequest.getTime() < 300) {
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
