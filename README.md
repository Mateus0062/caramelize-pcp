# Caramelize PCP — Sistema de Planejamento e Controle de Produção

Sistema web full-stack em **Next.js (App Router) + TypeScript + Tailwind CSS v4** criado para a gestão completa de produção da **Caramelize — Pudim Artesanal**.

## Módulos Implementados

1. **Visão Geral (Dashboard)**: Valor total em estoque, alertas de reposição (insumos abaixo do estoque mínimo), ordens em aberto e histórico recente de movimentações.
2. **Insumos & Preços**: Cadastro completo de ingredientes e embalagens por categoria, com **Calculadora de Preço por Embalagem** (ex.: R$ 6,90 / 395g → R$ 0,0175/g) e saldo calculado em tempo real.
3. **Receitas & Custos**: Montagem de fichas técnicas combinando insumos cadastrados, cálculo automático de custo por lote e por ml, e **Simulador de Precificação por Forma** (Mini 120ml, Média 500ml, Grande 1,1L, Geladinho 150ml) com preço sugerido baseado na margem de lucro alvo.
4. **Produção (PCP)**: Criação de Ordens de Produção por receita, forma e quantidade, com **Explosão de Materiais (MRP)** em tempo real (indicando exatamente o que falta comprar) e **baixa automática no estoque** ao concluir a ordem.
5. **Estoque & Formas**: Registro de compras (com atualização opcional do preço unitário do insumo), ajustes de entrada/saída e vínculo de formas (`volume_ml` ↔ insumo de embalagem).

## Como Rodar Localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

Por padrão, se `DATABASE_URL` não estiver configurada, o sistema funciona imediatamente em **Modo Local**, persistindo os dados em `data/caramelize-db.json` com dados iniciais da Caramelize prontos para teste.

## Conectar ao Supabase (PostgreSQL)

1. No SQL Editor do seu projeto Supabase, execute o script [`supabase/schema.sql`](supabase/schema.sql) (compatível com as migrations `V1`–`V4` do antigo back-end `prodly` + tabela `ordem_producao`).
2. Copie `.env.example` para `.env.local` e preencha `DATABASE_URL` com a string de conexão PostgreSQL do Supabase.
3. Reinicie o servidor (`npm run dev`). O indicador lateral mudará automaticamente para **Supabase Conectado**.
