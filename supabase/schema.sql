-- ============================================================================
-- Caramelize PCP — Schema PostgreSQL (Supabase)
-- Compatível com as migrations V1–V4 do projeto prodly + módulo de Ordens de Produção
-- ============================================================================

CREATE TABLE IF NOT EXISTS categoria (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS insumo (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    unidade_medida VARCHAR(10) NOT NULL,
    estoque_minimo DECIMAL(12, 3) NOT NULL DEFAULT 0,
    custo_unitario DECIMAL(12, 4) NOT NULL DEFAULT 0,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    categoria_id INTEGER NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categoria (id)
);

CREATE TABLE IF NOT EXISTS movimento_estoque (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quantidade DECIMAL(12, 3) NOT NULL CHECK (quantidade > 0),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('COMPRA', 'PRODUCAO', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA')),
    custo_unitario DECIMAL(12, 4),
    data_movimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observacao VARCHAR(255),
    insumo_id INTEGER NOT NULL,
    CONSTRAINT fk_insumo FOREIGN KEY (insumo_id) REFERENCES insumo (id)
);

CREATE TABLE IF NOT EXISTS receita (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao VARCHAR(255),
    rendimento_ml DECIMAL(12, 2) NOT NULL CHECK (rendimento_ml > 0),
    margem_lucro DECIMAL(5, 2) NOT NULL DEFAULT 65.00,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forma (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(80),
    volume_ml DECIMAL(12, 2) NOT NULL CHECK (volume_ml > 0),
    insumo_id INTEGER NOT NULL UNIQUE,
    CONSTRAINT fk_forma_insumo FOREIGN KEY (insumo_id) REFERENCES insumo (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS receita_item (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receita_id INTEGER NOT NULL,
    insumo_id INTEGER NOT NULL,
    quantidade DECIMAL(12, 3) NOT NULL CHECK (quantidade > 0),
    CONSTRAINT uk_receita_insumo UNIQUE (receita_id, insumo_id),
    CONSTRAINT fk_item_receita FOREIGN KEY (receita_id) REFERENCES receita (id) ON DELETE CASCADE,
    CONSTRAINT fk_item_insumo FOREIGN KEY (insumo_id) REFERENCES insumo (id)
);

CREATE TABLE IF NOT EXISTS ordem_producao (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receita_id INTEGER NOT NULL,
    forma_id INTEGER NOT NULL,
    quantidade_unidades INTEGER NOT NULL CHECK (quantidade_unidades > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PLANEJADA' CHECK (status IN ('PLANEJADA', 'EM_PRODUCAO', 'CONCLUIDA', 'CANCELADA')),
    custo_total_estimado DECIMAL(12, 2) NOT NULL DEFAULT 0,
    preco_venda_unitario DECIMAL(12, 2),
    observacao VARCHAR(255),
    data_prevista TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_conclusao TIMESTAMP,
    CONSTRAINT fk_op_receita FOREIGN KEY (receita_id) REFERENCES receita (id),
    CONSTRAINT fk_op_forma FOREIGN KEY (forma_id) REFERENCES forma (id)
);

-- ============================================================================
-- Migração segura caso as tabelas antigas do `prodly` (V1–V4) já existissem
-- ============================================================================
ALTER TABLE forma ADD COLUMN IF NOT EXISTS nome VARCHAR(80);
ALTER TABLE receita ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);
ALTER TABLE receita ADD COLUMN IF NOT EXISTS margem_lucro DECIMAL(5, 2) NOT NULL DEFAULT 65.00;
ALTER TABLE receita ADD COLUMN IF NOT EXISTS data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE insumo ALTER COLUMN custo_unitario TYPE DECIMAL(12, 4);
ALTER TABLE insumo ALTER COLUMN estoque_minimo TYPE DECIMAL(12, 3);
ALTER TABLE movimento_estoque ALTER COLUMN quantidade TYPE DECIMAL(12, 3);
ALTER TABLE movimento_estoque ALTER COLUMN custo_unitario TYPE DECIMAL(12, 4);
ALTER TABLE receita_item ALTER COLUMN quantidade TYPE DECIMAL(12, 3);

-- ============================================================================
-- Tabela de Usuários (Autenticação)
-- ============================================================================
CREATE TABLE IF NOT EXISTS usuario (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'OPERADOR' CHECK (role IN ('ADMIN', 'OPERADOR')),
    ativo BOOLEAN NOT NULL DEFAULT true,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


