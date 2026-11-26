import type {
  Categoria,
  DashboardResumo,
  Forma,
  FormaComDetalhes,
  Insumo,
  InsumoComDetalhes,
  MovimentoComDetalhes,
  MovimentoEstoque,
  NecessidadeInsumo,
  OrdemProducao,
  OrdemProducaoComDetalhes,
  Receita,
  ReceitaComDetalhes,
  ReceitaItem,
  ReceitaItemComDetalhes,
  StatusOrdemProducao,
} from "./types";
import { arred, Big, div, mul, soma, sub } from "./decimal";

// ============================================================================
// Ciclo de vida da Ordem de Produção
// ============================================================================
export const STATUS_LABEL: Record<StatusOrdemProducao, string> = {
  PLANEJADA: "Planejada",
  EM_PRODUCAO: "Em Produção",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

/** Transições permitidas. Uma ordem concluída não muda mais (o estoque já foi baixado). */
export const TRANSICOES_STATUS: Record<StatusOrdemProducao, StatusOrdemProducao[]> = {
  PLANEJADA: ["EM_PRODUCAO", "CONCLUIDA", "CANCELADA"],
  EM_PRODUCAO: ["CONCLUIDA", "CANCELADA"],
  CANCELADA: ["PLANEJADA"],
  CONCLUIDA: [],
};

/** Retorna null se a transição é permitida, ou a mensagem de erro. */
export function validarTransicaoStatus(
  de: StatusOrdemProducao,
  para: StatusOrdemProducao,
): string | null {
  if (de === para) return `A ordem já está ${STATUS_LABEL[para].toLowerCase()}.`;
  if (de === "CONCLUIDA") return "Ordem de produção já foi concluída e baixada no estoque.";
  if (!TRANSICOES_STATUS[de]?.includes(para)) {
    return `Não é possível mudar uma ordem ${STATUS_LABEL[de].toLowerCase()} para ${STATUS_LABEL[para].toLowerCase()}.`;
  }
  return null;
}

/** Ordens que ainda vão consumir estoque. */
export function ordemAtiva(status: StatusOrdemProducao): boolean {
  return status === "PLANEJADA" || status === "EM_PRODUCAO";
}

/** Saldo atual por insumo (id do insumo → quantidade em estoque). */
export type SaldosMap = Map<number, number>;

/**
 * Soma entradas e saídas. No Postgres o saldo é calculado pelo próprio banco
 * (SUM ... GROUP BY); esta função é usada no modo local.
 */
export function calcularSaldosMap(
  movimentos: MovimentoEstoque[],
): SaldosMap {
  const acumulado = new Map<number, Big>();
  for (const m of movimentos) {
    const atual = acumulado.get(m.insumoId) ?? new Big(0);
    const qtd = new Big(Number.isFinite(m.quantidade) ? m.quantidade : 0);
    acumulado.set(
      m.insumoId,
      m.tipo === "COMPRA" || m.tipo === "AJUSTE_ENTRADA" ? atual.plus(qtd) : atual.minus(qtd),
    );
  }
  const saldos: SaldosMap = new Map();
  for (const [insumoId, valor] of acumulado) saldos.set(insumoId, arred(valor, 4));
  return saldos;
}

export function enriquecerInsumos(
  insumos: Insumo[],
  categorias: Categoria[],
  saldos: SaldosMap,
): InsumoComDetalhes[] {
  const catMap = new Map(categorias.map((c) => [c.id, c.nome]));

  return insumos
    .filter((i) => i.ativo)
    .map((insumo) => {
      const saldoAtual = saldos.get(insumo.id) ?? 0;
      const abaixoMinimo = saldoAtual <= insumo.estoqueMinimo;
      const valorEmEstoque = mul(Math.max(0, saldoAtual), insumo.custoUnitario, 2);
      return {
        ...insumo,
        categoriaNome: catMap.get(insumo.categoriaId) ?? "Sem categoria",
        saldoAtual,
        abaixoMinimo,
        valorEmEstoque,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function enriquecerMovimentos(
  movimentos: MovimentoEstoque[],
  insumos: Insumo[],
): MovimentoComDetalhes[] {
  const insumoMap = new Map(insumos.map((i) => [i.id, i]));
  return [...movimentos]
    .sort(
      (a, b) =>
        new Date(b.dataMovimento).getTime() - new Date(a.dataMovimento).getTime() ||
        b.id - a.id,
    )
    .map((m) => {
      const ins = insumoMap.get(m.insumoId);
      return {
        ...m,
        insumoNome: ins?.nome ?? `Insumo #${m.insumoId}`,
        unidadeMedida: ins?.unidadeMedida ?? "un",
      };
    });
}

export function enriquecerFormas(
  formas: Forma[],
  insumos: Insumo[],
  saldos: SaldosMap,
): FormaComDetalhes[] {
  const insumoMap = new Map(insumos.map((i) => [i.id, i]));

  return formas
    .map((f) => {
      const ins = insumoMap.get(f.insumoId);
      return {
        ...f,
        nome: f.nome || ins?.nome || `Forma #${f.id}`,
        insumoNome: ins?.nome ?? `Insumo #${f.insumoId}`,
        custoUnitario: ins?.custoUnitario ?? 0,
        saldoAtual: saldos.get(f.insumoId) ?? 0,
      };
    })
    .sort((a, b) => a.volumeMl - b.volumeMl);
}

export function calcularPrecoSugerido(
  custoUnitario: number,
  margemLucroPercent: number,
): number {
  const margem = Math.min(Math.max(margemLucroPercent, 0), 95);
  // preço = custo / (1 - margem%)
  return div(custoUnitario, sub(1, div(margem, 100, 6), 6), 2);
}

export function enriquecerReceitas(
  receitas: Receita[],
  receitaItens: ReceitaItem[],
  insumos: Insumo[],
  formasDet: FormaComDetalhes[],
  saldos: SaldosMap,
): ReceitaComDetalhes[] {
  const insumoMap = new Map(insumos.map((i) => [i.id, i]));
  const itensPorReceita = new Map<number, ReceitaItem[]>();
  for (const it of receitaItens) {
    const lista = itensPorReceita.get(it.receitaId);
    if (lista) lista.push(it);
    else itensPorReceita.set(it.receitaId, [it]);
  }

  return receitas
    .map((r) => {
      const itens: ReceitaItemComDetalhes[] = (itensPorReceita.get(r.id) ?? [])
        .map((it) => {
          const ins = insumoMap.get(it.insumoId);
          const custoUnitario = ins?.custoUnitario ?? 0;
          const custoSubtotal = mul(it.quantidade, custoUnitario, 4);
          return {
            ...it,
            insumoNome: ins?.nome ?? `Insumo #${it.insumoId}`,
            unidadeMedida: ins?.unidadeMedida ?? "un",
            custoUnitario,
            custoSubtotal,
            saldoAtual: saldos.get(it.insumoId) ?? 0,
          };
        });

      const custoTotal = soma(itens.map((item) => item.custoSubtotal), 2);
      // Custo por ml mantido em precisão total para as contas por forma.
      const custoPorMlExato =
        r.rendimentoMl > 0 ? new Big(custoTotal).div(r.rendimentoMl) : new Big(0);
      const custoPorMl = arred(custoPorMlExato, 10);

      const simulacaoFormas = formasDet.map((forma) => {
        const unidadesPorLote = div(r.rendimentoMl, forma.volumeMl, 2);
        const custoMassaUnitario = mul(custoPorMlExato, forma.volumeMl, 2);
        const custoFormaUnitario = arred(forma.custoUnitario, 2);
        const custoTotalUnitario = soma([custoMassaUnitario, custoFormaUnitario], 2);
        const precoSugeridoUnitario = calcularPrecoSugerido(
          custoTotalUnitario,
          r.margemLucro,
        );
        const lucroUnitario = sub(precoSugeridoUnitario, custoTotalUnitario, 2);
        return {
          formaId: forma.id,
          formaNome: forma.nome,
          volumeMl: forma.volumeMl,
          unidadesPorLote,
          custoMassaUnitario,
          custoFormaUnitario,
          custoTotalUnitario,
          precoSugeridoUnitario,
          lucroUnitario,
        };
      });

      return {
        ...r,
        itens,
        custoTotal,
        custoPorMl,
        simulacaoFormas,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function calcularNecessidadesOrdem(
  receita: ReceitaComDetalhes,
  forma: FormaComDetalhes,
  quantidadeUnidades: number,
): {
  volumeTotalMl: number;
  fatorEscala: number;
  necessidades: NecessidadeInsumo[];
  custoTotalEstimado: number;
  custoUnitario: number;
  estoqueSuficiente: boolean;
} {
  const volumeTotalMl = mul(quantidadeUnidades, forma.volumeMl, 2);
  const fatorEscala =
    receita.rendimentoMl > 0 ? new Big(volumeTotalMl).div(receita.rendimentoMl) : new Big(0);

  const necessidades: NecessidadeInsumo[] = receita.itens.map((item) => {
    const quantidadeNecessaria = mul(item.quantidade, fatorEscala, 3);
    const falta = Math.max(0, sub(quantidadeNecessaria, item.saldoAtual, 3));
    const custoTotal = mul(quantidadeNecessaria, item.custoUnitario, 2);
    return {
      insumoId: item.insumoId,
      insumoNome: item.insumoNome,
      unidadeMedida: item.unidadeMedida,
      quantidadeNecessaria,
      saldoDisponivel: item.saldoAtual,
      falta,
      custoUnitario: item.custoUnitario,
      custoTotal,
      ehForma: false,
    };
  });

  // Adiciona a própria forma/embalagem como insumo necessário
  const faltaForma = Math.max(0, sub(quantidadeUnidades, forma.saldoAtual, 3));
  necessidades.push({
    insumoId: forma.insumoId,
    insumoNome: forma.insumoNome,
    unidadeMedida: "un",
    quantidadeNecessaria: quantidadeUnidades,
    saldoDisponivel: forma.saldoAtual,
    falta: faltaForma,
    custoUnitario: forma.custoUnitario,
    custoTotal: mul(quantidadeUnidades, forma.custoUnitario, 2),
    ehForma: true,
  });

  const custoTotalEstimado = soma(necessidades.map((n) => n.custoTotal), 2);
  const custoUnitario = div(custoTotalEstimado, quantidadeUnidades, 2);
  const estoqueSuficiente = necessidades.every((n) => n.falta <= 0);

  return {
    volumeTotalMl,
    fatorEscala: arred(fatorEscala, 3),
    necessidades,
    custoTotalEstimado,
    custoUnitario,
    estoqueSuficiente,
  };
}

export function enriquecerOrdens(
  ordens: OrdemProducao[],
  receitasDet: ReceitaComDetalhes[],
  formasDet: FormaComDetalhes[],
): OrdemProducaoComDetalhes[] {
  const receitaMap = new Map(receitasDet.map((r) => [r.id, r]));
  const formaMap = new Map(formasDet.map((f) => [f.id, f]));

  return [...ordens]
    .sort(
      (a, b) =>
        new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime(),
    )
    .map((op) => {
      const receita = receitaMap.get(op.receitaId);
      const forma = formaMap.get(op.formaId);

      if (!receita || !forma) {
        return {
          ...op,
          receitaNome: receita?.nome ?? `Receita #${op.receitaId}`,
          formaNome: forma?.nome ?? `Forma #${op.formaId}`,
          volumeTotalMl: 0,
          fatorEscala: 0,
          custoUnitario: 0,
          necessidades: [],
          estoqueSuficiente: true,
        };
      }

      const calc = calcularNecessidadesOrdem(receita, forma, op.quantidadeUnidades);
      return {
        ...op,
        receitaNome: receita.nome,
        formaNome: forma.nome,
        volumeTotalMl: calc.volumeTotalMl,
        fatorEscala: calc.fatorEscala,
        custoTotalEstimado:
          op.status === "CONCLUIDA" ? op.custoTotalEstimado : calc.custoTotalEstimado,
        custoUnitario:
          op.status === "CONCLUIDA"
            ? div(op.custoTotalEstimado, op.quantidadeUnidades, 2)
            : calc.custoUnitario,
        necessidades: calc.necessidades,
        estoqueSuficiente: ordemAtiva(op.status) ? calc.estoqueSuficiente : true,
      };
    });
}

export function montarDashboardResumo(params: {
  storageMode: "supabase" | "local";
  insumosDet: InsumoComDetalhes[];
  movimentosDet: MovimentoComDetalhes[];
  receitasDet: ReceitaComDetalhes[];
  formasDet: FormaComDetalhes[];
  ordensDet: OrdemProducaoComDetalhes[];
}): DashboardResumo {
  const {
    storageMode,
    insumosDet,
    movimentosDet,
    receitasDet,
    formasDet,
    ordensDet,
  } = params;

  const alertasEstoque = insumosDet
    .filter((i) => i.abaixoMinimo)
    .sort((a, b) => a.saldoAtual - b.saldoAtual);

  const valorTotalEstoque = soma(insumosDet.map((i) => i.valorEmEstoque), 2);

  const ordensPlanejadas = ordensDet.filter((o) => o.status === "PLANEJADA").length;
  const ordensEmProducao = ordensDet.filter((o) => o.status === "EM_PRODUCAO").length;
  const ordensConcluidas = ordensDet.filter((o) => o.status === "CONCLUIDA").length;
  const unidadesProduzidas = ordensDet
    .filter((o) => o.status === "CONCLUIDA")
    .reduce((acc, o) => acc + o.quantidadeUnidades, 0);

  return {
    storageMode,
    totalInsumosAtivos: insumosDet.length,
    insumosAbaixoMinimo: alertasEstoque.length,
    valorTotalEstoque,
    totalReceitas: receitasDet.length,
    totalFormas: formasDet.length,
    ordensPlanejadas,
    ordensEmProducao,
    ordensConcluidas,
    unidadesProduzidas,
    alertasEstoque,
    ultimosMovimentos: movimentosDet.slice(0, 8),
    ordensRecentes: ordensDet.slice(0, 6),
  };
}

/**
 * Custo médio ponderado (CMP) após uma compra:
 *   (saldo × custo atual + quantidade comprada × custo da compra) ÷ (saldo + quantidade).
 * Sem saldo positivo antes da compra, o custo passa a ser o da própria compra.
 */
export function calcularCustoMedioPonderado(
  saldoAntes: number,
  custoAtual: number,
  quantidadeCompra: number,
  custoCompra: number,
): number {
  if (!(saldoAntes > 0)) return arred(custoCompra, 4);
  const valorTotal = new Big(saldoAntes).times(custoAtual).plus(new Big(quantidadeCompra).times(custoCompra));
  return div(valorTotal, new Big(saldoAntes).plus(quantidadeCompra), 4);
}

export interface ItemListaCompras {
  insumoId: number;
  insumoNome: string;
  unidadeMedida: string;
  /** Soma do que as ordens planejadas/em produção vão consumir. */
  necessario: number;
  saldoAtual: number;
  /** Quanto falta comprar (necessário − saldo, nunca negativo). */
  comprar: number;
  custoUnitario: number;
  custoEstimado: number;
}

/**
 * Lista de compras consolidada de todas as ordens ainda não concluídas.
 * Diferente da falta de cada ordem isolada, aqui o estoque é dividido entre
 * as ordens: duas ordens que usam o mesmo insumo somam o consumo.
 */
export function montarListaDeCompras(ordens: OrdemProducaoComDetalhes[]): ItemListaCompras[] {
  const porInsumo = new Map<number, { item: NecessidadeInsumo; total: Big }>();
  for (const ordem of ordens) {
    if (!ordemAtiva(ordem.status)) continue;
    for (const nec of ordem.necessidades) {
      const atual = porInsumo.get(nec.insumoId);
      if (atual) atual.total = atual.total.plus(nec.quantidadeNecessaria);
      else porInsumo.set(nec.insumoId, { item: nec, total: new Big(nec.quantidadeNecessaria) });
    }
  }

  return [...porInsumo.values()]
    .map(({ item, total }) => {
      const necessario = arred(total, 3);
      const comprar = Math.max(0, sub(necessario, item.saldoDisponivel, 3));
      return {
        insumoId: item.insumoId,
        insumoNome: item.insumoNome,
        unidadeMedida: item.unidadeMedida,
        necessario,
        saldoAtual: item.saldoDisponivel,
        comprar,
        custoUnitario: item.custoUnitario,
        custoEstimado: mul(comprar, item.custoUnitario, 2),
      };
    })
    .filter((i) => i.comprar > 0)
    .sort((a, b) => a.insumoNome.localeCompare(b.insumoNome, "pt-BR"));
}
