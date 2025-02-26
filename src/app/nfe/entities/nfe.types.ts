/**
 * Define o tipo de operação
 * - `0` : ENTRADA
 * - `1` : SAÍDA
 */
export type TipoNfe = 0 | 1;

/**
 * Define a situação/status da NFE
 * - `1` : Pendente
 * - `2` : Cancelada
 * - `3` : Aguardando Recibo
 * - `4` : Rejeitada
 * - `5` : Autorizada
 * - `6` : Emitida DANFE
 * - `7` : Registrada
 * - `8` : Aguardando protocolo
 * - `9` : Denegada
 * - `10`: Consulta situação
 * - `11`: Bloqueada
 */
export type SituacaoNFe = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
