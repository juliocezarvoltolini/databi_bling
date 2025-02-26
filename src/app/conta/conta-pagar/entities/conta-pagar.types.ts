export enum ContaPagarSituacao {
    EM_ABERTO = 1,
    RECEBIDO = 2,
    PARCIALMENTE_RECEBIDO = 3,
    DEVOLVIDO = 4,
    CANCELADO = 5 
}

export const contaPagarSituacao = {
    [1]: ContaPagarSituacao.EM_ABERTO,
    [2]: ContaPagarSituacao.RECEBIDO,
    [3]: ContaPagarSituacao.PARCIALMENTE_RECEBIDO,
    [4]: ContaPagarSituacao.DEVOLVIDO,
    [5]: ContaPagarSituacao.CANCELADO
}
