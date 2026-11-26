import {
  boolean,
  integer,
  numeric,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { StatusOrdemProducao, TipoMovimento } from "../lib/types";

/**
 * Tabelas do banco para o Drizzle ORM (consultas tipadas).
 *
 * A fonte da verdade da estrutura são as migrations em supabase/migrations/
 * (chaves estrangeiras, CHECKs, índices e RLS ficam lá). Ao mudar uma tabela,
 * crie uma nova migration e ajuste este arquivo junto.
 */

const dataHora = (coluna: string) => timestamp(coluna, { withTimezone: true, mode: "date" });
const decimal = (coluna: string, precision: number, scale: number) =>
  numeric(coluna, { precision, scale, mode: "number" });

export const categoria = pgTable("categoria", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar("nome", { length: 50 }).notNull(),
  dataAtualizacao: dataHora("data_atualizacao").defaultNow(),
});

export const insumo = pgTable("insumo", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar("nome", { length: 80 }).notNull(),
  unidadeMedida: varchar("unidade_medida", { length: 10 }).notNull(),
  estoqueMinimo: decimal("estoque_minimo", 12, 3).notNull().default(0),
  custoUnitario: decimal("custo_unitario", 12, 4).notNull().default(0),
  dataAtualizacao: dataHora("data_atualizacao").defaultNow(),
  categoriaId: integer("categoria_id").notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

export const movimentoEstoque = pgTable("movimento_estoque", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  quantidade: decimal("quantidade", 12, 3).notNull(),
  tipo: varchar("tipo", { length: 20 }).$type<TipoMovimento>().notNull(),
  custoUnitario: decimal("custo_unitario", 12, 4),
  dataMovimento: dataHora("data_movimento").defaultNow(),
  dataRegistro: dataHora("data_registro").defaultNow(),
  observacao: varchar("observacao", { length: 255 }),
  insumoId: integer("insumo_id").notNull(),
});

export const receita = pgTable("receita", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: varchar("descricao", { length: 255 }),
  rendimentoMl: decimal("rendimento_ml", 12, 2).notNull(),
  margemLucro: decimal("margem_lucro", 5, 2).notNull().default(65),
  dataAtualizacao: dataHora("data_atualizacao").defaultNow(),
});

export const forma = pgTable("forma", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar("nome", { length: 80 }),
  volumeMl: decimal("volume_ml", 12, 2).notNull(),
  insumoId: integer("insumo_id").notNull().unique(),
});

export const receitaItem = pgTable("receita_item", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  receitaId: integer("receita_id").notNull(),
  insumoId: integer("insumo_id").notNull(),
  quantidade: decimal("quantidade", 12, 3).notNull(),
});

export const ordemProducao = pgTable("ordem_producao", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  receitaId: integer("receita_id").notNull(),
  formaId: integer("forma_id").notNull(),
  quantidadeUnidades: integer("quantidade_unidades").notNull(),
  status: varchar("status", { length: 20 }).$type<StatusOrdemProducao>().notNull().default("PLANEJADA"),
  custoTotalEstimado: decimal("custo_total_estimado", 12, 2).notNull().default(0),
  precoVendaUnitario: decimal("preco_venda_unitario", 12, 2),
  observacao: varchar("observacao", { length: 255 }),
  dataPrevista: dataHora("data_prevista").defaultNow(),
  dataCriacao: dataHora("data_criacao").defaultNow(),
  dataConclusao: dataHora("data_conclusao"),
});

export const usuario = pgTable("usuario", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar("nome", { length: 100 }).notNull(),
  email: varchar("email", { length: 120 }).notNull().unique(),
  senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).$type<"ADMIN" | "OPERADOR">().notNull().default("OPERADOR"),
  ativo: boolean("ativo").notNull().default(true),
  dataCriacao: dataHora("data_criacao").defaultNow(),
});
