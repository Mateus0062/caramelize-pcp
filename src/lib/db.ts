import fs from "node:fs";
import path from "node:path";
import { DomainError } from "./errors";
import { formatQty, hojeISO } from "./format";
import { assertLocalModeAllowed, writeJsonAtomic } from "./local-store";
import {
  calcularNecessidadesOrdem,
  calcularSaldosMap,
  enriquecerFormas,
  enriquecerInsumos,
  enriquecerMovimentos,
  enriquecerOrdens,
  enriquecerReceitas,
  montarDashboardResumo,
  validarTransicaoStatus,
} from "./pcp-engine";
import { getPool, hasDatabaseUrl, withTransaction } from "./pg";
import { createSeedData, type LocalDbSchema } from "./seed";
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

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "caramelize-db.json");

const MSG_ORDEM_ALTERADA =
  "Esta ordem foi alterada por outra ação ao mesmo tempo. Atualize a página e tente novamente.";

/**
 * Data prevista é uma data de calendário ("AAAA-MM-DD"). Gravamos ao
 * meio-dia UTC daquele dia: assim nenhum fuso horário a empurra para o dia
 * anterior ou seguinte. Sem data informada, usa hoje no fuso da operação.
 */
function normalizarDataPrevista(valor?: string): string {
  const dia = valor?.trim() || hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new DomainError("Data prevista inválida. Use o formato AAAA-MM-DD.");
  }
  const date = new Date(`${dia}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dia) {
    throw new DomainError("Data prevista inválida.");
  }
  return date.toISOString();
}

export function getStorageMode(): "supabase" | "local" {
  return hasDatabaseUrl() ? "supabase" : "local";
}

/*
 * Modo local: cada operação lê o arquivo, altera e grava de volta sem nenhum
 * `await` no meio — o Node executa esse trecho inteiro antes de atender outra
 * requisição, então duas operações não se sobrepõem dentro do mesmo processo.
 */
function readLocalDb(): LocalDbSchema {
  assertLocalModeAllowed();
  if (!fs.existsSync(DATA_FILE)) {
    const seed = createSeedData();
    writeJsonAtomic(DATA_FILE, seed);
    return seed;
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as LocalDbSchema;
}

function writeLocalDb(db: LocalDbSchema): void {
  assertLocalModeAllowed();
  writeJsonAtomic(DATA_FILE, db);
}

async function loadAllData(): Promise<{
  categorias: Categoria[];
  insumos: Insumo[];
  movimentos: MovimentoEstoque[];
  formas: Forma[];
  receitas: Receita[];
  receitaItens: ReceitaItem[];
  ordensProducao: OrdemProducao[];
}> {
  if (!hasDatabaseUrl()) {
    const local = readLocalDb();
    return {
      categorias: local.categorias,
      insumos: local.insumos,
      movimentos: local.movimentos,
      formas: local.formas,
      receitas: local.receitas,
      receitaItens: local.receitaItens,
      ordensProducao: local.ordensProducao,
    };
  }

  const pool = getPool();
  const [catRes, insRes, movRes, formRes, recRes, itemRes, opRes] =
    await Promise.all([
      pool.query("SELECT id, nome, data_atualizacao FROM categoria ORDER BY nome"),
      pool.query(
        "SELECT id, nome, unidade_medida, estoque_minimo, custo_unitario, data_atualizacao, categoria_id, ativo FROM insumo",
      ),
      pool.query(
        "SELECT id, quantidade, tipo, custo_unitario, data_movimento, data_registro, observacao, insumo_id FROM movimento_estoque",
      ),
      pool.query("SELECT id, nome, volume_ml, insumo_id FROM forma"),
      pool.query(
        "SELECT id, nome, descricao, rendimento_ml, margem_lucro, data_atualizacao FROM receita",
      ),
      pool.query(
        "SELECT id, receita_id, insumo_id, quantidade FROM receita_item",
      ),
      pool.query(
        "SELECT id, receita_id, forma_id, quantidade_unidades, status, custo_total_estimado, preco_venda_unitario, observacao, data_prevista, data_criacao, data_conclusao FROM ordem_producao",
      ),
    ]);

  return {
    categorias: catRes.rows.map((r) => ({
      id: Number(r.id),
      nome: r.nome,
      dataAtualizacao: new Date(r.data_atualizacao).toISOString(),
    })),
    insumos: insRes.rows.map((r) => ({
      id: Number(r.id),
      nome: r.nome,
      unidadeMedida: r.unidade_medida,
      estoqueMinimo: Number(r.estoque_minimo ?? 0),
      custoUnitario: Number(r.custo_unitario ?? 0),
      dataAtualizacao: new Date(r.data_atualizacao).toISOString(),
      categoriaId: Number(r.categoria_id),
      ativo: Boolean(r.ativo),
    })),
    movimentos: movRes.rows.map((r) => ({
      id: Number(r.id),
      quantidade: Number(r.quantidade),
      tipo: r.tipo as TipoMovimento,
      custoUnitario: r.custo_unitario != null ? Number(r.custo_unitario) : null,
      dataMovimento: new Date(r.data_movimento).toISOString(),
      dataRegistro: new Date(r.data_registro).toISOString(),
      observacao: r.observacao ?? null,
      insumoId: Number(r.insumo_id),
    })),
    formas: formRes.rows.map((r) => ({
      id: Number(r.id),
      nome: r.nome ?? "",
      volumeMl: Number(r.volume_ml),
      insumoId: Number(r.insumo_id),
    })),
    receitas: recRes.rows.map((r) => ({
      id: Number(r.id),
      nome: r.nome,
      descricao: r.descricao ?? null,
      rendimentoMl: Number(r.rendimento_ml),
      margemLucro: Number(r.margem_lucro ?? 65),
      dataAtualizacao: new Date(r.data_atualizacao).toISOString(),
    })),
    receitaItens: itemRes.rows.map((r) => ({
      id: Number(r.id),
      receitaId: Number(r.receita_id),
      insumoId: Number(r.insumo_id),
      quantidade: Number(r.quantidade),
    })),
    ordensProducao: opRes.rows.map((r) => ({
      id: Number(r.id),
      receitaId: Number(r.receita_id),
      formaId: Number(r.forma_id),
      quantidadeUnidades: Number(r.quantidade_unidades),
      status: r.status as StatusOrdemProducao,
      custoTotalEstimado: Number(r.custo_total_estimado ?? 0),
      precoVendaUnitario:
        r.preco_venda_unitario != null ? Number(r.preco_venda_unitario) : null,
      observacao: r.observacao ?? null,
      dataPrevista: new Date(r.data_prevista).toISOString(),
      dataCriacao: new Date(r.data_criacao).toISOString(),
      dataConclusao: r.data_conclusao
        ? new Date(r.data_conclusao).toISOString()
        : null,
    })),
  };
}

// ============================================================================
// DASHBOARD
// ============================================================================
export async function getDashboard(): Promise<DashboardResumo> {
  const data = await loadAllData();
  const insumosDet = enriquecerInsumos(
    data.insumos,
    data.categorias,
    data.movimentos,
  );
  const movimentosDet = enriquecerMovimentos(data.movimentos, data.insumos);
  const formasDet = enriquecerFormas(data.formas, data.insumos, data.movimentos);
  const receitasDet = enriquecerReceitas(
    data.receitas,
    data.receitaItens,
    data.insumos,
    data.formas,
    data.movimentos,
  );
  const ordensDet = enriquecerOrdens(data.ordensProducao, receitasDet, formasDet);

  return montarDashboardResumo({
    storageMode: getStorageMode(),
    insumosDet,
    movimentosDet,
    receitasDet,
    formasDet,
    ordensDet,
  });
}

// ============================================================================
// VALIDAÇÕES COMPARTILHADAS (mensagens claras em vez de erros de chave estrangeira)
// ============================================================================
async function assertCategoriaExiste(categoriaId: number): Promise<void> {
  const res = await getPool().query("SELECT 1 FROM categoria WHERE id = $1", [categoriaId]);
  if (!res.rowCount) throw new DomainError("Categoria não encontrada.");
}

function assertSaldoSuficiente(
  nome: string,
  unidade: string,
  saldo: number,
  quantidade: number,
): void {
  if (quantidade > saldo + 1e-9) {
    throw new DomainError(
      `Saldo insuficiente de ${nome}: disponível ${formatQty(saldo, unidade)}. ` +
        "Registre a compra ou um ajuste de entrada antes da saída.",
    );
  }
}

async function assertInsumosAtivos(insumoIds: number[]): Promise<void> {
  const ids = [...new Set(insumoIds)];
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const ativos = new Set(db.insumos.filter((i) => i.ativo).map((i) => i.id));
    if (ids.some((id) => !ativos.has(id))) {
      throw new DomainError("A receita usa um insumo que não existe ou foi arquivado.");
    }
    return;
  }
  const res = await getPool().query(
    "SELECT id FROM insumo WHERE id = ANY($1::int[]) AND ativo = true",
    [ids],
  );
  if ((res.rowCount ?? 0) !== ids.length) {
    throw new DomainError("A receita usa um insumo que não existe ou foi arquivado.");
  }
}

// ============================================================================
// CATEGORIAS
// ============================================================================
export async function listCategorias(): Promise<Categoria[]> {
  const data = await loadAllData();
  return [...data.categorias].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function createCategoria(nome: string): Promise<Categoria> {
  const now = new Date().toISOString();
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const cat: Categoria = {
      id: db.nextIds.categoria++,
      nome: nome.trim(),
      dataAtualizacao: now,
    };
    db.categorias.push(cat);
    writeLocalDb(db);
    return cat;
  }

  const res = await getPool().query(
    "INSERT INTO categoria (nome, data_atualizacao) VALUES ($1, NOW()) RETURNING id, nome, data_atualizacao",
    [nome.trim()],
  );
  const row = res.rows[0];
  return {
    id: Number(row.id),
    nome: row.nome,
    dataAtualizacao: new Date(row.data_atualizacao).toISOString(),
  };
}

const MSG_CATEGORIA_EM_USO =
  "Esta categoria possui insumos (inclusive arquivados) e não pode ser excluída.";

export async function deleteCategoria(id: number): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    if (!db.categorias.some((c) => c.id === id)) {
      throw new DomainError("Categoria não encontrada.");
    }
    // Insumos arquivados também apontam para a categoria: apagá-la deixaria
    // registros órfãos (no Postgres, a chave estrangeira impediria).
    if (db.insumos.some((i) => i.categoriaId === id)) {
      throw new DomainError(MSG_CATEGORIA_EM_USO);
    }
    db.categorias = db.categorias.filter((c) => c.id !== id);
    writeLocalDb(db);
    return;
  }

  const check = await getPool().query(
    "SELECT 1 FROM insumo WHERE categoria_id = $1 LIMIT 1",
    [id],
  );
  if (check.rowCount && check.rowCount > 0) {
    throw new DomainError(MSG_CATEGORIA_EM_USO);
  }
  const res = await getPool().query("DELETE FROM categoria WHERE id = $1", [id]);
  if (!res.rowCount) throw new DomainError("Categoria não encontrada.");
}

// ============================================================================
// INSUMOS
// ============================================================================
export async function listInsumos(): Promise<InsumoComDetalhes[]> {
  const data = await loadAllData();
  return enriquecerInsumos(data.insumos, data.categorias, data.movimentos);
}

export async function createInsumo(input: {
  nome: string;
  unidadeMedida: string;
  estoqueMinimo: number;
  custoUnitario: number;
  categoriaId: number;
  estoqueInicial?: number;
}): Promise<Insumo> {
  const now = new Date().toISOString();
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    if (!db.categorias.some((c) => c.id === input.categoriaId)) {
      throw new DomainError("Categoria não encontrada.");
    }
    const insumo: Insumo = {
      id: db.nextIds.insumo++,
      nome: input.nome.trim(),
      unidadeMedida: input.unidadeMedida.trim(),
      estoqueMinimo: input.estoqueMinimo,
      custoUnitario: input.custoUnitario,
      categoriaId: input.categoriaId,
      dataAtualizacao: now,
      ativo: true,
    };
    db.insumos.push(insumo);

    if (input.estoqueInicial && input.estoqueInicial > 0) {
      db.movimentos.push({
        id: db.nextIds.movimento++,
        insumoId: insumo.id,
        quantidade: input.estoqueInicial,
        tipo: "COMPRA",
        custoUnitario: input.custoUnitario,
        dataMovimento: now,
        dataRegistro: now,
        observacao: "Estoque inicial no cadastro",
      });
    }

    writeLocalDb(db);
    return insumo;
  }

  await assertCategoriaExiste(input.categoriaId);

  // Insumo + estoque inicial na mesma transação: ou grava os dois, ou nenhum.
  const row = await withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO insumo (nome, unidade_medida, estoque_minimo, custo_unitario, categoria_id, ativo, data_atualizacao)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       RETURNING id, nome, unidade_medida, estoque_minimo, custo_unitario, data_atualizacao, categoria_id, ativo`,
      [
        input.nome.trim(),
        input.unidadeMedida.trim(),
        input.estoqueMinimo,
        input.custoUnitario,
        input.categoriaId,
      ],
    );
    const inserted = res.rows[0];
    if (input.estoqueInicial && input.estoqueInicial > 0) {
      await client.query(
        `INSERT INTO movimento_estoque (quantidade, tipo, custo_unitario, observacao, insumo_id)
         VALUES ($1, 'COMPRA', $2, 'Estoque inicial no cadastro', $3)`,
        [input.estoqueInicial, input.custoUnitario, Number(inserted.id)],
      );
    }
    return inserted;
  });
  const insumoId = Number(row.id);

  return {
    id: insumoId,
    nome: row.nome,
    unidadeMedida: row.unidade_medida,
    estoqueMinimo: Number(row.estoque_minimo),
    custoUnitario: Number(row.custo_unitario),
    dataAtualizacao: new Date(row.data_atualizacao).toISOString(),
    categoriaId: Number(row.categoria_id),
    ativo: Boolean(row.ativo),
  };
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
  const now = new Date().toISOString();
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const idx = db.insumos.findIndex((i) => i.id === id);
    if (idx === -1) throw new DomainError("Insumo não encontrado.");
    if (!db.categorias.some((c) => c.id === input.categoriaId)) {
      throw new DomainError("Categoria não encontrada.");
    }
    db.insumos[idx] = {
      ...db.insumos[idx],
      nome: input.nome.trim(),
      unidadeMedida: input.unidadeMedida.trim(),
      estoqueMinimo: input.estoqueMinimo,
      custoUnitario: input.custoUnitario,
      categoriaId: input.categoriaId,
      dataAtualizacao: now,
    };
    writeLocalDb(db);
    return db.insumos[idx];
  }

  await assertCategoriaExiste(input.categoriaId);
  const res = await getPool().query(
    `UPDATE insumo
     SET nome = $1, unidade_medida = $2, estoque_minimo = $3, custo_unitario = $4, categoria_id = $5, data_atualizacao = NOW()
     WHERE id = $6
     RETURNING id, nome, unidade_medida, estoque_minimo, custo_unitario, data_atualizacao, categoria_id, ativo`,
    [
      input.nome.trim(),
      input.unidadeMedida.trim(),
      input.estoqueMinimo,
      input.custoUnitario,
      input.categoriaId,
      id,
    ],
  );
  if (res.rowCount === 0) throw new DomainError("Insumo não encontrado.");
  const row = res.rows[0];
  return {
    id: Number(row.id),
    nome: row.nome,
    unidadeMedida: row.unidade_medida,
    estoqueMinimo: Number(row.estoque_minimo),
    custoUnitario: Number(row.custo_unitario),
    dataAtualizacao: new Date(row.data_atualizacao).toISOString(),
    categoriaId: Number(row.categoria_id),
    ativo: Boolean(row.ativo),
  };
}

