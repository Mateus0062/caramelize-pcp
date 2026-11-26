import type {
  Categoria,
  Forma,
  Insumo,
  MovimentoEstoque,
  OrdemProducao,
  Receita,
  ReceitaItem,
} from "./types";

export interface LocalDbSchema {
  nextIds: {
    categoria: number;
    insumo: number;
    movimento: number;
    forma: number;
    receita: number;
    receitaItem: number;
    ordemProducao: number;
  };
  categorias: Categoria[];
  insumos: Insumo[];
  movimentos: MovimentoEstoque[];
  formas: Forma[];
  receitas: Receita[];
  receitaItens: ReceitaItem[];
  ordensProducao: OrdemProducao[];
}

export function createSeedData(): LocalDbSchema {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

  return {
    nextIds: {
      categoria: 5,
      insumo: 12,
      movimento: 13,
      forma: 5,
      receita: 3,
      receitaItem: 10,
      ordemProducao: 3,
    },
    categorias: [
      { id: 1, nome: "Laticínios", dataAtualizacao: twoDaysAgo },
      { id: 2, nome: "Mercearia", dataAtualizacao: twoDaysAgo },
      { id: 3, nome: "Ovos & Frescos", dataAtualizacao: twoDaysAgo },
      { id: 4, nome: "Embalagens & Formas", dataAtualizacao: twoDaysAgo },
    ],
    insumos: [
      {
        id: 1,
        nome: "Leite Condensado Integral",
        unidadeMedida: "g",
        estoqueMinimo: 2370, // 6 caixinhas de 395g
        custoUnitario: 0.0175, // R$ 6,90 / 395g
        dataAtualizacao: yesterday,
        categoriaId: 1,
        ativo: true,
      },
      {
        id: 2,
        nome: "Leite Integral UHT",
        unidadeMedida: "ml",
        estoqueMinimo: 3000,
        custoUnitario: 0.0055, // R$ 5,50 / 1000ml
        dataAtualizacao: yesterday,
        categoriaId: 1,
        ativo: true,
      },
      {
        id: 3,
        nome: "Creme de Leite 20%",
        unidadeMedida: "g",
        estoqueMinimo: 1000,
        custoUnitario: 0.0195, // R$ 3,90 / 200g
        dataAtualizacao: yesterday,
        categoriaId: 1,
        ativo: true,
      },
      {
        id: 4,
        nome: "Ovos Brancos Grandes",
        unidadeMedida: "un",
        estoqueMinimo: 30,
        custoUnitario: 0.85, // R$ 25,50 / 30 un
        dataAtualizacao: yesterday,
        categoriaId: 3,
        ativo: true,
      },
      {
        id: 5,
        nome: "Açúcar Refinado (Calda)",
        unidadeMedida: "g",
        estoqueMinimo: 2000,
        custoUnitario: 0.0054, // R$ 5,40 / 1000g
        dataAtualizacao: yesterday,
        categoriaId: 2,
        ativo: true,
      },
      {
        id: 6,
        nome: "Essência de Baunilha",
        unidadeMedida: "ml",
        estoqueMinimo: 60,
        custoUnitario: 0.18, // R$ 5,40 / 30ml
        dataAtualizacao: yesterday,
        categoriaId: 2,
        ativo: true,
      },
      {
        id: 7,
        nome: "Leite em Pó Integral",
        unidadeMedida: "g",
        estoqueMinimo: 400,
        custoUnitario: 0.042, // R$ 16,80 / 400g
        dataAtualizacao: yesterday,
        categoriaId: 1,
        ativo: true,
      },
      {
        id: 8,
        nome: "Forma Forneável Mini 120ml c/ Tampa",
        unidadeMedida: "un",
        estoqueMinimo: 50,
        custoUnitario: 1.15,
        dataAtualizacao: yesterday,
        categoriaId: 4,
        ativo: true,
      },
      {
        id: 9,
        nome: "Forma Forneável Média 500ml c/ Tampa",
        unidadeMedida: "un",
        estoqueMinimo: 20,
        custoUnitario: 2.9,
        dataAtualizacao: yesterday,
        categoriaId: 4,
        ativo: true,
      },
      {
        id: 10,
        nome: "Forma Forneável Grande 1,1L c/ Tampa",
        unidadeMedida: "un",
        estoqueMinimo: 15,
        custoUnitario: 4.5,
        dataAtualizacao: yesterday,
        categoriaId: 4,
        ativo: true,
      },
      {
        id: 11,
        nome: "Saquinho Geladinho Gourmet 150ml",
        unidadeMedida: "un",
        estoqueMinimo: 80,
        custoUnitario: 0.25,
        dataAtualizacao: yesterday,
        categoriaId: 4,
        ativo: true,
      },
    ],
    movimentos: [
      {
        id: 1,
        insumoId: 1,
        quantidade: 7900, // 20 caixinhas
        tipo: "COMPRA",
        custoUnitario: 0.0175,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Compra atacado — 20 cx Leite Condensado 395g",
      },
      {
        id: 2,
        insumoId: 2,
        quantidade: 12000,
        tipo: "COMPRA",
        custoUnitario: 0.0055,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Fardo com 12L de Leite Integral",
      },
      {
        id: 3,
        insumoId: 3,
        quantidade: 2400,
        tipo: "COMPRA",
        custoUnitario: 0.0195,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "12 caixinhas de Creme de Leite",
      },
      {
        id: 4,
        insumoId: 4,
        quantidade: 90,
        tipo: "COMPRA",
        custoUnitario: 0.85,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "3 cartelas de 30 ovos",
      },
      {
        id: 5,
        insumoId: 5,
        quantidade: 5000,
        tipo: "COMPRA",
        custoUnitario: 0.0054,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "5kg Açúcar Refinado",
      },
      {
        id: 6,
        insumoId: 6,
        quantidade: 45, // intencionalmente abaixo do mínimo (60ml) para mostrar alerta no dashboard!
        tipo: "COMPRA",
        custoUnitario: 0.18,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Estoque inicial Essência de Baunilha",
      },
      {
        id: 7,
        insumoId: 7,
        quantidade: 1200,
        tipo: "COMPRA",
        custoUnitario: 0.042,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "3 latas Leite em Pó 400g",
      },
      {
        id: 8,
        insumoId: 8,
        quantidade: 120,
        tipo: "COMPRA",
        custoUnitario: 1.15,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Pacote formas mini para eventos",
      },
      {
        id: 9,
        insumoId: 9,
        quantidade: 35,
        tipo: "COMPRA",
        custoUnitario: 2.9,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Formas médias 500ml",
      },
      {
        id: 10,
        insumoId: 10,
        quantidade: 12, // abaixo do mínimo (15) para alerta!
        tipo: "COMPRA",
        custoUnitario: 4.5,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Formas grandes 1,1L",
      },
      {
        id: 11,
        insumoId: 11,
        quantidade: 200,
        tipo: "COMPRA",
        custoUnitario: 0.25,
        dataMovimento: twoDaysAgo,
        dataRegistro: twoDaysAgo,
        observacao: "Saquinhos geladinho gourmet",
      },
      {
        id: 12,
        insumoId: 1,
        quantidade: 790,
        tipo: "PRODUCAO",
        custoUnitario: 0.0175,
        dataMovimento: yesterday,
        dataRegistro: yesterday,
        observacao: "Produção de lote teste Caramelize",
      },
    ],
    formas: [
      { id: 1, nome: "Pudim Mini (120g)", volumeMl: 120, insumoId: 8 },
      { id: 2, nome: "Pudim Médio (500g)", volumeMl: 500, insumoId: 9 },
      { id: 3, nome: "Pudim Grande (1,1kg)", volumeMl: 1100, insumoId: 10 },
      { id: 4, nome: "Geladinho de Pudim (150g)", volumeMl: 150, insumoId: 11 },
    ],
    receitas: [
      {
        id: 1,
        nome: "Pudim Tradicional Caramelize",
        descricao:
          "Receita clássica ultra cremosa sem furinhos, com calda artesanal de caramelo.",
        rendimentoMl: 1100,
        margemLucro: 68,
        dataAtualizacao: yesterday,
      },
      {
        id: 2,
        nome: "Geladinho Gourmet de Pudim",
        descricao:
          "Base cremosa de pudim com leite em pó e calda caramelizada no saquinho.",
        rendimentoMl: 1500,
        margemLucro: 70,
        dataAtualizacao: yesterday,
      },
    ],
    receitaItens: [
      // Pudim Tradicional (rende 1100ml = 1 grande ou ~2 médios ou ~9 minis)
      { id: 1, receitaId: 1, insumoId: 1, quantidade: 790 }, // 2 cx leite condensado
      { id: 2, receitaId: 1, insumoId: 2, quantidade: 600 }, // 600ml leite integral
      { id: 3, receitaId: 1, insumoId: 4, quantidade: 6 }, // 6 ovos
      { id: 4, receitaId: 1, insumoId: 5, quantidade: 200 }, // 200g açúcar p/ calda
      { id: 5, receitaId: 1, insumoId: 6, quantidade: 5 }, // 5ml baunilha

      // Geladinho Gourmet de Pudim (rende 1500ml = 10 geladinhos de 150ml)
      { id: 6, receitaId: 2, insumoId: 1, quantidade: 395 }, // 1 cx leite condensado
      { id: 7, receitaId: 2, insumoId: 2, quantidade: 800 }, // 800ml leite
      { id: 8, receitaId: 2, insumoId: 3, quantidade: 200 }, // 1 cx creme de leite
      { id: 9, receitaId: 2, insumoId: 7, quantidade: 80 }, // 80g leite em pó
      { id: 10, receitaId: 2, insumoId: 5, quantidade: 180 }, // 180g açúcar p/ calda
    ],
    ordensProducao: [
      {
        id: 1,
        receitaId: 1,
        formaId: 1,
        quantidadeUnidades: 24,
        status: "PLANEJADA",
        custoTotalEstimado: 89.24,
        precoVendaUnitario: 12.0,
        observacao: "Encomenda evento corporativo — sexta-feira",
        dataPrevista: now,
        dataCriacao: yesterday,
        dataConclusao: null,
      },
      {
        id: 2,
        receitaId: 1,
        formaId: 2,
        quantidadeUnidades: 6,
        status: "EM_PRODUCAO",
        custoTotalEstimado: 82.87,
        precoVendaUnitario: 45.0,
        observacao: "Lote vitrine / WhatsApp de hoje",
        dataPrevista: now,
        dataCriacao: now,
        dataConclusao: null,
      },
    ],
  };
}
