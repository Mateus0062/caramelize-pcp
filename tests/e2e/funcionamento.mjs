// Teste ponta a ponta contra um servidor rodando (padrão: http://localhost:3000).
// Rode SEMPRE contra um banco local descartável (sem DATABASE_URL): o teste cria
// usuários, insumos e ordens, e dispara o limite de tentativas de login.
//
//   E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD (ou ADMIN_EMAIL/ADMIN_PASSWORD do .env.local)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const APP_DIR = process.cwd();
const env = {
  ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD,
  TEST_OPERADOR_PASSWORD: `Oper-${crypto.randomBytes(9).toString("base64url")}`,
};
if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
  console.error("Defina E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD (ou ADMIN_EMAIL/ADMIN_PASSWORD).");
  process.exit(1);
}

/** Trava de segurança: não roda contra o Supabase (dados reais). */
async function exigirBancoLocal(cookie) {
  const r = await fetch(BASE + "/api/pcp", { headers: { Cookie: `caramelize_session=${cookie}` } });
  const modo = (await r.json()).dashboard?.storageMode;
  if (modo !== "local" && process.env.E2E_PERMITIR_SUPABASE !== "true") {
    console.error(`Abortado: o servidor está usando o banco "${modo}". Rode os testes contra o banco local.`);
    process.exit(1);
  }
}

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${extra}`}`);
}