export async function deleteInsumo(id: number): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const insumo = db.insumos.find((i) => i.id === id);
    if (!insumo) throw new DomainError("Insumo não encontrado.");

    const emReceita = db.receitaItens.some((ri) => ri.insumoId === id);
    if (emReceita) {
      throw new DomainError(
        "Este insumo faz parte de uma receita. Remova-o da receita antes de excluir.",
      );
    }

    const forma = db.formas.find((f) => f.insumoId === id);
    if (forma) {
      throw new DomainError(
        `Este insumo é a embalagem da forma "${forma.nome}". Exclua a forma antes.`,
      );
    }

    const temMovimento = db.movimentos.some((m) => m.insumoId === id);
    if (temMovimento) {
      insumo.ativo = false;
    } else {
      db.insumos = db.insumos.filter((i) => i.id !== id);
    }
    writeLocalDb(db);
    return;
  }

  const pool = getPool();
  const existe = await pool.query("SELECT 1 FROM insumo WHERE id = $1", [id]);
  if (!existe.rowCount) throw new DomainError("Insumo não encontrado.");

  const recCheck = await pool.query(
    "SELECT 1 FROM receita_item WHERE insumo_id = $1 LIMIT 1",
    [id],
  );
  if (recCheck.rowCount && recCheck.rowCount > 0) {
    throw new DomainError(
      "Este insumo faz parte de uma receita. Remova-o da receita antes de excluir.",
    );
  }
  const formaCheck = await pool.query("SELECT nome FROM forma WHERE insumo_id = $1 LIMIT 1", [id]);
  if (formaCheck.rowCount) {
    throw new DomainError(
      `Este insumo é a embalagem da forma "${formaCheck.rows[0].nome ?? ""}". Exclua a forma antes.`,
    );
  }
  const movCheck = await pool.query(
    "SELECT 1 FROM movimento_estoque WHERE insumo_id = $1 LIMIT 1",
    [id],
  );
  if (movCheck.rowCount && movCheck.rowCount > 0) {
    await pool.query("UPDATE insumo SET ativo = false WHERE id = $1", [id]);
  } else {
    await pool.query("DELETE FROM insumo WHERE id = $1", [id]);
  }
}

