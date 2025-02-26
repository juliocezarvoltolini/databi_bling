/**
 * Operações com números flutuantes sem erros.
 * fonte: @see https://github.com/royNiladri/js-big-decimal/tree/master
 * autor: royNiladri
 * funções copiadas em: 21/11/2023
 */
export class BigDecimalOperationsCopy {

    public static testing() {
        // logging algumas operações para verificar resultados
        console.debug(BigDecimalOperationsCopy.add(12, -13), '-1');
        console.debug(BigDecimalOperationsCopy.add(-12.67, 13), '0.33');
        console.debug(BigDecimalOperationsCopy.add(12.67, -130.7), '-118.03');
        console.debug(BigDecimalOperationsCopy.multiply(0.13, 0.00130), '0.000169');
        console.debug(BigDecimalOperationsCopy.multiply(-0.0000005, 13), '-0.0000065');
        console.debug(BigDecimalOperationsCopy.divide(123456789.123456, .0123456), '10000063919.40902022');
        console.debug(BigDecimalOperationsCopy.divide(.102, .0383292, 5), '2.66115651');
    }

    // operações adaptadas para utilização -------------------------------------------------------------------------------------------------------

    public static add(num1: number, num2: number, precision = 8): number {
        let result = new Number(this.roundOff(this._add(this.validate(num1), this.validate(num2)), precision, RoundingModes.DOWN));
        return result.valueOf();
    }

    public static multiply(number1: number, number2: number, precision = 8, mode: RoundingModes = RoundingModes.DOWN): number {
        let result = new Number(this.roundOff(this._multiply(this.validate(number1), this.validate(number2)), precision, mode));
        return result.valueOf();
    }

    public static divide(dividend: number, divisor: number, precission = 8, mode: RoundingModes = RoundingModes.DOWN): number {
        let result = new Number(this._divide(this.validate(dividend), this.validate(divisor), precission, RoundingModes.DOWN));
        return result.valueOf();
    }


    // private funções bigDecimal -----------------------------------------------------------------

    private static _add(number1: string, number2 = "0") {
        let neg = 0,
            ind = -1,
            neg_len;

        //check for negatives
        if (number1[0] == "-") {
            number1 = number1.substring(1);
            if (!this.testZero(number1)) {
                neg++;
                ind = 1;
                neg_len = number1.length;
            }
        }
        if (number2[0] == "-") {
            number2 = number2.substring(1);
            if (!this.testZero(number2)) {
                neg++;
                ind = 2;
                neg_len = number2.length;
            }
        }

        number1 = this.trim(number1);
        number2 = this.trim(number2);

        [number1, number2] = this.pad(this.trim(number1), this.trim(number2));

        if (neg == 1) {
            if (ind === 1) number1 = this.compliment(number1);
            else if (ind === 2) number2 = this.compliment(number2);
        }

        let res = this.addCore(number1, number2);
        if (!neg) return this.trim(res);
        else if (neg == 2) return "-" + this.trim(res);
        else {
            if (number1.length < res.length) return this.trim(res.substring(1));
            else return "-" + this.trim(this.compliment(res));
        }
    }

    private static _multiply(number1, number2) {
        number1 = this._add(number1.toString(), '0').toString();
        number2 = number2.toString();

        /*Filter numbers*/
        let negative = 0;
        if (number1[0] == '-') {
            negative++;
            number1 = number1.substr(1);
        }
        if (number2[0] == '-') {
            negative++;
            number2 = number2.substr(1);
        }
        number1 = this.trailZero(number1);
        number2 = this.trailZero(number2);
        let decimalLength1 = 0;
        let decimalLength2 = 0;

        if (number1.indexOf('.') != -1) {
            decimalLength1 = number1.length - number1.indexOf('.') - 1;
        }

        if (number2.indexOf('.') != -1) {
            decimalLength2 = number2.length - number2.indexOf('.') - 1;
        }
        let decimalLength = decimalLength1 + decimalLength2;
        number1 = this.trailZero(number1.replace('.', ''));
        number2 = this.trailZero(number2.replace('.', ''));

        if (number1.length < number2.length) {
            let temp = number1;
            number1 = number2;
            number2 = temp;
        }

        if (number2 == '0') {
            return '0';
        }

        /*
         * Core multiplication
         */
        let length = number2.length;
        let carry = 0;
        let positionVector = [];
        let currentPosition = length - 1;

        let result = "";
        for (let i = 0; i < length; i++) {
            positionVector[i] = number1.length - 1;
        }
        for (let i = 0; i < 2 * number1.length; i++) {
            let sum = 0;
            for (let j = number2.length - 1; j >= currentPosition && j >= 0; j--) {
                if (positionVector[j] > -1 && positionVector[j] < number1.length) {
                    sum += parseInt(number1[positionVector[j]--]) * parseInt(number2[j]);
                }
            }
            sum += carry;
            carry = Math.floor(sum / 10);
            result = sum % 10 + result;
            currentPosition--;
        }
        /*
         * Formatting result
         */
        result = this.trailZero(this.adjustDecimal(result, decimalLength));
        if (negative == 1) {
            result = '-' + result;
        }
        return result;
    }

