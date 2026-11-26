/** Fuso horário da operação. Datas e horas são sempre exibidas nele, seja qual for o fuso do servidor ou do navegador. */
export const TIME_ZONE = "America/Sao_Paulo";

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatUnitCost(value: number): string {
  if (!Number.isFinite(value)) return "R$ 0,00";
  const decimals = value > 0 && value < 0.1 ? 4 : 2;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatQty(value: number, unit?: string): string {
  const num = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(num);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * Datas "de calendário" (ex.: data prevista da ordem), que não têm hora.
 * São gravadas ao meio-dia UTC e exibidas em UTC, então o dia nunca "volta"
 * por causa de fuso horário.
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Data de hoje (AAAA-MM-DD) no fuso da operação — para campos <input type="date">. */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

/**
 * Converte texto digitado em número aceitando os formatos brasileiro e
 * internacional: "1.234,56", "1234,56", "1234.56" e "0,5".
 * Retorna NaN se o texto não for um número.
 */
export function parseDecimal(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return NaN;
  let normalized = text;
  if (text.includes(",")) {
    // Vírgula é o separador decimal: pontos são separadores de milhar.
    normalized = text.replace(/\./g, "").replace(",", ".");
  }
  if (!/^-?\d*\.?\d+$/.test(normalized) && !/^-?\d+\.$/.test(normalized)) return NaN;
  return Number(normalized);
}
