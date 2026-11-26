"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AppShell,
  type ActiveTab,
  type AuthUserInfo,
} from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { EstoqueFormasView } from "@/components/EstoqueFormasView";
import { InsumosView } from "@/components/InsumosView";
import { ProducaoView } from "@/components/ProducaoView";
import { ReceitasView } from "@/components/ReceitasView";
import { UsuariosView } from "@/components/UsuariosView";
import type {
  Categoria,
  DashboardResumo,
  FormaComDetalhes,
  InsumoComDetalhes,
  MovimentoComDetalhes,
  OrdemProducaoComDetalhes,
  ReceitaComDetalhes,
} from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [dashboard, setDashboard] = useState<DashboardResumo | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [insumos, setInsumos] = useState<InsumoComDetalhes[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentoComDetalhes[]>([]);
  const [totalMovimentos, setTotalMovimentos] = useState(0);
  const [carregandoMovimentos, setCarregandoMovimentos] = useState(false);
  const [formas, setFormas] = useState<FormaComDetalhes[]>([]);
  const [receitas, setReceitas] = useState<ReceitaComDetalhes[]>([]);
  const [ordens, setOrdens] = useState<OrdemProducaoComDetalhes[]>([]);

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 4000);
    },
    [],
  );

  const loadAll = useCallback(async () => {
    try {
      // Uma única requisição traz tudo (antes eram 8, e cada uma relia o banco inteiro).
      const res = await fetch("/api/pcp", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Falha ao carregar dados do PCP");
      }

      const listas = [
        data?.categorias,
        data?.insumos,
        data?.movimentos,
        data?.formas,
        data?.receitas,
        data?.ordens,
      ];
      if (!data?.dashboard || listas.some((l) => !Array.isArray(l))) {
        throw new Error("Resposta inesperada do servidor ao carregar os dados.");
      }

      setUser(data.user ?? null);
      setDashboard(data.dashboard);
      setCategorias(data.categorias);
      setInsumos(data.insumos);
      setMovimentos(data.movimentos);
      setTotalMovimentos(Number(data.totalMovimentos ?? data.movimentos.length));
      setFormas(data.formas);
      setReceitas(data.receitas);
      setOrdens(data.ordens);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro inesperado ao carregar sistema",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  /** Busca a próxima página do histórico de movimentos. */
  const loadMoreMovimentos = useCallback(async () => {
    setCarregandoMovimentos(true);
    try {
      const res = await fetch(
        `/api/movimentos?limite=200&deslocamento=${movimentos.length}`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(data?.error || "Erro ao carregar mais movimentos");
      }
      setMovimentos((prev) => {
        // Evita duplicados caso um movimento novo tenha deslocado a paginação.
        const ids = new Set(prev.map((m) => m.id));
        return [...prev, ...(data as MovimentoComDetalhes[]).filter((m) => !ids.has(m.id))];
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao carregar movimentos", "error");
    } finally {
      setCarregandoMovimentos(false);
    }
  }, [movimentos.length, showToast]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <img
            src="/marca-pudim.png"
            alt="Caramelize"
            className="h-16 w-16 mx-auto animate-pulse object-contain"
          />
          <p className="font-display text-xl font-semibold text-cacau">
            Carregando Caramelize PCP...
          </p>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center p-6">
        <div className="bg-creme-claro rounded-3xl border border-red-200 p-6 max-w-md w-full text-center space-y-3">
          <h2 className="font-display text-2xl font-semibold text-cacau">
            Ops! Algo deu errado
          </h2>
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadAll();
            }}
            className="px-4 py-2 rounded-xl bg-caramelo-600 text-creme-claro text-sm font-semibold cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === "ADMIN";

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      storageMode={dashboard.storageMode}
      alertCount={dashboard.insumosAbaixoMinimo}
      activeOrdersCount={dashboard.ordensPlanejadas + dashboard.ordensEmProducao}
      user={user}
      onLogout={handleLogout}
    >
      {activeTab === "dashboard" && (
        <DashboardView dashboard={dashboard} onNavigate={setActiveTab} />
      )}
      {activeTab === "insumos" && (
        <InsumosView
          insumos={insumos}
          categorias={categorias}
          isAdmin={isAdmin}
          onRefresh={loadAll}
          onToast={showToast}
        />
      )}
      {activeTab === "receitas" && (
        <ReceitasView
          receitas={receitas}
          insumos={insumos}
          isAdmin={isAdmin}
          onRefresh={loadAll}
          onToast={showToast}
        />
      )}
      {activeTab === "producao" && (
        <ProducaoView
          ordens={ordens}
          receitas={receitas}
          formas={formas}
          isAdmin={isAdmin}
          onRefresh={loadAll}
          onToast={showToast}
        />
      )}
      {activeTab === "estoque" && (
        <EstoqueFormasView
          insumos={insumos}
          movimentos={movimentos}
          totalMovimentos={totalMovimentos}
          carregandoMovimentos={carregandoMovimentos}
          onLoadMoreMovimentos={loadMoreMovimentos}
          formas={formas}
          isAdmin={isAdmin}
          onRefresh={loadAll}
          onToast={showToast}
        />
      )}
      {activeTab === "usuarios" && isAdmin && user && (
        <UsuariosView currentUserId={user.id} onToast={showToast} />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border transition ${
            toast.type === "error"
              ? "bg-red-700 text-white border-red-800"
              : "bg-cacau text-creme-claro border-caramelo-700"
          }`}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}
