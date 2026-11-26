"use client";

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Play,
  Plus,
  RotateCcw,
  ShoppingCart,
  Download,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { useDialogo } from "./useDialogo";
import { mul, soma, sub } from "@/lib/decimal";
import { formatBRL, formatDateOnly, formatQty, hojeISO, parseDecimal } from "@/lib/format";
import { baixarArquivo, gerarCsv, numeroCsv } from "@/lib/csv";
import {
  calcularNecessidadesOrdem,
  montarListaDeCompras,
  ordemAtiva,
  STATUS_LABEL,
} from "@/lib/pcp-engine";
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
  const confirmar = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [receitaId, setReceitaId] = useState("");
  const [formaId, setFormaId] = useState("");
  const [quantidade, setQuantidade] = useState("10");
  const [precoVenda, setPrecoVenda] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dataPrevista, setDataPrevista] = useState(hojeISO);
  const [saving, setSaving] = useState(false);
  const ordemDialogoRef = useDialogo<HTMLDivElement>(modalOpen, () => setModalOpen(false));
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);

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
    setDataPrevista(hojeISO());
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
          precoVendaUnitario: precoVenda ? parseDecimal(precoVenda) : null,
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
    if (busyOrderId !== null) return;
    let permitirEstoqueNegativo = false;
    if (status === "CANCELADA") {
      const ok = await confirmar({
        titulo: `Cancelar a OP #${op.id}`,
        mensagem: "Nenhum insumo será baixado do estoque. Você poderá reabrir a ordem depois.",
        textoConfirmar: "Cancelar ordem",
        perigo: true,
      });
      if (!ok) return;
    }
    if (status === "CONCLUIDA") {
      if (!op.estoqueSuficiente) {
        const ok = await confirmar({
          titulo: "Estoque insuficiente",
          mensagem: `Há insumos com saldo abaixo do necessário para a OP #${op.id}. Concluir mesmo assim e dar baixa no estoque? O saldo desses insumos ficará negativo.`,
          textoConfirmar: "Concluir mesmo assim",
          perigo: true,
        });
        if (!ok) return;
        permitirEstoqueNegativo = true;
      } else {
        const ok = await confirmar({
          titulo: `Concluir a OP #${op.id}`,
          mensagem: `${op.quantidadeUnidades}x ${op.formaNome}: todos os insumos serão baixados do estoque automaticamente.`,
          textoConfirmar: "Concluir e baixar",
        });
        if (!ok) return;
      }
    }

    setBusyOrderId(op.id);
    try {
      const res = await fetch(`/api/ordens/${op.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, permitirEstoqueNegativo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar ordem");
      onToast(
        status === "CONCLUIDA"
          ? "Produção concluída e estoque atualizado automaticamente!"
          : `Ordem agora está: ${STATUS_LABEL[status]}.`,
      );
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao atualizar status",
        "error",
      );
      await onRefresh();
    } finally {
      setBusyOrderId(null);
    }
  };

  const exportarListaDeCompras = () => {
    const lista = montarListaDeCompras(ordens);
    if (lista.length === 0) {
      onToast("Nada a comprar: o estoque cobre todas as ordens planejadas e em produção.");
      return;
    }
    const csv = gerarCsv(
      ["Insumo", "Unidade", "Necessário", "Em estoque", "Comprar", "Custo unitário (R$)", "Custo estimado (R$)"],
      lista.map((i) => [
        i.insumoNome,
        i.unidadeMedida,
        numeroCsv(i.necessario, 3),
        numeroCsv(i.saldoAtual, 3),
        numeroCsv(i.comprar, 3),
        numeroCsv(i.custoUnitario, 4),
        numeroCsv(i.custoEstimado, 2),
      ]),
    );
    baixarArquivo(`lista-de-compras-${hojeISO()}.csv`, csv);
    const total = soma(lista.map((i) => i.custoEstimado), 2);
    onToast(`Lista com ${lista.length} insumo(s) exportada — custo estimado ${formatBRL(total)}.`);
  };

  const handleDelete = async (op: OrdemProducaoComDetalhes) => {
    const ok = await confirmar({
      titulo: "Excluir ordem",
      mensagem: `Excluir a Ordem de Produção #${op.id}?`,
      textoConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
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
        <div className="flex flex-wrap gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={exportarListaDeCompras}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-caramelo-300 bg-creme-claro text-sm font-semibold text-cacau hover:bg-caramelo-50 transition cursor-pointer"
            title="Soma o que falta comprar para todas as ordens planejadas e em produção"
          >
            <Download className="h-4 w-4 text-caramelo-600" aria-hidden="true" />
            Lista de compras (CSV)
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 transition shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova Ordem de Produção
          </button>
        </div>
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
              ? mul(op.precoVendaUnitario, op.quantidadeUnidades, 2)
              : null;
            const lucroPrevisto =
              receitaPrevista != null
                ? sub(receitaPrevista, op.custoTotalEstimado, 2)
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
                        Prevista: {formatDateOnly(op.dataPrevista)}
                      </span>
                      {!op.estoqueSuficiente && ordemAtiva(op.status) && (
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
                        disabled={busyOrderId !== null}
                        onClick={() => handleStatusChange(op, "EM_PRODUCAO")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-100 text-amber-900 text-xs font-semibold hover:bg-amber-200 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Iniciar Produção
                      </button>
                    )}
                    {ordemAtiva(op.status) && (
                      <button
                        type="button"
                        disabled={busyOrderId !== null}
                        onClick={() => handleStatusChange(op, "CONCLUIDA")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-wait"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {busyOrderId === op.id ? "Processando..." : "Concluir & Baixar Estoque"}
                      </button>
                    )}
                    {ordemAtiva(op.status) && (
                      <button
                        type="button"
                        disabled={busyOrderId !== null}
                        onClick={() => handleStatusChange(op, "CANCELADA")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-caramelo-200 text-cacau-suave text-xs font-semibold hover:bg-stone-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    )}
                    {op.status === "CANCELADA" && (
                      <button
                        type="button"
                        disabled={busyOrderId !== null}
                        onClick={() => handleStatusChange(op, "PLANEJADA")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-caramelo-200 text-cacau text-xs font-semibold hover:bg-caramelo-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reabrir
                      </button>
                    )}
                    {op.status !== "CONCLUIDA" && (
                      <button
                        type="button"
                        disabled={busyOrderId !== null}
                        onClick={() => handleDelete(op)}
                        className="p-2 rounded-xl border border-caramelo-200 text-cacau-suave hover:bg-red-100 hover:text-red-700 transition cursor-pointer"
                        title="Excluir ordem"
                        aria-label="Excluir ordem"
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
                            <td
                              className={`py-2 pr-3 ${nec.saldoDisponivel < 0 ? "text-red-700 font-semibold" : "text-cacau-suave"}`}
                            >
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
          <div
            ref={ordemDialogoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ordem-modal-titulo"
            className="bg-creme-claro rounded-3xl border border-caramelo-200 max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-caramelo-200/70">
              <h3 id="ordem-modal-titulo" className="font-display text-2xl font-semibold text-cacau">
                Planejar Ordem de Produção
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl text-cacau-suave hover:bg-caramelo-100 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ordem-receita" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Receita *
                  </label>
                  <select
                    id="ordem-receita"
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
                  <label htmlFor="ordem-forma-tamanho" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Forma / Tamanho *
                  </label>
                  <select
                    id="ordem-forma-tamanho"
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
                  <label htmlFor="ordem-quantidade-de-unidades" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Quantidade de Unidades *
                  </label>
                  <input
                    id="ordem-quantidade-de-unidades"
                    type="number"
                    min="1"
                    required
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ordem-preco-de-venda-unitario-r" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Preço de Venda Unitário (R$)
                  </label>
                  <input
                    id="ordem-preco-de-venda-unitario-r"
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
                  <label htmlFor="ordem-data-prevista" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Data Prevista
                  </label>
                  <input
                    id="ordem-data-prevista"
                    type="date"
                    value={dataPrevista}
                    onChange={(e) => setDataPrevista(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="ordem-observacao-cliente" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Observação / Cliente
                  </label>
                  <input
                    id="ordem-observacao-cliente"
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
