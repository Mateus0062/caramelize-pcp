import { describe, expect, it } from "vitest";
import { gerarCsv, numeroCsv } from "@/lib/csv";
import { montarListaDeCompras } from "@/lib/pcp-engine";
import type { NecessidadeInsumo, OrdemProducaoComDetalhes, StatusOrdemProducao } from "@/lib/types";

function nec(insumoId: number, nome: string, necessario: number, saldo: number, custo: number): NecessidadeInsumo {
  return {
    insumoId,
    insumoNome: nome,
    unidadeMedida: "g",
    quantidadeNecessaria: necessario,
    saldoDisponivel: saldo,
    falta: Math.max(0, necessario - saldo),
    custoUnitario: custo,
    custoTotal: necessario * custo,
    ehForma: false,
  };
}

function ordem(id: number, status: StatusOrdemProducao, necessidades: NecessidadeInsumo[]): OrdemProducaoComDetalhes {
  return {
    id,
    receitaId: 1,
    formaId: 1,
    quantidadeUnidades: 10,
    status,
    custoTotalEstimado: 0,
    precoVendaUnitario: null,
    observacao: null,
    dataPrevista: "2026-11-30T12:00:00.000Z",
    dataCriacao: "2026-11-26T12:00:00.000Z",
    dataConclusao: null,
    receitaNome: "Pudim",
    formaNome: "Mini",
    volumeTotalMl: 0,
    fatorEscala: 1,
    custoUnitario: 0,
    necessidades,
    estoqueSuficiente: true,
  };
}

describe("lista de compras consolidada", () => {
  it("soma o consumo de várias ordens antes de comparar com o estoque", () => {
    // Cada ordem sozinha cabe no estoque (600 ≤ 1000), mas juntas não (1200 > 1000).
    const lista = montarListaDeCompras([
      ordem(1, "PLANEJADA", [nec(1, "Leite", 600, 1000, 0.0175)]),
      ordem(2, "EM_PRODUCAO", [nec(1, "Leite", 600, 1000, 0.0175)]),
    ]);
    expect(lista).toEqual([
      expect.objectContaining({ insumoId: 1, necessario: 1200, saldoAtual: 1000, comprar: 200, custoEstimado: 3.5 }),
    ]);
  });

  it("ignora ordens concluídas e canceladas e itens que não faltam", () => {
    const lista = montarListaDeCompras([
      ordem(1, "CONCLUIDA", [nec(1, "Leite", 5000, 0, 1)]),
      ordem(2, "CANCELADA", [nec(2, "Ovo", 50, 0, 1)]),
      ordem(3, "PLANEJADA", [nec(3, "Açúcar", 10, 100, 1)]),
    ]);
    expect(lista).toEqual([]);
  });

  it("considera saldo negativo como dívida a repor", () => {
    const [item] = montarListaDeCompras([ordem(1, "PLANEJADA", [nec(1, "Forma", 10, -3, 1.2)])]);
    expect(item.comprar).toBe(13);
    expect(item.custoEstimado).toBe(15.6);
  });
});

describe("CSV para Excel em português", () => {
  it("usa ponto e vírgula, vírgula decimal, CRLF e BOM", () => {
    const csv = gerarCsv(["Insumo", "Comprar"], [["Leite", numeroCsv(1234.5, 3)]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Insumo;Comprar\r\nLeite;1234,500\r\n");
  });

  it("escapa aspas, ponto e vírgula e bloqueia fórmulas", () => {
    const csv = gerarCsv(["A"], [['Leite "Moça"; 395g'], ["=HYPERLINK(1)"], ["-1+2"], ["@SOMA(A1)"]]);
    expect(csv).toContain('"Leite ""Moça""; 395g"');
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'-1+2");
    expect(csv).toContain("'@SOMA(A1)");
  });

  it("números negativos continuam números (sem apóstrofo)", () => {
    const csv = gerarCsv(["Saldo"], [[numeroCsv(-2200, 3)], ["-5"]]);
    expect(csv).toContain("\r\n-2200,000\r\n-5\r\n");
    expect(csv).not.toContain("'-");
  });
});
