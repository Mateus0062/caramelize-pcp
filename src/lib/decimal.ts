import Big from "big.js";

/**
 * Aritmética decimal exata para dinheiro e quantidades.
 *
 * Em ponto flutuante, 0,1 + 0,2 = 0,30000000000000004 e 1,005 arredondado
 * para 2 casas vira 1,00. Aqui cada número é tratado pelo valor decimal que
 * ele representa (como o DECIMAL do banco), e o arredondamento é "meio para
 * cima" (1,005 → 1,01), como se espera em valores monetários.
 *
 * Os valores entram e saem como `number` (JSON e banco não mudam); só as
 * contas são feitas em decimal.
 */

Big.RM = Big.roundHalfUp;
Big.DP = 20;

type Valor = number | Big;

function toBig(v: Valor): Big {
  if (v instanceof Big) return v;
  return Number.isFinite(v) ? new Big(v) : new Big(0);
}

function fim(v: Big, casas: number): number {
  return Number(v.round(casas).toString());
}

/** Arredonda para `casas` decimais (meio para cima). */
export function arred(v: Valor, casas: number): number {
  return fim(toBig(v), casas);
}

export function soma(valores: Valor[], casas: number): number {
  return fim(valores.reduce<Big>((acc, v) => acc.plus(toBig(v)), new Big(0)), casas);
}

export function sub(a: Valor, b: Valor, casas: number): number {
  return fim(toBig(a).minus(toBig(b)), casas);
}

export function mul(a: Valor, b: Valor, casas: number): number {
  return fim(toBig(a).times(toBig(b)), casas);
}

/** Divisão; divisor zero (ou inválido) resulta em 0. */
export function div(a: Valor, b: Valor, casas: number): number {
  const divisor = toBig(b);
  if (divisor.eq(0)) return 0;
  return fim(toBig(a).div(divisor), casas);
}

export function maior(a: number, b: number): number {
  return toBig(a).gt(toBig(b)) ? a : b;
}

export { Big };