    private static _divide(dividend, divisor, precission = 8, mode = RoundingModes.HALF_EVEN) {
        if (divisor == 0) {
            throw new Error('Cannot divide by 0');
        }

        dividend = dividend.toString();
        divisor = divisor.toString();

        // remove trailing zeros in decimal ISSUE#18
        dividend = dividend.replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/, "");
        divisor = divisor.replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/, "");

        if (dividend == 0)
            return '0';

        let neg = 0;
        if (divisor[0] == '-') {
            divisor = divisor.substring(1);
            neg++;
        }
        if (dividend[0] == '-') {
            dividend = dividend.substring(1);
            neg++;
        }

        var pt_dvsr = divisor.indexOf('.') > 0 ? divisor.length - divisor.indexOf('.') - 1 : -1;

        divisor = this.trim(divisor.replace('.', ''));
        if (pt_dvsr >= 0) {
            let pt_dvnd = dividend.indexOf('.') > 0 ? dividend.length - dividend.indexOf('.') - 1 : -1;

            if (pt_dvnd == -1) {
                dividend = this.trim(dividend + (new Array(pt_dvsr + 1)).join('0'));
            } else {
                if (pt_dvsr > pt_dvnd) {
                    dividend = dividend.replace('.', '');
                    dividend = this.trim(dividend + (new Array(pt_dvsr - pt_dvnd + 1)).join('0'));
                } else if (pt_dvsr < pt_dvnd) {
                    dividend = dividend.replace('.', '');
                    let loc = dividend.length - pt_dvnd + pt_dvsr;
                    dividend = this.trim(dividend.substring(0, loc) + '.' + dividend.substring(loc));
                } else if (pt_dvsr == pt_dvnd) {
                    dividend = this.trim(dividend.replace('.', ''));
                }
            }
        }

        let prec = 0, dl = divisor.length, rem = '0', quotent = '';
        let dvnd = (dividend.indexOf('.') > -1 && dividend.indexOf('.') < dl) ? dividend.substring(0, dl + 1) : dividend.substring(0, dl);
        dividend = (dividend.indexOf('.') > -1 && dividend.indexOf('.') < dl) ? dividend.substring(dl + 1) : dividend.substring(dl);

        if (dvnd.indexOf('.') > -1) {
            let shift = dvnd.length - dvnd.indexOf('.') - 1;
            dvnd = dvnd.replace('.', '');
            if (dl > dvnd.length) {
                shift += dl - dvnd.length;
                dvnd = dvnd + (new Array(dl - dvnd.length + 1)).join('0');
            }
            prec = shift;
            quotent = '0.' + (new Array(shift)).join('0');

        }

        precission = precission + 2;

        while (prec <= precission) {
            let qt = 0;
            while (parseInt(dvnd) >= parseInt(divisor)) {
                dvnd = this._add(dvnd, '-' + divisor);
                qt++;
            }
            quotent += qt;

            if (!dividend) {
                if (!prec)
                    quotent += '.';
                prec++;
                dvnd = dvnd + '0';
            } else {
                if (dividend[0] == '.') {
                    quotent += '.';
                    prec++;
                    dividend = dividend.substring(1);
                }
                dvnd = dvnd + dividend.substring(0, 1);
                dividend = dividend.substring(1);
            }
        }

        return ((neg == 1) ? '-' : '') + this.trim(this.roundOff(quotent, precission - 2, mode));
    }

    public static roundOff(input: number | string | bigint, n: number = 0, mode = RoundingModes.HALF_EVEN) {
        if (mode === RoundingModes.UNNECESSARY) {
            throw new Error("UNNECESSARY Rounding Mode has not yet been implemented");
        }

        if (typeof (input) == 'number' || typeof (input) == 'bigint')
            input = input.toString();

        let neg = false;
        if (input[0] === '-') {
            neg = true;
            input = input.substring(1);
        }

        let parts = input.split('.'),
            partInt = parts[0],
            partDec = parts[1];

        //handle case of -ve n: roundOff(12564,-2)=12600
        if (n < 0) {
            n = -n;
            if (partInt.length <= n)
                return '0';
            else {
                let prefix = partInt.substr(0, partInt.length - n);
                input = prefix + '.' + partInt.substr(partInt.length - n) + partDec;
                prefix = this.roundOff(input, 0, mode);
                return (neg ? '-' : '') + prefix + (new Array(n + 1).join('0'));
            }
        }


        // handle case when integer output is desired
        if (n == 0) {
            let l = partInt.length;
            if (this.greaterThanFive(parts[1], partInt, neg, mode)) {
                partInt = this.increment(partInt);
            }
            return (neg && parseInt(partInt) ? '-' : '') + partInt;
        }


        // handle case when n>0
        if (!parts[1]) {
            return (neg ? '-' : '') + partInt + '.' + (new Array(n + 1).join('0'));
        } else if (parts[1].length < n) {
            return (neg ? '-' : '') + partInt + '.' + parts[1] + (new Array(n - parts[1].length + 1).join('0'));
        }

        partDec = parts[1].substring(0, n);
        let rem = parts[1].substring(n);

        if (rem && this.greaterThanFive(rem, partDec, neg, mode)) {
            partDec = this.increment(partDec);
            if (partDec.length > n) {
                return (neg ? '-' : '') + this.increment(partInt, parseInt(partDec[0])) + '.' + partDec.substring(1);
            }
        }
        return (neg && (parseInt(partInt) || parseInt(partDec)) ? '-' : '') + partInt + '.' + partDec;
    }

    private static greaterThanFive(part: string, pre: string, neg: boolean, mode: RoundingModes) {
        if (!part || part === new Array(part.length + 1).join('0'))
            return false;

        // #region UP, DOWN, CEILING, FLOOR 
        if (mode === RoundingModes.DOWN || (!neg && mode === RoundingModes.FLOOR) ||
            (neg && mode === RoundingModes.CEILING))
            return false;

        if (mode === RoundingModes.UP || (neg && mode === RoundingModes.FLOOR) ||
            (!neg && mode === RoundingModes.CEILING))
            return true;
        // #endregion

        // case when part !== five
        let five = '5' + (new Array(part.length).join('0'));
        if (part > five)
            return true;
        else if (part < five)
            return false;

        // case when part === five
        switch (mode) {
            case RoundingModes.HALF_DOWN: return false;
            case RoundingModes.HALF_UP: return true;
            case RoundingModes.HALF_EVEN:
            default: return (parseInt(pre[pre.length - 1]) % 2 == 1)
        }
    }

    private static increment(part, c: number = 0) {
        if (!c)
            c = 1;
        if (typeof (part) == 'number')
            part.toString();

        let l = part.length - 1,
            s = '';

        for (let i = l; i >= 0; i--) {
            let x = parseInt(part[i]) + c;
            if (x == 10) {
                c = 1; x = 0;
            } else {
                c = 0;
            }
            s += x;
        }
        if (c)
            s += c;

        return s.split('').reverse().join('');
    }

    private static compliment(number: string) {
        if (this.testZero(number)) {
            return number;
        }

        let s = "",
            l = number.length,
            dec = number.split(".")[1],
            ld = dec ? dec.length : 0;

        for (let i = 0; i < l; i++) {
            if (number[i] >= "0" && number[i] <= "9") s += 9 - parseInt(number[i]);
            else s += number[i];
        }

        let one = ld > 0 ? "0." + new Array(ld).join("0") + "1" : "1";

        return this.addCore(s, one);
    }

    private static trim(number: string) {
        let parts = number.split(".");

        if (!parts[0]) parts[0] = "0";

        while (parts[0][0] == "0" && parts[0].length > 1)
            parts[0] = parts[0].substring(1);

        return parts[0] + (parts[1] ? "." + parts[1] : "");
    }

    private static pad(number1: string, number2: string) {
        let parts1 = number1.split("."),
            parts2 = number2.split(".");

        //pad integral part
        let length1 = parts1[0].length,
            length2 = parts2[0].length;
        if (length1 > length2) {
            parts2[0] =
                new Array(Math.abs(length1 - length2) + 1).join("0") +
                (parts2[0] ? parts2[0] : "");
        } else {
            parts1[0] =
                new Array(Math.abs(length1 - length2) + 1).join("0") +
                (parts1[0] ? parts1[0] : "");
        }

        //pad fractional part
        (length1 = parts1[1] ? parts1[1].length : 0),
            (length2 = parts2[1] ? parts2[1].length : 0);
        if (length1 || length2) {
            if (length1 > length2) {
                parts2[1] =
                    (parts2[1] ? parts2[1] : "") +
                    new Array(Math.abs(length1 - length2) + 1).join("0");
            } else {
                parts1[1] =
                    (parts1[1] ? parts1[1] : "") +
                    new Array(Math.abs(length1 - length2) + 1).join("0");
            }
        }

        number1 = parts1[0] + (parts1[1] ? "." + parts1[1] : "");
        number2 = parts2[0] + (parts2[1] ? "." + parts2[1] : "");

        return [number1, number2];
    }

    private static addCore(number1: string, number2: string) {
        [number1, number2] = this.pad(number1, number2);

        let sum = "",
            carry = 0;

        for (let i = number1.length - 1; i >= 0; i--) {
            if (number1[i] === ".") {
                sum = "." + sum;
                continue;
            }
            let temp = parseInt(number1[i]) + parseInt(number2[i]) + carry;
            sum = (temp % 10) + sum;
            carry = Math.floor(temp / 10);
        }

        return carry ? carry.toString() + sum : sum;
    }

    private static testZero(number: string) {
        return /^0[0]*[.]{0,1}[0]*$/.test(number);
    }

    /*
     * Add decimal point
     */
    private static adjustDecimal(number, decimal) {
        if (decimal == 0)
            return number;
        else {
            number = (decimal >= number.length) ? ((new Array(decimal - number.length + 1)).join('0') + number) : number;
            return number.substr(0, number.length - decimal) + '.' + number.substr(number.length - decimal, decimal)
        }
    }

    /*
     * Removes zero from front and back
     */
    private static trailZero(number) {
        while (number[0] == '0') {
            number = number.substr(1);
        }
        if (number.indexOf('.') != -1) {
            while (number[number.length - 1] == '0') {
                number = number.substr(0, number.length - 1);
            }
        }
        if (number == "" || number == ".") {
            number = '0';
        } else if (number[number.length - 1] == '.') {
            number = number.substr(0, number.length - 1);
        }
        if (number[0] == '.') {
            number = '0' + number;
        }
        return number;
    }

    private static validate(number): string {
        if (number) {
            number = number.toString();
            if (isNaN(number)) throw Error("Parameter is not a number: " + number);

            if (number[0] == "+") number = number.substring(1);
        } else number = "0";

        //handle missing leading zero
        if (number.startsWith(".")) number = "0" + number;
        else if (number.startsWith("-.")) number = "-0" + number.substr(1);

        //handle exponentiation
        if (/e/i.test(number)) {
            let [mantisa, exponent] = number.split(/[eE]/);
            mantisa = this.trim(mantisa);

            let sign = "";
            if (mantisa[0] == "-") {
                sign = "-";
                mantisa = mantisa.substring(1);
            }

            if (mantisa.indexOf(".") >= 0) {
                exponent = parseInt(exponent) + mantisa.indexOf(".");
                mantisa = mantisa.replace(".", "");
            } else {
                exponent = parseInt(exponent) + mantisa.length;
            }

            if (mantisa.length < exponent) {
                number =
                    sign + mantisa + new Array(exponent - mantisa.length + 1).join("0");
            } else if (mantisa.length >= exponent && exponent > 0) {
                number =
                    sign +
                    this.trim(mantisa.substring(0, exponent)) +
                    (mantisa.length > exponent ? "." + mantisa.substring(exponent) : "");
            } else {
                number = sign + "0." + new Array(-exponent + 1).join("0") + mantisa;
            }
        }

        return number;
    }
}

export enum RoundingModes {
    /**
     * Rounding mode to round towards positive infinity.
     */
    CEILING,

    /**
     * Rounding mode to round towards zero.
     */
    DOWN,

    /**
     * Rounding mode to round towards negative infinity.
     */
    FLOOR,

    /**
     * Rounding mode to round towards "nearest neighbor" unless both neighbors are equidistant, 
     * in which case round down.
     */
    HALF_DOWN,

    /**
     * Rounding mode to round towards the "nearest neighbor" unless both neighbors are equidistant, 
     * in which case, round towards the even neighbor.
     */
    HALF_EVEN,

    /**
     * Rounding mode to round towards "nearest neighbor" unless both neighbors are equidistant, 
     * in which case round up.
     */
    HALF_UP,

    /**
     * Rounding mode to assert that the requested operation has an exact result, hence no rounding is necessary.
     * UNIMPLEMENTED
     */
    UNNECESSARY,

    /**
     * Rounding mode to round away from zero.
     */
    UP
}