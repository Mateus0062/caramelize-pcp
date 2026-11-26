-- ============================================================================
-- Caramelize PCP — Índices de desempenho
-- Execute no SQL Editor do Supabase. Pode ser executado mais de uma vez.
--
-- O PostgreSQL não cria índices automaticamente para chaves estrangeiras.
-- Sem eles, cada checagem ("este insumo tem movimentos?", "esta receita tem
-- ordens?") e a listagem do histórico percorrem a tabela inteira.
-- ============================================================================

-- Histórico de movimentos (mais recentes primeiro, paginado)
CREATE INDEX IF NOT EXISTS idx_movimento_data ON movimento_estoque (data_movimento DESC, id DESC);

-- Saldo e movimentos de um insumo (saídas, exclusão de insumo)
CREATE INDEX IF NOT EXISTS idx_movimento_insumo ON movimento_estoque (insumo_id);

-- Insumo usado em receitas (exclusão de insumo)
CREATE INDEX IF NOT EXISTS idx_receita_item_insumo ON receita_item (insumo_id);

-- Insumos de uma categoria (exclusão de categoria)
CREATE INDEX IF NOT EXISTS idx_insumo_categoria ON insumo (categoria_id);

-- Ordens de uma receita / forma (exclusão de receita e forma)
CREATE INDEX IF NOT EXISTS idx_ordem_receita ON ordem_producao (receita_id);
CREATE INDEX IF NOT EXISTS idx_ordem_forma ON ordem_producao (forma_id);

-- Login: busca por e-mail sem diferenciar maiúsculas
CREATE INDEX IF NOT EXISTS idx_usuario_email_lower ON usuario (LOWER(email));
