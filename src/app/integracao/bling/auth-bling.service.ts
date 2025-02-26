import { Injectable } from '@nestjs/common';
import { firstValueFrom, map, switchMap } from 'rxjs';

import { EmpresaService } from 'src/app/empresa/empresa.service';
import { Empresa } from 'src/app/empresa/entities/empresa.entity';
import blingConstants from './bling.constants';
import { Assigned } from 'src/shared/util/object/object.util';
import { logger } from 'src/logger/winston.logger';
import { AuthConstantsService } from 'src/auth-constants/auth-constants.service';
import { AuthConstants } from 'src/auth-constants/entities/auth-constants.entity';

type GrantType = 'authorization_code' | 'refresh_token';

@Injectable()
export class AuthBlingService {
  private empresa: Empresa;
  private code: string;
  private accessToken: string;
  private refreshToken: string;
  private expire: Date;
  private lastRequestTime: number = 0;

  constructor(
    private readonly authConstantsService: AuthConstantsService,
    private readonly empresaService: EmpresaService,
  ) {
    this.empresaService.find(new Empresa()).subscribe((empresas) => {
      this.empresa = { ...empresas[0] };
    });
  }

  private async getCode(): Promise<string> {
    const authConst = new AuthConstants();
    authConst.empresa = this.empresa;

    const consulta = await firstValueFrom(this.authConstantsService.find(authConst));

    consulta.forEach((value) => {
      if (value.nome === 'access_token') {
        this.accessToken = value.valor;
        console.log(value);
        this.expire = value.expira;
      } else if (value.nome === 'refresh_token') {
        this.refreshToken = value.valor;
      } else if (value.nome === 'code') {
        this.code = value.valor;
      }
    });

    if (this.code) {
      return this.code;
    } else {
      throw new Error('Não foi registrada a chave Code.');
    }
  }

  private atualizarTokenNoBanco(token: string, expire: Date, refreshToken: string) {
    console.log(token, '\n', expire, '\n', refreshToken);
    this.accessToken = token;
    this.refreshToken = refreshToken;
    this.expire = expire;

    const authConst = new AuthConstants();
    authConst.empresa = this.empresa;

    this.authConstantsService
      .find(authConst)
      .pipe(
        map((consulta) => {
          const auth: AuthConstants[] = [];

          // Atualiza os valores existentes
          consulta.forEach((value) => {
            if (value.nome === 'access_token') {
              auth.push({ ...value, valor: token, expira: expire });
            } else if (value.nome === 'refresh_token') {
              auth.push({ ...value, valor: refreshToken });
            }
          });

          // Adiciona novos registros caso necessário
          if (auth.length === 0) {
            auth.push(
              {
                empresa: this.empresa,
                nome: 'access_token',
                valor: token,
                expira: expire,
              } as AuthConstants,
              {
                empresa: this.empresa,
                nome: 'refresh_token',
                valor: refreshToken,
              } as AuthConstants,
            );
          } else if (auth.length === 1) {
            const existingName = auth[0].nome;
            auth.push({
              empresa: this.empresa,
              nome: existingName === 'access_token' ? 'refresh_token' : 'access_token',
              valor: existingName === 'access_token' ? refreshToken : token,
              expira: existingName === 'access_token' ? undefined : expire,
            } as AuthConstants);
          }

          return auth;
        }),
        switchMap((auth) => this.authConstantsService.repository.save(auth)), // Salva os dados no banco
      )
      .subscribe({
        next: () => console.log('Tokens atualizados com sucesso'),
        error: (err) => console.error('Erro ao atualizar os tokens:', err),
      });
  }

  private async solicitarToken(): Promise<{
    accessToken: string;
    expire_in: Date;
    refreshToken: string;
  }> {
    let retorno;

    if (!Assigned(this.refreshToken)) {
      const code = await this.getCode();

      if (!this.accessToken) {
        retorno = await this.postApiBling(code, 'authorization_code');
        this.atualizarTokenNoBanco(retorno.accessToken, retorno.expire_in, retorno.refreshToken);
      }
    }

    retorno = {
      accessToken: this.accessToken,
      expire_in: this.expire,
      refreshToken: this.refreshToken,
    };

    if (this.expire.getTime() < Date.now()) {
      retorno = await this.postApiBling(this.refreshToken, 'refresh_token');
      this.atualizarTokenNoBanco(retorno.accessToken, retorno.expire_in, retorno.refreshToken);
    }

    return retorno;
  }

  /**
   *
   * @param code
   * @param grant_type `authorization_code` ou `refresh_token`
   * @returns
   */
  private async postApiBling(
    code: string,
    grant_type: GrantType,
  ): Promise<{ accessToken: string; expire_in: Date; refreshToken: string }> {
    const authKey = `${blingConstants().client_id}:${blingConstants().client_secret}`;
    console.log('authKey: ', authKey);
    console.log('Realizando consulta do access_token');
    console.log(code);

    console.log(
      `grant_type=${grant_type}&${grant_type == 'authorization_code' ? 'code' : 'refresh_token'}=${code}`,
    );

    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      body: `grant_type=${grant_type}&${grant_type == 'authorization_code' ? 'code' : 'refresh_token'}=${code}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(authKey).toString('base64')}`,
      },
    });

    const content = await response.json();

    if (response.status === 200) {
      logger.info('Consulta realizada com sucesso. %j', [content]);
      const expire = new Date(Date.now() + content.expires_in * 1000);
      return {
        accessToken: content.access_token,
        expire_in: expire,
        refreshToken: content.refresh_token,
      };
    } else {
      console.log('Consulta falhou : ', content, '\n', response);
      return {
        accessToken: '',
        expire_in: null,
        refreshToken: '',
      };
    }
  }

  async getAcessToken(): Promise<string> {
    const retorno = await this.solicitarToken();
    console.log('==================retorno> \n', retorno);
    return retorno.accessToken;
  }
}
