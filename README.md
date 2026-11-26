# Caramelize PCP — Sistema de Planejamento e Controle de Produção

Sistema web full-stack em **Next.js (App Router) + TypeScript + Tailwind CSS v4** criado para a gestão completa de produção da **Caramelize — Pudim Artesanal**.

## Módulos Implementados

1. **Visão Geral (Dashboard)**: Valor total em estoque, alertas de reposição (insumos abaixo do estoque mínimo), ordens em aberto e histórico recente de movimentações.
2. **Insumos & Preços**: Cadastro completo de ingredientes e embalagens por categoria, com **Calculadora de Preço por Embalagem** (ex.: R$ 6,90 / 395g → R$ 0,0175/g) e saldo calculado em tempo real.
3. **Receitas & Custos**: Montagem de fichas técnicas combinando insumos cadastrados, cálculo automático de custo por lote e por ml, e **Simulador de Precificação por Forma** (Mini 120ml, Média 500ml, Grande 1,1L, Geladinho 150ml) com preço sugerido baseado na margem de lucro alvo.
4. **Produção (PCP)**: Criação de Ordens de Produção por receita, forma e quantidade, com **Explosão de Materiais (MRP)** em tempo real (indicando exatamente o que falta comprar) e **baixa automática no estoque** ao concluir a ordem.
5. **Estoque & Formas**: Registro de compras (com atualização opcional do preço unitário do insumo), ajustes de entrada/saída e vínculo de formas (`volume_ml` ↔ insumo de embalagem).
6. **Usuários** (somente administradores): criação de contas, papéis, desativação e redefinição de senha.

## Como Rodar Localmente

1. Copie `.env.example` para `.env.local` e preencha:
   - `AUTH_SECRET` — **obrigatório**, 32+ caracteres aleatórios:
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD` (12+ caracteres) — criam o primeiro administrador quando ainda não existe nenhum usuário.
2. Rode:

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

Se `DATABASE_URL` estiver vazia, o sistema usa o **Modo Local** (somente para desenvolvimento), salvando os dados em `data/caramelize-db.json`. Em produção (`next start`) esse modo fica bloqueado para evitar perda de dados; defina `ALLOW_LOCAL_DB=true` apenas se for intencional (ex.: testar o build).

## Conectar ao Supabase (PostgreSQL)

1. No SQL Editor do Supabase, execute [`supabase/schema.sql`](supabase/schema.sql). Em bancos que já existiam, execute também [`supabase/seguranca.sql`](supabase/seguranca.sql) — ele liga o RLS e fecha o acesso pela chave `anon`.
2. Baixe o certificado da CA do Supabase (**Project Settings → Database → SSL Configuration**), salve em `certs/supabase-ca.crt` e defina `DATABASE_SSL_CA_FILE`. O certificado do banco é sempre verificado.
3. Preencha `DATABASE_URL` no `.env.local` e reinicie o servidor.
4. Recomendado: crie o usuário `caramelize_app` com acesso mínimo (Parte 2 de `supabase/seguranca.sql`) e use-o na `DATABASE_URL` em vez de `postgres`.
5. Opcional: execute [`supabase/migracao-timestamptz.sql`](supabase/migracao-timestamptz.sql) para converter as colunas de data/hora para `TIMESTAMPTZ`. Sem ela o sistema já funciona: as colunas `TIMESTAMP` são lidas como UTC (fuso padrão do Supabase).

## Ordens de Produção

- Fluxo: **Planejada → Em Produção → Concluída**. Planejadas e em produção podem ser **canceladas**; canceladas podem ser **reabertas**. Uma ordem concluída não muda mais (o estoque já foi baixado).
- Concluir a mesma ordem duas vezes ao mesmo tempo (duplo clique, dois usuários) baixa o estoque uma única vez.
- Saídas manuais de estoque não podem ser maiores que o saldo. Se um administrador forçar a conclusão sem estoque, o saldo fica negativo e aparece em vermelho até ser reposto.
- Datas e horas são exibidas no fuso `America/Sao_Paulo`.

## Segurança e Permissões

- Não existe cadastro público: contas são criadas por um administrador na aba **Usuários**.
- Toda rota da API valida a sessão (assinatura HMAC + usuário ativo no banco) e o papel do usuário.
- Sessões duram 12 horas. Desativar um usuário ou trocar a senha encerra as sessões abertas dele.
- Login e troca de senha bloqueiam temporariamente após várias tentativas erradas (o contador fica na memória do servidor; com várias instâncias use um armazenamento compartilhado).
- Quem ainda usa a senha padrão antiga, ou uma senha com menos de 8 caracteres, precisa trocá-la no próximo login.

| Ação | Operador | Administrador |
| --- | :---: | :---: |
| Consultar todas as telas | ✅ | ✅ |
| Registrar movimentos de estoque | ✅ | ✅ |
| Criar ordens e mudar o status | ✅ | ✅ |
| Concluir ordem com estoque insuficiente | — | ✅ |
| Cadastrar/editar/excluir insumos, categorias, formas e receitas | — | ✅ |
| Excluir ordens | — | ✅ |
| Gerenciar usuários | — | ✅ |
