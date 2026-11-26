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
} from "./types";

export function calcularSaldosMap(
  movimentos: MovimentoEstoque[],
): Map<number, number> {
  const saldos = new Map<number, number>();
  for (const m of movimentos) {
    const atual = saldos.get(m.insumoId) ?? 0;
    const delta =
      m.tipo === "COMPRA" || m.tipo === "AJUSTE_ENTRADA"
        ? m.quantidade
        : -m.quantidade;
    saldos.set(m.insumoId, Number((atual + delta).toFixed(4)));
  }
  return saldos;
}

export function enriquecerInsumos(
  insumos: Insumo[],
  categorias: Categoria[],
  movimentos: MovimentoEstoque[],
): InsumoComDetalhes[] {
  const catMap = new Map(categorias.map((c) => [c.id, c.nome]));
  const saldos = calcularSaldosMap(movimentos);

  return insumos
    .filter((i) => i.ativo)
    .map((insumo) => {
      const saldoAtual = Math.max(0, saldos.get(insumo.id) ?? 0);
      const abaixoMinimo = saldoAtual <= insumo.estoqueMinimo;
      const valorEmEstoque = Number((saldoAtual * insumo.custoUnitario).toFixed(2));
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
        new Date(b.dataMovimento).getTime() - new Date(a.dataMovimento).getTime(),
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
  movimentos: MovimentoEstoque[],
): FormaComDetalhes[] {
  const insumoMap = new Map(insumos.map((i) => [i.id, i]));
  const saldos = calcularSaldosMap(movimentos);

  return formas
    .map((f) => {
      const ins = insumoMap.get(f.insumoId);
      return {
        ...f,
        nome: f.nome || ins?.nome || `Forma #${f.id}`,
        insumoNome: ins?.nome ?? `Insumo #${f.insumoId}`,
        custoUnitario: ins?.custoUnitario ?? 0,
        saldoAtual: Math.max(0, saldos.get(f.insumoId) ?? 0),
      };
    })
    .sort((a, b) => a.volumeMl - b.volumeMl);
}

export function calcularPrecoSugerido(
  custoUnitario: number,
  margemLucroPercent: number,
): number {
  const margem = Math.min(Math.max(margemLucroPercent, 0), 95) / 100;
  if (margem >= 1) return custoUnitario;
  return Number((custoUnitario / (1 - margem)).toFixed(2));
}

export function enriquecerReceitas(
  receitas: Receita[],
  receitaItens: ReceitaItem[],
  insumos: Insumo[],
  formas: Forma[],
  movimentos: MovimentoEstoque[],
): ReceitaComDetalhes[] {
  const insumoMap = new Map(insumos.map((i) => [i.id, i]));
  const saldos = calcularSaldosMap(movimentos);
  const formasDet = enriquecerFormas(formas, insumos, movimentos);

  return receitas
    .map((r) => {
      const itens: ReceitaItemComDetalhes[] = receitaItens
        .filter((it) => it.receitaId === r.id)
        .map((it) => {
          const ins = insumoMap.get(it.insumoId);
          const custoUnitario = ins?.custoUnitario ?? 0;
          const custoSubtotal = Number((it.quantidade * custoUnitario).toFixed(4));
          return {
            ...it,
            insumoNome: ins?.nome ?? `Insumo #${it.insumoId}`,
            unidadeMedida: ins?.unidadeMedida ?? "un",
            custoUnitario,
            custoSubtotal,
            saldoAtual: Math.max(0, saldos.get(it.insumoId) ?? 0),
          };
        });

      const custoTotal = Number(
        itens.reduce((acc, item) => acc + item.custoSubtotal, 0).toFixed(2),
      );
      const custoPorMl = r.rendimentoMl > 0 ? custoTotal / r.rendimentoMl : 0;

      const simulacaoFormas = formasDet.map((forma) => {
        const unidadesPorLote =
          forma.volumeMl > 0
            ? Number((r.rendimentoMl / forma.volumeMl).toFixed(2))
            : 0;
        const custoMassaUnitario = Number((custoPorMl * forma.volumeMl).toFixed(2));
        const custoFormaUnitario = Number(forma.custoUnitario.toFixed(2));
        const custoTotalUnitario = Number(
          (custoMassaUnitario + custoFormaUnitario).toFixed(2),
        );
        const precoSugeridoUnitario = calcularPrecoSugerido(
          custoTotalUnitario,
          r.margemLucro,
        );
        const lucroUnitario = Number(
          (precoSugeridoUnitario - custoTotalUnitario).toFixed(2),
        );
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
  const volumeTotalMl = Number((quantidadeUnidades * forma.volumeMl).toFixed(2));
  const fatorEscala =
    receita.rendimentoMl > 0 ? volumeTotalMl / receita.rendimentoMl : 0;

  const necessidades: NecessidadeInsumo[] = receita.itens.map((item) => {
    const quantidadeNecessaria = Number((item.quantidade * fatorEscala).toFixed(2));
    const falta = Math.max(
      0,
      Number((quantidadeNecessaria - item.saldoAtual).toFixed(2)),
    );
    const custoTotal = Number((quantidadeNecessaria * item.custoUnitario).toFixed(2));
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
  const faltaForma = Math.max(
    0,
    Number((quantidadeUnidades - forma.saldoAtual).toFixed(2)),
  );
  necessidades.push({
    insumoId: forma.insumoId,
    insumoNome: forma.insumoNome,
    unidadeMedida: "un",
    quantidadeNecessaria: quantidadeUnidades,
    saldoDisponivel: forma.saldoAtual,
    falta: faltaForma,
    custoUnitario: forma.custoUnitario,
    custoTotal: Number((quantidadeUnidades * forma.custoUnitario).toFixed(2)),
    ehForma: true,
  });

  const custoTotalEstimado = Number(
    necessidades.reduce((acc, n) => acc + n.custoTotal, 0).toFixed(2),
  );
  const custoUnitario =
    quantidadeUnidades > 0
      ? Number((custoTotalEstimado / quantidadeUnidades).toFixed(2))
      : 0;
  const estoqueSuficiente = necessidades.every((n) => n.falta <= 0);

  return {
    volumeTotalMl,
    fatorEscala: Number(fatorEscala.toFixed(3)),
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
            ? Number((op.custoTotalEstimado / op.quantidadeUnidades).toFixed(2))
            : calc.custoUnitario,
        necessidades: calc.necessidades,
        estoqueSuficiente:
          op.status === "CONCLUIDA" ? true : calc.estoqueSuficiente,
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

  const valorTotalEstoque = Number(
    insumosDet.reduce((acc, i) => acc + i.valorEmEstoque, 0).toFixed(2),
  );

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
