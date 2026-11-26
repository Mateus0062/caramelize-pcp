import { describe, expect, it } from "vitest";
import {
  calcularNecessidadesOrdem,
  calcularPrecoSugerido,
  calcularSaldosMap,
  enriquecerFormas,
  enriquecerInsumos,
  enriquecerOrdens,
  enriquecerReceitas,
  validarTransicaoStatus,
} from "@/lib/pcp-engine";
import type {
  Categoria,
  Forma,
  Insumo,
  MovimentoEstoque,
  OrdemProducao,
  Receita,
  ReceitaItem,
} from "@/lib/types";

const agora = "2026-11-26T12:00:00.000Z";

const categorias: Categoria[] = [
  { id: 1, nome: "Laticínios", dataAtualizacao: agora },
  { id: 2, nome: "Embalagens", dataAtualizacao: agora },
];

function insumo(id: number, nome: string, custo: number, minimo: number, extra: Partial<Insumo> = {}): Insumo {
  return {
    id,
    nome,
    unidadeMedida: "g",
    estoqueMinimo: minimo,
    custoUnitario: custo,
    categoriaId: 1,
    dataAtualizacao: agora,
    ativo: true,
    ...extra,
  };
}

const insumos: Insumo[] = [
  insumo(1, "Leite Condensado", 0.0175, 1000),
  insumo(2, "Ovo", 0.8, 12, { unidadeMedida: "un" }),
  insumo(3, "Forma Mini", 1.2, 10, { unidadeMedida: "un", categoriaId: 2 }),
  insumo(4, "Arquivado", 1, 0, { ativo: false }),
];

let movId = 1;
function mov(insumoId: number, tipo: MovimentoEstoque["tipo"], quantidade: number): MovimentoEstoque {
  return {
    id: movId++,
    insumoId,
    tipo,
    quantidade,
    custoUnitario: null,
    dataMovimento: agora,
    dataRegistro: agora,
    observacao: null,
  };
}

const movimentos: MovimentoEstoque[] = [
  mov(1, "COMPRA", 2000),
  mov(1, "PRODUCAO", 500),
  mov(2, "COMPRA", 30),
  mov(2, "AJUSTE_SAIDA", 6),
  mov(3, "COMPRA", 5),
  mov(3, "PRODUCAO", 8),
];

const saldos = calcularSaldosMap(movimentos);
const formas: Forma[] = [{ id: 1, nome: "Mini", volumeMl: 100, insumoId: 3 }];
const receitas: Receita[] = [
  { id: 1, nome: "Pudim", descricao: null, rendimentoMl: 1000, margemLucro: 50, dataAtualizacao: agora },
];
const receitaItens: ReceitaItem[] = [
  { id: 1, receitaId: 1, insumoId: 1, quantidade: 400 },
  { id: 2, receitaId: 1, insumoId: 2, quantidade: 3 },
];

describe("saldos e insumos", () => {
  it("soma entradas e subtrai saídas por insumo", () => {
    expect(saldos.get(1)).toBe(1500);
    expect(saldos.get(2)).toBe(24);
    expect(saldos.get(3)).toBe(-3);
    expect(saldos.get(99)).toBeUndefined();
  });

  it("lista só insumos ativos, em ordem alfabética", () => {
    const det = enriquecerInsumos(insumos, categorias, saldos);
    expect(det.map((i) => i.nome)).toEqual(["Forma Mini", "Leite Condensado", "Ovo"]);
  });

  it("mostra saldo negativo, mas não deixa o valor em estoque negativo", () => {
    const forma = enriquecerInsumos(insumos, categorias, saldos).find((i) => i.id === 3)!;
    expect(forma.saldoAtual).toBe(-3);
    expect(forma.abaixoMinimo).toBe(true);
    expect(forma.valorEmEstoque).toBe(0);
    expect(forma.categoriaNome).toBe("Embalagens");
  });

  it("calcula valor em estoque e alerta de mínimo", () => {
    const det = enriquecerInsumos(insumos, categorias, saldos);
    const leite = det.find((i) => i.id === 1)!;
    expect(leite.valorEmEstoque).toBe(26.25);
    expect(leite.abaixoMinimo).toBe(false);
  });
});

