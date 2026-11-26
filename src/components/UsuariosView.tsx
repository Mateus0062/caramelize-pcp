"use client";

import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { formatDate } from "@/lib/format";

type Role = "ADMIN" | "OPERADOR";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  dataCriacao: string;
}

interface UsuariosViewProps {
  currentUserId: number;
  onToast: (msg: string, type?: "success" | "error") => void;
}

const PASSWORD_MIN_LENGTH = 8;

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500";
const labelClass =
  "block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5";

export function UsuariosView({ currentUserId, onToast }: UsuariosViewProps) {
  const confirmar = useConfirm();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<Role>("OPERADOR");

  const [resetId, setResetId] = useState<number | null>(null);
  const [resetSenha, setResetSenha] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usuarios", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao carregar usuários");
      setUsuarios(data as Usuario[]);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao carregar usuários", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, senha, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao criar usuário");
      setNome("");
      setEmail("");
      setSenha("");
      setRole("OPERADOR");
      onToast("Usuário criado! Passe a senha temporária para a pessoa trocar no primeiro acesso.");
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao criar usuário", "error");
    } finally {
      setSaving(false);
    }
  };

  const patchUsuario = async (
    u: Usuario,
    changes: { role?: Role; ativo?: boolean; novaSenha?: string },
    successMessage: string,
  ): Promise<boolean> => {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar usuário");
      onToast(successMessage);
      await load();
      return true;
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erro ao atualizar usuário", "error");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAtivo = async (u: Usuario) => {
    const ok = await confirmar({
      titulo: u.ativo ? "Desativar acesso" : "Reativar acesso",
      mensagem: u.ativo
        ? `${u.nome} não conseguirá mais entrar, e as sessões abertas serão encerradas.`
        : `${u.nome} voltará a ter acesso ao sistema.`,
      textoConfirmar: u.ativo ? "Desativar" : "Reativar",
    });
    if (!ok) return;
    void patchUsuario(
      u,
      { ativo: !u.ativo },
      u.ativo ? "Usuário desativado. As sessões dele foram encerradas." : "Usuário reativado.",
    );
  };

  const handleResetSenha = async (u: Usuario) => {
    if (resetSenha.length < PASSWORD_MIN_LENGTH) {
      onToast(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`, "error");
      return;
    }
    const ok = await patchUsuario(
      u,
      { novaSenha: resetSenha },
      "Senha redefinida. As sessões abertas desse usuário foram encerradas.",
    );
    if (ok) {
      setResetId(null);
      setResetSenha("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-caramelo-600 font-semibold">
          Acesso ao Sistema
        </p>
        <h2 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-1">
          Usuários
        </h2>
        <p className="text-sm text-cacau-suave mt-1">
          Somente administradores têm acesso a esta aba e gerenciam contas. Operadores
          têm controle total sobre as demais áreas do sistema (insumos, receitas, estoque, formas e produção).
        </p>
      </div>

      {/* Novo usuário */}
      <form
        onSubmit={handleCreate}
        className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
      >
        <div className="lg:col-span-1">
          <label htmlFor="novo-nome" className={labelClass}>
            Nome
          </label>
          <input
            id="novo-nome"
            required
            minLength={2}
            maxLength={100}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="lg:col-span-1">
          <label htmlFor="novo-email" className={labelClass}>
            E-mail
          </label>
          <input
            id="novo-email"
            type="email"
            required
            maxLength={120}
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="lg:col-span-1">
          <label htmlFor="novo-senha" className={labelClass}>
            Senha temporária
          </label>
          <input
            id="novo-senha"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={`Mín. ${PASSWORD_MIN_LENGTH} caracteres`}
            className={inputClass}
          />
        </div>
        <div className="lg:col-span-1">
          <label htmlFor="novo-papel" className={labelClass}>
            Papel
          </label>
          <select
            id="novo-papel"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={inputClass}
          >
            <option value="OPERADOR">Operador</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 transition shadow-sm cursor-pointer disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Criar usuário
        </button>
      </form>

      {/* Lista */}
      <div className="bg-creme-claro rounded-3xl border border-caramelo-200/70 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-caramelo-50/80 border-b border-caramelo-200/70 text-left text-xs uppercase tracking-wider text-cacau-suave">
                <th className="py-3.5 px-5">Usuário</th>
                <th className="py-3.5 px-4">Papel</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Criado em</th>
                <th className="py-3.5 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-caramelo-100">
              {usuarios.map((u) => {
                const isSelf = u.id === currentUserId;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-caramelo-50/40 transition align-top">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-cacau">
                        {u.nome}
                        {isSelf && (
                          <span className="ml-2 text-[11px] font-medium text-caramelo-700">(você)</span>
                        )}
                      </p>
                      <p className="text-xs text-cacau-suave">{u.email}</p>
                      {resetId === u.id && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            type="password"
                            aria-label={`Nova senha para ${u.nome}`}
                            autoComplete="new-password"
                            minLength={PASSWORD_MIN_LENGTH}
                            value={resetSenha}
                            onChange={(e) => setResetSenha(e.target.value)}
                            placeholder={`Nova senha (mín. ${PASSWORD_MIN_LENGTH})`}
                            className="px-3 py-1.5 rounded-lg bg-creme border border-caramelo-200 text-xs"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleResetSenha(u)}
                            className="px-3 py-1.5 rounded-lg bg-caramelo-600 text-creme-claro text-xs font-semibold cursor-pointer disabled:opacity-60"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetId(null);
                              setResetSenha("");
                            }}
                            className="px-3 py-1.5 rounded-lg border border-caramelo-200 text-xs cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        aria-label={`Papel de ${u.nome}`}
                        value={u.role}
                        disabled={isSelf || busy}
                        onChange={(e) =>
                          void patchUsuario(
                            u,
                            { role: e.target.value as Role },
                            "Papel atualizado.",
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-creme border border-caramelo-200 text-xs disabled:opacity-60"
                      >
                        <option value="OPERADOR">Operador</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          u.ativo ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"
                        }`}
                      >
                        {u.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-cacau-suave">{formatDate(u.dataCriacao)}</td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setResetId(u.id);
                          setResetSenha("");
                        }}
                        className="p-2 rounded-xl text-cacau-suave hover:bg-caramelo-100 hover:text-caramelo-700 transition cursor-pointer"
                        title="Redefinir senha"
                        aria-label={`Redefinir senha de ${u.nome}`}
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      {!isSelf && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleAtivo(u)}
                          className={`p-2 rounded-xl text-cacau-suave transition cursor-pointer ml-1 disabled:opacity-60 ${
                            u.ativo
                              ? "hover:bg-red-100 hover:text-red-700"
                              : "hover:bg-emerald-100 hover:text-emerald-700"
                          }`}
                          title={u.ativo ? "Desativar acesso" : "Reativar acesso"}
                          aria-label={u.ativo ? `Desativar ${u.nome}` : `Reativar ${u.nome}`}
                        >
                          {u.ativo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-cacau-suave">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-cacau-suave">
                    Carregando usuários...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
