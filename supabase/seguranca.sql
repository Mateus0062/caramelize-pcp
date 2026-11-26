-- ============================================================================
-- Caramelize PCP — Endurecimento de segurança do banco (Supabase)
-- Execute no SQL Editor do Supabase. Pode ser executado mais de uma vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1 (OBRIGATÓRIA): fechar a Data API do Supabase
--
-- Por padrão, tabelas do schema "public" ficam acessíveis pela API REST do
-- Supabase usando a chave "anon" (que é pública). Sem RLS, qualquer pessoa
-- com essa chave consegue ler e alterar os dados — inclusive a tabela
-- "usuario", com os hashes de senha.
--
-- O servidor Next.js conecta direto no PostgreSQL como dono das tabelas,
-- então continua funcionando normalmente.
-- ----------------------------------------------------------------------------
ALTER TABLE categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimento_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE receita ENABLE ROW LEVEL SECURITY;
ALTER TABLE forma ENABLE ROW LEVEL SECURITY;
ALTER TABLE receita_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordem_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON categoria, insumo, movimento_estoque, receita, forma, receita_item, ordem_producao, usuario FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON categoria, insumo, movimento_estoque, receita, forma, receita_item, ordem_producao, usuario FROM authenticated;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- PARTE 2 (RECOMENDADA): usuário próprio da aplicação, com o mínimo de acesso
--
-- Hoje a aplicação conecta como "postgres", que pode apagar tabelas, criar
-- funções etc. O papel abaixo só lê e grava dados nas tabelas do sistema.
--
-- 1. Troque a senha abaixo por uma senha forte e execute este bloco.
-- 2. Atualize DATABASE_URL no servidor:
--    conexão direta: postgresql://caramelize_app:SENHA@db.<ref>.supabase.co:5432/postgres
--    pooler:         postgresql://caramelize_app.<ref>:SENHA@<host-do-pooler>:6543/postgres
-- 3. Reinicie a aplicação.
--
-- (Descomente as linhas para executar.)
-- ----------------------------------------------------------------------------
-- CREATE ROLE caramelize_app WITH LOGIN PASSWORD 'TROQUE-POR-UMA-SENHA-FORTE';
--
-- GRANT USAGE ON SCHEMA public TO caramelize_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE
--   ON categoria, insumo, movimento_estoque, receita, forma, receita_item, ordem_producao, usuario
--   TO caramelize_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO caramelize_app;
--
-- -- Como esse papel não é dono das tabelas, o RLS se aplica a ele:
-- -- estas políticas liberam o acesso somente para caramelize_app.
-- CREATE POLICY caramelize_app_all ON categoria         TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON insumo            TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON movimento_estoque TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON receita           TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON forma             TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON receita_item      TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON ordem_producao    TO caramelize_app USING (true) WITH CHECK (true);
-- CREATE POLICY caramelize_app_all ON usuario           TO caramelize_app USING (true) WITH CHECK (true);
