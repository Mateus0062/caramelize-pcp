-- ============================================================================
-- Caramelize PCP — Migração opcional: TIMESTAMP → TIMESTAMPTZ
--
-- As colunas de data/hora foram criadas como TIMESTAMP (sem fuso). O sistema
-- já as lê como UTC (fuso padrão do Supabase), então tudo funciona sem esta
-- migração. Ela deixa o banco explícito sobre o fuso e independente da
-- configuração TimeZone da sessão.
--
-- Pré-requisito: o fuso do banco deve ser UTC (padrão do Supabase).
-- Confira com:  SHOW timezone;
-- Execute UMA vez no SQL Editor do Supabase.
-- ============================================================================
BEGIN;

ALTER TABLE categoria
  ALTER COLUMN data_atualizacao TYPE TIMESTAMPTZ USING data_atualizacao AT TIME ZONE 'UTC';

ALTER TABLE insumo
  ALTER COLUMN data_atualizacao TYPE TIMESTAMPTZ USING data_atualizacao AT TIME ZONE 'UTC';

ALTER TABLE movimento_estoque
  ALTER COLUMN data_movimento TYPE TIMESTAMPTZ USING data_movimento AT TIME ZONE 'UTC',
  ALTER COLUMN data_registro TYPE TIMESTAMPTZ USING data_registro AT TIME ZONE 'UTC';

ALTER TABLE receita
  ALTER COLUMN data_atualizacao TYPE TIMESTAMPTZ USING data_atualizacao AT TIME ZONE 'UTC';

ALTER TABLE ordem_producao
  ALTER COLUMN data_prevista TYPE TIMESTAMPTZ USING data_prevista AT TIME ZONE 'UTC',
  ALTER COLUMN data_criacao TYPE TIMESTAMPTZ USING data_criacao AT TIME ZONE 'UTC',
  ALTER COLUMN data_conclusao TYPE TIMESTAMPTZ USING data_conclusao AT TIME ZONE 'UTC';

ALTER TABLE usuario
  ALTER COLUMN data_criacao TYPE TIMESTAMPTZ USING data_criacao AT TIME ZONE 'UTC';

COMMIT;