let cookie;
async function req(method, url, body) {
  const headers = { Cookie: `caramelize_session=${cookie ?? ""}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const m = (res.headers.get("set-cookie") ?? "").match(/caramelize_session=([^;]*)/);
  return { status: res.status, json, text, cookie: m?.[1] };
}

// Login como admin
let r = await req("POST", "/api/auth/login", { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
cookie = r.cookie;
await exigirBancoLocal(cookie);
check("Login admin", r.status === 200 && Boolean(cookie), r.status + " " + r.text);

const receitas = (await req("GET", "/api/receitas")).json;
const formas = (await req("GET", "/api/formas")).json;
const receitaId = receitas[0].id;
const forma = formas[0];

const contarBaixas = async (opId) =>
  (await req("GET", "/api/movimentos")).json.filter(
    (m) => m.tipo === "PRODUCAO" && (m.observacao ?? "").includes(`OP #${opId} `),
  ).length;

// --- 1. Baixa duplicada (duas conclusões simultâneas da mesma OP) ---
r = await req("POST", "/api/ordens", { receitaId, formaId: forma.id, quantidadeUnidades: 500, dataPrevista: "2026-11-30" });
const opGrande = r.json;
check("Cria OP grande (estoque insuficiente)", r.status === 201, r.status + " " + r.text);
check("Data prevista gravada ao meio-dia UTC do dia escolhido", opGrande?.dataPrevista === "2026-11-30T12:00:00.000Z", opGrande?.dataPrevista);

const [c1, c2, c3] = await Promise.all([
  req("PATCH", `/api/ordens/${opGrande.id}`, { status: "CONCLUIDA", permitirEstoqueNegativo: true }),
  req("PATCH", `/api/ordens/${opGrande.id}`, { status: "CONCLUIDA", permitirEstoqueNegativo: true }),
  req("PATCH", `/api/ordens/${opGrande.id}`, { status: "CONCLUIDA", permitirEstoqueNegativo: true }),
]);
const okCount = [c1, c2, c3].filter((x) => x.status === 200).length;
check("3 conclusões simultâneas → só 1 aceita", okCount === 1, [c1, c2, c3].map((x) => x.status).join(","));
const ordensAgora = (await req("GET", "/api/ordens")).json;
const nec = ordensAgora.find((o) => o.id === opGrande.id).necessidades.filter((n) => n.quantidadeNecessaria > 0).length;
const baixas = await contarBaixas(opGrande.id);
check("Estoque baixado uma única vez", baixas === nec, `baixas=${baixas} esperado=${nec}`);

// --- 2. Estoque negativo visível ---
const insumos = (await req("GET", "/api/insumos")).json;
check("Saldo negativo aparece (não é mais escondido como 0)", insumos.some((i) => i.saldoAtual < 0));
const dash = (await req("GET", "/api/dashboard")).json;
check("Valor do estoque não fica negativo", dash.valorTotalEstoque >= 0, dash.valorTotalEstoque);

// --- 3. Regras de status ---
r = await req("PATCH", `/api/ordens/${opGrande.id}`, { status: "PLANEJADA" });
check("OP concluída não volta para planejada → 400", r.status === 400, r.status);
r = await req("POST", "/api/ordens", { receitaId, formaId: forma.id, quantidadeUnidades: 1 });
const op2 = r.json;
r = await req("PATCH", `/api/ordens/${op2.id}`, { status: "PLANEJADA" });
check("Mesmo status → 400", r.status === 400, r.status);
r = await req("PATCH", `/api/ordens/${op2.id}`, { status: "CANCELADA" });
check("Planejada → cancelada → 200", r.status === 200, r.status + " " + r.text);
r = await req("PATCH", `/api/ordens/${op2.id}`, { status: "CONCLUIDA", permitirEstoqueNegativo: true });
check("Cancelada → concluída é bloqueado → 400", r.status === 400, r.status);
check("OP cancelada não baixou estoque", (await contarBaixas(op2.id)) === 0);
r = await req("PATCH", `/api/ordens/${op2.id}`, { status: "PLANEJADA" });
check("Cancelada → reaberta (planejada) → 200", r.status === 200, r.status);
r = await req("PATCH", `/api/ordens/${op2.id}`, { status: "EM_PRODUCAO" });
r = await req("PATCH", `/api/ordens/${op2.id}`, { status: "PLANEJADA" });
check("Em produção → planejada é bloqueado → 400", r.status === 400, r.status);

// --- 4. Datas ---
r = await req("POST", "/api/ordens", { receitaId, formaId: forma.id, quantidadeUnidades: 1, dataPrevista: "2026-02-31" });
check("Data inexistente (31/02) → 400", r.status === 400, r.status + " " + r.text);
r = await req("POST", "/api/ordens", { receitaId, formaId: forma.id, quantidadeUnidades: 1, dataPrevista: "amanhã" });
check("Data em formato inválido → 400", r.status === 400, r.status);
r = await req("POST", "/api/ordens", { receitaId, formaId: forma.id, quantidadeUnidades: 1 });
const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
check("Sem data → hoje no fuso de São Paulo", r.json?.dataPrevista?.slice(0, 10) === hojeSP, r.json?.dataPrevista);

// --- 5. Saídas sem saldo ---
const comSaldo = (await req("GET", "/api/insumos")).json.find((i) => i.saldoAtual > 1);
r = await req("POST", "/api/movimentos", { insumoId: comSaldo.id, quantidade: comSaldo.saldoAtual + 1000, tipo: "AJUSTE_SAIDA" });
check("Saída maior que o saldo → 400 com mensagem", r.status === 400 && /Saldo insuficiente/.test(r.json?.error ?? ""), r.status + " " + r.text);
r = await req("POST", "/api/movimentos", { insumoId: comSaldo.id, quantidade: 1, tipo: "AJUSTE_SAIDA" });
check("Saída dentro do saldo → 201", r.status === 201, r.status + " " + r.text);
r = await req("POST", "/api/movimentos", { insumoId: comSaldo.id, quantidade: 1, tipo: "AJUSTE_ENTRADA" });
check("Movimento sem custo registra o custo atual do insumo", r.status === 201 && r.json?.custoUnitario === comSaldo.custoUnitario, JSON.stringify(r.json));

// --- 6. Insumo arquivado, categoria e forma ---
r = await req("POST", "/api/categorias", { nome: "Categoria Teste" });
const catId = r.json.id;
r = await req("POST", "/api/insumos", { nome: "Insumo Arquivável", unidadeMedida: "g", estoqueMinimo: 0, custoUnitario: 1, categoriaId: catId, estoqueInicial: 10 });
const insArq = r.json;
check("Cria insumo com estoque inicial", r.status === 201, r.status + " " + r.text);
r = await req("DELETE", `/api/insumos/${insArq.id}`);
check("Insumo com movimento é arquivado", r.status === 200, r.status);
r = await req("POST", "/api/movimentos", { insumoId: insArq.id, quantidade: 1, tipo: "COMPRA" });
check("Movimento em insumo arquivado → 400", r.status === 400, r.status);
r = await req("DELETE", `/api/categorias/${catId}`);
check("Categoria com insumo arquivado não é apagada → 400", r.status === 400 && /arquivados/.test(r.json?.error ?? ""), r.status + " " + r.text);
r = await req("POST", "/api/insumos", { nome: "Sem Categoria", unidadeMedida: "g", estoqueMinimo: 0, custoUnitario: 1, categoriaId: 99999 });
check("Insumo com categoria inexistente → 400", r.status === 400, r.status);
r = await req("DELETE", `/api/insumos/${forma.insumoId}`);
check("Insumo que é embalagem de uma forma não é excluído → 400", r.status === 400 && /forma/.test(r.json?.error ?? ""), r.status + " " + r.text);
r = await req("POST", "/api/formas", { nome: "Forma Duplicada", volumeMl: 100, insumoId: forma.insumoId });
check("Forma com insumo já vinculado → 400", r.status === 400, r.status);
r = await req("POST", "/api/formas", { nome: "Forma Fantasma", volumeMl: 100, insumoId: 99999 });
check("Forma com insumo inexistente → 400", r.status === 400, r.status);
r = await req("POST", "/api/receitas", { nome: "Receita Fantasma", rendimentoMl: 100, itens: [{ insumoId: 99999, quantidade: 1 }] });
check("Receita com insumo inexistente → 400", r.status === 400, r.status);
r = await req("DELETE", "/api/ordens/99999");
check("Excluir OP inexistente → 400 (antes dizia ok)", r.status === 400, r.status);
r = await req("DELETE", `/api/ordens/${opGrande.id}`);
check("Excluir OP concluída → 400", r.status === 400, r.status);

// --- 7. Banco embutido e custo médio ponderado ---
check("Banco local (PGlite) criado em data/pglite", fs.existsSync(path.join(APP_DIR, "data", "pglite")));
r = await req("POST", "/api/categorias", { nome: "Categoria CMP" });
r = await req("POST", "/api/insumos", { nome: "Insumo CMP", unidadeMedida: "g", estoqueMinimo: 0, custoUnitario: 1, categoriaId: r.json.id, estoqueInicial: 100 });
const insCmp = r.json;
r = await req("POST", "/api/movimentos", { insumoId: insCmp.id, quantidade: 100, tipo: "COMPRA", custoUnitario: 2, atualizarPrecoInsumo: true });
check("Compra com custo médio: 100 @ R$1 + 100 @ R$2 → R$1,50", r.status === 201 && r.json?.novoCustoInsumo === 1.5, r.status + " " + r.text);
r = await req("POST", "/api/movimentos", { insumoId: insCmp.id, quantidade: 10, tipo: "COMPRA", custoUnitario: 3, atualizarPrecoInsumo: true, metodoCusto: "ULTIMO" });
check("Compra com 'último preço' → R$3,00", r.status === 201 && r.json?.novoCustoInsumo === 3, r.status + " " + r.text);
const insAtual = (await req("GET", "/api/insumos")).json.find((i) => i.id === insCmp.id);
check("Custo do insumo atualizado no cadastro", insAtual?.custoUnitario === 3, JSON.stringify(insAtual));

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
