/**
 * - `F` : Pessoa Física
 * - `J` : Pessoa Jurídica
 * - `E` : Pessoa Estrangeira
 */
type TipoPessoa = 'F' | 'J' | 'E';

/**
 * - `1` : Contribuinte ICMS 
 * - `2` : Contribuinte isento de Inscrição no cadastro de Contribuintes
 * - `9` : Não Contribuinte
 */
type IndicadorInscricaoEstadual = 1 | 2 | 9;

/**
 * - `M` - MAsculino
 * - `F` - Feminino
 * - `O` - Outro
 */
type Sexo = 'M' | 'F' | 'O'