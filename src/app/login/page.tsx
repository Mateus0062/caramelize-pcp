"use client";

import Image from "next/image";
import { Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "senha";

const PASSWORD_MIN_LENGTH = 8;

const inputClass =
  "w-full pl-10 pr-10 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500";
const labelClass =
  "block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setNovaSenha("");
    setConfirmarSenha("");
  };

  const handleLogin = async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 403 && data.code === "MUST_CHANGE_PASSWORD") {
      setMode("senha");
      setNotice(
        data.error ?? "Por segurança, defina uma nova senha antes de entrar.",
      );
      return;
    }
    if (!res.ok) {
      throw new Error(data.error || "Não foi possível entrar.");
    }
    router.replace("/");
    router.refresh();
  };

  const handleChangePassword = async () => {
    if (novaSenha.length < PASSWORD_MIN_LENGTH) {
      throw new Error(`A nova senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    }
    if (novaSenha !== confirmarSenha) {
      throw new Error("A confirmação não confere com a nova senha.");
    }
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senhaAtual: password, novaSenha }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Não foi possível trocar a senha.");
    }
    router.replace("/");
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") await handleLogin();
      else await handleChangePassword();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar solicitação.");
    } finally {
      setLoading(false);
    }
  };

  const toggleShowPass = (
    <button
      type="button"
      onClick={() => setShowPass((v) => !v)}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-cacau-suave hover:text-cacau cursor-pointer"
      aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
    >
      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-creme flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Marca */}
        <div className="text-center">
          <Image
            src="/marca-pudim.png"
            alt="Caramelize"
            width={64}
            height={64}
            priority
            className="h-16 w-16 mx-auto rounded-2xl object-contain bg-creme-claro p-2 border border-caramelo-200 shadow-xs"
          />
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-4">
            Caramelize
          </h1>
          <p className="text-xs uppercase tracking-[0.22em] text-caramelo-600 font-semibold mt-1">
            Planejamento e Controle de Produção
          </p>
        </div>

        {/* Card */}
        <div className="bg-creme-claro rounded-3xl border border-caramelo-200/80 p-6 sm:p-8 shadow-sm">
          <h2 className="font-display text-2xl font-semibold text-cacau mb-5">
            {mode === "login" ? "Entrar" : "Trocar senha"}
          </h2>

          {notice && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs font-medium text-amber-900">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelClass}>
                E-mail
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                {mode === "login" ? "Senha" : "Senha atual"}
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
                {toggleShowPass}
              </div>
            </div>

            {mode === "senha" && (
              <>
                <div>
                  <label htmlFor="nova-senha" className={labelClass}>
                    Nova senha
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="nova-senha"
                      type={showPass ? "text" : "password"}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmar-senha" className={labelClass}>
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="confirmar-senha"
                      type={showPass ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-caramelo-600 text-creme-claro text-sm font-semibold hover:bg-caramelo-700 transition shadow-sm disabled:opacity-60 cursor-pointer mt-2"
            >
              {loading
                ? "Aguarde..."
                : mode === "login"
                  ? "Entrar no Sistema"
                  : "Salvar nova senha e entrar"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-caramelo-200/70 text-center space-y-2">
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "senha" : "login")}
              className="text-xs font-semibold text-caramelo-700 hover:text-caramelo-800 cursor-pointer"
            >
              {mode === "login" ? "Quero trocar minha senha" : "Voltar para o login"}
            </button>
            <p className="text-xs text-cacau-suave">
              Não tem acesso? Peça a um administrador para criar sua conta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
