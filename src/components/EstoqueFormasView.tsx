"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  formatBRL,
  formatDateTime,
  formatQty,
  formatUnitCost,
  parseDecimal,
} from "@/lib/format";
import type {
  FormaComDetalhes,
  InsumoComDetalhes,
  MovimentoComDetalhes,
  TipoMovimento,
} from "@/lib/types";

interface EstoqueFormasViewProps {
  insumos: InsumoComDetalhes[];
  movimentos: MovimentoComDetalhes[];
  formas: FormaComDetalhes[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: "success" | "error") => void;
}

export function EstoqueFormasView({
  insumos,
  movimentos,
  formas,
  isAdmin,
  onRefresh,
  onToast,
}: EstoqueFormasViewProps) {
  const [subTab, setSubTab] = useState<"movimentos" | "formas">("movimentos");

  // Form movimento
  const [insumoId, setInsumoId] = useState(insumos[0] ? String(insumos[0].id) : "");
  const [tipo, setTipo] = useState<TipoMovimento>("COMPRA");
  const [quantidade, setQuantidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [atualizarPreco, setAtualizarPreco] = useState(true);
  const [observacao, setObservacao] = useState("");

  // Form forma
  const [formaNome, setFormaNome] = useState("");
  const [formaVolume, setFormaVolume] = useState("");
  const [formaInsumoId, setFormaInsumoId] = useState("");

  const [saving, setSaving] = useState(false);

  const selectedInsumo = insumos.find((i) => String(i.id) === insumoId);
  const insumosDisponiveisParaForma = insumos.filter(
    (i) => !formas.some((f) => f.insumoId === i.id),
  );

  const handleCreateMovimento = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insumoId: Number(insumoId),
          tipo,
          quantidade: parseDecimal(quantidade),
          custoUnitario: custoUnitario
            ? parseDecimal(custoUnitario)
            : null,
          atualizarPrecoInsumo: tipo === "COMPRA" && atualizarPreco,
          observacao: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar movimento");

      setQuantidade("");
      setCustoUnitario("");
      setObservacao("");
      onToast("Movimentação registrada no estoque!");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao registrar movimento",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateForma = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/formas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formaNome,
          volumeMl: parseDecimal(formaVolume),
          insumoId: Number(formaInsumoId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar forma");
      setFormaNome("");
      setFormaVolume("");
      setFormaInsumoId("");
      onToast("Forma cadastrada com sucesso!");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao criar forma",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteForma = async (f: FormaComDetalhes) => {
    if (!confirm(`Remover a forma "${f.nome}"?`)) return;
    try {
      const res = await fetch(`/api/formas/${f.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir forma");
      onToast("Forma removida.");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao excluir forma",
        "error",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-caramelo-600 font-semibold">
            Controle de Materiais
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-1">
            Estoque & Formas
          </h2>
          <p className="text-sm text-cacau-suave mt-1">
            Registre compras, ajustes de estoque e vincule os tamanhos de formas usadas na produção.
          </p>
        </div>

        <div className="inline-flex rounded-2xl bg-creme-claro border border-caramelo-200 p-1 self-start">
          <button
            type="button"
            onClick={() => setSubTab("movimentos")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              subTab === "movimentos"
                ? "bg-caramelo-600 text-creme-claro"
                : "text-cacau hover:bg-caramelo-50"
            }`}
          >
            Movimentações ({movimentos.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("formas")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              subTab === "formas"
                ? "bg-caramelo-600 text-creme-claro"
                : "text-cacau hover:bg-caramelo-50"
            }`}
          >
            Formas & Tamanhos ({formas.length})
          </button>
        </div>
      </div>

      {subTab === "movimentos" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Formulário de Lançamento */}
          <section className="lg:col-span-4 bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs h-fit">
            <h3 className="font-display text-xl font-semibold text-cacau">
              Registrar Movimento
            </h3>
            <p className="text-xs text-cacau-suave mt-1">
              Lance compras para repor estoque ou faça ajustes manuais.
            </p>

            <form onSubmit={handleCreateMovimento} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Insumo *
                </label>
                <select
                  required
                  value={insumoId}
                  onChange={(e) => setInsumoId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                >
                  <option value="">Selecione...</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={String(i.id)}>
                      {i.nome} (Saldo: {formatQty(i.saldoAtual, i.unidadeMedida)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Tipo de Movimento *
                </label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoMovimento)}
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                >
                  <option value="COMPRA">Compra (Entrada)</option>
                  <option value="AJUSTE_ENTRADA">Ajuste de Entrada (+)</option>
                  <option value="AJUSTE_SAIDA">Ajuste / Perda (Saída -)</option>
                  <option value="PRODUCAO">Consumo de Produção (-)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Quantidade ({selectedInsumo?.unidadeMedida ?? "un"}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="Ex.: 1000"
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                />
              </div>

              {tipo === "COMPRA" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                      Novo Preço Unitário (R$ / {selectedInsumo?.unidadeMedida ?? "un"})
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={custoUnitario}
                      onChange={(e) => setCustoUnitario(e.target.value)}
                      placeholder={
                        selectedInsumo
                          ? `Atual: ${selectedInsumo.custoUnitario}`
                          : "Opcional"
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-cacau cursor-pointer">
                    <input
                      type="checkbox"
                      checked={atualizarPreco}
                      onChange={(e) => setAtualizarPreco(e.target.checked)}
                      className="accent-caramelo-600 h-4 w-4"
                    />
                    Atualizar preço do insumo com este valor
                  </label>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Observação
                </label>
                <input
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: Compra no Atacadão"
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-caramelo-600 text-creme-claro text-sm font-semibold hover:bg-caramelo-700 transition cursor-pointer disabled:opacity-60"
              >
                {saving ? "Registrando..." : "Registrar Movimentação"}
              </button>
            </form>
          </section>

          {/* Histórico */}
          <section className="lg:col-span-8 bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs">
            <h3 className="font-display text-xl font-semibold text-cacau mb-4">
              Histórico de Movimentações
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-caramelo-200/70 text-left text-xs uppercase tracking-wider text-cacau-suave">
                    <th className="py-2.5 pr-3">Tipo</th>
                    <th className="py-2.5 pr-3">Insumo</th>
                    <th className="py-2.5 pr-3">Qtd</th>
                    <th className="py-2.5 pr-3">Observação</th>
                    <th className="py-2.5 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-caramelo-100">
                  {movimentos.map((m) => {
                    const entrada =
                      m.tipo === "COMPRA" || m.tipo === "AJUSTE_ENTRADA";
                    return (
                      <tr key={m.id} className="hover:bg-caramelo-50/40">
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
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
                        <td className="py-3 pr-3 font-medium text-cacau">
                          {m.insumoNome}
                        </td>
                        <td className="py-3 pr-3 font-semibold">
                          {entrada ? "+" : "-"}
                          {formatQty(m.quantidade, m.unidadeMedida)}
                        </td>
                        <td className="py-3 pr-3 text-cacau-suave max-w-xs truncate">
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Nova Forma */}
          {isAdmin && (
          <section className="lg:col-span-4 bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs h-fit">
            <h3 className="font-display text-xl font-semibold text-cacau">
              Cadastrar Forma / Tamanho
            </h3>
            <p className="text-xs text-cacau-suave mt-1">
              Vincule um insumo de embalagem ao volume em ml que ele comporta. O sistema usa isso para calcular o rendimento das receitas.
            </p>

            <form onSubmit={handleCreateForma} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Nome Comercial *
                </label>
                <input
                  type="text"
                  required
                  value={formaNome}
                  onChange={(e) => setFormaNome(e.target.value)}
                  placeholder="Ex.: Pudim Família (1,5kg)"
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Volume de Massa (ml) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formaVolume}
                  onChange={(e) => setFormaVolume(e.target.value)}
                  placeholder="Ex.: 1500"
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1">
                  Insumo da Embalagem *
                </label>
                <select
                  required
                  value={formaInsumoId}
                  onChange={(e) => setFormaInsumoId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                >
                  <option value="">Selecione...</option>
                  {insumosDisponiveisParaForma.map((i) => (
                    <option key={i.id} value={String(i.id)}>
                      {i.nome} ({formatBRL(i.custoUnitario)}/un)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-caramelo-600 text-creme-claro text-sm font-semibold hover:bg-caramelo-700 transition cursor-pointer disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {saving ? "Salvando..." : "Cadastrar Forma"}
              </button>
            </form>
          </section>
          )}

          {/* Lista de Formas */}
          <section className={`${isAdmin ? "lg:col-span-8" : "lg:col-span-12"} grid grid-cols-1 sm:grid-cols-2 gap-4 h-fit`}>
            {formas.map((f) => (
              <div
                key={f.id}
                className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-caramelo-100 text-caramelo-700">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-semibold text-cacau">
                        {f.nome}
                      </h4>
                      <p className="text-xs text-cacau-suave">{f.insumoNome}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteForma(f)}
                      className="p-1.5 rounded-lg text-cacau-suave hover:bg-red-100 hover:text-red-700 cursor-pointer"
                      title="Excluir forma"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-caramelo-100 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] text-cacau-suave">Volume</p>
                    <p className="text-sm font-bold text-cacau">{f.volumeMl} ml</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-cacau-suave">Custo Emb.</p>
                    <p className="text-sm font-bold text-caramelo-700">
                      {formatUnitCost(f.custoUnitario)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-cacau-suave">Em Estoque</p>
                    <p className={`text-sm font-bold ${f.saldoAtual < 0 ? "text-red-700" : "text-cacau"}`}>
                      {formatQty(f.saldoAtual, "un")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
