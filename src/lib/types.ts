export type TipoMovimento =
  | "COMPRA"
  | "PRODUCAO"
  | "AJUSTE_ENTRADA"
  | "AJUSTE_SAIDA";

export type StatusOrdemProducao =
  | "PLANEJADA"
  | "EM_PRODUCAO"
  | "CONCLUIDA"
  | "CANCELADA";

export interface Categoria {
  id: number;
  nome: string;
  dataAtualizacao: string;
}

export interface Insumo {
  id: number;
  nome: string;
  unidadeMedida: string;
  estoqueMinimo: number;
  custoUnitario: number;
  dataAtualizacao: string;
  categoriaId: number;
  ativo: boolean;
}

export interface InsumoComDetalhes extends Insumo {
  categoriaNome: string;
  saldoAtual: number;
  abaixoMinimo: boolean;
  valorEmEstoque: number;
}

export interface MovimentoEstoque {
  id: number;
  quantidade: number;
  tipo: TipoMovimento;
  custoUnitario: number | null;
  dataMovimento: string;
  dataRegistro: string;
  observacao: string | null;
  insumoId: number;
}

export interface MovimentoComDetalhes extends MovimentoEstoque {
  insumoNome: string;
  unidadeMedida: string;
}

export interface Forma {
  id: number;
  nome: string;
  volumeMl: number;
  insumoId: number;
}

export interface FormaComDetalhes extends Forma {
  insumoNome: string;
  custoUnitario: number;
  saldoAtual: number;
}

export interface ReceitaItem {
  id: number;
  receitaId: number;
  insumoId: number;
  quantidade: number;
}

export interface ReceitaItemComDetalhes extends ReceitaItem {
  insumoNome: string;
  unidadeMedida: string;
  custoUnitario: number;
  custoSubtotal: number;
  saldoAtual: number;
}

export interface Receita {
  id: number;
  nome: string;
  descricao: string | null;
  rendimentoMl: number;
  margemLucro: number;
  dataAtualizacao: string;
}

export interface ReceitaComDetalhes extends Receita {
  itens: ReceitaItemComDetalhes[];
  custoTotal: number;
  custoPorMl: number;
  simulacaoFormas: Array<{
    formaId: number;
    formaNome: string;
    volumeMl: number;
    unidadesPorLote: number;
    custoMassaUnitario: number;
    custoFormaUnitario: number;
    custoTotalUnitario: number;
    precoSugeridoUnitario: number;
    lucroUnitario: number;
  }>;
}

export interface OrdemProducao {
  id: number;
  receitaId: number;
  formaId: number;
  quantidadeUnidades: number;
  status: StatusOrdemProducao;
  custoTotalEstimado: number;
  precoVendaUnitario: number | null;
  observacao: string | null;
  dataPrevista: string;
  dataCriacao: string;
  dataConclusao: string | null;
}

export interface NecessidadeInsumo {
  insumoId: number;
  insumoNome: string;
  unidadeMedida: string;
  quantidadeNecessaria: number;
  saldoDisponivel: number;
  falta: number;
  custoUnitario: number;
  custoTotal: number;
  ehForma: boolean;
}

export interface OrdemProducaoComDetalhes extends OrdemProducao {
  receitaNome: string;
  formaNome: string;
  volumeTotalMl: number;
  fatorEscala: number;
  custoUnitario: number;
  necessidades: NecessidadeInsumo[];
  estoqueSuficiente: boolean;
}

export interface DashboardResumo {
  storageMode: "supabase" | "local";
  totalInsumosAtivos: number;
  insumosAbaixoMinimo: number;
  valorTotalEstoque: number;
  totalReceitas: number;
  totalFormas: number;
  ordensPlanejadas: number;
  ordensEmProducao: number;
  ordensConcluidas: number;
  unidadesProduzidas: number;
  alertasEstoque: InsumoComDetalhes[];
  ultimosMovimentos: MovimentoComDetalhes[];
  ordensRecentes: OrdemProducaoComDetalhes[];
}
