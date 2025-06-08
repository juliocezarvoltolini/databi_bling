import Bling from 'bling-erp-api';
import { AuthBlingService } from './auth-bling.service';
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.DEFAULT })
export class BlingApiService {
  private bling: Bling;
  private accessToken: string;
  private queue: (() => void)[] = [];
  private isProcessing = false;
  private lastExecutionTime = 0;

  constructor(private readonly authBlingService: AuthBlingService) {}

  public async getBling(): Promise<Bling> {
    const updatedAccessToken = await this.authBlingService.getAccessToken();
    if (this.accessToken !== updatedAccessToken) {
      this.bling = new Bling(updatedAccessToken);
      this.accessToken = updatedAccessToken;
    }

    return new Promise<Bling>((resolve) => {
      this.queue.push(() => resolve(this.bling));
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    const now = Date.now();
    const elapsed = now - this.lastExecutionTime;
    const wait = elapsed >= 350 ? 0 : 350 - elapsed;

    setTimeout(() => {
      const next = this.queue.shift();
      if (next) next();

      this.lastExecutionTime = Date.now();
      this.isProcessing = false;

      // Chama o próximo da fila
      this.processQueue();
    }, wait);
  }
}
