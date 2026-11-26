import { describe, expect, it } from "vitest";
import { arred, div, maior, mul, soma, sub } from "@/lib/decimal";
import {
  calcularCustoMedioPonderado,
  calcularPrecoSugerido,
  calcularSaldosMap,
  enriquecerFormas,
  enriquecerReceitas,
} from "@/lib/pcp-engine";
import type { Insumo, MovimentoEstoque } from "@/lib/types";

describe("aritmética decimal", () => {
  it("evita os erros clássicos de ponto flutuante", () => {
    expect(soma([0.1, 0.2], 2)).toBe(0.3); // em float: 0.30000000000000004
    expect(mul(1.005, 1, 2)).toBe(1.01); // em float, 1.005.toFixed(2) dá "1.00"
    expect(arred(2.675, 2)).toBe(2.68); // em float, 2.675.toFixed(2) dá "2.67"
    expect(sub(0.3, 0.1, 2)).toBe(0.2);
    expect(div(10, 3, 4)).toBe(3.3333);
  });

  it("trata divisão por zero e valores inválidos como zero", () => {
    expect(div(10, 0, 2)).toBe(0);
    expect(mul(Number.NaN, 2, 2)).toBe(0);
    expect(maior(-1, 0)).toBe(0);
  });
});

describe("motor de cálculo com decimal exato", () => {
  const agora = "2026-11-26T12:00:00.000Z";
  const insumos: Insumo[] = [
    {
      id: 1,
      nome: "Calda",
      unidadeMedida: "un",
      estoqueMinimo: 0,
      custoUnitario: 1.005,
      categoriaId: 1,
      dataAtualizacao: agora,
      ativo: true,
    },
  ];

  it("arredonda o custo do lote corretamente (1,005 → 1,01)", () => {
    const formasDet = enriquecerFormas([], insumos, new Map());
    const [receita] = enriquecerReceitas(
      [{ id: 1, nome: "R", descricao: null, rendimentoMl: 100, margemLucro: 0, dataAtualizacao: agora }],
      [{ id: 1, receitaId: 1, insumoId: 1, quantidade: 1 }],
      insumos,
      formasDet,
      new Map(),
    );
    expect(receita.custoTotal).toBe(1.01);
  });

  it("preço sugerido arredonda meio centavo para cima", () => {
    expect(calcularPrecoSugerido(2.675, 0)).toBe(2.68);
  });

  it("saldo acumula sem resíduo de ponto flutuante", () => {
    const movs: MovimentoEstoque[] = [0.1, 0.2].map((q, i) => ({
      id: i + 1,
      insumoId: 1,
      tipo: "COMPRA",
      quantidade: q,
      custoUnitario: null,
      dataMovimento: agora,
      dataRegistro: agora,
      observacao: null,
    }));
    expect(calcularSaldosMap(movs).get(1)).toBe(0.3);
  });
});

describe("custo médio ponderado", () => {
  it("pondera pelo saldo e pela quantidade comprada", () => {
    // 100 g a R$ 1,00 + 100 g a R$ 2,00 → R$ 1,50
    expect(calcularCustoMedioPonderado(100, 1, 100, 2)).toBe(1.5);
    // 300 a R$ 0,0175 + 100 a R$ 0,02 → (5,25 + 2) / 400 = 0,018125 → 0,0181
    expect(calcularCustoMedioPonderado(300, 0.0175, 100, 0.02)).toBe(0.0181);
  });

  it("sem saldo positivo, usa o preço da compra", () => {
    expect(calcularCustoMedioPonderado(0, 5, 10, 2)).toBe(2);
    expect(calcularCustoMedioPonderado(-30, 5, 10, 2)).toBe(2);
  });
});
