/**
 * - `1`: Dinheiro
 * - `2`: Cheque
 * - `3`: Cartão de Crédito
 * - `4`: Cartão de Débito
 * - `5`: Cartão da Loja (Private Label)
 * - `10`: Vale Alimentação
 * - `11`: Vale Refeição
 * - `12`: Vale Presente
 * - `13`: Vale Combustível
 * - `14`: Duplicata Mercantil
 * - `15`: Boleto Bancário
 * - `16`: Depósito Bancário
 * - `17`: Pagamento Instantâneo (PIX) - Dinâmico
 * - `18`: Transferência Bancária, Carteira Digital
 * - `19`: Programa de Fidelidade, Cashback, Crédito Virtual
 * - `20`: Pagamento Instantâneo (PIX) – Estático
 * - `21`: Crédito em loja
 * - `22`: Pagamento Eletrônico não Informado - falha de hardware do sistema emissor
 * - `90`: Sem pagamento
 * - `99`: Outros
 */
export type TipoPagamento =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 90
  | 99;

/**
 * Tipagem referente à finalidade de uma forma de pagamento.
 *
 * - `1`: Pagamentos
 * - `2`: Recebimentos
 * - `3`: Pagamentos e Recebimentos
 */
export type Finalidade = 1 | 2 | 3

/**
 * Tipagem referente à bandeira de um cartão de crédito.
 *
 * - `1`: Visa
 * - `2`: Mastercard
 * - `3`: American Express
 * - `4`: Sorocred
 * - `5`: Diners Club
 * - `6`: Elo
 * - `7`: Hipercard
 * - `8`: Aura
 * - `9`: Cabal
 * - `99`: Outros
 */
export type BandeiraCartao = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 99
