import { DefaultAuthentication } from "typeorm/driver/sqlserver/authentication/DefaultAuthentication";
import { BigDecimalOperationsCopy, RoundingModes } from "./big-decimal-operations.copy";

const DEFAULT_PRESISION = 2;
const DEFAULT_TRUNC_PRESISION = 0;


export class AppMath {

  /**
   * Retorna a soma exata sem os erros do ponto flutuante
   *   com precisão de duas casas decimais.
   * 
   * @param num1 pode receber valores positivos e negativos
   * @param num2 pode receber valores positivos e negativos
   * @param precision número de casas decimais após a virgula (default = 2)
   */
  
  public static sum(num: number, num2:number, precision?: number): number;
  public static sum(num: number[], precision?: number): number;
  public static sum(
    num: number | number[],
    num2?: number,
    precision = DEFAULT_PRESISION
  ): number {
    if (Array.isArray(num)) {
      return num.reduce(
        (previous, current) => BigDecimalOperationsCopy.add(previous, current, precision),
        0.0 
      );
    } else {
      const safeNum2 = num2 ?? 0; // Garantir valor seguro
      return BigDecimalOperationsCopy.add(num, safeNum2, precision);
    }
  }


  public static round(value: number, precision: number = DEFAULT_PRESISION, mode: RoundingModes = RoundingModes.HALF_DOWN): number {
    return BigDecimalOperationsCopy.multiply(value, 1, precision, mode);
  }




  /**
   * Retorna multiplicação exata sem os erros do ponto flutuante
   *   com precisão de duas casas decimais.
   * 
   * @param precision número de casas decimais após a virgula (default = 2)
   */
  public static multiply(num1: number, num2: number, precision = DEFAULT_PRESISION, mode: RoundingModes = RoundingModes.HALF_DOWN) {
    return BigDecimalOperationsCopy.multiply(num1, num2, precision, mode);
  }

  /**
   * Retorna divisão exata sem os erros do ponto flutuante
   *   com precisão de duas casas decimais.
   * 
   * @param precision número de casas decimais após a virgula (default = 2)
   */
  public static divide(dividend: number, divisor: number, precision = DEFAULT_PRESISION, mode: RoundingModes = RoundingModes.HALF_DOWN) {
    return BigDecimalOperationsCopy.divide(dividend, divisor, precision, mode);
  }

  /**
   * Retorna valor truncado com a precisão especificada
   * @param value 
   * @param precision default = 0
   * @returns 
   */
  public static truncate(value: number, precision = DEFAULT_TRUNC_PRESISION) {
    return this.sum(value, 0, precision);
  }

  /**
   * Retira percentual adicionado de um valor.
   * ex: 100 + 10% = 110 | dez porcento adicionado a 100
   * revertendo: thisfunction(110, 0.1) retorna 100
   * ex: 100 - 10% = 90 | dez porcento subtraido de 100
   * revertendo: thisfunction(110, -0.1) retorna 90
   * 
   * @param valor total após percentual adicionado
   * @param decimalPercentTaxa taxa percentual na forma decimal
   * @returns valor / (1 + taxa) => valor original
   */
  public static removeAddedPercentual(valor: number, decimalPercentTaxa: number, precision = DEFAULT_PRESISION): number {
    return this.truncate(
      this.divide(valor, this.sum(1, decimalPercentTaxa)),
      precision
    );
  }
}