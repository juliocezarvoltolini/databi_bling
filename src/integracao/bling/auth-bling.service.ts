import { HttpService } from "@nestjs/axios";
import { Injectable, Scope } from "@nestjs/common";
import { catchError, concatMap, firstValueFrom, from, interval, map, Observable, of, Subject, switchMap } from "rxjs";
import { AuthConstantsService } from "src/auth-constants/auth-constants.service";
import { AuthConstants } from "src/auth-constants/entities/auth-constants.entity";
import { EmpresaService } from "src/empresa/empresa.service";
import { Empresa } from "src/empresa/entities/empresa.entity";
import blingConstants from "./bling.constants";
import axios, { Axios } from "axios";
import { Assigned } from "src/common/util/object/object.util";
import { logger } from "src/logger/winston.logger";
import { setTimeout } from "timers/promises";


type GrantType = 'authorization_code' | 'refresh_token'

@Injectable()
export class AuthBlingService {
    private empresa: Empresa;
    private code: string;
    private accessToken: string;
    private refreshToken: string;
    private expire: Date;
    private lastRequestTime: number = 0
   

    constructor(private readonly authConstantsService: AuthConstantsService,
        private readonly empresaService: EmpresaService) {
        this.empresaService.find(new Empresa()).subscribe(empresas => {
            this.empresa = { ...empresas[0] };
          
            
        })

    }


    private async getCode(): Promise<string> {
        let authConst = new AuthConstants();
        authConst.empresa = this.empresa;

        const consulta = await firstValueFrom(this.authConstantsService.find(authConst));

        consulta.forEach(value => {
            if (value.nome === 'access_token') {
                this.accessToken = value.valor;
                console.log(value)
                this.expire = value.expira;
            } else if (value.nome === 'refresh_token') {
                this.refreshToken = value.valor;
            } else if (value.nome === 'code') {
                this.code = value.valor
            }
        })

        if (this.code) {
            return this.code
        } else {
            throw new Error('Não foi registrada a chave Code.')
        }
    }

    private atualizarTokenNoBAnco(token: string, expire: Date, refreshToken: string) {
        console.log(token, '\n', expire, '\n', refreshToken)
        this.accessToken = token;
        this.refreshToken = refreshToken;
        this.expire = expire;

        let auth: AuthConstants[] = [];
        let authConst = new AuthConstants();
        authConst.empresa = this.empresa;
        this.authConstantsService.find(authConst).subscribe(
            consulta => {
                consulta.forEach((value) => {
                    if (value.nome === 'access_token') {
                        auth.push({ ...value });
                        auth[auth.length - 1].valor = token;
                        auth[auth.length - 1].expira = expire;
                    } else if (value.nome === 'refresh_token') {
                        auth.push({ ...value });
                        auth[auth.length - 1].valor = refreshToken;
                    };
                });
                console.log('auth', auth)

                if (auth.length <= 1) {
                    let insert = new AuthConstants();
                    insert.empresa = this.empresa;
                    insert.nome = 'access_token';
                    insert.valor = token;
                    insert.expira = expire

                    let insert2 = new AuthConstants();
                    insert2.empresa = this.empresa;
                    insert2.nome = 'refresh_token';
                    insert2.valor = token;
                    if (auth.length = 0) {
                        auth.push(insert);
                        auth.push(insert2);
                    } else {
                        auth.push(auth[0].nome === 'access_token' ? insert2 : insert);
                    }

                }

                this.authConstantsService.create(auth);

            }

        )

    }


    private async solicitarToken(): Promise<{ accessToken: string, expire_in: Date, refreshToken: string }> {
        let retorno;

        const agora = Date.now();
        const delay = 200; // Milissegundos de espera entre cada requisição

        // Verificar se o tempo da última requisição foi inferior a 333ms
        if (agora - this.lastRequestTime < delay) {
            const waitTime = delay - (agora - this.lastRequestTime);
            await new Promise(() => setTimeout(waitTime)); // Aguardar até o tempo limite
        }      


        this.lastRequestTime = Date.now(); // Atualizar o tempo da última requisição
        if (!Assigned(this.refreshToken)) {


            const code = await this.getCode();

            if (!this.accessToken) {
                retorno = await this.postApiBling(code, "authorization_code");
                this.atualizarTokenNoBAnco(retorno.accessToken, retorno.expire_in, retorno.refreshToken)
            }

        }

        retorno = {
            accessToken: this.accessToken,
            expire_in: this.expire,
            refreshToken: this.refreshToken
        }


        if (this.expire.getTime() < Date.now()) {
            retorno = await this.postApiBling(this.refreshToken, "refresh_token");
            this.atualizarTokenNoBAnco(retorno.accessToken, retorno.expire_in, retorno.refreshToken);
        }

        return retorno;

    }


    /**
     * 
     * @param code 
     * @param grant_type `authorization_code` ou `refresh_token`
     * @returns 
     */
    private async postApiBling(code: string, grant_type: GrantType): Promise<{ accessToken: string, expire_in: Date, refreshToken: string }> {
        const authKey = `${blingConstants().client_id}:${blingConstants().client_secret}`;
        console.log('authKey: ', authKey)
        console.log('Realizando consulta do access_token');
        console.log(code);

        console.log(`grant_type=${grant_type}&${grant_type == "authorization_code" ? 'code' : 'refresh_token'}=${code}`)


        let response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
            method: 'POST',
            body: `grant_type=${grant_type}&${grant_type == "authorization_code" ? 'code' : 'refresh_token'}=${code}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(authKey).toString('base64')}`
            }
        });

        let content = await response.json();

        if (response.status === 200) {
            logger.info('Consulta realizada com sucesso. %j', [content]);
            const expire = new Date(Date.now() + (content.expires_in * 1000));
            return {
                accessToken: content.access_token,
                expire_in: expire,
                refreshToken: content.refresh_token
            };
        } else {
            console.log('Consulta falhou : ', content, '\n', response);
            return {
                accessToken: '',
                expire_in: null,
                refreshToken: ''
            };

        }
    }



    async getAcessToken(): Promise<string> {

        
      
        const retorno = await this.solicitarToken();
        console.log('==================retorno> \n', retorno)
        return retorno.accessToken;

    }
}