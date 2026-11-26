"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Play,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatBRL, formatDate, formatQty } from "@/lib/format";
import { calcularNecessidadesOrdem } from "@/lib/pcp-engine";
import type {
  FormaComDetalhes,
  OrdemProducaoComDetalhes,
  ReceitaComDetalhes,
  StatusOrdemProducao,
} from "@/lib/types";
import { StatusBadge } from "./DashboardView";

interface ProducaoViewProps {
  ordens: OrdemProducaoComDetalhes[];
  receitas: ReceitaComDetalhes[];
  formas: FormaComDetalhes[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: "success" | "error") => void;
}

export function ProducaoView({
  ordens,
  receitas,
  formas,
  onRefresh,
  onToast,
}: ProducaoViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [receitaId, setReceitaId] = useState("");
  const [formaId, setFormaId] = useState("");
  const [quantidade, setQuantidade] = useState("10");
  const [precoVenda, setPrecoVenda] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataPrevista, setDataPrevista] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  const selectedReceita = useMemo(
    () => receitas.find((r) => String(r.id) === receitaId) ?? null,
    [receitas, receitaId],
  );
  const selectedForma = useMemo(
    () => formas.find((f) => String(f.id) === formaId) ?? null,
    [formas, formaId],
  );

  // Explosão de Materiais (MRP) ao vivo no modal
  const previewMrp = useMemo(() => {
    const qtdNum = Number(quantidade) || 0;
    if (!selectedReceita || !selectedForma || qtdNum <= 0) return null;
    return calcularNecessidadesOrdem(selectedReceita, selectedForma, qtdNum);
  }, [selectedReceita, selectedForma, quantidade]);

  const openCreate = () => {
    const firstRec = receitas[0];
    const firstForma = formas[0];
    setReceitaId(firstRec ? String(firstRec.id) : "");
    setFormaId(firstForma ? String(firstForma.id) : "");
    setQuantidade("10");
    const sim = firstRec?.simulacaoFormas.find(
      (s) => s.formaId === firstForma?.id,
    );
    setPrecoVenda(sim ? String(sim.precoSugeridoUnitario) : "");
    setObservacao("");
    setDataPrevista(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  };

  const handleSelectReceitaOrForma = (nextRecId: string, nextFormaId: string) => {
    setReceitaId(nextRecId);
    setFormaId(nextFormaId);
    const rec = receitas.find((r) => String(r.id) === nextRecId);
    const sim = rec?.simulacaoFormas.find(
      (s) => String(s.formaId) === nextFormaId,
    );
    if (sim) setPrecoVenda(String(sim.precoSugeridoUnitario));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/ordens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receitaId: Number(receitaId),
          formaId: Number(formaId),
          quantidadeUnidades: Number(quantidade),
          precoVendaUnitario: precoVenda
            ? Number(precoVenda.replace(",", "."))
            : null,
          observacao: observacao.trim() || null,
          dataPrevista,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar ordem");
      onToast("Ordem de produção criada!");
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao criar ordem",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (
    op: OrdemProducaoComDetalhes,
    status: StatusOrdemProducao,
  ) => {
    let permitirEstoqueNegativo = false;
    if (status === "CONCLUIDA") {
      if (!op.estoqueSuficiente) {
        const ok = confirm(
          `Atenção: há insumos com saldo abaixo do necessário para a OP #${op.id}. Deseja concluir mesmo assim e dar baixa no estoque?`,
        );
        if (!ok) return;
        permitirEstoqueNegativo = true;
      } else {
        const ok = confirm(
          `Concluir a OP #${op.id} (${op.quantidadeUnidades}x ${op.formaNome}) e dar baixa automática de todos os insumos no estoque?`,
        );
        if (!ok) return;
      }
    }

    try {
      const res = await fetch(`/api/ordens/${op.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, permitirEstoqueNegativo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar ordem");
      onToast(
        status === "CONCLUIDA"
          ? "Produção concluída e estoque atualizado automaticamente!"
          : `Status atualizado para ${status.replace("_", " ")}.`,
      );
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao atualizar status",
        "error",
      );
    }
  };

  const handleDelete = async (op: OrdemProducaoComDetalhes) => {
    if (!confirm(`Excluir a Ordem de Produção #${op.id}?`)) return;
    try {
      const res = await fetch(`/api/ordens/${op.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir ordem");
      onToast("Ordem removida.");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao excluir ordem",
        "error",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-caramelo-600 font-semibold">
            Planejamento & Controle de Produção
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-1">
            Ordens de Produção (PCP)
          </h2>
          <p className="text-sm text-cacau-suave mt-1">
            Planeje lotes por tamanho de forma, confira a lista exata de ingredientes necessários e dê baixa automática no estoque ao concluir.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 transition shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nova Ordem de Produção
        </button>
      </div>

      {/* Lista de Ordens */}
      {ordens.length === 0 ? (
        <div className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-10 text-center">
          <ClipboardList className="h-10 w-10 text-caramelo-500 mx-auto" />
          <h3 className="font-display text-xl font-semibold text-cacau mt-3">
            Nenhuma ordem planejada
          </h3>
          <p className="text-sm text-cacau-suave mt-1">
            Crie sua primeira ordem de produção para calcular ingredientes e controlar o estoque.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {ordens.map((op) => {
            const receitaPrevista = op.precoVendaUnitario
              ? op.precoVendaUnitario * op.quantidadeUnidades
              : null;
            const lucroPrevisto =
              receitaPrevista != null
                ? receitaPrevista - op.custoTotalEstimado
                : null;

            return (
              <article
                key={op.id}
                className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-caramelo-200/60">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-caramelo-700">
                        OP #{op.id}
                      </span>
                      <StatusBadge status={op.status} />
                      <span className="text-xs text-cacau-suave">
                        Prevista: {formatDate(op.dataPrevista)}
                      </span>
                      {!op.estoqueSuficiente && op.status !== "CONCLUIDA" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Falta insumo no estoque
                        </span>
                      )}
                    </div>
                    <h3 className="font-display text-2xl font-semibold text-cacau mt-1.5">
                      {op.quantidadeUnidades}× {op.formaNome} — {op.receitaNome}
                    </h3>
                    <p className="text-xs text-cacau-suave mt-1">
                      Volume total: {formatQty(op.volumeTotalMl, "ml")} · Escala:{" "}
                      {op.fatorEscala}× da receita base
                      {op.observacao ? ` · ${op.observacao}` : ""}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-wrap items-center gap-2">
                    {op.status === "PLANEJADA" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(op, "EM_PRODUCAO")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200 transition cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Iniciar Produção
                      </button>
                    )}
                    {(op.status === "PLANEJADA" ||
                      op.status === "EM_PRODUCAO") && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(op, "CONCLUIDA")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Concluir & Baixar Estoque
                      </button>
                    )}
                    {op.status !== "CONCLUIDA" && (
                      <button
                        type="button"
                        onClick={() => handleDelete(op)}
                        className="p-2 rounded-xl border border-caramelo-200 text-cacau-suave hover:bg-red-100 hover:text-red-700 transition cursor-pointer"
                        title="Excluir ordem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Resumo Financeiro da OP */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-creme p-3 border border-caramelo-100">
                    <p className="text-[11px] uppercase tracking-wider text-cacau-suave font-semibold">
                      Custo Total
                    </p>
                    <p className="font-display text-lg font-semibold text-cacau mt-0.5">
                      {formatBRL(op.custoTotalEstimado)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-creme p-3 border border-caramelo-100">
                    <p className="text-[11px] uppercase tracking-wider text-cacau-suave font-semibold">
                      Custo / Unidade
                    </p>
                    <p className="font-display text-lg font-semibold text-cacau mt-0.5">
                      {formatBRL(op.custoUnitario)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-creme p-3 border border-caramelo-100">
                    <p className="text-[11px] uppercase tracking-wider text-cacau-suave font-semibold">
                      Faturamento Prev.
                    </p>
                    <p className="font-display text-lg font-semibold text-caramelo-700 mt-0.5">
                      {receitaPrevista != null ? formatBRL(receitaPrevista) : "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-creme p-3 border border-caramelo-100">
                    <p className="text-[11px] uppercase tracking-wider text-cacau-suave font-semibold">
                      Lucro Previsto
                    </p>
                    <p className="font-display text-lg font-semibold text-emerald-700 mt-0.5">
                      {lucroPrevisto != null ? formatBRL(lucroPrevisto) : "—"}
                    </p>
                  </div>
                </div>

                {/* Explosão de Materiais (MRP) */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-2">
                    Explosão de Materiais (Ingredientes + Embalagens)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="text-left text-xs text-cacau-suave border-b border-caramelo-100">
                          <th className="py-2 pr-3">Insumo</th>
                          <th className="py-2 pr-3">Necessário</th>
                          <th className="py-2 pr-3">Em Estoque</th>
                          <th className="py-2 pr-3">Situação</th>
                          <th className="py-2 text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-caramelo-100/70">
                        {op.necessidades.map((nec) => (
                          <tr key={`${op.id}-${nec.insumoId}-${nec.ehForma}`}>
                            <td className="py-2 pr-3 font-medium text-cacau">
                              {nec.insumoNome}
                              {nec.ehForma && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-caramelo-100 text-caramelo-800 text-[10px] font-semibold">
                                  Forma
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-semibold text-cacau">
                              {formatQty(nec.quantidadeNecessaria, nec.unidadeMedida)}
                            </td>
                            <td className="py-2 pr-3 text-cacau-suave">
                              {formatQty(nec.saldoDisponivel, nec.unidadeMedida)}
                            </td>
                            <td className="py-2 pr-3">
                              {op.status === "CONCLUIDA" ? (
                                <span className="text-emerald-700 font-semibold text-xs">
                                  Baixado
                                </span>
                              ) : nec.falta > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                  <ShoppingCart className="h-3 w-3" />
                                  Comprar {formatQty(nec.falta, nec.unidadeMedida)}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-semibold text-xs">
                                  OK
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right font-medium text-cacau">
                              {formatBRL(nec.custoTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Nova Ordem de Produção */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-cacau/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-creme-claro rounded-3xl border border-caramelo-200 max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-caramelo-200/70">
              <h3 className="font-display text-2xl font-semibold text-cacau">
                Planejar Ordem de Produção
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl text-cacau-suave hover:bg-caramelo-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Receita *
                  </label>
                  <select
                    required
                    value={receitaId}
                    onChange={(e) =>
                      handleSelectReceitaOrForma(e.target.value, formaId)
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {receitas.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.nome} ({r.rendimentoMl}ml)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Forma / Tamanho *
                  </label>
                  <select
                    required
                    value={formaId}
                    onChange={(e) =>
                      handleSelectReceitaOrForma(receitaId, e.target.value)
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {formas.map((f) => (
                      <option key={f.id} value={String(f.id)}>
                        {f.nome} ({f.volumeMl}ml)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Quantidade de Unidades *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Preço de Venda Unitário (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={precoVenda}
                    onChange={(e) => setPrecoVenda(e.target.value)}
                    placeholder="Opcional — p/ cálculo de lucro"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Data Prevista
                  </label>
                  <input
                    type="date"
                    value={dataPrevista}
                    onChange={(e) => setDataPrevista(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Observação / Cliente
                  </label>
                  <input
                    type="text"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex.: Encomenda festa sábado"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  />
                </div>
              </div>

              {/* Preview MRP */}
              {previewMrp && (
                <div className="rounded-2xl bg-caramelo-50/90 border border-caramelo-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-caramelo-800">
                        Cálculo MRP em Tempo Real
                      </p>
                      <p className="text-xs text-cacau-suave">
                        {formatQty(previewMrp.volumeTotalMl, "ml")} de massa (
                        {previewMrp.fatorEscala}× receita)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-cacau-suave">Custo Total</p>
                      <p className="font-display text-xl font-semibold text-caramelo-700">
                        {formatBRL(previewMrp.custoTotalEstimado)} (
                        {formatBRL(previewMrp.custoUnitario)}/un)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {previewMrp.necessidades.map((n) => (
                      <div
                        key={`${n.insumoId}-${n.ehForma}`}
                        className="flex items-center justify-between text-xs px-3 py-1.5 rounded-xl bg-creme-claro border border-caramelo-200/60"
                      >
                        <span className="font-medium text-cacau">
                          {n.insumoNome}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">
                            {formatQty(n.quantidadeNecessaria, n.unidadeMedida)}
                          </span>
                          {n.falta > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                              Falta {formatQty(n.falta, n.unidadeMedida)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">
                              OK
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-caramelo-200/70">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-caramelo-200 text-sm font-semibold text-cacau hover:bg-caramelo-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? "Criando..." : "Criar Ordem de Produção"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
