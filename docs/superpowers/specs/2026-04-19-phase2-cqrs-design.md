# Design: Banking Event Sourcing — Fase 2: CQRS

**Data:** 2026-04-19
**Escopo:** Fase 2 de 5 — CQRS com projeções, Redis snapshot cache e read model cache
**Stack:** Bun + Elysia + PostgreSQL (write + read separados) + Drizzle ORM + Redis + TypeScript

---

## Contexto e Objetivo

A Fase 1 entregou o write side completo: aggregate `Account`, Event Store no PostgreSQL com controle de concorrência otimista, e 7 command handlers expostos via HTTP. Toda consulta de estado exigiria replay completo dos eventos — inviável em produção.

A Fase 2 introduz o **read side** via CQRS:
- **Projeções** pré-computadas mantidas atualizadas a cada evento
- **Queries** dedicadas que consultam o read DB sem tocar o Event Store
- **Redis** em dois papéis: snapshot cache (write side) e read model cache (read side)
- **Drizzle ORM** para o schema e queries do read DB
- **Banco separado** (`banking_read`) — padrão adotado em fintechs reguladas (Nubank, etc.)

---

## Queries Expostas

| Endpoint | Descrição |
|----------|-----------|
| `GET /accounts/:id/balance` | Saldo atual com breakdown (balance, available, locked) |
| `GET /accounts/:id/statement?from=&to=&type=` | Extrato paginado com filtros por data e tipo de operação |

---

## Arquitetura Geral

```
                    WRITE SIDE (Fase 1)
┌─────────┐    ┌──────────────┐    ┌─────────────────┐    ┌────────────────┐
│  HTTP   │───▶│   Command    │───▶│  Account        │───▶│ PostgreSQL     │
│ (POST)  │    │   Handler    │    │  Aggregate      │    │ (Event Store)  │
└─────────┘    └──────┬───────┘    └─────────────────┘    └────────────────┘
                      │ após append(), passa eventos ao projector
                      ▼
               ┌──────────────┐
               │  Projector   │
               └──────┬───────┘
                      │ atualiza read DB + invalida cache
          ┌───────────┴───────────┐
          ▼                       ▼
   ┌─────────────┐        ┌──────────────┐
   │  PostgreSQL │        │    Redis     │
   │ (Read DB)   │        │   (Cache)    │
   └─────────────┘        └──────────────┘
          ▲                       ▲
          │ miss                  │ hit
   ┌──────┴───────────────────────┴──┐
   │          Query Handler          │
   └──────────────┬──────────────────┘
                  │
           ┌──────▼──────┐
           │  HTTP (GET) │
           └─────────────┘

                    SNAPSHOT CACHE (write side)
   Command Handler → SnapshotStore.get(accountId)
     HIT:  Account.fromSnapshot(snapshot) + load eventos recentes
     MISS: replay completo + save snapshot se version >= SNAPSHOT_THRESHOLD
```

**Regra de dependência mantida:** domínio não conhece Redis nem Drizzle. Toda infraestrutura implementa ports definidas na camada de application.

---

## Read DB — Schema Drizzle

Banco: `banking_read` (separado do Event Store `banking`).

### `account_balances`

Projeção do estado atual de cada conta:

```typescript
export const accountBalances = pgTable('account_balances', {
  accountId:        uuid('account_id').primaryKey(),
  ownerId:          text('owner_id').notNull(),
  balance:          numeric('balance').notNull(),
  availableBalance: numeric('available_balance').notNull(),
  lockedBalance:    numeric('locked_balance').notNull().default('0'),
  lastEventSeq:     bigint('last_event_seq', { mode: 'number' }).notNull().default(0),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`lastEventSeq` é o checkpoint — registra o último `sequence_number` processado. Permite retomada sem reprocessamento em caso de falha.

### `account_transactions`

Projeção do extrato — uma linha por evento relevante:

```typescript
export const accountTransactions = pgTable('account_transactions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  accountId:    uuid('account_id').notNull(),
  eventType:    text('event_type').notNull(),
  amount:       numeric('amount'),
  balanceAfter: numeric('balance_after'),
  description:  text('description'),
  occurredAt:   timestamp('occurred_at', { withTimezone: true }).notNull(),
}, (t) => ({
  accountDateTypeIdx: index('idx_transactions_account_date_type')
    .on(t.accountId, t.occurredAt, t.eventType),
}))
```

O índice composto suporta filtros por `account_id` + `occurred_at` + `event_type` eficientemente.

---

## Ports do Read Side

```typescript
// application/ports/ReadModelStore.ts
export interface ReadModelStore {
  upsertBalance(data: AccountBalanceData): Promise<void>
  appendTransaction(data: AccountTransactionData): Promise<void>
  getBalance(accountId: string): Promise<AccountBalanceData | null>
  getStatement(accountId: string, filters: StatementFilters): Promise<AccountTransactionData[]>
}

export type AccountBalanceData = {
  accountId: string
  ownerId: string
  balance: number
  availableBalance: number
  lockedBalance: number
  lastEventSeq: number
}

export type AccountTransactionData = {
  accountId: string
  eventType: string
  amount?: number
  balanceAfter?: number
  description?: string
  occurredAt: Date
}

export type StatementFilters = {
  from?: Date
  to?: Date
  type?: string
  limit?: number
  offset?: number
}
```

## Projector

```typescript
// application/projectors/AccountProjector.ts
interface AccountProjector {
  project(events: DomainEvent[], aggregateId: string): Promise<void>
}
```

Mapeamento de eventos para ações no Read DB:

| Evento | account_balances | account_transactions |
|--------|-----------------|---------------------|
| AccountOpened | INSERT | INSERT |
| MoneyDeposited | UPDATE balance/available | INSERT |
| MoneyWithdrawn | UPDATE balance/available | INSERT |
| TransferInitiated | UPDATE balance/available | INSERT |
| TransferReceived | UPDATE balance/available | INSERT |
| BalanceLocked | UPDATE available/locked | INSERT |
| BalanceUnlocked | UPDATE available/locked | INSERT |
| TransactionReversed | UPDATE balance/available | INSERT |

Após projetar, invalida as chaves Redis da conta afetada (`balance:{accountId}`, `statement:{accountId}:*`).

O projector é chamado pelo command handler logo após o `append()`:

```typescript
// em cada command handler
await eventStore.append(aggregateId, 'Account', events, expectedVersion)
await projector.project(events, aggregateId)
```

---

## Snapshot Cache (Write Side)

### Porta

```typescript
// application/ports/SnapshotStore.ts
export type AccountSnapshot = {
  id: string
  ownerId: string
  balance: number
  lockedBalance: number
  version: number
}

export interface SnapshotStore {
  get(aggregateId: string): Promise<AccountSnapshot | null>
  save(aggregateId: string, snapshot: AccountSnapshot): Promise<void>
}
```

### Redis key

```
key:   snapshot:{aggregateId}
value: JSON.stringify(AccountSnapshot)
TTL:   nenhum — invalidado apenas quando novo snapshot é salvo
```

### Fluxo de carregamento com snapshot

```typescript
// EventStore com snapshot (substitui o load() atual nos command handlers)
async function loadWithSnapshot(aggregateId: string): Promise<Account> {
  const snapshot = await snapshotStore.get(aggregateId)
  if (snapshot) {
    const account = Account.fromSnapshot(snapshot)
    const recentEvents = await eventStore.loadFrom(aggregateId, snapshot.version + 1)
    account.loadFromHistory(recentEvents)
    return account
  }
  const allEvents = await eventStore.load(aggregateId)
  const account = new Account()
  account.loadFromHistory(allEvents)
  if (account.version >= SNAPSHOT_THRESHOLD) {
    await snapshotStore.save(aggregateId, account.toSnapshot())
  }
  return account
}
```

### Alterações no Account aggregate

```typescript
// Novo método estático
static fromSnapshot(snapshot: AccountSnapshot): Account

