-- ============================================================================
-- 0003 — Índices de desempenho
-- O PostgreSQL não cria índices para chaves estrangeiras sozinho. Sem eles,
-- o histórico de movimentos e as checagens de exclusão percorrem a tabela toda.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_movimento_data ON movimento_estoque (data_movimento DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_movimento_insumo ON movimento_estoque (insumo_id);
CREATE INDEX IF NOT EXISTS idx_receita_item_insumo ON receita_item (insumo_id);
CREATE INDEX IF NOT EXISTS idx_insumo_categoria ON insumo (categoria_id);
CREATE INDEX IF NOT EXISTS idx_ordem_receita ON ordem_producao (receita_id);
CREATE INDEX IF NOT EXISTS idx_ordem_forma ON ordem_producao (forma_id);
CREATE INDEX IF NOT EXISTS idx_usuario_email_lower ON usuario (LOWER(email));
