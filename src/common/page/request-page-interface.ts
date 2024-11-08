import { FindOptionsOrder } from "typeorm";
import { AppMath } from "../util/operacoes-matematicas/app-math-operations";
import { Assigned } from "../util/object/object.util";

export interface IPageRequest<T> {
    pagina: number,
    quantidadePorPagina: number,
    ordenarPor: FindOptionsOrder<T>,
    object: T
}

export function defaultPageRequest<A>(object: A): IPageRequest<A> {
    let retorno: IPageRequest<A>;
    retorno.pagina = 0;
    retorno.quantidadePorPagina = 50;
    retorno.object = object;
    return retorno;
}

export class PageRequest<T> {
    constructor(private readonly pageRequest: IPageRequest<T>) {
        this.setDefaultIfEmpty();
    }

    setDefaultIfEmpty() {
        this.pageRequest.pagina = this.pageRequest.pagina ?? 0;
        this.pageRequest.ordenarPor = this.pageRequest.ordenarPor ?? {};
        let quantidadePorPagina$ = this.pageRequest.quantidadePorPagina ?? 50
        this.pageRequest.quantidadePorPagina = quantidadePorPagina$ > 200 ? 200 : quantidadePorPagina$;

    }

    getPagina(): number {
        return this.pageRequest.pagina;
    }

    getQuantidadePorPagina(): number {
        return this.pageRequest.quantidadePorPagina;
    }

    getOrdenarPor(): FindOptionsOrder<T> {
        return this.pageRequest.ordenarPor;
    }

    getSkip(quantidadeDeRegistros?: number, pagina?: number): number {
        let skip = 0;
        let quantidadeDePaginas = 0;
        let paginaCalculada = 0;
        pagina = pagina ?? this.getPagina();

        if (Assigned(quantidadeDeRegistros) && quantidadeDeRegistros > 0) {
            quantidadeDePaginas = AppMath.divide(quantidadeDeRegistros, this.pageRequest.quantidadePorPagina, 0);
        } else {
            quantidadeDePaginas = pagina + 1;
        }

        quantidadeDePaginas = quantidadeDePaginas < 1 ? 1 : quantidadeDePaginas;
        //A paginação começa em 0
        paginaCalculada = pagina > (quantidadeDePaginas - 1) ? (quantidadeDePaginas - 1) : pagina;
        this.pageRequest.pagina = paginaCalculada;

        //Quantidade de registros que o banco de dados irá "ignorar" ou "pular"       
        skip = AppMath.multiply(paginaCalculada, this.pageRequest.quantidadePorPagina, 0);

        return skip;
    }

    getUltimaPagina(quantidadeDeRegistros: number) {
        let quantidadeDePaginas = 0;
        quantidadeDeRegistros = quantidadeDeRegistros ?? 0;

        if (Assigned(quantidadeDeRegistros) && quantidadeDeRegistros > 0) {
            quantidadeDePaginas = AppMath.divide(quantidadeDeRegistros, this.pageRequest.quantidadePorPagina, 0);
        } else {
            quantidadeDePaginas = 0;
        }

        return quantidadeDePaginas;
    }



}