describe("receitas e precificação", () => {
  const formasDet = enriquecerFormas(formas, insumos, saldos);
  const [receita] = enriquecerReceitas(receitas, receitaItens, insumos, formasDet, saldos);

  it("soma o custo do lote e o custo por ml", () => {
    expect(receita.custoTotal).toBe(9.4);
    expect(receita.custoPorMl).toBeCloseTo(0.0094, 10);
  });

  it("simula o preço por forma com a margem da receita", () => {
    const sim = receita.simulacaoFormas[0];
    expect(sim.unidadesPorLote).toBe(10);
    expect(sim.custoMassaUnitario).toBe(0.94);
    expect(sim.custoFormaUnitario).toBe(1.2);
    expect(sim.custoTotalUnitario).toBe(2.14);
    expect(sim.precoSugeridoUnitario).toBe(4.28);
    expect(sim.lucroUnitario).toBe(2.14);
  });

  it("limita a margem entre 0% e 95%", () => {
    expect(calcularPrecoSugerido(10, 95)).toBe(200);
    expect(calcularPrecoSugerido(10, 120)).toBe(200);
    expect(calcularPrecoSugerido(10, -5)).toBe(10);
  });
});

describe("MRP da ordem de produção", () => {
  const formasDet = enriquecerFormas(formas, insumos, saldos);
  const [receita] = enriquecerReceitas(receitas, receitaItens, insumos, formasDet, saldos);
  const calc = calcularNecessidadesOrdem(receita, formasDet[0], 20);

  it("escala a receita pelo volume das formas", () => {
    expect(calc.volumeTotalMl).toBe(2000);
    expect(calc.fatorEscala).toBe(2);
  });

  it("lista insumos e a embalagem com o que falta comprar", () => {
    const leite = calc.necessidades.find((n) => n.insumoId === 1)!;
    expect(leite.quantidadeNecessaria).toBe(800);
    expect(leite.falta).toBe(0);
    const embalagem = calc.necessidades.find((n) => n.ehForma)!;
    expect(embalagem.quantidadeNecessaria).toBe(20);
    expect(embalagem.falta).toBe(23); // saldo -3 → faltam 20 + 3
    expect(calc.estoqueSuficiente).toBe(false);
  });

  it("calcula custo total e unitário", () => {
    expect(calc.custoTotalEstimado).toBe(42.8);
    expect(calc.custoUnitario).toBe(2.14);
  });

  it("mantém o custo gravado de ordens concluídas", () => {
    const base: OrdemProducao = {
      id: 1,
      receitaId: 1,
      formaId: 1,
      quantidadeUnidades: 20,
      status: "CONCLUIDA",
      custoTotalEstimado: 50,
      precoVendaUnitario: null,
      observacao: null,
      dataPrevista: agora,
      dataCriacao: agora,
      dataConclusao: agora,
    };
    const [concluida, planejada, cancelada] = enriquecerOrdens(
      [base, { ...base, id: 2, status: "PLANEJADA" }, { ...base, id: 3, status: "CANCELADA" }],
      [receita],
      formasDet,
    ).sort((a, b) => a.id - b.id);
    expect(concluida.custoTotalEstimado).toBe(50);
    expect(concluida.custoUnitario).toBe(2.5);
    expect(concluida.estoqueSuficiente).toBe(true);
    expect(planejada.custoTotalEstimado).toBe(42.8);
    expect(planejada.estoqueSuficiente).toBe(false);
    expect(cancelada.estoqueSuficiente).toBe(true);
  });
});

describe("regras de status", () => {
  it.each([
    ["PLANEJADA", "EM_PRODUCAO"],
    ["PLANEJADA", "CONCLUIDA"],
    ["PLANEJADA", "CANCELADA"],
    ["EM_PRODUCAO", "CONCLUIDA"],
    ["EM_PRODUCAO", "CANCELADA"],
    ["CANCELADA", "PLANEJADA"],
  ] as const)("permite %s → %s", (de, para) => {
    expect(validarTransicaoStatus(de, para)).toBeNull();
  });

  it.each([
    ["EM_PRODUCAO", "PLANEJADA"],
    ["CANCELADA", "CONCLUIDA"],
    ["CONCLUIDA", "PLANEJADA"],
    ["CONCLUIDA", "CANCELADA"],
    ["PLANEJADA", "PLANEJADA"],
  ] as const)("bloqueia %s → %s", (de, para) => {
    expect(validarTransicaoStatus(de, para)).toEqual(expect.any(String));
  });
});
