# Design: Banking Event Sourcing — Fase 1: Core Bancário

**Data:** 2026-04-19  
**Escopo:** Fase 1 de 5 — domínio bancário com Event Sourcing puro, sem CQRS ainda  
**Stack:** Bun + Elysia + PostgreSQL + TypeScript

---

## Contexto e Objetivo

Simulação de aplicação bancária com foco em aprendizado progressivo de Event Sourcing e CQRS. Esta fase estabelece o núcleo: aggregate `Account`, Event Store no Postgres com controle de concorrência otimista, e exposição via HTTP com Elysia.

Fases subsequentes introduzirão: CQRS + projeções + Redis (Fase 2), RabbitMQ e Kafka como adapters (Fase 3), Kubernetes + observabilidade (Fase 4), GitFlow + CI/CD (Fase 5).

---

## Operações do Domínio

Operações cobertas nesta fase:

| Operação | Descrição |
|----------|-----------|
| Abrir conta | Cria aggregate com saldo inicial |
| Depositar | Incrementa saldo disponível |
| Sacar | Decrementa saldo, valida disponibilidade |
| Transferir | Débito na origem, crédito no destino |
| Bloquear saldo | Reserva parcial do saldo (ex: garantia) |
| Desbloquear saldo | Libera reserva |
| Estornar | Reverte uma transação anterior pelo seu eventId |

---

## Arquitetura Hexagonal

O domínio não possui dependências externas. Toda comunicação com infraestrutura ocorre via interfaces (portas) implementadas por adapters.

```
src/
├── domain/                  # zero dependências externas
│   ├── account/
│   │   ├── Account.ts       # Aggregate root
│   │   ├── AccountEvents.ts # union type dos eventos do domínio
│   │   └── AccountErrors.ts # erros de domínio tipados
│   └── shared/
│       ├── AggregateRoot.ts # classe base: acumula eventos pendentes
│       └── DomainEvent.ts   # tipo base para todos os eventos
│
├── application/             # casos de uso — orquestra domínio + ports
│   ├── commands/
│   │   ├── OpenAccount.ts
│   │   ├── Deposit.ts
│   │   ├── Withdraw.ts
│   │   ├── Transfer.ts
│   │   ├── LockBalance.ts
│   │   ├── UnlockBalance.ts
│   │   └── ReverseTransaction.ts
│   └── ports/
│       ├── EventStore.ts    # porta de saída (interface)
│       └── UnitOfWork.ts    # porta de saída (interface)
│
├── infrastructure/          # adapters — implementam as portas
│   └── postgres/
│       ├── PostgresEventStore.ts
│       └── schema.sql
│
└── http/                    # adapter de entrada
    └── routes/
        └── accounts.ts
```

**Regra de dependência:** `domain` ← `application` ← `infrastructure` / `http`. Nunca o inverso.

---

## Eventos do Domínio

Eventos são imutáveis e representam fatos que já ocorreram. Nomenclatura no passado.

```typescript
type AccountEvent =
  | { type: 'AccountOpened';       accountId: string; ownerId: string; initialBalance: number }
  | { type: 'MoneyDeposited';      accountId: string; amount: number; balanceAfter: number }
  | { type: 'MoneyWithdrawn';      accountId: string; amount: number; balanceAfter: number }
  | { type: 'TransferInitiated';   fromAccountId: string; toAccountId: string; amount: number }
  | { type: 'TransferReceived';    accountId: string; fromAccountId: string; amount: number }
  | { type: 'BalanceLocked';       accountId: string; amount: number; reason: string }
  | { type: 'BalanceUnlocked';     accountId: string; amount: number }
  | { type: 'TransactionReversed'; accountId: string; originalEventId: string; amount: number }
```

O aggregate reconstrói seu estado aplicando eventos em sequência (replay). Nunca persiste estado diretamente.

---

## Event Store — Schema PostgreSQL

```sql
CREATE TABLE events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id    UUID        NOT NULL,
  aggregate_type  TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  sequence_number BIGINT      NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_aggregate_sequence
    UNIQUE (aggregate_id, sequence_number)
);

CREATE INDEX idx_events_aggregate
  ON events (aggregate_id, sequence_number ASC);
```

**Controle de concorrência otimista:** a constraint `UNIQUE(aggregate_id, sequence_number)` garante que dois processos concorrentes não gravem no mesmo slot. Em caso de violação, o command handler faz retry com reload do aggregate.

**metadata JSONB** carrega rastreabilidade sem poluir o payload de domínio: `correlationId`, `causationId`, `userId`, `ipAddress`.

---

## Porta EventStore

```typescript
// application/ports/EventStore.ts
interface EventStore {
  append(
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion: number  // último sequence_number conhecido
  ): Promise<void>

  load(aggregateId: string): Promise<DomainEvent[]>
}
```

`expectedVersion` é o `sequence_number` do último evento carregado. Se outro processo já gravou nessa posição, `append` lança `ConcurrencyError` e o handler faz retry.

---

## Fluxo de um Comando

```
HTTP POST /accounts/:id/deposit  { amount }
  → Elysia route: valida schema, extrai DTO
  → Command Handler:
      1. eventStore.load(accountId)        -- replay → estado atual
      2. account.deposit(amount)           -- valida regra, emite evento
      3. eventStore.append(id, events, v)  -- persiste com versão esperada
  → HTTP 202 Accepted { accountId }
```

Comandos retornam `202 Accepted` com o `aggregateId`. Não retornam estado calculado — isso é responsabilidade do Read Side (Fase 2, CQRS). Essa assimetria é intencional e prepara o terreno para a separação Command/Query.

---

## Estratégia de Testes

| Tipo | Escopo | Ferramenta |
|------|--------|------------|
| Unitário | Aggregate + eventos (domínio isolado) | Bun test |
| Integração | PostgresEventStore contra Postgres real | Bun test + Docker Compose |

Sem mocks para o Event Store — testes de integração usam instância real do Postgres em container. Isso garante que a constraint de concorrência e o ordering são testados de verdade.

---

## O que esta fase NÃO inclui

- Read models / projeções → Fase 2
- Redis (snapshots e cache) → Fase 2
- Message brokers (RabbitMQ, Kafka) → Fase 3
- Kubernetes, Prometheus, Grafana → Fase 4
- GitFlow, CI/CD → Fase 5

---

## Próximos Passos

Ao completar a Fase 1, o projeto terá:
- Aggregate `Account` com replay de eventos funcionando
- Event Store Postgres com controle de concorrência otimista
- Endpoints HTTP via Elysia para todos os comandos
- Testes unitários do domínio e integração do adapter Postgres

A Fase 2 introduzirá CQRS: separação do Write Side (já construído) do Read Side, com projeções, Redis como snapshot cache e read model cache.
