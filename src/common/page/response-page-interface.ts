export interface IResponsePage<T> {
    quantidadeNaPagina: number,
    quantidadeTotal: number,
    pagina: number,
    ultimaPagina: number,
    quantidadePorPagina: number,
    registros: T[],
}

export class ResponsePage<T> implements IResponsePage<T>{
    quantidadeNaPagina: number;
    quantidadeTotal: number;
    pagina: number;
    ultimaPagina: number;
    quantidadePorPagina: number;
    registros: T[];
    
}