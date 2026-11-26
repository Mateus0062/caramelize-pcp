import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, type Db, type Tx } from "../db/client";
import * as t from "../db/schema";
import { DomainError } from "./errors";
import { formatQty, hojeISO } from "./format";
import {
  calcularCustoMedioPonderado,
  calcularNecessidadesOrdem,
  enriquecerFormas,
  enriquecerInsumos,
  enriquecerMovimentos,
  enriquecerOrdens,
  enriquecerReceitas,
  montarDashboardResumo,
  validarTransicaoStatus,
  type SaldosMap,
} from "./pcp-engine";
import { hasDatabaseUrl } from "./pg";
import type {
  Categoria,
  DashboardResumo,
  Forma,
  FormaComDetalhes,
  Insumo,
  InsumoComDetalhes,
  MovimentoComDetalhes,
  MovimentoEstoque,
  OrdemProducao,
  OrdemProducaoComDetalhes,
  Receita,
  ReceitaComDetalhes,
  ReceitaItem,
  StatusOrdemProducao,
  TipoMovimento,
} from "./types";

/**
 * Regras de negócio e acesso a dados do PCP (Drizzle ORM).
 * O mesmo código atende o Supabase e o banco local (PGlite) — ver db/client.ts.
 */

/** Quantos movimentos recentes a tela carrega de início (o resto vem paginado). */
export const MOVIMENTOS_POR_PAGINA = 200;

const MSG_ORDEM_ALTERADA =
  "Esta ordem foi alterada por outra ação ao mesmo tempo. Atualize a página e tente novamente.";
const MSG_CATEGORIA_EM_USO =
  "Esta categoria possui insumos (inclusive arquivados) e não pode ser excluída.";

export function getStorageMode(): "supabase" | "local" {
  return hasDatabaseUrl() ? "supabase" : "local";
}

/**
 * Data prevista é uma data de calendário ("AAAA-MM-DD"). Gravamos ao
 * meio-dia UTC daquele dia: assim nenhum fuso horário a empurra para o dia
 * anterior ou seguinte. Sem data informada, usa hoje no fuso da operação.
 */
