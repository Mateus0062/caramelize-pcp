"use client";

import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login" ? { email, password } : { nome, email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível autenticar.");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao processar solicitação.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-creme flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Marca */}
        <div className="text-center">
          <img
            src="/marca-pudim.png"
            alt="Caramelize"
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
          {/* Tabs Entrar / Criar Conta */}
          <div className="grid grid-cols-2 rounded-2xl bg-creme border border-caramelo-200/70 p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                mode === "login"
                  ? "bg-caramelo-600 text-creme-claro shadow-xs"
                  : "text-cacau-suave hover:text-cacau"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                mode === "register"
                  ? "bg-caramelo-600 text-creme-claro shadow-xs"
                  : "text-cacau-suave hover:text-cacau"
              }`}
            >
              Criar Conta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Maria Caramelize"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPass ? "text" : "password"}
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "register" ? "Mínimo 6 caracteres" : "••••••••"
                  }
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-cacau-suave hover:text-cacau cursor-pointer"
                  tabIndex={-1}
                >
                  {showPass ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700">
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
                  : "Criar Conta e Entrar"}
            </button>
          </form>

          {mode === "login" && (
            <div className="mt-5 pt-4 border-t border-caramelo-200/70 text-center">
              <p className="text-xs text-cacau-suave">
                Primeiro acesso? Use o administrador padrão:
              </p>
              <p className="text-xs font-medium text-cacau mt-1">
                <code className="px-1.5 py-0.5 rounded bg-caramelo-50 border border-caramelo-200">
                  admin@caramelize.com.br
                </code>{" "}
                ·{" "}
                <code className="px-1.5 py-0.5 rounded bg-caramelo-50 border border-caramelo-200">
                  caramelize123
                </code>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
