"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChefHat,
  ClipboardList,
  Package,
  Plus,
  TrendingUp,
} from "lucide-react";
import { formatBRL, formatDateTime, formatQty } from "@/lib/format";
import type { DashboardResumo } from "@/lib/types";
import type { ActiveTab } from "./AppShell";

interface DashboardViewProps {
  dashboard: DashboardResumo;
  onNavigate: (tab: ActiveTab) => void;
}

export function DashboardView({ dashboard, onNavigate }: DashboardViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-caramelo-600 font-semibold">
            Painel de Controle
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-1">
            Produção Caramelize
          </h2>
          <p className="text-sm text-cacau-suave mt-1">
            Acompanhe custos de insumos, fichas técnicas, níveis de estoque e ordens de produção.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate("insumos")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-caramelo-300 bg-creme-claro text-sm font-semibold text-cacau hover:bg-caramelo-50 transition cursor-pointer"
          >
            <Plus className="h-4 w-4 text-caramelo-600" />
            Novo Insumo
          </button>
          <button
            type="button"
            onClick={() => onNavigate("producao")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 transition shadow-sm cursor-pointer"
          >
            <ClipboardList className="h-4 w-4" />
            Nova Ordem de Produção
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Valor em Estoque"
          value={formatBRL(dashboard.valorTotalEstoque)}
          subtitle={`${dashboard.totalInsumosAtivos} insumos ativos cadastrados`}
          icon={TrendingUp}
          accent="caramelo"
        />
        <KpiCard
          title="Alertas de Reposição"
          value={String(dashboard.insumosAbaixoMinimo)}
          subtitle={
            dashboard.insumosAbaixoMinimo > 0
              ? "Itens abaixo do estoque mínimo"
              : "Todos os insumos abastecidos"
          }
          icon={AlertTriangle}
          accent={dashboard.insumosAbaixoMinimo > 0 ? "danger" : "success"}
        />
        <KpiCard
          title="Receitas & Formas"
          value={`${dashboard.totalReceitas} / ${dashboard.totalFormas}`}
          subtitle="Fichas técnicas e tamanhos ativos"
          icon={ChefHat}
          accent="caramelo"
        />
        <KpiCard
          title="Ordens em Aberto"
          value={String(dashboard.ordensPlanejadas + dashboard.ordensEmProducao)}
          subtitle={`${dashboard.ordensEmProducao} em produção · ${dashboard.unidadesProduzidas} un. concluídas`}
          icon={Package}
          accent="caramelo"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Alertas de Estoque */}
        <section className="lg:col-span-5 bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-xl font-semibold text-cacau">
                Alertas de Estoque
              </h3>
              <p className="text-xs text-cacau-suave">
                Insumos no limite ou abaixo do mínimo configurado
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("estoque")}
              className="text-xs font-semibold text-caramelo-600 hover:text-caramelo-700 cursor-pointer"
            >
              Repor estoque →
            </button>
          </div>

          {dashboard.alertasEstoque.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200/70 p-5 text-center">
              <p className="text-sm font-semibold text-emerald-800">
                Estoque 100% em dia!
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Nenhum insumo está abaixo do estoque mínimo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboard.alertasEstoque.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-red-50/70 border border-red-200/70"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-cacau truncate">
                      {item.nome}
                    </p>
                    <p className="text-xs text-cacau-suave">
                      {item.categoriaNome} · Mín:{" "}
                      {formatQty(item.estoqueMinimo, item.unidadeMedida)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                      {formatQty(item.saldoAtual, item.unidadeMedida)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ordens de Produção Recentes */}
        <section className="lg:col-span-7 bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-xl font-semibold text-cacau">
                Ordens de Produção
              </h3>
              <p className="text-xs text-cacau-suave">
                Lotes planejados e em andamento na cozinha
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("producao")}
              className="text-xs font-semibold text-caramelo-600 hover:text-caramelo-700 cursor-pointer"
            >
              Ver todas →
            </button>
          </div>

          {dashboard.ordensRecentes.length === 0 ? (
            <div className="rounded-2xl bg-caramelo-50/70 border border-caramelo-200 p-6 text-center">
              <p className="text-sm text-cacau-suave">
                Nenhuma ordem de produção cadastrada ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboard.ordensRecentes.map((op) => (
                <div
                  key={op.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-creme/60 border border-caramelo-200/60"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-caramelo-700">
                        OP #{op.id}
                      </span>
                      <StatusBadge status={op.status} />
                      {!op.estoqueSuficiente && op.status !== "CONCLUIDA" && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                          Falta insumo
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-cacau mt-1">
                      {op.quantidadeUnidades}× {op.formaNome} — {op.receitaNome}
                    </p>
                    {op.observacao && (
                      <p className="text-xs text-cacau-suave mt-0.5">
                        {op.observacao}
                      </p>
                    )}
                  </div>
                  <div className="sm:text-right shrink-0">
                    <p className="text-sm font-bold text-cacau">
                      {formatBRL(op.custoTotalEstimado)}
                    </p>
                    <p className="text-xs text-cacau-suave">
                      {formatBRL(op.custoUnitario)} / un
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Últimas Movimentações */}
      <section className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl font-semibold text-cacau">
              Últimas Movimentações de Estoque
            </h3>
            <p className="text-xs text-cacau-suave">
              Compras, baixas automáticas de produção e ajustes
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("estoque")}
            className="text-xs font-semibold text-caramelo-600 hover:text-caramelo-700 cursor-pointer"
          >
            Histórico completo →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-caramelo-200/70 text-left text-xs uppercase tracking-wider text-cacau-suave">
                <th className="py-2.5 pr-4">Tipo</th>
                <th className="py-2.5 pr-4">Insumo</th>
                <th className="py-2.5 pr-4">Quantidade</th>
                <th className="py-2.5 pr-4">Observação</th>
                <th className="py-2.5 text-right">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-caramelo-100">
              {dashboard.ultimosMovimentos.map((m) => {
                const entrada =
                  m.tipo === "COMPRA" || m.tipo === "AJUSTE_ENTRADA";
                return (
                  <tr key={m.id} className="hover:bg-caramelo-50/40">
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          entrada
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {entrada ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        )}
                        {m.tipo.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-medium text-cacau">
                      {m.insumoNome}
                    </td>
                    <td className="py-3 pr-4 font-semibold">
                      {entrada ? "+" : "-"}
                      {formatQty(m.quantidade, m.unidadeMedida)}
                    </td>
                    <td className="py-3 pr-4 text-cacau-suave max-w-xs truncate">
                      {m.observacao || "—"}
                    </td>
                    <td className="py-3 text-right text-xs text-cacau-suave whitespace-nowrap">
                      {formatDateTime(m.dataMovimento)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Package;
  accent: "caramelo" | "danger" | "success";
}) {
  const iconStyle =
    accent === "danger"
      ? "bg-red-100 text-red-700"
      : accent === "success"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-caramelo-100 text-caramelo-700";

  return (
    <div className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cacau-suave">
            {title}
          </p>
          <p className="font-display text-3xl font-semibold text-cacau mt-2">
            {value}
          </p>
        </div>
        <div className={`p-2.5 rounded-2xl ${iconStyle}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-xs text-cacau-suave mt-3">{subtitle}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PLANEJADA: "bg-caramelo-100 text-caramelo-800",
    EM_PRODUCAO: "bg-amber-100 text-amber-900",
    CONCLUIDA: "bg-emerald-100 text-emerald-800",
    CANCELADA: "bg-stone-200 text-stone-700",
  };
  const labels: Record<string, string> = {
    PLANEJADA: "Planejada",
    EM_PRODUCAO: "Em Produção",
    CONCLUIDA: "Concluída",
    CANCELADA: "Cancelada",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
        styles[status] ?? "bg-stone-100 text-stone-700"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
