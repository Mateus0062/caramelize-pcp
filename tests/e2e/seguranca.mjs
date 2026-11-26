// Teste ponta a ponta contra um servidor rodando (padrão: http://localhost:3000).
// Rode SEMPRE contra um banco local descartável (sem DATABASE_URL): o teste cria
// usuários, insumos e ordens, e dispara o limite de tentativas de login.
//
//   E2E_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD (ou ADMIN_EMAIL/ADMIN_PASSWORD do .env.local)
import crypto from "node:crypto";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
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

async function req(method, url, { cookie, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = `caramelize_session=${cookie}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    h["Content-Type"] = "application/json";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    h["Content-Type"] = "application/json";
  }
  const res = await fetch(BASE + url, { method, headers: h, body: payload, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/caramelize_session=([^;]*)/);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, cookie: m ? m[1] : undefined, headers: res.headers };
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

// 1) Sem cookie
let r = await req("GET", "/api/insumos");
check("API sem sessão → 401", r.status === 401, r.status);

// 2) Bypass antigo: qualquer cookie com ponto
r = await req("GET", "/api/insumos", { cookie: "a.b" });
check("Cookie falso 'a.b' → 401 (bypass antigo fechado)", r.status === 401, r.status);

// 3) Token forjado com a chave padrão antiga
const oldSecret = "caramelize-pcp-local-dev-secret-change-in-production-2026";
const forgedPayload = b64url(
  JSON.stringify({ id: 1, sub: 1, nome: "x", email: "x", role: "ADMIN", fp: "x", exp: Math.floor(Date.now() / 1000) + 3600 }),
);
const forgedSig = crypto.createHmac("sha256", oldSecret).update(forgedPayload).digest("base64url");
r = await req("GET", "/api/insumos", { cookie: `${forgedPayload}.${forgedSig}` });
check("Token forjado com a chave padrão antiga → 401", r.status === 401, r.status);

// 4) Cadastro público removido
r = await req("POST", "/api/auth/register", { body: { nome: "Hacker", email: "h@x.test", password: "12345678" } });
check("Cadastro público não existe mais", r.status === 401 || r.status === 404, r.status);

// 5) Página de login sem credenciais padrão
r = await req("GET", "/login");
check("Tela de login não exibe a senha padrão", r.status === 200 && !r.text.includes("caramelize123"), r.status);

// 6) Página principal sem sessão redireciona
r = await req("GET", "/");
check("Página inicial sem sessão → redireciona para /login", [307, 308].includes(r.status) && (r.headers.get("location") ?? "").includes("/login"), r.status);

// 7) Login errado
r = await req("POST", "/api/auth/login", { body: { email: env.ADMIN_EMAIL, password: "senha-errada-123" } });
check("Login com senha errada → 401", r.status === 401, r.status);

// 8) Login admin (criado via ADMIN_EMAIL/ADMIN_PASSWORD)
r = await req("POST", "/api/auth/login", { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
const admin = r.cookie;
await exigirBancoLocal(admin);
check("Login do administrador inicial → 200", r.status === 200 && Boolean(admin), r.status + " " + r.text);
check("Cookie de sessão é HttpOnly e SameSite", /HttpOnly/i.test(r.headers.get("set-cookie") ?? "") && /SameSite=lax/i.test(r.headers.get("set-cookie") ?? ""));

r = await req("GET", "/api/auth/me", { cookie: admin });
check("/api/auth/me devolve papel ADMIN", r.json?.user?.role === "ADMIN", r.text);

r = await req("GET", "/api/insumos", { cookie: admin });
check("Admin lê insumos → 200", r.status === 200 && Array.isArray(r.json), r.status);

// 9) Admin cria operador
const opEmail = "operador.teste@caramelize.test";
r = await req("POST", "/api/usuarios", {
  cookie: admin,
  body: { nome: "Operador Teste", email: opEmail, senha: env.TEST_OPERADOR_PASSWORD, role: "OPERADOR" },
});
const opId = r.json?.id;
check("Admin cria operador → 201", r.status === 201 && Number.isInteger(opId), r.status + " " + r.text);
check("Resposta de usuário não contém hash de senha", !r.text.includes("senhaHash") && !r.text.includes("senha_hash"));

r = await req("POST", "/api/auth/login", { body: { email: opEmail, password: env.TEST_OPERADOR_PASSWORD } });
let op = r.cookie;
check("Login do operador → 200", r.status === 200 && Boolean(op), r.status);

// 10) Permissões do operador
r = await req("DELETE", "/api/insumos/1", { cookie: op });
check("Operador não exclui insumo → 403", r.status === 403, r.status);
r = await req("POST", "/api/categorias", { cookie: op, body: { nome: "Invasora" } });
check("Operador não cria categoria → 403", r.status === 403, r.status);
r = await req("PUT", "/api/receitas/1", { cookie: op, body: { nome: "X", rendimentoMl: 1, itens: [{ insumoId: 1, quantidade: 1 }] } });
check("Operador não edita receita → 403", r.status === 403, r.status);
r = await req("GET", "/api/usuarios", { cookie: op });
check("Operador não lista usuários → 403", r.status === 403, r.status);
r = await req("POST", "/api/movimentos", { cookie: op, body: { insumoId: 1, quantidade: 1, tipo: "AJUSTE_ENTRADA" } });
check("Operador registra movimento → 201", r.status === 201, r.status + " " + r.text);
r = await req("PATCH", "/api/ordens/1", { cookie: op, body: { status: "CONCLUIDA", permitirEstoqueNegativo: true } });
check("Operador não força baixa com estoque negativo → 403", r.status === 403, r.status);

// 11) Validação e erros
r = await req("POST", "/api/movimentos", { cookie: admin, raw: "{nao-e-json" });
check("JSON malformado → 400 com mensagem genérica", r.status === 400 && r.json?.error === "Requisição inválida.", r.status + " " + r.text);
r = await req("POST", "/api/receitas", {
  cookie: admin,
  body: { nome: "Gigante", rendimentoMl: 100, itens: Array.from({ length: 101 }, (_, i) => ({ insumoId: i + 1, quantidade: 1 })) },
});
check("Receita com 101 itens → 400", r.status === 400, r.status);
r = await req("POST", "/api/movimentos", { cookie: admin, body: { insumoId: 1, quantidade: 1e15, tipo: "COMPRA" } });
check("Quantidade acima do limite → 400", r.status === 400, r.status);
r = await req("POST", "/api/movimentos", { cookie: admin, raw: JSON.stringify({ pad: "x".repeat(150_000) }) });
check("Corpo acima de 100 KB → 413", r.status === 413, r.status);
r = await req("DELETE", "/api/categorias/1", { cookie: admin });
check("Erro de negócio continua com mensagem clara (400)", r.status === 400 && typeof r.json?.error === "string", r.status + " " + r.text);

// 12) Revogação: desativar usuário encerra a sessão
r = await req("PATCH", `/api/usuarios/${opId}`, { cookie: admin, body: { ativo: false } });
check("Admin desativa operador → 200", r.status === 200, r.status + " " + r.text);
r = await req("GET", "/api/insumos", { cookie: op });
check("Sessão do operador desativado → 401", r.status === 401, r.status);
r = await req("POST", "/api/auth/login", { body: { email: opEmail, password: env.TEST_OPERADOR_PASSWORD } });
check("Operador desativado não consegue logar → 401", r.status === 401, r.status);
r = await req("PATCH", `/api/usuarios/${opId}`, { cookie: admin, body: { ativo: true } });
check("Admin reativa operador → 200", r.status === 200, r.status);

// 13) Troca de senha encerra sessões antigas
r = await req("POST", "/api/auth/login", { body: { email: opEmail, password: env.TEST_OPERADOR_PASSWORD } });
op = r.cookie;
const novaSenhaOp = env.TEST_OPERADOR_PASSWORD + "-nova";
r = await req("POST", "/api/auth/password", { body: { email: opEmail, senhaAtual: env.TEST_OPERADOR_PASSWORD, novaSenha: novaSenhaOp } });
const opNovo = r.cookie;
check("Operador troca a própria senha → 200", r.status === 200 && Boolean(opNovo), r.status + " " + r.text);
r = await req("GET", "/api/insumos", { cookie: op });
check("Token anterior à troca de senha → 401", r.status === 401, r.status);
r = await req("GET", "/api/insumos", { cookie: opNovo });
check("Novo token após troca → 200", r.status === 200, r.status);

// 14) Proteções do admin
const adminMe = (await req("GET", "/api/auth/me", { cookie: admin })).json?.user;
r = await req("PATCH", `/api/usuarios/${adminMe.id}`, { cookie: admin, body: { ativo: false } });
check("Admin não desativa a si mesmo → 400", r.status === 400, r.status);
r = await req("POST", "/api/usuarios", { cookie: admin, body: { nome: "Fraco", email: "fraco@caramelize.test", senha: "caramelize123", role: "OPERADOR" } });
check("Senha padrão antiga é recusada para novos usuários → 400", r.status === 400, r.status);

// 15) Troca obrigatória para quem ainda usa a senha padrão antiga.
// Requer um usuário "legado@caramelize.test" com a senha antiga no banco de teste
// (ex.: importado de data/caramelize-users.json); sem ele, o teste é pulado.
r = await req("POST", "/api/auth/login", { body: { email: "legado@caramelize.test", password: "caramelize123" } });
if (r.status === 401) {
  console.log("SKIP  Troca obrigatória de senha (usuário legado não existe neste banco)");
} else {
  check("Login com senha padrão antiga → 403 MUST_CHANGE_PASSWORD (sem cookie)", r.status === 403 && r.json?.code === "MUST_CHANGE_PASSWORD" && !r.cookie, r.status + " " + r.text);
  r = await req("POST", "/api/auth/password", { body: { email: "legado@caramelize.test", senhaAtual: "caramelize123", novaSenha: "Nova-Senha-Legado-2026" } });
  check("Troca obrigatória de senha → 200 e já entra", r.status === 200 && Boolean(r.cookie), r.status + " " + r.text);
}

// 16) Limite de tentativas
const alvo = "ninguem@caramelize.test";
const statuses = [];
for (let i = 0; i < 6; i++) {
  r = await req("POST", "/api/auth/login", { body: { email: alvo, password: `errada-${i}` } });
  statuses.push(r.status);
}
check("6ª tentativa errada seguida → 429 com Retry-After", statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429 && Boolean(r.headers.get("retry-after")), statuses.join(","));

// 17) Logout
r = await req("POST", "/api/auth/logout", { cookie: admin });
check("Logout limpa o cookie", r.status === 200 && r.cookie === "", r.status);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
