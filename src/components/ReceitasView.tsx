"use client";

import {
  ChefHat,
  Edit3,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatBRL, formatQty, formatUnitCost } from "@/lib/format";
import type { InsumoComDetalhes, ReceitaComDetalhes } from "@/lib/types";

interface ReceitasViewProps {
  receitas: ReceitaComDetalhes[];
  insumos: InsumoComDetalhes[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: "success" | "error") => void;
}

interface DraftItem {
  insumoId: string;
  quantidade: string;
}

export function ReceitasView({
  receitas,
  insumos,
  onRefresh,
  onToast,
}: ReceitasViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReceitaComDetalhes | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [rendimentoMl, setRendimentoMl] = useState("1100");
  const [margemLucro, setMargemLucro] = useState("65");
  const [itens, setItens] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  const insumoMap = useMemo(
    () => new Map(insumos.map((i) => [String(i.id), i])),
    [insumos],
  );

  // Cálculo em tempo real no modal enquanto monta a receita
  const previewCustoTotal = useMemo(() => {
    return itens.reduce((acc, it) => {
      const ins = insumoMap.get(it.insumoId);
      const qtd = Number(it.quantidade.replace(",", ".")) || 0;
      return acc + (ins ? ins.custoUnitario * qtd : 0);
    }, 0);
  }, [itens, insumoMap]);

  const openCreate = () => {
    setEditing(null);
    setNome("");
    setDescricao("");
    setRendimentoMl("1100");
    setMargemLucro("65");
    setItens([
      {
        insumoId: insumos[0] ? String(insumos[0].id) : "",
        quantidade: "",
      },
    ]);
    setModalOpen(true);
  };

  const openEdit = (rec: ReceitaComDetalhes) => {
    setEditing(rec);
    setNome(rec.nome);
    setDescricao(rec.descricao ?? "");
    setRendimentoMl(String(rec.rendimentoMl));
    setMargemLucro(String(rec.margemLucro));
    setItens(
      rec.itens.map((it) => ({
        insumoId: String(it.insumoId),
        quantidade: String(it.quantidade),
      })),
    );
    setModalOpen(true);
  };

  const addItemRow = () => {
    const usedIds = new Set(itens.map((i) => i.insumoId));
    const nextInsumo =
      insumos.find((i) => !usedIds.has(String(i.id))) ?? insumos[0];
    setItens((prev) => [
      ...prev,
      { insumoId: nextInsumo ? String(nextInsumo.id) : "", quantidade: "" },
    ]);
  };

  const updateItemRow = (index: number, patch: Partial<DraftItem>) => {
    setItens((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const removeItemRow = (index: number) => {
    setItens((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItens = itens
      .map((it) => ({
        insumoId: Number(it.insumoId),
        quantidade: Number(it.quantidade.replace(",", ".")),
      }))
      .filter((it) => it.insumoId > 0 && it.quantidade > 0);

    if (validItens.length === 0) {
      onToast("Adicione pelo menos 1 insumo com quantidade válida.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nome,
        descricao: descricao.trim() || null,
        rendimentoMl: Number(rendimentoMl.replace(",", ".")),
        margemLucro: Number(margemLucro.replace(",", ".")),
        itens: validItens,
      };
      const url = editing ? `/api/receitas/${editing.id}` : "/api/receitas";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar receita");

      onToast(
        editing
          ? "Receita atualizada com sucesso!"
          : "Receita criada com sucesso!",
      );
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao salvar receita",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec: ReceitaComDetalhes) => {
    if (!confirm(`Deseja excluir a receita "${rec.nome}"?`)) return;
    try {
      const res = await fetch(`/api/receitas/${rec.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir receita");
      onToast("Receita removida.");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao excluir receita",
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
            Fichas Técnicas & Precificação
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-1">
            Receitas de Pudim
          </h2>
          <p className="text-sm text-cacau-suave mt-1">
            Monte suas receitas a partir dos insumos cadastrados e veja o custo real e preço sugerido por tamanho de forma.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 transition shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nova Receita
        </button>
      </div>

      {/* Recipe Cards */}
      {receitas.length === 0 ? (
        <div className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-10 text-center">
          <ChefHat className="h-10 w-10 text-caramelo-500 mx-auto" />
          <h3 className="font-display text-xl font-semibold text-cacau mt-3">
            Nenhuma receita cadastrada ainda
          </h3>
          <p className="text-sm text-cacau-suave mt-1">
            Clique em &ldquo;Nova Receita&rdquo; para combinar seus insumos e calcular o custo automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {receitas.map((rec) => (
            <article
              key={rec.id}
              className="bg-creme-claro rounded-3xl border border-caramelo-200/70 p-5 sm:p-6 shadow-xs space-y-5"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-caramelo-200/60">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="font-display text-2xl font-semibold text-cacau">
                      {rec.nome}
                    </h3>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-caramelo-100 text-caramelo-800">
                      Rendimento: {formatQty(rec.rendimentoMl, "ml")}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      Margem alvo: {rec.margemLucro}%
                    </span>
                  </div>
                  {rec.descricao && (
                    <p className="text-sm text-cacau-suave mt-1.5">
                      {rec.descricao}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wider text-cacau-suave font-semibold">
                      Custo do Lote
                    </p>
                    <p className="font-display text-2xl font-semibold text-caramelo-700">
                      {formatBRL(rec.custoTotal)}
                    </p>
                    <p className="text-[11px] text-cacau-suave">
                      {formatUnitCost(rec.custoPorMl)} / ml
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(rec)}
                      className="p-2 rounded-xl border border-caramelo-200 text-cacau-suave hover:bg-caramelo-100 hover:text-caramelo-700 transition cursor-pointer"
                      title="Editar receita"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rec)}
                      className="p-2 rounded-xl border border-caramelo-200 text-cacau-suave hover:bg-red-100 hover:text-red-700 transition cursor-pointer"
                      title="Excluir receita"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Ingredientes */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-3">
                  Composição de Insumos ({rec.itens.length} itens)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-cacau-suave border-b border-caramelo-100">
                        <th className="py-2 pr-4">Insumo</th>
                        <th className="py-2 pr-4">Quantidade</th>
                        <th className="py-2 pr-4">Preço Unit.</th>
                        <th className="py-2 pr-4">Subtotal</th>
                        <th className="py-2 text-right">% do Custo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-caramelo-100/70">
                      {rec.itens.map((it) => {
                        const pct =
                          rec.custoTotal > 0
                            ? (it.custoSubtotal / rec.custoTotal) * 100
                            : 0;
                        return (
                          <tr key={it.id}>
                            <td className="py-2.5 pr-4 font-medium text-cacau">
                              {it.insumoNome}
                            </td>
                            <td className="py-2.5 pr-4 text-cacau">
                              {formatQty(it.quantidade, it.unidadeMedida)}
                            </td>
                            <td className="py-2.5 pr-4 text-cacau-suave">
                              {formatUnitCost(it.custoUnitario)}/{it.unidadeMedida}
                            </td>
                            <td className="py-2.5 pr-4 font-semibold text-cacau">
                              {formatBRL(it.custoSubtotal)}
                            </td>
                            <td className="py-2.5 text-right text-xs text-cacau-suave">
                              {pct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Simulação por Forma */}
              {rec.simulacaoFormas.length > 0 && (
                <div className="rounded-2xl bg-caramelo-50/80 border border-caramelo-200/70 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-caramelo-600" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-caramelo-800">
                      Simulador de Custo & Preço Sugerido por Forma
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {rec.simulacaoFormas.map((sim) => (
                      <div
                        key={sim.formaId}
                        className="rounded-2xl bg-creme-claro border border-caramelo-200/70 p-3.5"
                      >
                        <p className="text-sm font-semibold text-cacau">
                          {sim.formaNome}
                        </p>
                        <p className="text-[11px] text-cacau-suave">
                          {sim.volumeMl}ml · Rende ~{sim.unidadesPorLote} un/lote
                        </p>
                        <div className="mt-3 space-y-1 text-xs">
                          <div className="flex justify-between text-cacau-suave">
                            <span>Massa + Calda</span>
                            <span>{formatBRL(sim.custoMassaUnitario)}</span>
                          </div>
                          <div className="flex justify-between text-cacau-suave">
                            <span>Embalagem/Forma</span>
                            <span>{formatBRL(sim.custoFormaUnitario)}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-cacau pt-1 border-t border-caramelo-100">
                            <span>Custo Total</span>
                            <span>{formatBRL(sim.custoTotalUnitario)}</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-caramelo-200/70 flex items-baseline justify-between">
                          <span className="text-[11px] font-semibold text-caramelo-700 uppercase">
                            Sugerido
                          </span>
                          <span className="font-display text-lg font-semibold text-emerald-700">
                            {formatBRL(sim.precoSugeridoUnitario)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Modal Criar / Editar Receita */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-cacau/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-creme-claro rounded-3xl border border-caramelo-200 max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-caramelo-200/70">
              <h3 className="font-display text-2xl font-semibold text-cacau">
                {editing ? "Editar Receita" : "Nova Receita de Pudim"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl text-cacau-suave hover:bg-caramelo-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Nome da Receita *
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Pudim Tradicional Caramelize"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Descrição / Notas de Preparo
                  </label>
                  <input
                    type="text"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex.: Assar em banho-maria a 180°C por 55 minutos..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Rendimento Total da Massa (ml) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={rendimentoMl}
                    onChange={(e) => setRendimentoMl(e.target.value)}
                    placeholder="Ex.: 1100"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Margem de Lucro Alvo (%) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="95"
                    required
                    value={margemLucro}
                    onChange={(e) => setMargemLucro(e.target.value)}
                    placeholder="Ex.: 65"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>
              </div>

              {/* Lista de Ingredientes */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-cacau-suave">
                    Insumos da Receita *
                  </label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-caramelo-100 text-caramelo-800 text-xs font-semibold hover:bg-caramelo-200 transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar Insumo
                  </button>
                </div>

                <div className="space-y-2.5">
                  {itens.map((row, idx) => {
                    const ins = insumoMap.get(row.insumoId);
                    const qtdNum = Number(row.quantidade.replace(",", ".")) || 0;
                    const subtotal = ins ? ins.custoUnitario * qtdNum : 0;

                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-2xl bg-creme border border-caramelo-200/70"
                      >
                        <select
                          value={row.insumoId}
                          onChange={(e) =>
                            updateItemRow(idx, { insumoId: e.target.value })
                          }
                          className="col-span-12 sm:col-span-6 px-3 py-2 rounded-xl bg-creme-claro border border-caramelo-200 text-sm"
                        >
                          <option value="">Selecione o insumo...</option>
                          {insumos.map((i) => (
                            <option key={i.id} value={String(i.id)}>
                              {i.nome} ({i.unidadeMedida})
                            </option>
                          ))}
                        </select>

                        <div className="col-span-6 sm:col-span-3 relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.quantidade}
                            onChange={(e) =>
                              updateItemRow(idx, { quantidade: e.target.value })
                            }
                            placeholder="Qtd"
                            className="w-full px-3 py-2 pr-9 rounded-xl bg-creme-claro border border-caramelo-200 text-sm"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-cacau-suave">
                            {ins?.unidadeMedida ?? ""}
                          </span>
                        </div>

                        <div className="col-span-4 sm:col-span-2 text-right text-xs font-semibold text-caramelo-800">
                          {formatBRL(subtotal)}
                        </div>

                        <div className="col-span-2 sm:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="p-1.5 rounded-lg text-cacau-suave hover:bg-red-100 hover:text-red-700 cursor-pointer"
                            title="Remover item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumo em tempo real */}
              <div className="rounded-2xl bg-caramelo-50 border border-caramelo-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-caramelo-700 font-semibold">
                    Custo Estimado da Receita
                  </p>
                  <p className="text-xs text-cacau-suave">
                    Calculado automaticamente com base nos preços dos insumos
                  </p>
                </div>
                <p className="font-display text-2xl font-semibold text-caramelo-700">
                  {formatBRL(previewCustoTotal)}
                </p>
              </div>

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
                  {saving ? "Salvando..." : editing ? "Salvar Receita" : "Criar Receita"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