// Novo método de instância
toSnapshot(): AccountSnapshot
```

### EventStore — nova porta

```typescript
// application/ports/EventStore.ts (adição)
loadFrom(aggregateId: string, fromSequence: number): Promise<DomainEvent[]>
```

---

## Read Model Cache (Read Side)

Redis como cache na frente do Read DB:

```
GET /accounts/:id/balance
  → Redis GET balance:{accountId}
    HIT:  retorna JSON cached
    MISS: query Drizzle → Redis SET balance:{accountId} EX READ_MODEL_CACHE_TTL → retorna

GET /accounts/:id/statement?...
  → Redis GET statement:{accountId}:{hash(params)}
    HIT:  retorna JSON cached
    MISS: query Drizzle → Redis SET EX READ_MODEL_CACHE_TTL → retorna
```

TTL configurável via `READ_MODEL_CACHE_TTL` (default: 60s). Invalidado pelo projector a cada evento.

---

## Novos Arquivos

```
src/
├── domain/account/
│   └── Account.ts                          ← adiciona fromSnapshot() + toSnapshot()
├── application/
│   ├── ports/
│   │   ├── SnapshotStore.ts                ← NOVO
│   │   └── ReadModelStore.ts               ← NOVO
│   ├── projectors/
│   │   └── AccountProjector.ts             ← NOVO
│   └── queries/
│       ├── GetBalance.ts                   ← NOVO
│       └── GetStatement.ts                 ← NOVO
├── infrastructure/
│   ├── postgres/read/
│   │   ├── schema.ts                       ← NOVO (Drizzle schema)
│   │   ├── migrations/                     ← NOVO (Drizzle migrations)
│   │   └── DrizzleReadModelStore.ts        ← NOVO
│   └── redis/
│       ├── RedisSnapshotStore.ts           ← NOVO
│       └── RedisReadModelCache.ts          ← NOVO
└── http/routes/
    └── accounts.ts                         ← adiciona GET /balance + GET /statement
```

---

## Estratégia de Testes

| Tipo | Escopo | Ferramenta |
|------|--------|------------|
| Unitário | `Account.fromSnapshot()` + `toSnapshot()` | Bun test |
| Unitário | `AccountProjector` com ReadModelStore mockado | Bun test |
| Integração | `DrizzleReadModelStore` contra Postgres real | Bun test + Docker |
| Integração | `RedisSnapshotStore` contra Redis real | Bun test + Docker |
| Integração | Fluxo completo: comando → projeção → query | Bun test |

---

## Variáveis de Ambiente

```bash
READ_DATABASE_URL=postgres://postgres:postgres@localhost:5432/banking_read
TEST_READ_DATABASE_URL=postgres://postgres:postgres@localhost:5433/banking_read_test
REDIS_URL=redis://localhost:6379
SNAPSHOT_THRESHOLD=50
READ_MODEL_CACHE_TTL=60
```

---

## O que esta fase NÃO inclui

- Message brokers (RabbitMQ, Kafka) → Fase 3
- Projetor event-driven via broker → Fase 3
- Kubernetes, Prometheus, Grafana → Fase 4
- GitFlow CI/CD → Fase 5

---

## Próximos Passos

Ao completar a Fase 2, o projeto terá:
- Read side completo com projeções atualizadas sincronamente
- Queries de saldo e extrato com filtros
- Redis como snapshot cache (write) e read model cache (read)
- Drizzle ORM gerenciando o schema do Read DB

A Fase 3 substituirá a chamada direta ao projector por eventos publicados no Kafka e RabbitMQ — tornando o sistema verdadeiramente event-driven e desacoplado.
