# Running with Docker

Compose sobe **PostgreSQL** (`pgvector/pgvector:pg16`) e, se você pedir, o app Next.js. Não há Supabase: auth, storage e realtime ficam no próprio app, em cima desse Postgres.

As migrations em `supabase/migrations/` são só arquivos SQL. O serviço `migrate` aplica elas no banco `crm-aluinter`.

## Só o banco (app com `npm run dev`)

A porta **5432** do Mac costuma estar ocupada. O Postgres do Compose publica em **5433**.

```bash
cp .env.docker.local.example .env.docker.local
cp .env.local.example .env.local
npm run docker:db
npm run dev
```

- Banco: `postgres://postgres:postgres@127.0.0.1:5433/crm-aluinter`
- App: http://localhost:3004
- Login demo (quando `SEED_DEMO=1`): `demo@local.test` / `demo123456`

`.env.local` é o que o `next dev` lê. `DATABASE_URL` tem que apontar para `127.0.0.1:5433`, não para dentro da rede do Compose.

## App + banco no Compose

O container do app também publica **3004**. Pare o `npm run dev` antes, senão a porta fica ocupada.

```bash
npm run docker:up
```

O app no container escuta 3000 por dentro e aparece em http://localhost:3004. `DATABASE_URL` aponta para o serviço `db`.

`NEXT_PUBLIC_*` e `AUTH_SECRET` entram no build. Se mudar, rode `npm run docker:up` de novo.

## Parar

```bash
npm run docker:down
```

O volume `crm-aluinter-pgdata` permanece. Para apagar os dados: `docker volume rm crm-aluinter-pgdata`.
