export enum ContaReceberSituacao {
    EM_ABERTO = 1,
    RECEBIDO = 2,
    PARCIALMENTE_RECEBIDO = 3,
    DEVOLVIDO = 4,
    CANCELADO = 5 
}

export const contaReceberSituacao = {
    [1]: ContaReceberSituacao.EM_ABERTO,
    [2]: ContaReceberSituacao.RECEBIDO,
    [3]: ContaReceberSituacao.PARCIALMENTE_RECEBIDO,
    [4]: ContaReceberSituacao.DEVOLVIDO,
    [5]: ContaReceberSituacao.CANCELADO
}
