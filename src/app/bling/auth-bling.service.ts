import { Injectable, OnModuleInit } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { EmpresaService } from 'src/app/empresa/empresa.service';
import { Empresa } from 'src/app/empresa/entities/empresa.entity';
import blingConstants from './bling.constants';
import { Assigned } from 'src/shared/util/object/object.util';
import { logger } from 'src/logger/winston.logger';
import { AuthConstantsService } from 'src/auth-constants/auth-constants.service';
import { AuthConstants } from 'src/auth-constants/entities/auth-constants.entity';

type GrantType = 'authorization_code' | 'refresh_token';

@Injectable()
export class AuthBlingService implements OnModuleInit {
  private empresa: Empresa;
  private code: string;
  private accessToken: string;
  private refreshToken: string;
  private expire: Date;
  private tokens: AuthConstants[];
  private tokenPromise: Promise<string> | null = null; // LOCK INTERNO

  constructor(
    private readonly authConstantsService: AuthConstantsService,
    private readonly empresaService: EmpresaService,
  ) {}

  async onModuleInit() {
    logger.info('Iniciando serviço de autenticação com o Bling.');
    await this.loadEmpresa();
    await this.loadTokens();
  }

  private async loadEmpresa() {
    const empresas = await firstValueFrom(this.empresaService.find(new Empresa()));
    if (!empresas.length) throw new Error('Nenhuma empresa encontrada.');
    logger.info('Empresa carregada com sucesso.');
    this.empresa = empresas[0];
  }

  private async loadTokens() {
    if (!this.empresa) return;
    const authConst = new AuthConstants();
    authConst.empresa = this.empresa;

    const consulta = await firstValueFrom(this.authConstantsService.find(authConst));
    this.tokens = consulta;
    consulta.forEach(({ nome, valor, expira }) => {
      if (nome === 'access_token') {
        this.accessToken = valor;
        this.expire = expira;
      } else if (nome === 'refresh_token') {
        this.refreshToken = valor;
      } else if (nome === 'code') {
        this.code = valor;
      }
    });
    console.table(consulta);
  }

  private async saveTokens(accessToken: string, expire: Date, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expire = expire;

    this.tokens.forEach((token) => {
      if (token.nome === 'access_token') {
        token.valor = accessToken;
        token.expira = expire;
      } else if (token.nome === 'refresh_token') {
        token.valor = refreshToken;
      }
    });

    await this.authConstantsService.repository.save(this.tokens);
    logger.info('Tokens atualizados com sucesso.');
  }

  private async requestToken(): Promise<string> {
    if (this.tokenPromise) {
      return this.tokenPromise; // SE JÁ ESTIVER SOLICITANDO, RETORNA A PROMISE EXISTENTE
    }

    this.tokenPromise = this._requestToken(); // GUARDA A PROMISE PARA EVITAR CONDIÇÃO DE CORRIDA
    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null; // RESETAR A PROMISE QUANDO TERMINAR
    }
  }

  private async _requestToken(): Promise<string> {
    if (!Assigned(this.refreshToken)) {
      if (!this.code) throw new Error('Código de autenticação não encontrado.');
      const tokenData = await this.postApiBling(this.code, 'authorization_code');
      return tokenData.accessToken;
    }

    if (this.expire && this.expire.getTime() > Date.now()) {
      return this.accessToken; // SE O TOKEN AINDA FOR VÁLIDO, RETORNA ELE
    }

    const tokenData = await this.postApiBling(this.refreshToken, 'refresh_token');
    return tokenData.accessToken;
  }

  private async postApiBling(
    code: string,
    grant_type: GrantType,
  ): Promise<{ accessToken: string; expire: Date; refreshToken: string }> {
    const authKey = `${blingConstants().client_id}:${blingConstants().client_secret}`;
    const body = `grant_type=${grant_type}&${grant_type === 'authorization_code' ? 'code' : 'refresh_token'}=${code}`;

    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(authKey).toString('base64')}`,
      },
    });

    const content = await response.json();
    if (response.status !== 200) throw new Error(`Erro ao obter token: ${JSON.stringify(content)}`);

    const expire = new Date(Date.now() + content.expires_in * 1000);
    await this.saveTokens(content.access_token, expire, content.refresh_token);

    return {
      accessToken: content.access_token,
      expire,
      refreshToken: content.refresh_token,
    };
  }

  async getAccessToken(): Promise<string> {
    return this.requestToken();
  }
}
