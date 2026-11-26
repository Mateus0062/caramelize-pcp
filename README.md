# Caramelize PCP — Sistema de Planejamento e Controle de Produção

Sistema web full-stack em **Next.js (App Router) + TypeScript + Tailwind CSS v4 + Drizzle ORM** criado para a gestão completa de produção da **Caramelize — Pudim Artesanal**.

## Módulos

1. **Visão Geral (Dashboard)**: valor total em estoque, alertas de reposição (insumos abaixo do mínimo), ordens em aberto e movimentações recentes.
2. **Insumos & Preços**: cadastro de ingredientes e embalagens por categoria, com **calculadora de preço por embalagem** (ex.: R$ 6,90 / 395 g → R$ 0,0175/g) e saldo em tempo real.
3. **Receitas & Custos**: fichas técnicas com custo por lote e por ml e **simulador de preço por forma** com base na margem de lucro.
4. **Produção (PCP)**: ordens de produção com **explosão de materiais (MRP)**, ciclo Planejada → Em Produção → Concluída (com cancelar e reabrir), **baixa automática no estoque** ao concluir e **lista de compras consolidada em CSV** (abre direto no Excel).
5. **Estoque & Formas**: compras com **custo médio ponderado** (ou último preço), ajustes de entrada/saída, histórico paginado e vínculo de formas (`volume_ml` ↔ embalagem).
6. **Usuários** (somente administradores): criação de contas, papéis, desativação e redefinição de senha.

A aba aberta fica no endereço (`/?aba=producao`): o F5 mantém a aba e os botões voltar/avançar do navegador funcionam.

## Como rodar localmente

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

Sem `DATABASE_URL`, o sistema usa um **PostgreSQL embutido (PGlite)** em `data/pglite/` — o mesmo código e o mesmo SQL do Supabase, sem instalar nada. Na primeira abertura ele aplica as migrations e:
- se existir `data/caramelize-db.json` / `data/caramelize-users.json` (do antigo modo JSON), **importa esses dados** automaticamente;
- senão, carrega os dados de exemplo da Caramelize.

Em produção (`next start`) o banco local fica bloqueado para evitar perda de dados; defina `ALLOW_LOCAL_DB=true` só se for intencional (ex.: testar o build). Não abra a mesma pasta `data/pglite` em dois processos ao mesmo tempo.

## Conectar ao Supabase (PostgreSQL)

1. Baixe o certificado da CA do Supabase (**Project Settings → Database → SSL Configuration**), salve em `certs/supabase-ca.crt` e defina `DATABASE_SSL_CA_FILE`. O certificado do banco é sempre verificado.
2. Preencha `DATABASE_URL` no `.env.local` (usuário `postgres`) e aplique as migrations:

```bash
npm run db:migrate
```

   Elas são idempotentes e funcionam em bancos novos e nos que já existiam: criam/ajustam as tabelas, convertem as datas para `TIMESTAMPTZ`, criam os índices e ligam o RLS (fechando o acesso pela chave `anon`). Use `npm run db:migrate -- --status` para ver o que já foi aplicado. **O servidor se recusa a iniciar com migrations pendentes**, com a instrução no log.
3. Recomendado: crie o usuário `caramelize_app` com acesso mínimo ([`supabase/papel-aplicacao.sql`](supabase/papel-aplicacao.sql)) e use-o na `DATABASE_URL` do servidor.

### Mudanças na estrutura do banco

A estrutura fica em [`supabase/migrations/`](supabase/migrations/) (fonte da verdade) e em [`src/db/schema.ts`](src/db/schema.ts) (tipos do Drizzle). Para mudar uma tabela: crie `supabase/migrations/NNNN_descricao.sql` com o próximo número, ajuste `schema.ts` e rode `npm run db:migrate`. O banco local aplica sozinho ao iniciar.

## Testes e qualidade

```bash
npm test            # testes unitários (Vitest): cálculos, custos, datas, senhas, sessões
npm run lint        # ESLint (regras do Next.js)
npm run typecheck   # TypeScript
npm run test:e2e    # testes ponta a ponta contra um servidor rodando
```

Os testes ponta a ponta criam usuários, insumos e ordens: rode-os contra o **banco local descartável**, nunca contra o Supabase (eles se recusam a rodar se o servidor estiver usando o Supabase). Exemplo:

```bash
# terminal 1 — servidor de teste com banco local limpo
npm run build
ALLOW_LOCAL_DB=true ADMIN_EMAIL=admin@teste.local ADMIN_PASSWORD=uma-senha-de-teste npm start
# terminal 2
E2E_ADMIN_EMAIL=admin@teste.local E2E_ADMIN_PASSWORD=uma-senha-de-teste npm run test:e2e
```

Os cálculos de dinheiro e quantidades usam **aritmética decimal exata** (`src/lib/decimal.ts`), com arredondamento meio-para-cima (1,005 → 1,01), igual ao `DECIMAL` do banco.

## Segurança e permissões

- Não existe cadastro público: contas são criadas por um administrador na aba **Usuários**.
- Toda rota da API valida a sessão (assinatura HMAC + usuário ativo no banco) e o papel do usuário.
- Sessões duram 12 horas. Desativar um usuário ou trocar a senha encerra as sessões abertas dele.
- Login e troca de senha bloqueiam temporariamente após várias tentativas erradas (o contador fica na memória do servidor; com várias instâncias use um armazenamento compartilhado).
- Quem ainda usa a senha padrão antiga, ou uma senha com menos de 8 caracteres, precisa trocá-la no próximo login.

| Ação | Operador | Administrador |
| --- | :---: | :---: |
| Consultar todas as telas e exportar a lista de compras | ✅ | ✅ |
| Registrar movimentos de estoque | ✅ | ✅ |
| Criar ordens e mudar o status (inclusive cancelar/reabrir) | ✅ | ✅ |
| Concluir ordem com estoque insuficiente | — | ✅ |
| Cadastrar/editar/excluir insumos, categorias, formas e receitas | — | ✅ |
| Excluir ordens | — | ✅ |
| Gerenciar usuários | — | ✅ |

## Ordens de produção

- Concluir a mesma ordem duas vezes ao mesmo tempo (duplo clique, dois usuários) baixa o estoque uma única vez.
- Saídas manuais de estoque não podem ser maiores que o saldo. Se um administrador forçar a conclusão sem estoque, o saldo fica negativo e aparece em vermelho até ser reposto.
- Datas e horas são exibidas no fuso `America/Sao_Paulo`.
