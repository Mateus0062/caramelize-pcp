"use client";

import {
  Boxes,
  ChefHat,
  ClipboardList,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  X,
} from "lucide-react";
import { useState } from "react";

export type ActiveTab =
  | "dashboard"
  | "insumos"
  | "receitas"
  | "producao"
  | "estoque";

export interface AuthUserInfo {
  id: number;
  nome: string;
  email: string;
  role: "ADMIN" | "OPERADOR";
}

interface AppShellProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  storageMode: "supabase" | "local";
  alertCount: number;
  activeOrdersCount: number;
  user: AuthUserInfo | null;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  subtitle: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: "dashboard",
    label: "Visão Geral",
    subtitle: "Resumo da produção",
    icon: LayoutDashboard,
  },
  {
    id: "insumos",
    label: "Insumos & Preços",
    subtitle: "Ingredientes e custos",
    icon: Package,
  },
  {
    id: "receitas",
    label: "Receitas & Custos",
    subtitle: "Fichas técnicas",
    icon: ChefHat,
  },
  {
    id: "producao",
    label: "Produção (PCP)",
    subtitle: "Ordens e MRP",
    icon: ClipboardList,
  },
  {
    id: "estoque",
    label: "Estoque & Formas",
    subtitle: "Entradas e tamanhos",
    icon: Boxes,
  },
];

export function AppShell({
  activeTab,
  onTabChange,
  storageMode,
  alertCount,
  activeOrdersCount,
  user,
  onLogout,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (tab: ActiveTab) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-creme text-cacau">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-creme-claro/95 backdrop-blur border-b border-caramelo-200/70">
        <div className="flex items-center gap-3">
          <img
            src="/marca-pudim.png"
            alt="Caramelize"
            className="h-9 w-9 rounded-xl object-contain bg-caramelo-50 p-1 border border-caramelo-200"
          />
          <div>
            <p className="font-display text-lg font-semibold leading-tight text-cacau">
              Caramelize
            </p>
            <p className="text-[11px] uppercase tracking-widest text-caramelo-600 font-medium">
              Sistema PCP
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-xl border border-caramelo-200 bg-creme text-cacau hover:bg-caramelo-100 transition"
          aria-label="Abrir menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-cacau/40 backdrop-blur-xs">
          <aside className="w-72 max-w-[85vw] h-full bg-creme-claro p-5 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-caramelo-200/70">
                <div className="flex items-center gap-3">
                  <img
                    src="/marca-pudim.png"
                    alt="Caramelize"
                    className="h-10 w-10 rounded-xl object-contain bg-caramelo-50 p-1 border border-caramelo-200"
                  />
                  <div>
                    <p className="font-display text-xl font-semibold text-cacau leading-none">
                      Caramelize
                    </p>
                    <p className="text-xs text-caramelo-600 font-medium mt-0.5">
                      PCP Pudim Artesanal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-cacau-suave hover:bg-caramelo-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-5 space-y-1.5">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-left transition ${
                        active
                          ? "bg-caramelo-600 text-creme-claro shadow-md"
                          : "text-cacau hover:bg-caramelo-100/70"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold leading-tight">
                            {item.label}
                          </p>
                          <p
                            className={`text-[11px] ${
                              active ? "text-caramelo-100" : "text-cacau-suave"
                            }`}
                          >
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      {item.id === "insumos" && alertCount > 0 && (
                        <span
                          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                            active
                              ? "bg-creme-claro text-caramelo-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {alertCount}
                        </span>
                      )}
                      {item.id === "producao" && activeOrdersCount > 0 && (
                        <span
                          className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                            active
                              ? "bg-creme-claro text-caramelo-700"
                              : "bg-caramelo-100 text-caramelo-700"
                          }`}
                        >
                          {activeOrdersCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="space-y-3">
              <UserFooter user={user} onLogout={onLogout} />
              <StorageBadge storageMode={storageMode} />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0 bg-creme-claro border-r border-caramelo-200/70 p-6 justify-between sticky top-0 h-screen">
        <div>
          <div className="flex items-center gap-3.5 pb-6 border-b border-caramelo-200/70">
            <img
              src="/marca-pudim.png"
              alt="Caramelize"
              className="h-12 w-12 rounded-2xl object-contain bg-caramelo-50 p-1.5 border border-caramelo-200 shadow-xs"
            />
            <div>
              <h1 className="font-display text-2xl font-semibold text-cacau leading-none tracking-tight">
                Caramelize
              </h1>
              <p className="text-[11px] uppercase tracking-[0.2em] text-caramelo-600 font-semibold mt-1">
                Gestão PCP
              </p>
            </div>
          </div>

          <nav className="mt-6 space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition cursor-pointer ${
                    active
                      ? "bg-caramelo-600 text-creme-claro shadow-md"
                      : "text-cacau hover:bg-caramelo-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold leading-tight">
                        {item.label}
                      </p>
                      <p
                        className={`text-[11px] mt-0.5 ${
                          active ? "text-caramelo-100" : "text-cacau-suave"
                        }`}
                      >
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  {item.id === "insumos" && alertCount > 0 && (
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                        active
                          ? "bg-creme-claro text-caramelo-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {alertCount}
                    </span>
                  )}
                  {item.id === "producao" && activeOrdersCount > 0 && (
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                        active
                          ? "bg-creme-claro text-caramelo-700"
                          : "bg-caramelo-100 text-caramelo-700"
                      }`}
                    >
                      {activeOrdersCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3">
          <UserFooter user={user} onLogout={onLogout} />
          <StorageBadge storageMode={storageMode} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}

function UserFooter({
  user,
  onLogout,
}: {
  user: AuthUserInfo | null;
  onLogout: () => void;
}) {
  if (!user) return null;
  return (
    <div className="rounded-2xl border border-caramelo-200/80 bg-creme p-3 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-cacau truncate">{user.nome}</p>
        <p className="text-[11px] text-cacau-suave truncate">{user.email}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-caramelo-200 bg-creme-claro text-xs font-semibold text-cacau hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition cursor-pointer shrink-0"
        title="Sair do sistema"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair
      </button>
    </div>
  );
}

function StorageBadge({ storageMode }: { storageMode: "supabase" | "local" }) {
  const isSupabase = storageMode === "supabase";
  return (
    <div className="rounded-2xl border border-caramelo-200/80 bg-caramelo-50/70 p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isSupabase ? "bg-emerald-500" : "bg-caramelo-500"
          }`}
        />
        <Database className="h-4 w-4 text-caramelo-700" />
        <span className="text-xs font-semibold text-cacau">
          {isSupabase ? "Supabase Conectado" : "Banco Local Ativo"}
        </span>
      </div>
      <p className="text-[11px] text-cacau-suave mt-1.5 leading-relaxed">
        {isSupabase
          ? "Dados persistidos no PostgreSQL do Supabase."
          : "Salvando em data/caramelize-db.json. Configure DATABASE_URL no .env.local para usar Supabase."}
      </p>
    </div>
  );
}
