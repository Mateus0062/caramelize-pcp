import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/errors";
import {
  hashPassword,
  isPasswordOutdated,
  LEGACY_DEFAULT_PASSWORD,
  verifyPassword,
} from "@/lib/password";
import {
  assertNotRateLimited,
  clearFailures,
  credentialRules,
  recordFailure,
} from "@/lib/rate-limit";
import {
  passwordFingerprint,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session-token";

const SEGREDO_TESTE = "segredo-de-teste-com-mais-de-32-caracteres-123456";

describe("senhas", () => {
  it("gera hash com sal e confere a senha", async () => {
    const hash = await hashPassword("Senha-Forte-2026");
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword("Senha-Forte-2026", hash)).toBe(true);
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("o mesmo texto gera hashes diferentes (sal aleatório)", async () => {
    expect(await hashPassword("abc12345")).not.toBe(await hashPassword("abc12345"));
  });

  it("recusa hash malformado", async () => {
    expect(await verifyPassword("x", "sem-dois-pontos")).toBe(false);
    expect(await verifyPassword("x", "aa:bb")).toBe(false);
  });

  it("exige troca da senha padrão antiga e de senhas curtas", () => {
    expect(isPasswordOutdated(LEGACY_DEFAULT_PASSWORD)).toBe(true);
    expect(isPasswordOutdated("1234567")).toBe(true);
    expect(isPasswordOutdated("12345678")).toBe(false);
  });
});

describe("token de sessão", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", SEGREDO_TESTE);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("assina e valida", async () => {
    const token = await signSessionToken({ sub: 7, fp: "abc" });
    const payload = await verifySessionToken(token);
    expect(payload?.sub).toBe(7);
    expect(payload?.fp).toBe("abc");
  });

  it("recusa token alterado ou falso", async () => {
    const token = await signSessionToken({ sub: 7, fp: "abc" });
    const [corpo, assinatura] = token.split(".");
    const corpoFalso = Buffer.from(JSON.stringify({ sub: 1, fp: "abc", exp: 9e9 })).toString("base64url");
    expect(await verifySessionToken(`${corpoFalso}.${assinatura}`)).toBeNull();
    expect(await verifySessionToken(`${corpo}.${assinatura.slice(0, -2)}xx`)).toBeNull();
    expect(await verifySessionToken("a.b")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it("recusa token assinado com outra chave", async () => {
    const token = await signSessionToken({ sub: 7, fp: "abc" });
    vi.stubEnv("AUTH_SECRET", "outra-chave-diferente-com-mais-de-32-caracteres");
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("expira depois do prazo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T08:00:00Z"));
    const token = await signSessionToken({ sub: 7, fp: "abc" });
    vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE_SECONDS - 60) * 1000));
    expect(await verifySessionToken(token)).not.toBeNull();
    vi.setSystemTime(new Date(Date.now() + 120 * 1000));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("falha fechada sem AUTH_SECRET", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(signSessionToken({ sub: 1, fp: "x" })).rejects.toThrow(/AUTH_SECRET/);
  });

  it("a impressão digital muda quando a senha muda", async () => {
    const a = await passwordFingerprint("salt:hash-1");
    const b = await passwordFingerprint("salt:hash-2");
    expect(a).not.toBe(b);
    expect(a).toBe(await passwordFingerprint("salt:hash-1"));
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois de 5 falhas do mesmo e-mail e IP", () => {
    const regras = credentialRules("teste-unit", "10.0.0.1", "alvo@teste.local");
    for (let i = 0; i < 5; i++) {
      expect(() => assertNotRateLimited(regras)).not.toThrow();
      recordFailure(regras);
    }
    try {
      assertNotRateLimited(regras);
      expect.unreachable("deveria bloquear");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(429);
      expect((err as HttpError).headers?.["Retry-After"]).toBeDefined();
    }
  });

  it("libera depois de limpar o contador", () => {
    const regras = credentialRules("teste-unit-2", "10.0.0.2", "b@teste.local");
    for (let i = 0; i < 5; i++) recordFailure(regras);
    clearFailures(regras.map((r) => r.key));
    expect(() => assertNotRateLimited(regras)).not.toThrow();
  });
});
