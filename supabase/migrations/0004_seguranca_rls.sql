-- ============================================================================
-- 0004 — Fecha a Data API do Supabase (RLS)
-- Tabelas do schema "public" ficam expostas na API REST do Supabase pela
-- chave "anon" (pública). Ligar o RLS sem políticas e revogar os acessos dos
-- papéis da API bloqueia isso. O servidor Next.js conecta direto como dono
-- das tabelas e continua funcionando.
-- ============================================================================
ALTER TABLE categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimento_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE receita ENABLE ROW LEVEL SECURITY;
ALTER TABLE forma ENABLE ROW LEVEL SECURITY;
ALTER TABLE receita_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordem_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON categoria, insumo, movimento_estoque, receita, forma, receita_item,
                  ordem_producao, usuario, schema_migrations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON categoria, insumo, movimento_estoque, receita, forma, receita_item,
                  ordem_producao, usuario, schema_migrations FROM authenticated;
  END IF;
END $$;
