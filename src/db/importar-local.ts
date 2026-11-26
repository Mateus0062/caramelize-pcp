import fs from "node:fs";
import path from "node:path";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { createSeedData, type LocalDbSchema } from "../lib/seed";

/**
 * Primeira abertura do banco local (PGlite): se estiver vazio, importa os
 * dados do antigo modo JSON (data/caramelize-db.json e
 * data/caramelize-users.json). Sem esses arquivos, carrega os dados de
 * exemplo da Caramelize. Os arquivos JSON não são apagados.
 */

const DATA_FILE = path.join(process.cwd(), "data", "caramelize-db.json");
const USERS_FILE = path.join(process.cwd(), "data", "caramelize-users.json");

interface UsuarioJson {
  id: number;
  nome: string;
  email: string;
  senhaHash: string;
  role: "ADMIN" | "OPERADOR";
  ativo: boolean;
  dataCriacao: string;
}

async function tabelaVazia(client: PGlite, tabela: string): Promise<boolean> {
  const { rows } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${tabela}`);
  return Number(rows[0]?.n ?? 0) === 0;
}

/** Insere em lotes mantendo os IDs originais e ajusta a sequência depois. */
async function inserirLote(
  tx: Transaction,
  tabela: string,
  colunas: string[],
  linhas: unknown[][],
): Promise<void> {
  for (let i = 0; i < linhas.length; i += 500) {
    const params: unknown[] = [];
    const valores = linhas
      .slice(i, i + 500)
      .map((linha) => `(${linha.map((v) => (params.push(v), `$${params.length}`)).join(", ")})`)
      .join(", ");
    await tx.query(
      `INSERT INTO ${tabela} (${colunas.join(", ")}) OVERRIDING SYSTEM VALUE VALUES ${valores}`,
      params,
    );
  }
  if (linhas.length > 0) {
    await tx.query(
      `SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), (SELECT MAX(id) FROM ${tabela}))`,
    );
  }
}

async function importarCadastros(client: PGlite, dados: LocalDbSchema): Promise<string> {
  // Registros órfãos (ex.: apagados por versões antigas) são ignorados, para
  // não violar as chaves estrangeiras do banco.
  const categorias = new Set(dados.categorias.map((c) => c.id));
  const insumos = dados.insumos.filter((i) => categorias.has(i.categoriaId));
  const insumoIds = new Set(insumos.map((i) => i.id));
  const formas = dados.formas.filter((f) => insumoIds.has(f.insumoId));
  const formaIds = new Set(formas.map((f) => f.id));
  const receitaIds = new Set(dados.receitas.map((r) => r.id));
  const itens = dados.receitaItens.filter((it) => receitaIds.has(it.receitaId) && insumoIds.has(it.insumoId));
  const movimentos = dados.movimentos.filter((m) => insumoIds.has(m.insumoId));
  const ordens = dados.ordensProducao.filter((o) => receitaIds.has(o.receitaId) && formaIds.has(o.formaId));

  await client.transaction(async (tx) => {
    await inserirLote(tx, "categoria", ["id", "nome", "data_atualizacao"],
      dados.categorias.map((c) => [c.id, c.nome, c.dataAtualizacao]));
    await inserirLote(tx, "insumo",
      ["id", "nome", "unidade_medida", "estoque_minimo", "custo_unitario", "data_atualizacao", "categoria_id", "ativo"],
      insumos.map((i) => [i.id, i.nome, i.unidadeMedida, i.estoqueMinimo, i.custoUnitario, i.dataAtualizacao, i.categoriaId, i.ativo]));
    await inserirLote(tx, "receita",
      ["id", "nome", "descricao", "rendimento_ml", "margem_lucro", "data_atualizacao"],
      dados.receitas.map((r) => [r.id, r.nome, r.descricao, r.rendimentoMl, r.margemLucro, r.dataAtualizacao]));
    await inserirLote(tx, "forma", ["id", "nome", "volume_ml", "insumo_id"],
      formas.map((f) => [f.id, f.nome, f.volumeMl, f.insumoId]));
    await inserirLote(tx, "receita_item", ["id", "receita_id", "insumo_id", "quantidade"],
      itens.map((it) => [it.id, it.receitaId, it.insumoId, it.quantidade]));
    await inserirLote(tx, "movimento_estoque",
      ["id", "quantidade", "tipo", "custo_unitario", "data_movimento", "data_registro", "observacao", "insumo_id"],
      movimentos.map((m) => [m.id, m.quantidade, m.tipo, m.custoUnitario, m.dataMovimento, m.dataRegistro, m.observacao, m.insumoId]));
    await inserirLote(tx, "ordem_producao",
      ["id", "receita_id", "forma_id", "quantidade_unidades", "status", "custo_total_estimado",
        "preco_venda_unitario", "observacao", "data_prevista", "data_criacao", "data_conclusao"],
      ordens.map((o) => [o.id, o.receitaId, o.formaId, o.quantidadeUnidades, o.status, o.custoTotalEstimado,
        o.precoVendaUnitario, o.observacao, o.dataPrevista, o.dataCriacao, o.dataConclusao]));
  });

  const ignorados =
    dados.insumos.length - insumos.length +
    (dados.formas.length - formas.length) +
    (dados.receitaItens.length - itens.length) +
    (dados.movimentos.length - movimentos.length) +
    (dados.ordensProducao.length - ordens.length);
  return `${insumos.length} insumos, ${movimentos.length} movimentos, ${ordens.length} ordens` +
    (ignorados > 0 ? ` (${ignorados} registros órfãos ignorados)` : "");
}

export async function importarDadosLocais(client: PGlite): Promise<void> {
  if (await tabelaVazia(client, "categoria")) {
    if (fs.existsSync(DATA_FILE)) {
      const dados = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as LocalDbSchema;
      const resumo = await importarCadastros(client, dados);
      console.info(`[db local] Dados importados de data/caramelize-db.json: ${resumo}.`);
    } else {
      const resumo = await importarCadastros(client, createSeedData());
      console.info(`[db local] Banco criado com os dados de exemplo: ${resumo}.`);
    }
  }

  if ((await tabelaVazia(client, "usuario")) && fs.existsSync(USERS_FILE)) {
    const { usuarios } = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as { usuarios: UsuarioJson[] };
    await client.transaction(async (tx) => {
      await inserirLote(tx, "usuario", ["id", "nome", "email", "senha_hash", "role", "ativo", "data_criacao"],
        usuarios.map((u) => [u.id, u.nome, u.email.toLowerCase(), u.senhaHash, u.role, u.ativo, u.dataCriacao]));
    });
    console.info(`[db local] ${usuarios.length} usuário(s) importado(s) de data/caramelize-users.json.`);
  }
}
