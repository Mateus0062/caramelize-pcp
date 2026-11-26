"use client";

import {
  AlertTriangle,
  Calculator,
  Edit3,
  FolderPlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { useDialogo } from "./useDialogo";
import { div } from "@/lib/decimal";
import { formatBRL, formatQty, formatUnitCost, parseDecimal } from "@/lib/format";
import type { Categoria, InsumoComDetalhes } from "@/lib/types";

interface InsumosViewProps {
  insumos: InsumoComDetalhes[];
  categorias: Categoria[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, type?: "success" | "error") => void;
}

const UNIDADES = ["g", "ml", "un", "kg", "L"];

export function InsumosView({
  insumos,
  categorias,
  onRefresh,
  onToast,
}: InsumosViewProps) {
  const confirmar = useConfirm();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [onlyLow, setOnlyLow] = useState(false);

  // Modal Insumo
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InsumoComDetalhes | null>(null);
  const [nome, setNome] = useState("");
  const [unidadeMedida, setUnidadeMedida] = useState("g");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [estoqueMinimo, setEstoqueMinimo] = useState("");
  const [estoqueInicial, setEstoqueInicial] = useState("");

  // Calculadora de preço por embalagem
  const [precoEmbalagem, setPrecoEmbalagem] = useState("");
  const [qtdEmbalagem, setQtdEmbalagem] = useState("");

  // Modal Categoria rápida
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState("");

  const [saving, setSaving] = useState(false);
  const insumoDialogoRef = useDialogo<HTMLDivElement>(modalOpen, () => setModalOpen(false));
  const categoriaDialogoRef = useDialogo<HTMLDivElement>(catModalOpen, () => setCatModalOpen(false));

  const filtered = useMemo(() => {
    return insumos.filter((i) => {
      const matchSearch =
        !search.trim() ||
        i.nome.toLowerCase().includes(search.toLowerCase()) ||
        i.categoriaNome.toLowerCase().includes(search.toLowerCase());
      const matchCat =
        catFilter === "all" || String(i.categoriaId) === catFilter;
      const matchLow = !onlyLow || i.abaixoMinimo;
      return matchSearch && matchCat && matchLow;
    });
  }, [insumos, search, catFilter, onlyLow]);

  const openCreate = () => {
    setEditing(null);
    setNome("");
    setUnidadeMedida("g");
    setCategoriaId(categorias[0] ? String(categorias[0].id) : "");
    setCustoUnitario("");
    setEstoqueMinimo("0");
    setEstoqueInicial("0");
    setPrecoEmbalagem("");
    setQtdEmbalagem("");
    setModalOpen(true);
  };

  const openEdit = (ins: InsumoComDetalhes) => {
    setEditing(ins);
    setNome(ins.nome);
    setUnidadeMedida(ins.unidadeMedida);
    setCategoriaId(String(ins.categoriaId));
    setCustoUnitario(String(ins.custoUnitario));
    setEstoqueMinimo(String(ins.estoqueMinimo));
    setEstoqueInicial("");
    setPrecoEmbalagem("");
    setQtdEmbalagem("");
    setModalOpen(true);
  };

  const aplicarCalculadora = () => {
    const preco = parseDecimal(precoEmbalagem);
    const qtd = parseDecimal(qtdEmbalagem);
    if (preco > 0 && qtd > 0) {
      setCustoUnitario(String(div(preco, qtd, 4)));
    }
  };

  const handleSaveInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nome,
        unidadeMedida,
        categoriaId: Number(categoriaId),
        custoUnitario: parseDecimal(custoUnitario),
        estoqueMinimo: parseDecimal(estoqueMinimo),
        ...(editing
          ? {}
          : {
              estoqueInicial:
                parseDecimal(estoqueInicial || "0") || 0,
            }),
      };

      const url = editing ? `/api/insumos/${editing.id}` : "/api/insumos";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar insumo");

      onToast(
        editing
          ? "Insumo atualizado com sucesso!"
          : "Insumo cadastrado com sucesso!",
      );
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao salvar insumo",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInsumo = async (ins: InsumoComDetalhes) => {
    const ok = await confirmar({
      titulo: "Excluir insumo",
      mensagem: `Excluir o insumo "${ins.nome}"? Se ele tiver histórico de estoque, será arquivado.`,
      textoConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/insumos/${ins.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir insumo");
      onToast("Insumo removido.");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao excluir insumo",
        "error",
      );
    }
  };

  const handleCreateCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaCategoria.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novaCategoria }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar categoria");
      setNovaCategoria("");
      onToast("Categoria criada!");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao criar categoria",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategoria = async (cat: Categoria) => {
    const ok = await confirmar({
      titulo: "Excluir categoria",
      mensagem: `Excluir a categoria "${cat.nome}"?`,
      textoConfirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/categorias/${cat.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir categoria");
      onToast("Categoria removida.");
      await onRefresh();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao excluir categoria",
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
            Matéria-Prima & Embalagens
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-cacau mt-1">
            Insumos & Preços
          </h2>
          <p className="text-sm text-cacau-suave mt-1">
            Cadastre cada ingrediente com seu preço unitário para cálculo automático nas receitas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setCatModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-caramelo-300 bg-creme-claro text-sm font-semibold text-cacau hover:bg-caramelo-50 transition cursor-pointer"
          >
            <FolderPlus className="h-4 w-4 text-caramelo-600" />
            Categorias ({categorias.length})
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-caramelo-600 text-sm font-semibold text-creme-claro hover:bg-caramelo-700 transition shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Novo Insumo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-creme-claro rounded-2xl border border-caramelo-200/70 p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-cacau-suave absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Buscar insumo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo por nome ou categoria..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
          />
        </div>
        <select
          aria-label="Filtrar por categoria"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
        >
          <option value="all">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.nome}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyLow}
            onChange={(e) => setOnlyLow(e.target.checked)}
            className="accent-caramelo-600 h-4 w-4"
          />
          Apenas abaixo do mínimo
        </label>
      </div>

      {/* Table */}
      <div className="bg-creme-claro rounded-3xl border border-caramelo-200/70 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-caramelo-50/80 border-b border-caramelo-200/70 text-left text-xs uppercase tracking-wider text-cacau-suave">
                <th className="py-3.5 px-5">Insumo</th>
                <th className="py-3.5 px-4">Categoria</th>
                <th className="py-3.5 px-4">Preço Unitário</th>
                <th className="py-3.5 px-4">Saldo Atual</th>
                <th className="py-3.5 px-4">Estoque Mín.</th>
                <th className="py-3.5 px-4">Valor Estoque</th>
                <th className="py-3.5 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-caramelo-100">
              {filtered.map((ins) => (
                <tr key={ins.id} className="hover:bg-caramelo-50/40 transition">
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-cacau">
                        {ins.nome}
                      </span>
                      {ins.abaixoMinimo && (
                        <span
                          title="Abaixo do estoque mínimo"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Repor
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-caramelo-100/80 text-caramelo-800">
                      {ins.categoriaNome}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-cacau">
                    {formatUnitCost(ins.custoUnitario)}
                    <span className="text-xs font-normal text-cacau-suave">
                      {" "}
                      / {ins.unidadeMedida}
                    </span>
                  </td>
                  <td
                    className={`py-3.5 px-4 font-semibold ${
                      ins.abaixoMinimo ? "text-red-700" : "text-cacau"
                    }`}
                  >
                    {formatQty(ins.saldoAtual, ins.unidadeMedida)}
                    {ins.saldoAtual < 0 && (
                      <span
                        className="block text-[11px] font-medium text-red-700"
                        title="Saldo negativo: houve baixa forçada sem estoque. Registre a compra ou um ajuste de entrada."
                      >
                        Saldo negativo
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-cacau-suave">
                    {formatQty(ins.estoqueMinimo, ins.unidadeMedida)}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-cacau">
                    {formatBRL(ins.valorEmEstoque)}
                  </td>
                  <td className="py-3.5 px-5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(ins)}
                      className="p-2 rounded-xl text-cacau-suave hover:bg-caramelo-100 hover:text-caramelo-700 transition cursor-pointer"
                      title="Editar insumo e preço"
                      aria-label="Editar insumo e preço"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInsumo(ins)}
                      className="p-2 rounded-xl text-cacau-suave hover:bg-red-100 hover:text-red-700 transition cursor-pointer ml-1"
                      title="Excluir insumo"
                      aria-label="Excluir insumo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-sm text-cacau-suave"
                  >
                    Nenhum insumo encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar / Editar Insumo */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-cacau/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            ref={insumoDialogoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="insumo-modal-titulo"
            className="bg-creme-claro rounded-3xl border border-caramelo-200 max-w-xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-4 border-b border-caramelo-200/70">
              <h3 id="insumo-modal-titulo" className="font-display text-2xl font-semibold text-cacau">
                {editing ? "Editar Insumo" : "Novo Insumo"}
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

            <form onSubmit={handleSaveInsumo} className="mt-5 space-y-4">
              <div>
                <label htmlFor="insumo-nome-do-insumo" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                  Nome do Insumo *
                </label>
                <input
                  id="insumo-nome-do-insumo"
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Leite Condensado Integral"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="insumo-categoria" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Categoria *
                  </label>
                  <select
                    id="insumo-categoria"
                    required
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  >
                    <option value="">Selecione...</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="insumo-unidade-de-medida" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Unidade de Medida *
                  </label>
                  <select
                    id="insumo-unidade-de-medida"
                    value={unidadeMedida}
                    onChange={(e) => setUnidadeMedida(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  >
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Calculadora auxiliar de preço por embalagem */}
              <div className="rounded-2xl bg-caramelo-50/90 border border-caramelo-200/80 p-4">
                <div className="flex items-center gap-2 text-caramelo-800 font-semibold text-xs uppercase tracking-wider">
                  <Calculator className="h-4 w-4" aria-hidden="true" />
                  Calculadora por Embalagem (opcional)
                </div>
                <p className="text-xs text-cacau-suave mt-1">
                  Ex.: paguei R$ 6,90 na caixinha de 395g → calcula automaticamente o preço por {unidadeMedida}.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label="Preço pago pela embalagem (R$)"
                    value={precoEmbalagem}
                    onChange={(e) => setPrecoEmbalagem(e.target.value)}
                    placeholder="Preço pago (R$)"
                    className="px-3 py-2 rounded-xl bg-creme-claro border border-caramelo-200 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label={`Quantidade na embalagem (${unidadeMedida})`}
                    value={qtdEmbalagem}
                    onChange={(e) => setQtdEmbalagem(e.target.value)}
                    placeholder={`Qtd (${unidadeMedida})`}
                    className="px-3 py-2 rounded-xl bg-creme-claro border border-caramelo-200 text-sm"
                  />
                  <button
                    type="button"
                    onClick={aplicarCalculadora}
                    className="px-3 py-2 rounded-xl bg-caramelo-600 text-creme-claro text-xs font-semibold hover:bg-caramelo-700 transition cursor-pointer"
                  >
                    Calcular Preço/{unidadeMedida}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="insumo-preco-por-r" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Preço por {unidadeMedida} (R$) *
                  </label>
                  <input
                    id="insumo-preco-por-r"
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={custoUnitario}
                    onChange={(e) => setCustoUnitario(e.target.value)}
                    placeholder="Ex.: 0.0175"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>
                <div>
                  <label htmlFor="insumo-estoque-minimo" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Estoque Mínimo ({unidadeMedida}) *
                  </label>
                  <input
                    id="insumo-estoque-minimo"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={estoqueMinimo}
                    onChange={(e) => setEstoqueMinimo(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
                </div>
              </div>

              {!editing && (
                <div>
                  <label htmlFor="insumo-estoque-inicial-opcional" className="block text-xs font-semibold uppercase tracking-wider text-cacau-suave mb-1.5">
                    Estoque Inicial ({unidadeMedida}) — opcional
                  </label>
                  <input
                    id="insumo-estoque-inicial-opcional"
                    type="number"
                    step="0.01"
                    min="0"
                    value={estoqueInicial}
                    onChange={(e) => setEstoqueInicial(e.target.value)}
                    placeholder="Quanto você já tem hoje no estoque?"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200 text-sm text-cacau focus:outline-none focus:border-caramelo-500"
                  />
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
                  {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Cadastrar Insumo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Categorias */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 bg-cacau/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            ref={categoriaDialogoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="categoria-modal-titulo"
            className="bg-creme-claro rounded-3xl border border-caramelo-200 max-w-md w-full p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-4 border-b border-caramelo-200/70">
              <h3 id="categoria-modal-titulo" className="font-display text-2xl font-semibold text-cacau">
                Categorias de Insumos
              </h3>
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="p-1.5 rounded-xl text-cacau-suave hover:bg-caramelo-100 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateCategoria} className="mt-4 flex gap-2">
              <input
                type="text"
                aria-label="Nome da nova categoria"
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                placeholder="Nova categoria (ex.: Caldas)"
                className="flex-1 px-3.5 py-2 rounded-xl bg-creme border border-caramelo-200 text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-caramelo-600 text-creme-claro text-sm font-semibold hover:bg-caramelo-700 cursor-pointer"
              >
                Adicionar
              </button>
            </form>

            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {categorias.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-creme border border-caramelo-200/60"
                >
                  <span className="text-sm font-medium text-cacau">{c.nome}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategoria(c)}
                    className="p-1.5 rounded-lg text-cacau-suave hover:bg-red-100 hover:text-red-700 cursor-pointer"
                    title="Excluir categoria"
                    aria-label="Excluir categoria"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