// ============================================================================
// MOVIMENTOS DE ESTOQUE
// ============================================================================
export async function listMovimentos(): Promise<MovimentoComDetalhes[]> {
  const data = await loadAllData();
  return enriquecerMovimentos(data.movimentos, data.insumos);
}

export async function createMovimento(input: {
  insumoId: number;
  quantidade: number;
  tipo: TipoMovimento;
  custoUnitario?: number | null;
  observacao?: string | null;
  atualizarPrecoInsumo?: boolean;
}): Promise<MovimentoEstoque> {
  const now = new Date().toISOString();
  const ehSaida = input.tipo === "AJUSTE_SAIDA" || input.tipo === "PRODUCAO";

  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const insumo = db.insumos.find((i) => i.id === input.insumoId);
    if (!insumo || !insumo.ativo) throw new DomainError("Insumo não encontrado ou arquivado.");

    if (ehSaida) {
      const saldo = calcularSaldosMap(db.movimentos).get(insumo.id) ?? 0;
      assertSaldoSuficiente(insumo.nome, insumo.unidadeMedida, saldo, input.quantidade);
    }

    const mov: MovimentoEstoque = {
      id: db.nextIds.movimento++,
      insumoId: input.insumoId,
      quantidade: input.quantidade,
      tipo: input.tipo,
      custoUnitario: input.custoUnitario ?? insumo.custoUnitario,
      dataMovimento: now,
      dataRegistro: now,
      observacao: input.observacao?.trim() || null,
    };
    db.movimentos.push(mov);

    if (
      input.tipo === "COMPRA" &&
      input.atualizarPrecoInsumo &&
      input.custoUnitario != null &&
      input.custoUnitario >= 0
    ) {
      insumo.custoUnitario = input.custoUnitario;
      insumo.dataAtualizacao = now;
    }

    writeLocalDb(db);
    return mov;
  }

  const r = await withTransaction(async (client) => {
    // FOR UPDATE: duas saídas simultâneas do mesmo insumo são processadas em
    // fila, então a checagem de saldo não é furada por concorrência.
    const insRes = await client.query(
      "SELECT nome, unidade_medida, custo_unitario, ativo FROM insumo WHERE id = $1 FOR UPDATE",
      [input.insumoId],
    );
    const insumo = insRes.rows[0];
    if (!insumo || !insumo.ativo) throw new DomainError("Insumo não encontrado ou arquivado.");

    if (ehSaida) {
      const saldoRes = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo IN ('COMPRA', 'AJUSTE_ENTRADA') THEN quantidade ELSE -quantidade END), 0) AS saldo
         FROM movimento_estoque WHERE insumo_id = $1`,
        [input.insumoId],
      );
      assertSaldoSuficiente(
        insumo.nome,
        insumo.unidade_medida,
        Number(saldoRes.rows[0]?.saldo ?? 0),
        input.quantidade,
      );
    }

    const res = await client.query(
      `INSERT INTO movimento_estoque (quantidade, tipo, custo_unitario, observacao, insumo_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, quantidade, tipo, custo_unitario, data_movimento, data_registro, observacao, insumo_id`,
      [
        input.quantidade,
        input.tipo,
        // Sem custo informado, registra o custo atual do insumo (igual ao modo local).
        input.custoUnitario ?? Number(insumo.custo_unitario ?? 0),
        input.observacao?.trim() || null,
        input.insumoId,
      ],
    );

    if (
      input.tipo === "COMPRA" &&
      input.atualizarPrecoInsumo &&
      input.custoUnitario != null &&
      input.custoUnitario >= 0
    ) {
      await client.query(
        "UPDATE insumo SET custo_unitario = $1, data_atualizacao = NOW() WHERE id = $2",
        [input.custoUnitario, input.insumoId],
      );
    }
    return res.rows[0];
  });

  return {
    id: Number(r.id),
    quantidade: Number(r.quantidade),
    tipo: r.tipo as TipoMovimento,
    custoUnitario: r.custo_unitario != null ? Number(r.custo_unitario) : null,
    dataMovimento: new Date(r.data_movimento).toISOString(),
    dataRegistro: new Date(r.data_registro).toISOString(),
    observacao: r.observacao ?? null,
    insumoId: Number(r.insumo_id),
  };
}

// ============================================================================
// FORMAS
// ============================================================================
export async function listFormas(): Promise<FormaComDetalhes[]> {
  const data = await loadAllData();
  return enriquecerFormas(data.formas, data.insumos, data.movimentos);
}

export async function createForma(input: {
  nome: string;
  volumeMl: number;
  insumoId: number;
}): Promise<Forma> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    if (!db.insumos.some((i) => i.id === input.insumoId && i.ativo)) {
      throw new DomainError("Insumo da embalagem não encontrado ou arquivado.");
    }
    if (db.formas.some((f) => f.insumoId === input.insumoId)) {
      throw new DomainError("Este insumo já está vinculado a uma forma.");
    }
    const forma: Forma = {
      id: db.nextIds.forma++,
      nome: input.nome.trim(),
      volumeMl: input.volumeMl,
      insumoId: input.insumoId,
    };
    db.formas.push(forma);
    writeLocalDb(db);
    return forma;
  }

  const pool = getPool();
  const insumoCheck = await pool.query("SELECT 1 FROM insumo WHERE id = $1 AND ativo = true", [
    input.insumoId,
  ]);
  if (!insumoCheck.rowCount) {
    throw new DomainError("Insumo da embalagem não encontrado ou arquivado.");
  }
  const res = await pool.query(
    `INSERT INTO forma (nome, volume_ml, insumo_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (insumo_id) DO NOTHING
     RETURNING id, nome, volume_ml, insumo_id`,
    [input.nome.trim(), input.volumeMl, input.insumoId],
  );
  if (!res.rowCount) throw new DomainError("Este insumo já está vinculado a uma forma.");
  const r = res.rows[0];
  return {
    id: Number(r.id),
    nome: r.nome,
    volumeMl: Number(r.volume_ml),
    insumoId: Number(r.insumo_id),
  };
}

export async function deleteForma(id: number): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    if (!db.formas.some((f) => f.id === id)) throw new DomainError("Forma não encontrada.");
    const emUso = db.ordensProducao.some((op) => op.formaId === id);
    if (emUso) {
      throw new DomainError(
        "Esta forma já possui ordens de produção vinculadas e não pode ser excluída.",
      );
    }
    db.formas = db.formas.filter((f) => f.id !== id);
    writeLocalDb(db);
    return;
  }

  const check = await getPool().query(
    "SELECT 1 FROM ordem_producao WHERE forma_id = $1 LIMIT 1",
    [id],
  );
  if (check.rowCount && check.rowCount > 0) {
    throw new DomainError(
      "Esta forma já possui ordens de produção vinculadas e não pode ser excluída.",
    );
  }
  const res = await getPool().query("DELETE FROM forma WHERE id = $1", [id]);
  if (!res.rowCount) throw new DomainError("Forma não encontrada.");
}

// ============================================================================
// RECEITAS
// ============================================================================
export async function listReceitas(): Promise<ReceitaComDetalhes[]> {
  const data = await loadAllData();
  return enriquecerReceitas(
    data.receitas,
    data.receitaItens,
    data.insumos,
    data.formas,
    data.movimentos,
  );
}

export async function createReceita(input: {
  nome: string;
  descricao?: string | null;
  rendimentoMl: number;
  margemLucro: number;
  itens: Array<{ insumoId: number; quantidade: number }>;
}): Promise<Receita> {
  const now = new Date().toISOString();
  await assertInsumosAtivos(input.itens.map((it) => it.insumoId));
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const receita: Receita = {
      id: db.nextIds.receita++,
      nome: input.nome.trim(),
      descricao: input.descricao?.trim() || null,
      rendimentoMl: input.rendimentoMl,
      margemLucro: input.margemLucro,
      dataAtualizacao: now,
    };
    db.receitas.push(receita);

    for (const item of input.itens) {
      db.receitaItens.push({
        id: db.nextIds.receitaItem++,
        receitaId: receita.id,
        insumoId: item.insumoId,
        quantidade: item.quantidade,
      });
    }
    writeLocalDb(db);
    return receita;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const recRes = await client.query(
      `INSERT INTO receita (nome, descricao, rendimento_ml, margem_lucro, data_atualizacao)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, nome, descricao, rendimento_ml, margem_lucro, data_atualizacao`,
      [
        input.nome.trim(),
        input.descricao?.trim() || null,
        input.rendimentoMl,
        input.margemLucro,
      ],
    );
    const rec = recRes.rows[0];
    const receitaId = Number(rec.id);

    for (const item of input.itens) {
      await client.query(
        `INSERT INTO receita_item (receita_id, insumo_id, quantidade)
         VALUES ($1, $2, $3)`,
        [receitaId, item.insumoId, item.quantidade],
      );
    }
    await client.query("COMMIT");
    return {
      id: receitaId,
      nome: rec.nome,
      descricao: rec.descricao ?? null,
      rendimentoMl: Number(rec.rendimento_ml),
      margemLucro: Number(rec.margem_lucro),
      dataAtualizacao: new Date(rec.data_atualizacao).toISOString(),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateReceita(
  id: number,
  input: {
    nome: string;
    descricao?: string | null;
    rendimentoMl: number;
    margemLucro: number;
    itens: Array<{ insumoId: number; quantidade: number }>;
  },
): Promise<Receita> {
  const now = new Date().toISOString();
  await assertInsumosAtivos(input.itens.map((it) => it.insumoId));
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const idx = db.receitas.findIndex((r) => r.id === id);
    if (idx === -1) throw new DomainError("Receita não encontrada.");

    db.receitas[idx] = {
      ...db.receitas[idx],
      nome: input.nome.trim(),
      descricao: input.descricao?.trim() || null,
      rendimentoMl: input.rendimentoMl,
      margemLucro: input.margemLucro,
      dataAtualizacao: now,
    };

    db.receitaItens = db.receitaItens.filter((ri) => ri.receitaId !== id);
    for (const item of input.itens) {
      db.receitaItens.push({
        id: db.nextIds.receitaItem++,
        receitaId: id,
        insumoId: item.insumoId,
        quantidade: item.quantidade,
      });
    }

    writeLocalDb(db);
    return db.receitas[idx];
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const recRes = await client.query(
      `UPDATE receita
       SET nome = $1, descricao = $2, rendimento_ml = $3, margem_lucro = $4, data_atualizacao = NOW()
       WHERE id = $5
       RETURNING id, nome, descricao, rendimento_ml, margem_lucro, data_atualizacao`,
      [
        input.nome.trim(),
        input.descricao?.trim() || null,
        input.rendimentoMl,
        input.margemLucro,
        id,
      ],
    );
    if (recRes.rowCount === 0) throw new DomainError("Receita não encontrada.");

    await client.query("DELETE FROM receita_item WHERE receita_id = $1", [id]);
    for (const item of input.itens) {
      await client.query(
        `INSERT INTO receita_item (receita_id, insumo_id, quantidade)
         VALUES ($1, $2, $3)`,
        [id, item.insumoId, item.quantidade],
      );
    }
    await client.query("COMMIT");
    const rec = recRes.rows[0];
    return {
      id: Number(rec.id),
      nome: rec.nome,
      descricao: rec.descricao ?? null,
      rendimentoMl: Number(rec.rendimento_ml),
      margemLucro: Number(rec.margem_lucro),
      dataAtualizacao: new Date(rec.data_atualizacao).toISOString(),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteReceita(id: number): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    if (!db.receitas.some((r) => r.id === id)) throw new DomainError("Receita não encontrada.");
    const emUso = db.ordensProducao.some((op) => op.receitaId === id);
    if (emUso) {
      throw new DomainError(
        "Esta receita possui ordens de produção vinculadas e não pode ser excluída.",
      );
    }
    db.receitas = db.receitas.filter((r) => r.id !== id);
    db.receitaItens = db.receitaItens.filter((ri) => ri.receitaId !== id);
    writeLocalDb(db);
    return;
  }

  const check = await getPool().query(
    "SELECT 1 FROM ordem_producao WHERE receita_id = $1 LIMIT 1",
    [id],
  );
  if (check.rowCount && check.rowCount > 0) {
    throw new DomainError(
      "Esta receita possui ordens de produção vinculadas e não pode ser excluída.",
    );
  }
  const res = await getPool().query("DELETE FROM receita WHERE id = $1", [id]);
  if (!res.rowCount) throw new DomainError("Receita não encontrada.");
}

// ============================================================================
// ORDENS DE PRODUÇÃO (PCP)
// ============================================================================
export async function listOrdensProducao(): Promise<OrdemProducaoComDetalhes[]> {
  const data = await loadAllData();
  const formasDet = enriquecerFormas(data.formas, data.insumos, data.movimentos);
  const receitasDet = enriquecerReceitas(
    data.receitas,
    data.receitaItens,
    data.insumos,
    data.formas,
    data.movimentos,
  );
  return enriquecerOrdens(data.ordensProducao, receitasDet, formasDet);
}

export async function createOrdemProducao(input: {
  receitaId: number;
  formaId: number;
  quantidadeUnidades: number;
  precoVendaUnitario?: number | null;
  observacao?: string | null;
  dataPrevista?: string;
}): Promise<OrdemProducao> {
  const data = await loadAllData();
  const formasDet = enriquecerFormas(data.formas, data.insumos, data.movimentos);
  const receitasDet = enriquecerReceitas(
    data.receitas,
    data.receitaItens,
    data.insumos,
    data.formas,
    data.movimentos,
  );
  const receita = receitasDet.find((r) => r.id === input.receitaId);
  const forma = formasDet.find((f) => f.id === input.formaId);
  if (!receita) throw new DomainError("Receita não encontrada.");
  if (!forma) throw new DomainError("Forma não encontrada.");

  const calc = calcularNecessidadesOrdem(receita, forma, input.quantidadeUnidades);
  const now = new Date().toISOString();
  const dataPrevista = normalizarDataPrevista(input.dataPrevista);

  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const op: OrdemProducao = {
      id: db.nextIds.ordemProducao++,
      receitaId: input.receitaId,
      formaId: input.formaId,
      quantidadeUnidades: input.quantidadeUnidades,
      status: "PLANEJADA",
      custoTotalEstimado: calc.custoTotalEstimado,
      precoVendaUnitario: input.precoVendaUnitario ?? null,
      observacao: input.observacao?.trim() || null,
      dataPrevista,
      dataCriacao: now,
      dataConclusao: null,
    };
    db.ordensProducao.push(op);
    writeLocalDb(db);
    return op;
  }

  const res = await getPool().query(
    `INSERT INTO ordem_producao (receita_id, forma_id, quantidade_unidades, status, custo_total_estimado, preco_venda_unitario, observacao, data_prevista)
     VALUES ($1, $2, $3, 'PLANEJADA', $4, $5, $6, $7)
     RETURNING id, receita_id, forma_id, quantidade_unidades, status, custo_total_estimado, preco_venda_unitario, observacao, data_prevista, data_criacao, data_conclusao`,
    [
      input.receitaId,
      input.formaId,
      input.quantidadeUnidades,
      calc.custoTotalEstimado,
      input.precoVendaUnitario ?? null,
      input.observacao?.trim() || null,
      dataPrevista,
    ],
  );
  const r = res.rows[0];
  return {
    id: Number(r.id),
    receitaId: Number(r.receita_id),
    formaId: Number(r.forma_id),
    quantidadeUnidades: Number(r.quantidade_unidades),
    status: r.status as StatusOrdemProducao,
    custoTotalEstimado: Number(r.custo_total_estimado),
    precoVendaUnitario:
      r.preco_venda_unitario != null ? Number(r.preco_venda_unitario) : null,
    observacao: r.observacao ?? null,
    dataPrevista: new Date(r.data_prevista).toISOString(),
    dataCriacao: new Date(r.data_criacao).toISOString(),
    dataConclusao: r.data_conclusao
      ? new Date(r.data_conclusao).toISOString()
      : null,
  };
}

export async function updateOrdemProducaoStatus(
  id: number,
  novoStatus: StatusOrdemProducao,
  permitirEstoqueNegativo = false,
): Promise<OrdemProducao> {
  const data = await loadAllData();
  const formasDet = enriquecerFormas(data.formas, data.insumos, data.movimentos);
  const receitasDet = enriquecerReceitas(
    data.receitas,
    data.receitaItens,
    data.insumos,
    data.formas,
    data.movimentos,
  );
  const ordensDet = enriquecerOrdens(data.ordensProducao, receitasDet, formasDet);
  const ordem = ordensDet.find((o) => o.id === id);
  if (!ordem) throw new DomainError("Ordem de produção não encontrada.");

  const statusLido = ordem.status;
  const erroTransicao = validarTransicaoStatus(statusLido, novoStatus);
  if (erroTransicao) throw new DomainError(erroTransicao);

  if (
    novoStatus === "CONCLUIDA" &&
    !ordem.estoqueSuficiente &&
    !permitirEstoqueNegativo
  ) {
    throw new DomainError(
      "Estoque insuficiente para concluir esta ordem. Reponha os insumos faltantes ou confirme a baixa forçada.",
    );
  }

  const now = new Date().toISOString();

  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const target = db.ordensProducao.find((o) => o.id === id);
    if (!target) throw new DomainError("Ordem de produção não encontrada.");
    // Releitura dentro do trecho síncrono (sem await até a gravação): se outra
    // requisição mudou o status nesse meio tempo, nada é baixado em dobro.
    if (target.status !== statusLido) throw new DomainError(MSG_ORDEM_ALTERADA);

    target.status = novoStatus;
    if (novoStatus === "CONCLUIDA") {
      target.dataConclusao = now;
      target.custoTotalEstimado = ordem.custoTotalEstimado;

      // Dá baixa automática no estoque de todos os insumos e formas consumidos!
      for (const nec of ordem.necessidades) {
        if (nec.quantidadeNecessaria > 0) {
          db.movimentos.push({
            id: db.nextIds.movimento++,
            insumoId: nec.insumoId,
            quantidade: nec.quantidadeNecessaria,
            tipo: "PRODUCAO",
            custoUnitario: nec.custoUnitario,
            dataMovimento: now,
            dataRegistro: now,
            observacao: `Baixa automática — OP #${ordem.id} (${ordem.quantidadeUnidades}x ${ordem.formaNome})`,
          });
        }
      }
    }

    writeLocalDb(db);
    return target;
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Atualização condicional: só muda se o status ainda for o que lemos.
    // Duas requisições simultâneas para concluir a mesma ordem → só uma vence.
    const res = await client.query(
      `UPDATE ordem_producao
       SET status = $1::varchar,
           custo_total_estimado = CASE WHEN $1::varchar = 'CONCLUIDA' THEN $2 ELSE custo_total_estimado END,
           data_conclusao = CASE WHEN $1::varchar = 'CONCLUIDA' THEN NOW() ELSE data_conclusao END
       WHERE id = $3 AND status = $4
       RETURNING id, receita_id, forma_id, quantidade_unidades, status, custo_total_estimado, preco_venda_unitario, observacao, data_prevista, data_criacao, data_conclusao`,
      [novoStatus, ordem.custoTotalEstimado, id, statusLido],
    );
    if (res.rowCount === 0) throw new DomainError(MSG_ORDEM_ALTERADA);

    if (novoStatus === "CONCLUIDA") {
      for (const nec of ordem.necessidades) {
        if (nec.quantidadeNecessaria > 0) {
          await client.query(
            `INSERT INTO movimento_estoque (quantidade, tipo, custo_unitario, observacao, insumo_id)
             VALUES ($1, 'PRODUCAO', $2, $3, $4)`,
            [
              nec.quantidadeNecessaria,
              nec.custoUnitario,
              `Baixa automática — OP #${ordem.id} (${ordem.quantidadeUnidades}x ${ordem.formaNome})`,
              nec.insumoId,
            ],
          );
        }
      }
    }

    await client.query("COMMIT");
    const r = res.rows[0];
    return {
      id: Number(r.id),
      receitaId: Number(r.receita_id),
      formaId: Number(r.forma_id),
      quantidadeUnidades: Number(r.quantidade_unidades),
      status: r.status as StatusOrdemProducao,
      custoTotalEstimado: Number(r.custo_total_estimado),
      precoVendaUnitario:
        r.preco_venda_unitario != null ? Number(r.preco_venda_unitario) : null,
      observacao: r.observacao ?? null,
      dataPrevista: new Date(r.data_prevista).toISOString(),
      dataCriacao: new Date(r.data_criacao).toISOString(),
      dataConclusao: r.data_conclusao
        ? new Date(r.data_conclusao).toISOString()
        : null,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteOrdemProducao(id: number): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const target = db.ordensProducao.find((o) => o.id === id);
    if (!target) throw new DomainError("Ordem de produção não encontrada.");
    if (target.status === "CONCLUIDA") {
      throw new DomainError("Não é possível excluir uma ordem já concluída.");
    }
    db.ordensProducao = db.ordensProducao.filter((o) => o.id !== id);
    writeLocalDb(db);
    return;
  }

  // Exclusão condicional: se a ordem for concluída no mesmo instante, não apaga.
  const res = await getPool().query(
    "DELETE FROM ordem_producao WHERE id = $1 AND status <> 'CONCLUIDA'",
    [id],
  );
  if (!res.rowCount) {
    const check = await getPool().query("SELECT status FROM ordem_producao WHERE id = $1", [id]);
    if (!check.rowCount) throw new DomainError("Ordem de produção não encontrada.");
    throw new DomainError("Não é possível excluir uma ordem já concluída.");
  }
}
