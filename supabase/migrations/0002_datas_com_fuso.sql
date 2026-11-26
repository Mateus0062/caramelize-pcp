-- ============================================================================
-- 0002 — Datas com fuso horário (TIMESTAMP → TIMESTAMPTZ)
-- Bancos antigos guardavam datas em TIMESTAMP sem fuso, gravadas em UTC (fuso
-- padrão do Supabase). Converte só as colunas que ainda estiverem sem fuso,
-- interpretando os valores como UTC. Bancos novos já nascem com TIMESTAMPTZ.
-- ============================================================================
DO $$
DECLARE
  coluna RECORD;
BEGIN
  FOR coluna IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('categoria', 'insumo', 'movimento_estoque', 'receita', 'ordem_producao', 'usuario')
      AND data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
      coluna.table_name, coluna.column_name, coluna.column_name
    );
  END LOOP;
END $$;
