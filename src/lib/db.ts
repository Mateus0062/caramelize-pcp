import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import {
  calcularNecessidadesOrdem,
  enriquecerFormas,
  enriquecerInsumos,
  enriquecerMovimentos,
  enriquecerOrdens,
  enriquecerReceitas,
  montarDashboardResumo,
} from "./pcp-engine";
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

let pgPool: Pool | null = null;

function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function getStorageMode(): "supabase" | "local" {
  return hasDatabaseUrl() ? "supabase" : "local";
}

function getPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pgPool;
}

function readLocalDb(): LocalDbSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const seed = createSeedData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), "utf-8");
    return seed;
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as LocalDbSchema;
}

function writeLocalDb(db: LocalDbSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
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

export async function deleteCategoria(id: number): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const emUso = db.insumos.some((i) => i.ativo && i.categoriaId === id);
    if (emUso) {
      throw new Error("Não é possível excluir uma categoria que possui insumos ativos.");
    }
    db.categorias = db.categorias.filter((c) => c.id !== id);
    writeLocalDb(db);
    return;
  }

  const check = await getPool().query(
    "SELECT 1 FROM insumo WHERE categoria_id = $1 AND ativo = true LIMIT 1",
    [id],
  );
  if (check.rowCount && check.rowCount > 0) {
    throw new Error("Não é possível excluir uma categoria que possui insumos ativos.");
  }
  await getPool().query("DELETE FROM categoria WHERE id = $1", [id]);
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

  const pool = getPool();
  const res = await pool.query(
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
  const row = res.rows[0];
  const insumoId = Number(row.id);

  if (input.estoqueInicial && input.estoqueInicial > 0) {
    await pool.query(
      `INSERT INTO movimento_estoque (quantidade, tipo, custo_unitario, observacao, insumo_id)
       VALUES ($1, 'COMPRA', $2, 'Estoque inicial no cadastro', $3)`,
      [input.estoqueInicial, input.custoUnitario, insumoId],
    );
  }

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
    if (idx === -1) throw new Error("Insumo não encontrado.");
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
  if (res.rowCount === 0) throw new Error("Insumo não encontrado.");
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
    if (!insumo) throw new Error("Insumo não encontrado.");

    const emReceita = db.receitaItens.some((ri) => ri.insumoId === id);
    if (emReceita) {
      throw new Error(
        "Este insumo faz parte de uma receita. Remova-o da receita antes de excluir.",
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
  const recCheck = await pool.query(
    "SELECT 1 FROM receita_item WHERE insumo_id = $1 LIMIT 1",
    [id],
  );
  if (recCheck.rowCount && recCheck.rowCount > 0) {
    throw new Error(
      "Este insumo faz parte de uma receita. Remova-o da receita antes de excluir.",
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
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const insumo = db.insumos.find((i) => i.id === input.insumoId);
    if (!insumo) throw new Error("Insumo não encontrado.");

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

  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO movimento_estoque (quantidade, tipo, custo_unitario, observacao, insumo_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, quantidade, tipo, custo_unitario, data_movimento, data_registro, observacao, insumo_id`,
    [
      input.quantidade,
      input.tipo,
      input.custoUnitario ?? null,
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
    await pool.query(
      "UPDATE insumo SET custo_unitario = $1, data_atualizacao = NOW() WHERE id = $2",
      [input.custoUnitario, input.insumoId],
    );
  }

  const r = res.rows[0];
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
    if (db.formas.some((f) => f.insumoId === input.insumoId)) {
      throw new Error("Este insumo já está vinculado a uma forma.");
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

  const res = await getPool().query(
    `INSERT INTO forma (nome, volume_ml, insumo_id)
     VALUES ($1, $2, $3)
     RETURNING id, nome, volume_ml, insumo_id`,
    [input.nome.trim(), input.volumeMl, input.insumoId],
  );
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
    const emUso = db.ordensProducao.some((op) => op.formaId === id);
    if (emUso) {
      throw new Error(
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
    throw new Error(
      "Esta forma já possui ordens de produção vinculadas e não pode ser excluída.",
    );
  }
  await getPool().query("DELETE FROM forma WHERE id = $1", [id]);
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
  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const idx = db.receitas.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Receita não encontrada.");

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
    if (recRes.rowCount === 0) throw new Error("Receita não encontrada.");

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
    const emUso = db.ordensProducao.some((op) => op.receitaId === id);
    if (emUso) {
      throw new Error(
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
    throw new Error(
      "Esta receita possui ordens de produção vinculadas e não pode ser excluída.",
    );
  }
  await getPool().query("DELETE FROM receita WHERE id = $1", [id]);
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
  if (!receita) throw new Error("Receita não encontrada.");
  if (!forma) throw new Error("Forma não encontrada.");

  const calc = calcularNecessidadesOrdem(receita, forma, input.quantidadeUnidades);
  const now = new Date().toISOString();
  const dataPrevista = input.dataPrevista
    ? new Date(input.dataPrevista).toISOString()
    : now;

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
  if (!ordem) throw new Error("Ordem de produção não encontrada.");

  if (ordem.status === "CONCLUIDA") {
    throw new Error("Ordem de produção já foi concluída e baixada no estoque.");
  }

  if (
    novoStatus === "CONCLUIDA" &&
    !ordem.estoqueSuficiente &&
    !permitirEstoqueNegativo
  ) {
    throw new Error(
      "Estoque insuficiente para concluir esta ordem. Reponha os insumos faltantes ou confirme a baixa forçada.",
    );
  }

  const now = new Date().toISOString();

  if (!hasDatabaseUrl()) {
    const db = readLocalDb();
    const target = db.ordensProducao.find((o) => o.id === id);
    if (!target) throw new Error("Ordem de produção não encontrada.");

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
    const res = await client.query(
      `UPDATE ordem_producao
       SET status = $1,
           custo_total_estimado = $2,
           data_conclusao = CASE WHEN $1 = 'CONCLUIDA' THEN NOW() ELSE data_conclusao END
       WHERE id = $3
       RETURNING id, receita_id, forma_id, quantidade_unidades, status, custo_total_estimado, preco_venda_unitario, observacao, data_prevista, data_criacao, data_conclusao`,
      [novoStatus, ordem.custoTotalEstimado, id],
    );

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
    if (target?.status === "CONCLUIDA") {
      throw new Error("Não é possível excluir uma ordem já concluída.");
    }
    db.ordensProducao = db.ordensProducao.filter((o) => o.id !== id);
    writeLocalDb(db);
    return;
  }

  const check = await getPool().query(
    "SELECT status FROM ordem_producao WHERE id = $1",
    [id],
  );
  if (check.rows[0]?.status === "CONCLUIDA") {
    throw new Error("Não é possível excluir uma ordem já concluída.");
  }
  await getPool().query("DELETE FROM ordem_producao WHERE id = $1", [id]);
}
