import { describe, expect, it } from "vitest";
import {
  formatDateOnly,
  formatDateTime,
  formatQty,
  hojeISO,
  parseDecimal,
} from "@/lib/format";

describe("parseDecimal", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["0,5", 0.5],
    [" 2,5 ", 2.5],
    ["10", 10],
  ])("lê %j como %d", (texto, esperado) => {
    expect(parseDecimal(texto)).toBe(esperado);
  });

  it.each(["", "abc", "1,2,3", "R$ 10"])("rejeita %j", (texto) => {
    expect(parseDecimal(texto)).toBeNaN();
  });
});

describe("datas", () => {
  it("mostra a data de calendário sem voltar um dia (novas e antigas)", () => {
    expect(formatDateOnly("2026-11-30T12:00:00.000Z")).toBe("30/11/2026");
    expect(formatDateOnly("2026-11-30T00:00:00.000Z")).toBe("30/11/2026");
  });

  it("mostra horários no fuso de São Paulo", () => {
    expect(formatDateTime("2026-11-26T13:49:00.000Z")).toContain("10:49");
  });

  it("hojeISO devolve AAAA-MM-DD", () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("valores vazios ou inválidos viram travessão", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateTime("lixo")).toBe("—");
  });
});

describe("quantidades", () => {
  it("usa até 3 casas decimais e a unidade", () => {
    expect(formatQty(0.0175, "kg")).toBe("0,018 kg");
    expect(formatQty(1500, "g")).toBe("1.500 g");
    expect(formatQty(-3, "un")).toBe("-3 un");
  });
});