function normalizarDataPrevista(valor?: string): Date {
  const dia = valor?.trim() || hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new DomainError("Data prevista inválida. Use o formato AAAA-MM-DD.");
  }
  const date = new Date(`${dia}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dia) {
    throw new DomainError("Data prevista inválida.");
  }
  return date;
}

// ============================================================================
// CONVERSÃO LINHA → MODELO
// ============================================================================
const iso = (d: Date | null | undefined): string => (d ?? new Date(0)).toISOString();

function mapCategoria(r: typeof t.categoria.$inferSelect): Categoria {
  return { id: r.id, nome: r.nome, dataAtualizacao: iso(r.dataAtualizacao) };
}

function mapInsumo(r: typeof t.insumo.$inferSelect): Insumo {
  return {
    id: r.id,
    nome: r.nome,
    unidadeMedida: r.unidadeMedida,
    estoqueMinimo: r.estoqueMinimo,
    custoUnitario: r.custoUnitario,
    dataAtualizacao: iso(r.dataAtualizacao),
    categoriaId: r.categoriaId,
    ativo: r.ativo,
  };
}

function mapMovimento(r: typeof t.movimentoEstoque.$inferSelect): MovimentoEstoque {
  return {
    id: r.id,
    quantidade: r.quantidade,
    tipo: r.tipo,
    custoUnitario: r.custoUnitario ?? null,
    dataMovimento: iso(r.dataMovimento),
    dataRegistro: iso(r.dataRegistro),
    observacao: r.observacao ?? null,
    insumoId: r.insumoId,
  };
}

function mapForma(r: typeof t.forma.$inferSelect): Forma {
  return { id: r.id, nome: r.nome ?? "", volumeMl: r.volumeMl, insumoId: r.insumoId };
}

function mapReceita(r: typeof t.receita.$inferSelect): Receita {
  return {
    id: r.id,
    nome: r.nome,
    descricao: r.descricao ?? null,
    rendimentoMl: r.rendimentoMl,
    margemLucro: r.margemLucro,
    dataAtualizacao: iso(r.dataAtualizacao),
  };
}

function mapReceitaItem(r: typeof t.receitaItem.$inferSelect): ReceitaItem {
  return { id: r.id, receitaId: r.receitaId, insumoId: r.insumoId, quantidade: r.quantidade };
}

function mapOrdem(r: typeof t.ordemProducao.$inferSelect): OrdemProducao {
  return {
    id: r.id,
    receitaId: r.receitaId,
    formaId: r.formaId,
    quantidadeUnidades: r.quantidadeUnidades,
    status: r.status,
    custoTotalEstimado: r.custoTotalEstimado,
    precoVendaUnitario: r.precoVendaUnitario ?? null,
    observacao: r.observacao ?? null,
    dataPrevista: iso(r.dataPrevista),
    dataCriacao: iso(r.dataCriacao),
    dataConclusao: r.dataConclusao ? r.dataConclusao.toISOString() : null,
  };
}

// ============================================================================
// SALDOS (somados pelo banco)
// ============================================================================
const deltaSaldo = sql`CASE WHEN ${t.movimentoEstoque.tipo} IN ('COMPRA', 'AJUSTE_ENTRADA')
  THEN ${t.movimentoEstoque.quantidade} ELSE -${t.movimentoEstoque.quantidade} END`;

async function saldoDoInsumo(executor: Db | Tx, insumoId: number): Promise<number> {
  const [r] = await executor
    .select({ saldo: sql<string | null>`SUM(${deltaSaldo})` })
    .from(t.movimentoEstoque)
    .where(eq(t.movimentoEstoque.insumoId, insumoId));
  return Number(r?.saldo ?? 0);
}

// ============================================================================
// LEITURA (snapshot)
// ============================================================================
interface Snapshot {
  categorias: Categoria[];
  insumos: Insumo[];
  formas: Forma[];
  receitas: Receita[];
  receitaItens: ReceitaItem[];
  ordensProducao: OrdemProducao[];
  saldos: SaldosMap;
  movimentosRecentes: MovimentoEstoque[];
  totalMovimentos: number;
}

/**
 * Carrega cadastros, saldos e (opcionalmente) os movimentos mais recentes.
 * O histórico de movimentos NÃO é transferido inteiro: o banco devolve só o
 * saldo e a contagem de cada insumo.
 */
async function loadSnapshot(limiteMovimentos = 0): Promise<Snapshot> {
  const db = await getDb();
  const [cats, ins, fms, recs, itens, ops, saldoRows, movs] = await Promise.all([
    db.select().from(t.categoria).orderBy(t.categoria.nome),
    db.select().from(t.insumo),
    db.select().from(t.forma),
    db.select().from(t.receita),
    db.select().from(t.receitaItem),
    db.select().from(t.ordemProducao),
    db
      .select({
        insumoId: t.movimentoEstoque.insumoId,
        saldo: sql<string>`SUM(${deltaSaldo})`,
        qtd: sql<number>`COUNT(*)::int`,
      })
      .from(t.movimentoEstoque)
      .groupBy(t.movimentoEstoque.insumoId),
    limiteMovimentos > 0
      ? db
          .select()
          .from(t.movimentoEstoque)
          .orderBy(desc(t.movimentoEstoque.dataMovimento), desc(t.movimentoEstoque.id))
          .limit(limiteMovimentos)
      : Promise.resolve([] as (typeof t.movimentoEstoque.$inferSelect)[]),
  ]);

  const saldos: SaldosMap = new Map();
  let totalMovimentos = 0;
  for (const r of saldoRows) {
    saldos.set(r.insumoId, Number(r.saldo));
    totalMovimentos += Number(r.qtd);
  }

  return {
    categorias: cats.map(mapCategoria),
    insumos: ins.map(mapInsumo),
    formas: fms.map(mapForma),
    receitas: recs.map(mapReceita),
    receitaItens: itens.map(mapReceitaItem),
    ordensProducao: ops.map(mapOrdem),
    saldos,
    movimentosRecentes: movs.map(mapMovimento),
    totalMovimentos,
  };
}

/** Calcula formas, receitas e ordens detalhadas uma única vez por snapshot. */
function detalhar(s: Snapshot) {
  const formasDet = enriquecerFormas(s.formas, s.insumos, s.saldos);
  const receitasDet = enriquecerReceitas(s.receitas, s.receitaItens, s.insumos, formasDet, s.saldos);
  const ordensDet = enriquecerOrdens(s.ordensProducao, receitasDet, formasDet);
  return { formasDet, receitasDet, ordensDet };
}

function ordenarCategorias(categorias: Categoria[]): Categoria[] {
  return [...categorias].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ============================================================================
// VALIDAÇÕES COMPARTILHADAS (mensagens claras em vez de erros de chave estrangeira)
// ============================================================================
async function assertCategoriaExiste(executor: Db | Tx, categoriaId: number): Promise<void> {
  const r = await executor
    .select({ id: t.categoria.id })
    .from(t.categoria)
    .where(eq(t.categoria.id, categoriaId))
    .limit(1);
  if (!r.length) throw new DomainError("Categoria não encontrada.");
}

function assertSaldoSuficiente(nome: string, unidade: string, saldo: number, quantidade: number): void {
  if (quantidade > saldo + 1e-9) {
    throw new DomainError(
      `Saldo insuficiente de ${nome}: disponível ${formatQty(saldo, unidade)}. ` +
        "Registre a compra ou um ajuste de entrada antes da saída.",
    );
  }
}

async function assertInsumosAtivos(executor: Db | Tx, insumoIds: number[]): Promise<void> {
  const ids = [...new Set(insumoIds)];
  const r = await executor
    .select({ id: t.insumo.id })
    .from(t.insumo)
    .where(and(inArray(t.insumo.id, ids), eq(t.insumo.ativo, true)));
  if (r.length !== ids.length) {
    throw new DomainError("A receita usa um insumo que não existe ou foi arquivado.");
  }
}

// ============================================================================
// DASHBOARD E CARGA COMPLETA DA TELA
// ============================================================================
function montarDashboard(
  insumosDet: InsumoComDetalhes[],
  movimentosDet: MovimentoComDetalhes[],
  det: ReturnType<typeof detalhar>,
): DashboardResumo {
  return montarDashboardResumo({
    storageMode: getStorageMode(),
    insumosDet,
    movimentosDet,
    receitasDet: det.receitasDet,
    formasDet: det.formasDet,
    ordensDet: det.ordensDet,
  });
}

export async function getDashboard(): Promise<DashboardResumo> {
  const s = await loadSnapshot(8);
  const insumosDet = enriquecerInsumos(s.insumos, s.categorias, s.saldos);
  const movimentosDet = enriquecerMovimentos(s.movimentosRecentes, s.insumos);
  return montarDashboard(insumosDet, movimentosDet, detalhar(s));
}

export interface PainelCompleto {
  dashboard: DashboardResumo;
  categorias: Categoria[];
  insumos: InsumoComDetalhes[];
  movimentos: MovimentoComDetalhes[];
  totalMovimentos: number;
  formas: FormaComDetalhes[];
  receitas: ReceitaComDetalhes[];
  ordens: OrdemProducaoComDetalhes[];
}

/** Tudo o que a tela principal precisa, numa única leitura do banco. */
export async function getPainelCompleto(): Promise<PainelCompleto> {
  const s = await loadSnapshot(MOVIMENTOS_POR_PAGINA);
  const insumosDet = enriquecerInsumos(s.insumos, s.categorias, s.saldos);
  const movimentosDet = enriquecerMovimentos(s.movimentosRecentes, s.insumos);
  const det = detalhar(s);
  return {
    dashboard: montarDashboard(insumosDet, movimentosDet, det),
    categorias: ordenarCategorias(s.categorias),
    insumos: insumosDet,
    movimentos: movimentosDet,
    totalMovimentos: s.totalMovimentos,
    formas: det.formasDet,
    receitas: det.receitasDet,
    ordens: det.ordensDet,
  };
}

// ============================================================================
// CATEGORIAS
// ============================================================================
export async function listCategorias(): Promise<Categoria[]> {
  const db = await getDb();
  return ordenarCategorias((await db.select().from(t.categoria)).map(mapCategoria));
}

export async function createCategoria(nome: string): Promise<Categoria> {
  const db = await getDb();
  const [r] = await db.insert(t.categoria).values({ nome: nome.trim() }).returning();
  return mapCategoria(r);
}

export async function deleteCategoria(id: number): Promise<void> {
  const db = await getDb();
  // Insumos arquivados também apontam para a categoria.
  const emUso = await db
    .select({ id: t.insumo.id })
    .from(t.insumo)
    .where(eq(t.insumo.categoriaId, id))
    .limit(1);
  if (emUso.length) throw new DomainError(MSG_CATEGORIA_EM_USO);
  const res = await db.delete(t.categoria).where(eq(t.categoria.id, id)).returning({ id: t.categoria.id });
  if (!res.length) throw new DomainError("Categoria não encontrada.");
}

// ============================================================================
// INSUMOS
// ============================================================================
export async function listInsumos(): Promise<InsumoComDetalhes[]> {
  const s = await loadSnapshot();
  return enriquecerInsumos(s.insumos, s.categorias, s.saldos);
}

export async function createInsumo(input: {
  nome: string;
  unidadeMedida: string;
  estoqueMinimo: number;
  custoUnitario: number;
  categoriaId: number;
  estoqueInicial?: number;
}): Promise<Insumo> {
  const db = await getDb();
  await assertCategoriaExiste(db, input.categoriaId);

  // Insumo + estoque inicial na mesma transação: ou grava os dois, ou nenhum.
  const row = await db.transaction(async (tx) => {
    const [ins] = await tx
      .insert(t.insumo)
      .values({
        nome: input.nome.trim(),
        unidadeMedida: input.unidadeMedida.trim(),
        estoqueMinimo: input.estoqueMinimo,
        custoUnitario: input.custoUnitario,
        categoriaId: input.categoriaId,
        ativo: true,
      })
      .returning();
    if (input.estoqueInicial && input.estoqueInicial > 0) {
      await tx.insert(t.movimentoEstoque).values({
        quantidade: input.estoqueInicial,
        tipo: "COMPRA",
        custoUnitario: input.custoUnitario,
        observacao: "Estoque inicial no cadastro",
        insumoId: ins.id,
      });
    }
    return ins;
  });
  return mapInsumo(row);
}

export async function updateInsumo(
  id: number,
  input: {
    nome: string;
    unidadeMedida: string;
    estoqueMinimo: number;
    custoUnitario: number;
    categoriaId: number;
  },
): Promise<Insumo> {
  const db = await getDb();
  await assertCategoriaExiste(db, input.categoriaId);
  const [r] = await db
    .update(t.insumo)
    .set({
      nome: input.nome.trim(),
      unidadeMedida: input.unidadeMedida.trim(),
      estoqueMinimo: input.estoqueMinimo,
      custoUnitario: input.custoUnitario,
      categoriaId: input.categoriaId,
      dataAtualizacao: new Date(),
    })
    .where(eq(t.insumo.id, id))
    .returning();
  if (!r) throw new DomainError("Insumo não encontrado.");
  return mapInsumo(r);
}

export async function deleteInsumo(id: number): Promise<void> {
  const db = await getDb();
  const existe = await db.select({ id: t.insumo.id }).from(t.insumo).where(eq(t.insumo.id, id)).limit(1);
  if (!existe.length) throw new DomainError("Insumo não encontrado.");

  const emReceita = await db
    .select({ id: t.receitaItem.id })
    .from(t.receitaItem)
    .where(eq(t.receitaItem.insumoId, id))
    .limit(1);
  if (emReceita.length) {
    throw new DomainError("Este insumo faz parte de uma receita. Remova-o da receita antes de excluir.");
  }

  const forma = await db
    .select({ nome: t.forma.nome })
    .from(t.forma)
    .where(eq(t.forma.insumoId, id))
    .limit(1);
  if (forma.length) {
    throw new DomainError(
      `Este insumo é a embalagem da forma "${forma[0].nome ?? ""}". Exclua a forma antes.`,
    );
  }

  const temMovimento = await db
    .select({ id: t.movimentoEstoque.id })
    .from(t.movimentoEstoque)
    .where(eq(t.movimentoEstoque.insumoId, id))
    .limit(1);
  if (temMovimento.length) {
    // Com histórico, o insumo é arquivado em vez de apagado.
    await db.update(t.insumo).set({ ativo: false }).where(eq(t.insumo.id, id));
  } else {
    await db.delete(t.insumo).where(eq(t.insumo.id, id));
  }
}

// ============================================================================
// MOVIMENTOS DE ESTOQUE
// ============================================================================
/** Histórico paginado, do mais recente para o mais antigo. */
export async function listMovimentos(
  opcoes: { limite?: number; deslocamento?: number } = {},
): Promise<MovimentoComDetalhes[]> {
  const limite = Math.min(Math.max(opcoes.limite ?? MOVIMENTOS_POR_PAGINA, 1), 1000);
  const deslocamento = Math.max(opcoes.deslocamento ?? 0, 0);
  const db = await getDb();
  const [movs, ins] = await Promise.all([
    db
      .select()
      .from(t.movimentoEstoque)
      .orderBy(desc(t.movimentoEstoque.dataMovimento), desc(t.movimentoEstoque.id))
      .limit(limite)
      .offset(deslocamento),
    db.select().from(t.insumo),
  ]);
  return enriquecerMovimentos(movs.map(mapMovimento), ins.map(mapInsumo));
}

export type MetodoCusto = "MEDIO" | "ULTIMO";

export async function createMovimento(input: {
  insumoId: number;
  quantidade: number;
  tipo: TipoMovimento;
  custoUnitario?: number | null;
  observacao?: string | null;
  atualizarPrecoInsumo?: boolean;
  /** Como atualizar o custo do insumo numa compra: médio ponderado (padrão) ou último preço. */
  metodoCusto?: MetodoCusto;
}): Promise<MovimentoEstoque & { novoCustoInsumo?: number }> {
  const db = await getDb();
  const ehSaida = input.tipo === "AJUSTE_SAIDA" || input.tipo === "PRODUCAO";

  return db.transaction(async (tx) => {
    // FOR UPDATE: duas operações simultâneas no mesmo insumo são processadas
    // em fila, então a checagem de saldo e o custo médio não são furados.
    const [ins] = await tx.select().from(t.insumo).where(eq(t.insumo.id, input.insumoId)).for("update");
    if (!ins || !ins.ativo) throw new DomainError("Insumo não encontrado ou arquivado.");

    const saldoAntes = await saldoDoInsumo(tx, ins.id);
    if (ehSaida) assertSaldoSuficiente(ins.nome, ins.unidadeMedida, saldoAntes, input.quantidade);

    const [mov] = await tx
      .insert(t.movimentoEstoque)
      .values({
        quantidade: input.quantidade,
        tipo: input.tipo,
        // Sem custo informado, registra o custo atual do insumo.
        custoUnitario: input.custoUnitario ?? ins.custoUnitario,
        observacao: input.observacao?.trim() || null,
        insumoId: ins.id,
      })
      .returning();

    let novoCustoInsumo: number | undefined;
    if (
      input.tipo === "COMPRA" &&
      input.atualizarPrecoInsumo &&
      input.custoUnitario != null &&
      input.custoUnitario >= 0
    ) {
      novoCustoInsumo =
        input.metodoCusto === "ULTIMO"
          ? input.custoUnitario
          : calcularCustoMedioPonderado(saldoAntes, ins.custoUnitario, input.quantidade, input.custoUnitario);
      await tx
        .update(t.insumo)
        .set({ custoUnitario: novoCustoInsumo, dataAtualizacao: new Date() })
        .where(eq(t.insumo.id, ins.id));
    }

    return { ...mapMovimento(mov), novoCustoInsumo };
  });
}

// ============================================================================
// FORMAS
// ============================================================================
export async function listFormas(): Promise<FormaComDetalhes[]> {
  const s = await loadSnapshot();
  return enriquecerFormas(s.formas, s.insumos, s.saldos);
}

export async function createForma(input: {
  nome: string;
  volumeMl: number;
  insumoId: number;
}): Promise<Forma> {
  const db = await getDb();
  const ins = await db
    .select({ id: t.insumo.id })
    .from(t.insumo)
    .where(and(eq(t.insumo.id, input.insumoId), eq(t.insumo.ativo, true)))
    .limit(1);
  if (!ins.length) throw new DomainError("Insumo da embalagem não encontrado ou arquivado.");

  const jaVinculado = await db
    .select({ id: t.forma.id })
    .from(t.forma)
    .where(eq(t.forma.insumoId, input.insumoId))
    .limit(1);
  if (jaVinculado.length) throw new DomainError("Este insumo já está vinculado a uma forma.");

  const [r] = await db
    .insert(t.forma)
    .values({ nome: input.nome.trim(), volumeMl: input.volumeMl, insumoId: input.insumoId })
    .returning();
  return mapForma(r);
}

export async function deleteForma(id: number): Promise<void> {
  const db = await getDb();
  const emUso = await db
    .select({ id: t.ordemProducao.id })
    .from(t.ordemProducao)
    .where(eq(t.ordemProducao.formaId, id))
    .limit(1);
  if (emUso.length) {
    throw new DomainError("Esta forma já possui ordens de produção vinculadas e não pode ser excluída.");
  }
  const res = await db.delete(t.forma).where(eq(t.forma.id, id)).returning({ id: t.forma.id });
  if (!res.length) throw new DomainError("Forma não encontrada.");
}

// ============================================================================
// RECEITAS
// ============================================================================
export async function listReceitas(): Promise<ReceitaComDetalhes[]> {
  return detalhar(await loadSnapshot()).receitasDet;
}

interface ReceitaInput {
  nome: string;
  descricao?: string | null;
  rendimentoMl: number;
  margemLucro: number;
  itens: Array<{ insumoId: number; quantidade: number }>;
}

function valoresReceita(input: ReceitaInput) {
  return {
    nome: input.nome.trim(),
    descricao: input.descricao?.trim() || null,
    rendimentoMl: input.rendimentoMl,
    margemLucro: input.margemLucro,
  };
}

export async function createReceita(input: ReceitaInput): Promise<Receita> {
  const db = await getDb();
  await assertInsumosAtivos(db, input.itens.map((it) => it.insumoId));
  const row = await db.transaction(async (tx) => {
    const [rec] = await tx.insert(t.receita).values(valoresReceita(input)).returning();
    await tx
      .insert(t.receitaItem)
      .values(input.itens.map((it) => ({ receitaId: rec.id, insumoId: it.insumoId, quantidade: it.quantidade })));
    return rec;
  });
  return mapReceita(row);
}

export async function updateReceita(id: number, input: ReceitaInput): Promise<Receita> {
  const db = await getDb();
  await assertInsumosAtivos(db, input.itens.map((it) => it.insumoId));
  const row = await db.transaction(async (tx) => {
    const [rec] = await tx
      .update(t.receita)
      .set({ ...valoresReceita(input), dataAtualizacao: new Date() })
      .where(eq(t.receita.id, id))
      .returning();
    if (!rec) throw new DomainError("Receita não encontrada.");
    await tx.delete(t.receitaItem).where(eq(t.receitaItem.receitaId, id));
    await tx
      .insert(t.receitaItem)
      .values(input.itens.map((it) => ({ receitaId: id, insumoId: it.insumoId, quantidade: it.quantidade })));
    return rec;
  });
  return mapReceita(row);
}

export async function deleteReceita(id: number): Promise<void> {
  const db = await getDb();
  const emUso = await db
    .select({ id: t.ordemProducao.id })
    .from(t.ordemProducao)
    .where(eq(t.ordemProducao.receitaId, id))
    .limit(1);
  if (emUso.length) {
    throw new DomainError("Esta receita possui ordens de produção vinculadas e não pode ser excluída.");
  }
  // Os itens da receita saem junto (ON DELETE CASCADE).
  const res = await db.delete(t.receita).where(eq(t.receita.id, id)).returning({ id: t.receita.id });
  if (!res.length) throw new DomainError("Receita não encontrada.");
}

// ============================================================================
// ORDENS DE PRODUÇÃO (PCP)
// ============================================================================
export async function listOrdensProducao(): Promise<OrdemProducaoComDetalhes[]> {
  return detalhar(await loadSnapshot()).ordensDet;
}

export async function createOrdemProducao(input: {
  receitaId: number;
  formaId: number;
  quantidadeUnidades: number;
  precoVendaUnitario?: number | null;
  observacao?: string | null;
  dataPrevista?: string;
}): Promise<OrdemProducao> {
  const { formasDet, receitasDet } = detalhar(await loadSnapshot());
  const receita = receitasDet.find((r) => r.id === input.receitaId);
  const forma = formasDet.find((f) => f.id === input.formaId);
  if (!receita) throw new DomainError("Receita não encontrada.");
  if (!forma) throw new DomainError("Forma não encontrada.");

  const calc = calcularNecessidadesOrdem(receita, forma, input.quantidadeUnidades);
  const db = await getDb();
  const [r] = await db
    .insert(t.ordemProducao)
    .values({
      receitaId: input.receitaId,
      formaId: input.formaId,
      quantidadeUnidades: input.quantidadeUnidades,
      status: "PLANEJADA",
      custoTotalEstimado: calc.custoTotalEstimado,
      precoVendaUnitario: input.precoVendaUnitario ?? null,
      observacao: input.observacao?.trim() || null,
      dataPrevista: normalizarDataPrevista(input.dataPrevista),
    })
    .returning();
  return mapOrdem(r);
}

export async function updateOrdemProducaoStatus(
  id: number,
  novoStatus: StatusOrdemProducao,
  permitirEstoqueNegativo = false,
): Promise<OrdemProducao> {
  const { ordensDet } = detalhar(await loadSnapshot());
  const ordem = ordensDet.find((o) => o.id === id);
  if (!ordem) throw new DomainError("Ordem de produção não encontrada.");

  const statusLido = ordem.status;
  const erroTransicao = validarTransicaoStatus(statusLido, novoStatus);
  if (erroTransicao) throw new DomainError(erroTransicao);

  if (novoStatus === "CONCLUIDA" && !ordem.estoqueSuficiente && !permitirEstoqueNegativo) {
    throw new DomainError(
      "Estoque insuficiente para concluir esta ordem. Reponha os insumos faltantes ou confirme a baixa forçada.",
    );
  }

  const db = await getDb();
  const row = await db.transaction(async (tx) => {
    const concluir = novoStatus === "CONCLUIDA";
    // Atualização condicional: só muda se o status ainda for o que lemos.
    // Duas requisições simultâneas para concluir a mesma ordem → só uma vence.
    const [atualizada] = await tx
      .update(t.ordemProducao)
      .set(
        concluir
          ? { status: novoStatus, custoTotalEstimado: ordem.custoTotalEstimado, dataConclusao: new Date() }
          : { status: novoStatus },
      )
      .where(and(eq(t.ordemProducao.id, id), eq(t.ordemProducao.status, statusLido)))
      .returning();
    if (!atualizada) throw new DomainError(MSG_ORDEM_ALTERADA);

    if (concluir) {
      const baixas = ordem.necessidades
        .filter((nec) => nec.quantidadeNecessaria > 0)
        .map((nec) => ({
          quantidade: nec.quantidadeNecessaria,
          tipo: "PRODUCAO" as const,
          custoUnitario: nec.custoUnitario,
          observacao: `Baixa automática — OP #${ordem.id} (${ordem.quantidadeUnidades}x ${ordem.formaNome})`,
          insumoId: nec.insumoId,
        }));
      if (baixas.length) await tx.insert(t.movimentoEstoque).values(baixas);
    }
    return atualizada;
  });
  return mapOrdem(row);
}

export async function deleteOrdemProducao(id: number): Promise<void> {
  const db = await getDb();
  // Exclusão condicional: se a ordem for concluída no mesmo instante, não apaga.
  const res = await db
    .delete(t.ordemProducao)
    .where(and(eq(t.ordemProducao.id, id), ne(t.ordemProducao.status, "CONCLUIDA")))
    .returning({ id: t.ordemProducao.id });
  if (!res.length) {
    const existe = await db
      .select({ id: t.ordemProducao.id })
      .from(t.ordemProducao)
      .where(eq(t.ordemProducao.id, id))
      .limit(1);
    if (!existe.length) throw new DomainError("Ordem de produção não encontrada.");
    throw new DomainError("Não é possível excluir uma ordem já concluída.");
  }
}
