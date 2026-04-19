# Phase 1 — Banking Event Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o core bancário com Event Sourcing — aggregate `Account`, Event Store no Postgres com controle de concorrência otimista, commands handlers e exposição via HTTP com Elysia.

**Architecture:** Arquitetura hexagonal: domínio sem dependências externas, ports como interfaces TypeScript, adapters implementando as ports. HTTP (Elysia) é um adapter de entrada; Postgres é um adapter de saída.

**Tech Stack:** Bun, Elysia, postgres (porsager/postgres), TypeScript, Docker Compose, Bun test (built-in)

---

## Mapa de Arquivos

```
.
├── src/
│   ├── domain/
│   │   ├── shared/
│   │   │   ├── DomainEvent.ts        # tipo base para todos os eventos
│   │   │   └── AggregateRoot.ts      # classe base: acumula eventos pendentes, controla versão
│   │   └── account/
│   │       ├── AccountEvents.ts      # union type de todos os eventos do aggregate Account
│   │       ├── AccountErrors.ts      # erros de domínio tipados
│   │       └── Account.ts            # aggregate root: regras de negócio, emite eventos
│   ├── application/
│   │   ├── ports/
│   │   │   └── EventStore.ts         # interface (porta de saída) + ConcurrencyError
│   │   └── commands/
│   │       ├── OpenAccount.ts        # handler: orquestra load → execute → append
│   │       ├── Deposit.ts
│   │       ├── Withdraw.ts
│   │       ├── Transfer.ts
│   │       ├── LockBalance.ts
│   │       ├── UnlockBalance.ts
│   │       └── ReverseTransaction.ts
│   ├── infrastructure/
│   │   └── postgres/
│   │       ├── schema.sql            # DDL da tabela events + constraint + índice
│   │       └── PostgresEventStore.ts # adapter: implementa EventStore com Postgres
│   └── http/
│       └── routes/
│           └── accounts.ts           # rotas Elysia: valida input, chama command handler
├── tests/
│   ├── unit/
│   │   └── domain/
│   │       └── Account.test.ts       # testa aggregate em isolamento total
│   └── integration/
│       └── postgres/
│           └── PostgresEventStore.test.ts  # testa adapter contra Postgres real
├── server.ts                         # entrypoint: wiring de dependências + app.listen
├── docker-compose.yml                # Postgres para desenvolvimento
├── docker-compose.test.yml           # Postgres isolado para testes (porta 5433)
├── tsconfig.json
└── .gitignore
```

---

## Task 1: Setup do Projeto e GitFlow

**Files:**
- Create: `package.json` (via bun init)
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `docker-compose.test.yml`
- Create: `server.ts` (placeholder)

- [ ] **Step 1: Inicializar repositório e branches GitFlow**

```bash
cd /home/icaro-appguard/Público/bckp_projetos/Bun/event-sourcing
git checkout -b develop
```

- [ ] **Step 2: Inicializar projeto Bun**

```bash
bun init -y
```

Edite o `package.json` gerado para garantir:

```json
{
  "name": "banking-event-sourcing",
  "version": "0.1.0",
  "scripts": {
    "dev": "bun run --watch server.ts",
    "start": "bun run server.ts",
    "test": "bun test",
    "test:integration": "TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/banking_test bun test tests/integration"
  },
  "dependencies": {
    "elysia": "latest",
    "postgres": "latest"
  }
}
```

- [ ] **Step 3: Instalar dependências**

```bash
bun install
```

Expected output: `bun install` resolve e instala `elysia` e `postgres`.

- [ ] **Step 4: Criar tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@domain/*": ["src/domain/*"],
      "@application/*": ["src/application/*"],
      "@infrastructure/*": ["src/infrastructure/*"],
      "@http/*": ["src/http/*"]
    }
  },
  "include": ["src", "tests", "server.ts"]
}
```

- [ ] **Step 5: Criar .gitignore**

```
node_modules/
dist/
.env
.env.*
!.env.example
```

- [ ] **Step 6: Criar docker-compose.yml (dev)**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: banking
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./src/infrastructure/postgres/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql

volumes:
  postgres_data:
```

- [ ] **Step 7: Criar docker-compose.test.yml (testes isolados)**

```yaml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: banking_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5433:5432"
```

- [ ] **Step 8: Criar server.ts placeholder**

```typescript
// server.ts
console.log('Banking Event Sourcing — Phase 1')
```

- [ ] **Step 9: Criar feature branch para o domínio**

```bash
git checkout -b feature/domain-core
```

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json .gitignore docker-compose.yml docker-compose.test.yml server.ts bun.lock
git commit -m "chore: project setup with Bun, Elysia, GitFlow branches"
```

---

## Task 2: Tipos Base do Domínio

**Files:**
- Create: `src/domain/shared/DomainEvent.ts`
- Create: `src/domain/shared/AggregateRoot.ts`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p src/domain/shared
```

- [ ] **Step 2: Criar DomainEvent.ts**

```typescript
// src/domain/shared/DomainEvent.ts
export type DomainEvent = {
  type: string
  occurredAt: Date
}
```

- [ ] **Step 3: Criar AggregateRoot.ts**

```typescript
// src/domain/shared/AggregateRoot.ts
import type { DomainEvent } from './DomainEvent'

export abstract class AggregateRoot {
  private _pendingEvents: DomainEvent[] = []
  private _version: number = 0
  private _baseVersion: number = 0

  get version(): number { return this._version }
  get baseVersion(): number { return this._baseVersion }
  get pendingEvents(): DomainEvent[] { return [...this._pendingEvents] }

  protected applyEvent(event: DomainEvent): void {
    this.apply(event)
    this._pendingEvents.push(event)
    this._version++
  }

  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.apply(event)
      this._version++
    }
    this._baseVersion = this._version
  }

  clearPendingEvents(): void {
    this._pendingEvents = []
    this._baseVersion = this._version
  }

  protected abstract apply(event: DomainEvent): void
}
```

> **Conceito:** `baseVersion` é a versão no momento do carregamento do Event Store. É passada como `expectedVersion` no `append` para controle de concorrência otimista. `pendingEvents` são os eventos emitidos desde o carregamento — o que será persistido.

- [ ] **Step 4: Commit**

```bash
git add src/domain/shared/
git commit -m "feat: add DomainEvent and AggregateRoot base types"
```

---

## Task 3: Tipos do Aggregate Account

**Files:**
- Create: `src/domain/account/AccountEvents.ts`
- Create: `src/domain/account/AccountErrors.ts`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p src/domain/account
```

- [ ] **Step 2: Criar AccountEvents.ts**

```typescript
// src/domain/account/AccountEvents.ts
import type { DomainEvent } from '../shared/DomainEvent'

export type AccountOpened = DomainEvent & {
  type: 'AccountOpened'
  accountId: string
  ownerId: string
  initialBalance: number
}

export type MoneyDeposited = DomainEvent & {
  type: 'MoneyDeposited'
  accountId: string
  amount: number
  balanceAfter: number
}

export type MoneyWithdrawn = DomainEvent & {
  type: 'MoneyWithdrawn'
  accountId: string
  amount: number
  balanceAfter: number
}

export type TransferInitiated = DomainEvent & {
  type: 'TransferInitiated'
  fromAccountId: string
  toAccountId: string
  amount: number
}

export type TransferReceived = DomainEvent & {
  type: 'TransferReceived'
  accountId: string
  fromAccountId: string
  amount: number
  balanceAfter: number
}

export type BalanceLocked = DomainEvent & {
  type: 'BalanceLocked'
  accountId: string
  amount: number
  reason: string
}

export type BalanceUnlocked = DomainEvent & {
  type: 'BalanceUnlocked'
  accountId: string
  amount: number
}

export type TransactionReversed = DomainEvent & {
  type: 'TransactionReversed'
  accountId: string
  originalEventId: string
  amount: number
  balanceAfter: number
}

export type AccountEvent =
  | AccountOpened
  | MoneyDeposited
  | MoneyWithdrawn
  | TransferInitiated
  | TransferReceived
  | BalanceLocked
  | BalanceUnlocked
  | TransactionReversed
```

- [ ] **Step 3: Criar AccountErrors.ts**

```typescript
// src/domain/account/AccountErrors.ts
export class InvalidAmountError extends Error {
  constructor(amount: number) {
    super(`Invalid amount: ${amount}. Must be greater than zero.`)
    this.name = 'InvalidAmountError'
  }
}

export class InsufficientFundsError extends Error {
  constructor(available: number, requested: number) {
    super(`Insufficient funds: available ${available}, requested ${requested}`)
    this.name = 'InsufficientFundsError'
  }
}

export class AccountNotInitializedError extends Error {
  constructor() {
    super('Account has not been initialized. Call Account.open() first.')
    this.name = 'AccountNotInitializedError'
  }
}

export class InvalidReversalError extends Error {
  constructor(reason: string) {
    super(`Cannot reverse transaction: ${reason}`)
    this.name = 'InvalidReversalError'
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/account/AccountEvents.ts src/domain/account/AccountErrors.ts
git commit -m "feat: add AccountEvents union type and AccountErrors"
```

---

## Task 4: Account Aggregate — Open

**Files:**
- Create: `src/domain/account/Account.ts`
- Create: `tests/unit/domain/Account.test.ts`

- [ ] **Step 1: Criar diretório de testes**

```bash
mkdir -p tests/unit/domain
```

- [ ] **Step 2: Escrever o teste que vai falhar**

```typescript
// tests/unit/domain/Account.test.ts
import { describe, it, expect } from 'bun:test'
import { Account } from '../../../src/domain/account/Account'
import { InvalidAmountError } from '../../../src/domain/account/AccountErrors'

describe('Account.open', () => {
  it('emits AccountOpened event with correct data', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    const events = account.pendingEvents
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('AccountOpened')
    expect((events[0] as any).accountId).toBe('acc-1')
    expect((events[0] as any).initialBalance).toBe(500)
  })

  it('sets balance to initialBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    expect(account.balance).toBe(500)
  })

  it('sets availableBalance equal to balance when nothing is locked', () => {
    const account = Account.open('acc-1', 'owner-1', 300)
    expect(account.availableBalance).toBe(300)
  })

  it('starts at baseVersion 0 after open (no history loaded)', () => {
    const account = Account.open('acc-1', 'owner-1', 0)
    expect(account.baseVersion).toBe(0)
    expect(account.version).toBe(1)
  })

  it('rejects negative initialBalance', () => {
    expect(() => Account.open('acc-1', 'owner-1', -1)).toThrow(InvalidAmountError)
  })

  it('allows zero initialBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 0)
    expect(account.balance).toBe(0)
  })
})
```

- [ ] **Step 3: Rodar o teste para confirmar que falha**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: FAIL com `Cannot find module '../../../src/domain/account/Account'`

- [ ] **Step 4: Implementar Account.open**

```typescript
// src/domain/account/Account.ts
import { AggregateRoot } from '../shared/AggregateRoot'
import type { AccountEvent } from './AccountEvents'
import { InvalidAmountError, AccountNotInitializedError, InsufficientFundsError, InvalidReversalError } from './AccountErrors'
import type { DomainEvent } from '../shared/DomainEvent'

export class Account extends AggregateRoot {
  private _id: string = ''
  private _ownerId: string = ''
  private _balance: number = 0
  private _lockedBalance: number = 0

  get id(): string { return this._id }
  get ownerId(): string { return this._ownerId }
  get balance(): number { return this._balance }
  get lockedBalance(): number { return this._lockedBalance }
  get availableBalance(): number { return this._balance - this._lockedBalance }

  static open(accountId: string, ownerId: string, initialBalance: number): Account {
    if (initialBalance < 0) throw new InvalidAmountError(initialBalance)
    const account = new Account()
    account.applyEvent({
      type: 'AccountOpened',
      accountId,
      ownerId,
      initialBalance,
      occurredAt: new Date(),
    })
    return account
  }

  protected apply(event: DomainEvent): void {
    const e = event as AccountEvent
    switch (e.type) {
      case 'AccountOpened':
        this._id = e.accountId
        this._ownerId = e.ownerId
        this._balance = e.initialBalance
        break
      default:
        break
    }
  }
}
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: todos os testes do describe `Account.open` passando.

- [ ] **Step 6: Commit**

```bash
git add src/domain/account/Account.ts tests/unit/domain/Account.test.ts
git commit -m "feat: Account aggregate with open command and AccountOpened event"
```

---

## Task 5: Account Aggregate — Deposit e Withdraw

**Files:**
- Modify: `src/domain/account/Account.ts`
- Modify: `tests/unit/domain/Account.test.ts`

- [ ] **Step 1: Adicionar testes de deposit**

Adicione ao final de `tests/unit/domain/Account.test.ts`:

```typescript
describe('Account.deposit', () => {
  it('emits MoneyDeposited event', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    account.clearPendingEvents()
    account.deposit(50)
    expect(account.pendingEvents).toHaveLength(1)
    expect(account.pendingEvents[0].type).toBe('MoneyDeposited')
  })

  it('increases balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    account.deposit(50)
    expect(account.balance).toBe(150)
  })

  it('event carries correct balanceAfter', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    account.clearPendingEvents()
    account.deposit(50)
    expect((account.pendingEvents[0] as any).balanceAfter).toBe(150)
  })

  it('rejects zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.deposit(0)).toThrow(InvalidAmountError)
  })

  it('rejects negative amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.deposit(-10)).toThrow(InvalidAmountError)
  })
})

describe('Account.withdraw', () => {
  it('emits MoneyWithdrawn event', () => {
    const account = Account.open('acc-1', 'owner-1', 200)
    account.clearPendingEvents()
    account.withdraw(80)
    expect(account.pendingEvents[0].type).toBe('MoneyWithdrawn')
  })

  it('decreases balance', () => {
    const account = Account.open('acc-1', 'owner-1', 200)
    account.withdraw(80)
    expect(account.balance).toBe(120)
  })

  it('event carries correct balanceAfter', () => {
    const account = Account.open('acc-1', 'owner-1', 200)
    account.clearPendingEvents()
    account.withdraw(80)
    expect((account.pendingEvents[0] as any).balanceAfter).toBe(120)
  })

  it('rejects withdrawal exceeding available balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.withdraw(101)).toThrow(InsufficientFundsError)
  })

  it('rejects zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.withdraw(0)).toThrow(InvalidAmountError)
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: FAIL em `account.deposit is not a function`

- [ ] **Step 3: Implementar deposit e withdraw em Account.ts**

Adicione os métodos e os casos no `apply`. Substitua o arquivo completo:

```typescript
// src/domain/account/Account.ts
import { AggregateRoot } from '../shared/AggregateRoot'
import type { AccountEvent } from './AccountEvents'
import { InvalidAmountError, InsufficientFundsError, InvalidReversalError } from './AccountErrors'
import type { DomainEvent } from '../shared/DomainEvent'

export class Account extends AggregateRoot {
  private _id: string = ''
  private _ownerId: string = ''
  private _balance: number = 0
  private _lockedBalance: number = 0

  get id(): string { return this._id }
  get ownerId(): string { return this._ownerId }
  get balance(): number { return this._balance }
  get lockedBalance(): number { return this._lockedBalance }
  get availableBalance(): number { return this._balance - this._lockedBalance }

  static open(accountId: string, ownerId: string, initialBalance: number): Account {
    if (initialBalance < 0) throw new InvalidAmountError(initialBalance)
    const account = new Account()
    account.applyEvent({
      type: 'AccountOpened',
      accountId,
      ownerId,
      initialBalance,
      occurredAt: new Date(),
    })
    return account
  }

  deposit(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    this.applyEvent({
      type: 'MoneyDeposited',
      accountId: this._id,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  withdraw(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'MoneyWithdrawn',
      accountId: this._id,
      amount,
      balanceAfter: this._balance - amount,
      occurredAt: new Date(),
    })
  }

  protected apply(event: DomainEvent): void {
    const e = event as AccountEvent
    switch (e.type) {
      case 'AccountOpened':
        this._id = e.accountId
        this._ownerId = e.ownerId
        this._balance = e.initialBalance
        break
      case 'MoneyDeposited':
        this._balance = e.balanceAfter
        break
      case 'MoneyWithdrawn':
        this._balance = e.balanceAfter
        break
      default:
        break
    }
  }
}
```

- [ ] **Step 4: Rodar todos os testes**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: todos os describes passando.

- [ ] **Step 5: Commit**

```bash
git add src/domain/account/Account.ts tests/unit/domain/Account.test.ts
git commit -m "feat: Account deposit and withdraw with domain validation"
```

---

## Task 6: Account Aggregate — Transfer

**Files:**
- Modify: `src/domain/account/Account.ts`
- Modify: `tests/unit/domain/Account.test.ts`

- [ ] **Step 1: Adicionar testes de transfer**

Adicione ao final de `tests/unit/domain/Account.test.ts`:

```typescript
describe('Account.initiateTransfer', () => {
  it('emits TransferInitiated event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.clearPendingEvents()
    account.initiateTransfer('acc-2', 200)
    expect(account.pendingEvents[0].type).toBe('TransferInitiated')
  })

  it('decreases balance on origin', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.initiateTransfer('acc-2', 200)
    expect(account.balance).toBe(300)
  })

  it('rejects transfer exceeding available balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.initiateTransfer('acc-2', 101)).toThrow(InsufficientFundsError)
  })

  it('rejects zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.initiateTransfer('acc-2', 0)).toThrow(InvalidAmountError)
  })
})

describe('Account.receiveTransfer', () => {
  it('emits TransferReceived event', () => {
    const account = Account.open('acc-2', 'owner-2', 0)
    account.clearPendingEvents()
    account.receiveTransfer('acc-1', 200)
    expect(account.pendingEvents[0].type).toBe('TransferReceived')
  })

  it('increases balance on destination', () => {
    const account = Account.open('acc-2', 'owner-2', 50)
    account.receiveTransfer('acc-1', 200)
    expect(account.balance).toBe(250)
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: FAIL em `account.initiateTransfer is not a function`

- [ ] **Step 3: Implementar initiateTransfer e receiveTransfer**

Adicione os métodos em `Account.ts` e os cases no `apply`. Substitua o arquivo completo:

```typescript
// src/domain/account/Account.ts
import { AggregateRoot } from '../shared/AggregateRoot'
import type { AccountEvent } from './AccountEvents'
import { InvalidAmountError, InsufficientFundsError, InvalidReversalError } from './AccountErrors'
import type { DomainEvent } from '../shared/DomainEvent'

export class Account extends AggregateRoot {
  private _id: string = ''
  private _ownerId: string = ''
  private _balance: number = 0
  private _lockedBalance: number = 0

  get id(): string { return this._id }
  get ownerId(): string { return this._ownerId }
  get balance(): number { return this._balance }
  get lockedBalance(): number { return this._lockedBalance }
  get availableBalance(): number { return this._balance - this._lockedBalance }

  static open(accountId: string, ownerId: string, initialBalance: number): Account {
    if (initialBalance < 0) throw new InvalidAmountError(initialBalance)
    const account = new Account()
    account.applyEvent({
      type: 'AccountOpened',
      accountId,
      ownerId,
      initialBalance,
      occurredAt: new Date(),
    })
    return account
  }

  deposit(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    this.applyEvent({
      type: 'MoneyDeposited',
      accountId: this._id,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  withdraw(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'MoneyWithdrawn',
      accountId: this._id,
      amount,
      balanceAfter: this._balance - amount,
      occurredAt: new Date(),
    })
  }

  initiateTransfer(toAccountId: string, amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'TransferInitiated',
      fromAccountId: this._id,
      toAccountId,
      amount,
      occurredAt: new Date(),
    })
  }

  receiveTransfer(fromAccountId: string, amount: number): void {
    this.applyEvent({
      type: 'TransferReceived',
      accountId: this._id,
      fromAccountId,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  protected apply(event: DomainEvent): void {
    const e = event as AccountEvent
    switch (e.type) {
      case 'AccountOpened':
        this._id = e.accountId
        this._ownerId = e.ownerId
        this._balance = e.initialBalance
        break
      case 'MoneyDeposited':
        this._balance = e.balanceAfter
        break
      case 'MoneyWithdrawn':
        this._balance = e.balanceAfter
        break
      case 'TransferInitiated':
        this._balance -= e.amount
        break
      case 'TransferReceived':
        this._balance = e.balanceAfter
        break
      default:
        break
    }
  }
}
```

- [ ] **Step 4: Rodar todos os testes**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: todos os describes passando.

- [ ] **Step 5: Commit**

```bash
git add src/domain/account/Account.ts tests/unit/domain/Account.test.ts
git commit -m "feat: Account transfer (initiateTransfer + receiveTransfer)"
```

---

## Task 7: Account Aggregate — Lock, Unlock e Reverse

**Files:**
- Modify: `src/domain/account/Account.ts`
- Modify: `tests/unit/domain/Account.test.ts`

- [ ] **Step 1: Adicionar testes**

Adicione ao final de `tests/unit/domain/Account.test.ts`:

```typescript
import { InvalidReversalError } from '../../../src/domain/account/AccountErrors'

describe('Account.lockBalance', () => {
  it('emits BalanceLocked event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.clearPendingEvents()
    account.lockBalance(100, 'guarantee')
    expect(account.pendingEvents[0].type).toBe('BalanceLocked')
  })

  it('reduces availableBalance without changing balance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(100, 'guarantee')
    expect(account.balance).toBe(500)
    expect(account.availableBalance).toBe(400)
    expect(account.lockedBalance).toBe(100)
  })

  it('rejects lock exceeding available balance', () => {
    const account = Account.open('acc-1', 'owner-1', 100)
    expect(() => account.lockBalance(101, 'reason')).toThrow(InsufficientFundsError)
  })
})

describe('Account.unlockBalance', () => {
  it('emits BalanceUnlocked event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(100, 'guarantee')
    account.clearPendingEvents()
    account.unlockBalance(100)
    expect(account.pendingEvents[0].type).toBe('BalanceUnlocked')
  })

  it('restores availableBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(100, 'guarantee')
    account.unlockBalance(100)
    expect(account.availableBalance).toBe(500)
    expect(account.lockedBalance).toBe(0)
  })

  it('rejects unlock exceeding lockedBalance', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.lockBalance(50, 'guarantee')
    expect(() => account.unlockBalance(100)).toThrow(InvalidReversalError)
  })
})

describe('Account.reverseTransaction', () => {
  it('emits TransactionReversed event', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.withdraw(100)
    account.clearPendingEvents()
    account.reverseTransaction('original-event-id', 100)
    expect(account.pendingEvents[0].type).toBe('TransactionReversed')
  })

  it('restores balance after reversal', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    account.withdraw(100)
    account.reverseTransaction('original-event-id', 100)
    expect(account.balance).toBe(500)
  })

  it('rejects reversal of zero amount', () => {
    const account = Account.open('acc-1', 'owner-1', 500)
    expect(() => account.reverseTransaction('id', 0)).toThrow(InvalidAmountError)
  })
})
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: FAIL em `account.lockBalance is not a function`

- [ ] **Step 3: Implementar lockBalance, unlockBalance, reverseTransaction**

Substitua `Account.ts` completo:

```typescript
// src/domain/account/Account.ts
import { AggregateRoot } from '../shared/AggregateRoot'
import type { AccountEvent } from './AccountEvents'
import { InvalidAmountError, InsufficientFundsError, InvalidReversalError } from './AccountErrors'
import type { DomainEvent } from '../shared/DomainEvent'

export class Account extends AggregateRoot {
  private _id: string = ''
  private _ownerId: string = ''
  private _balance: number = 0
  private _lockedBalance: number = 0

  get id(): string { return this._id }
  get ownerId(): string { return this._ownerId }
  get balance(): number { return this._balance }
  get lockedBalance(): number { return this._lockedBalance }
  get availableBalance(): number { return this._balance - this._lockedBalance }

  static open(accountId: string, ownerId: string, initialBalance: number): Account {
    if (initialBalance < 0) throw new InvalidAmountError(initialBalance)
    const account = new Account()
    account.applyEvent({
      type: 'AccountOpened',
      accountId,
      ownerId,
      initialBalance,
      occurredAt: new Date(),
    })
    return account
  }

  deposit(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    this.applyEvent({
      type: 'MoneyDeposited',
      accountId: this._id,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  withdraw(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'MoneyWithdrawn',
      accountId: this._id,
      amount,
      balanceAfter: this._balance - amount,
      occurredAt: new Date(),
    })
  }

  initiateTransfer(toAccountId: string, amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'TransferInitiated',
      fromAccountId: this._id,
      toAccountId,
      amount,
      occurredAt: new Date(),
    })
  }

  receiveTransfer(fromAccountId: string, amount: number): void {
    this.applyEvent({
      type: 'TransferReceived',
      accountId: this._id,
      fromAccountId,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  lockBalance(amount: number, reason: string): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this.availableBalance) throw new InsufficientFundsError(this.availableBalance, amount)
    this.applyEvent({
      type: 'BalanceLocked',
      accountId: this._id,
      amount,
      reason,
      occurredAt: new Date(),
    })
  }

  unlockBalance(amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    if (amount > this._lockedBalance) throw new InvalidReversalError(`unlock amount ${amount} exceeds locked balance ${this._lockedBalance}`)
    this.applyEvent({
      type: 'BalanceUnlocked',
      accountId: this._id,
      amount,
      occurredAt: new Date(),
    })
  }

  reverseTransaction(originalEventId: string, amount: number): void {
    if (amount <= 0) throw new InvalidAmountError(amount)
    this.applyEvent({
      type: 'TransactionReversed',
      accountId: this._id,
      originalEventId,
      amount,
      balanceAfter: this._balance + amount,
      occurredAt: new Date(),
    })
  }

  protected apply(event: DomainEvent): void {
    const e = event as AccountEvent
    switch (e.type) {
      case 'AccountOpened':
        this._id = e.accountId
        this._ownerId = e.ownerId
        this._balance = e.initialBalance
        break
      case 'MoneyDeposited':
        this._balance = e.balanceAfter
        break
      case 'MoneyWithdrawn':
        this._balance = e.balanceAfter
        break
      case 'TransferInitiated':
        this._balance -= e.amount
        break
      case 'TransferReceived':
        this._balance = e.balanceAfter
        break
      case 'BalanceLocked':
        this._lockedBalance += e.amount
        break
      case 'BalanceUnlocked':
        this._lockedBalance -= e.amount
        break
      case 'TransactionReversed':
        this._balance = e.balanceAfter
        break
    }
  }
}
```

- [ ] **Step 4: Rodar todos os testes unitários**

```bash
bun test tests/unit/domain/Account.test.ts
```

Expected: todos os describes passando.

- [ ] **Step 5: Commit**

```bash
git add src/domain/account/Account.ts tests/unit/domain/Account.test.ts
git commit -m "feat: Account lockBalance, unlockBalance, reverseTransaction"
```

---

## Task 8: EventStore Port e ConcurrencyError

**Files:**
- Create: `src/application/ports/EventStore.ts`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p src/application/ports
```

- [ ] **Step 2: Criar EventStore.ts**

```typescript
// src/application/ports/EventStore.ts
import type { DomainEvent } from '../../domain/shared/DomainEvent'

export class ConcurrencyError extends Error {
  constructor(aggregateId: string, expectedVersion: number) {
    super(`Concurrency conflict for aggregate '${aggregateId}' at version ${expectedVersion}. Another process modified it first.`)
    this.name = 'ConcurrencyError'
  }
}

export interface EventStore {
  append(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void>

  load(aggregateId: string): Promise<DomainEvent[]>
}
```

> **Conceito revisado:** `expectedVersion` é o `baseVersion` do aggregate no momento do carregamento. O Event Store garante que o próximo `sequence_number` a ser inserido seja `expectedVersion + 1`. Se outro processo já inseriu nessa posição, a constraint `UNIQUE(aggregate_id, sequence_number)` dispara e lançamos `ConcurrencyError`. O command handler então recarrega e reaplica.

- [ ] **Step 3: Commit**

```bash
git add src/application/ports/EventStore.ts
git commit -m "feat: EventStore port interface with ConcurrencyError"
```

---

## Task 9: Schema PostgreSQL e Docker Compose

**Files:**
- Create: `src/infrastructure/postgres/schema.sql`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p src/infrastructure/postgres
```

- [ ] **Step 2: Criar schema.sql**

```sql
-- src/infrastructure/postgres/schema.sql
CREATE TABLE IF NOT EXISTS events (
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

CREATE INDEX IF NOT EXISTS idx_events_aggregate
  ON events (aggregate_id, sequence_number ASC);
```

- [ ] **Step 3: Subir Postgres de desenvolvimento**

```bash
docker compose up -d
```

Expected: container `postgres` rodando na porta 5432.

- [ ] **Step 4: Verificar que o schema foi aplicado**

```bash
docker compose exec postgres psql -U postgres -d banking -c "\d events"
```

Expected: tabela `events` com as colunas definidas.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/postgres/schema.sql
git commit -m "feat: PostgreSQL event store schema with optimistic concurrency constraint"
```

---

## Task 10: PostgresEventStore — Adapter

**Files:**
- Create: `src/infrastructure/postgres/PostgresEventStore.ts`
- Create: `tests/integration/postgres/PostgresEventStore.test.ts`

- [ ] **Step 1: Criar diretório de testes de integração**

```bash
mkdir -p tests/integration/postgres
```

- [ ] **Step 2: Subir Postgres de teste**

```bash
docker compose -f docker-compose.test.yml up -d
```

Expected: container `postgres-test` rodando na porta 5433.

- [ ] **Step 3: Escrever os testes de integração (falharão)**

```typescript
// tests/integration/postgres/PostgresEventStore.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'bun:test'
import postgres from 'postgres'
import { PostgresEventStore } from '../../../src/infrastructure/postgres/PostgresEventStore'
import { ConcurrencyError } from '../../../src/application/ports/EventStore'
import { readFileSync } from 'fs'

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/banking_test'
const sql = postgres(TEST_DB_URL)
const store = new PostgresEventStore(sql)

beforeAll(async () => {
  const schema = readFileSync('./src/infrastructure/postgres/schema.sql', 'utf-8')
  await sql.unsafe(schema)
})

afterEach(async () => {
  await sql`TRUNCATE TABLE events`
})

afterAll(async () => {
  await sql.end()
})

describe('PostgresEventStore.append + load', () => {
  it('persists events and loads them in order', async () => {
    const aggregateId = crypto.randomUUID()
    const events = [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'owner-1', initialBalance: 100, occurredAt: new Date() },
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 50, balanceAfter: 150, occurredAt: new Date() },
    ]
    await store.append(aggregateId, 'Account', events, 0)
    const loaded = await store.load(aggregateId)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].type).toBe('AccountOpened')
    expect(loaded[1].type).toBe('MoneyDeposited')
  })

  it('assigns sequence_numbers starting at expectedVersion + 1', async () => {
    const aggregateId = crypto.randomUUID()
    await store.append(aggregateId, 'Account', [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() }
    ], 0)
    await store.append(aggregateId, 'Account', [
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 10, balanceAfter: 10, occurredAt: new Date() }
    ], 1)
    const loaded = await store.load(aggregateId)
    expect(loaded).toHaveLength(2)
  })

  it('throws ConcurrencyError when expectedVersion conflicts', async () => {
    const aggregateId = crypto.randomUUID()
    const event = { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() }
    await store.append(aggregateId, 'Account', [event], 0)
    await expect(
      store.append(aggregateId, 'Account', [{ ...event, occurredAt: new Date() }], 0)
    ).rejects.toThrow(ConcurrencyError)
  })

  it('returns empty array for unknown aggregateId', async () => {
    const events = await store.load(crypto.randomUUID())
    expect(events).toHaveLength(0)
  })

  it('appends multiple events in a single call atomically', async () => {
    const aggregateId = crypto.randomUUID()
    const events = [
      { type: 'AccountOpened', accountId: aggregateId, ownerId: 'o', initialBalance: 0, occurredAt: new Date() },
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 100, balanceAfter: 100, occurredAt: new Date() },
      { type: 'MoneyDeposited', accountId: aggregateId, amount: 200, balanceAfter: 300, occurredAt: new Date() },
    ]
    await store.append(aggregateId, 'Account', events, 0)
    const loaded = await store.load(aggregateId)
    expect(loaded).toHaveLength(3)
  })
})
```

- [ ] **Step 4: Rodar para confirmar que falha**

```bash
bun test:integration
```

Expected: FAIL em `Cannot find module '../../../src/infrastructure/postgres/PostgresEventStore'`

- [ ] **Step 5: Implementar PostgresEventStore.ts**

```typescript
// src/infrastructure/postgres/PostgresEventStore.ts
import type postgres from 'postgres'
import type { EventStore } from '../../application/ports/EventStore'
import { ConcurrencyError } from '../../application/ports/EventStore'
import type { DomainEvent } from '../../domain/shared/DomainEvent'

export class PostgresEventStore implements EventStore {
  constructor(private readonly sql: postgres.Sql) {}

  async append(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void> {
    if (events.length === 0) return
    try {
      await this.sql.begin(async (tx) => {
        for (let i = 0; i < events.length; i++) {
          const event = events[i]
          const sequenceNumber = expectedVersion + i + 1
          await tx`
            INSERT INTO events
              (aggregate_id, aggregate_type, event_type, payload, sequence_number, occurred_at)
            VALUES (
              ${aggregateId}::uuid,
              ${aggregateType},
              ${event.type},
              ${JSON.stringify(event)}::jsonb,
              ${sequenceNumber},
              ${event.occurredAt}
            )
          `
        }
      })
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConcurrencyError(aggregateId, expectedVersion)
      }
      throw err
    }
  }

  async load(aggregateId: string): Promise<DomainEvent[]> {
    const rows = await this.sql<{ payload: DomainEvent }[]>`
      SELECT payload
      FROM events
      WHERE aggregate_id = ${aggregateId}::uuid
      ORDER BY sequence_number ASC
    `
    return rows.map((row) => row.payload)
  }
}
```

- [ ] **Step 6: Rodar testes de integração**

```bash
bun run test:integration
```

Expected: todos os testes de integração passando.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/postgres/PostgresEventStore.ts tests/integration/postgres/PostgresEventStore.test.ts
git commit -m "feat: PostgresEventStore adapter with optimistic concurrency and transaction support"
```

---

## Task 11: Command Handlers

**Files:**
- Create: `src/application/commands/OpenAccount.ts`
- Create: `src/application/commands/Deposit.ts`
- Create: `src/application/commands/Withdraw.ts`
- Create: `src/application/commands/Transfer.ts`
- Create: `src/application/commands/LockBalance.ts`
- Create: `src/application/commands/UnlockBalance.ts`
- Create: `src/application/commands/ReverseTransaction.ts`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p src/application/commands
```

- [ ] **Step 2: Criar OpenAccount.ts**

```typescript
// src/application/commands/OpenAccount.ts
import type { EventStore } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type OpenAccountCommand = {
  accountId: string
  ownerId: string
  initialBalance: number
}

export async function handleOpenAccount(
  command: OpenAccountCommand,
  eventStore: EventStore
): Promise<void> {
  const account = Account.open(command.accountId, command.ownerId, command.initialBalance)
  await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
}
```

- [ ] **Step 3: Criar Deposit.ts**

```typescript
// src/application/commands/Deposit.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type DepositCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleDeposit(
  command: DepositCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const history = await eventStore.load(command.accountId)
    if (history.length === 0) throw new Error(`Account not found: ${command.accountId}`)

    const account = new Account()
    account.loadFromHistory(history)
    account.deposit(command.amount)

    try {
      await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 4: Criar Withdraw.ts**

```typescript
// src/application/commands/Withdraw.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type WithdrawCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleWithdraw(
  command: WithdrawCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const history = await eventStore.load(command.accountId)
    if (history.length === 0) throw new Error(`Account not found: ${command.accountId}`)

    const account = new Account()
    account.loadFromHistory(history)
    account.withdraw(command.amount)

    try {
      await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 5: Criar Transfer.ts**

```typescript
// src/application/commands/Transfer.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type TransferCommand = {
  fromAccountId: string
  toAccountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleTransfer(
  command: TransferCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const [fromHistory, toHistory] = await Promise.all([
      eventStore.load(command.fromAccountId),
      eventStore.load(command.toAccountId),
    ])
    if (fromHistory.length === 0) throw new Error(`Account not found: ${command.fromAccountId}`)
    if (toHistory.length === 0) throw new Error(`Account not found: ${command.toAccountId}`)

    const from = new Account()
    from.loadFromHistory(fromHistory)
    from.initiateTransfer(command.toAccountId, command.amount)

    const to = new Account()
    to.loadFromHistory(toHistory)
    to.receiveTransfer(command.fromAccountId, command.amount)

    try {
      await eventStore.append(command.fromAccountId, 'Account', from.pendingEvents, from.baseVersion)
      await eventStore.append(command.toAccountId, 'Account', to.pendingEvents, to.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

> **Nota:** A transferência faz dois `append` sequenciais, não atômicos entre si. Em caso de falha entre os dois, a conta de origem perde o saldo sem o destino receber. Isso é intencional para Phase 1 — o problema será resolvido com Saga/Outbox Pattern na Phase 3 (brokers).

- [ ] **Step 6: Criar LockBalance.ts**

```typescript
// src/application/commands/LockBalance.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type LockBalanceCommand = {
  accountId: string
  amount: number
  reason: string
}

const MAX_RETRIES = 3

export async function handleLockBalance(
  command: LockBalanceCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const history = await eventStore.load(command.accountId)
    if (history.length === 0) throw new Error(`Account not found: ${command.accountId}`)

    const account = new Account()
    account.loadFromHistory(history)
    account.lockBalance(command.amount, command.reason)

    try {
      await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 7: Criar UnlockBalance.ts**

```typescript
// src/application/commands/UnlockBalance.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type UnlockBalanceCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleUnlockBalance(
  command: UnlockBalanceCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const history = await eventStore.load(command.accountId)
    if (history.length === 0) throw new Error(`Account not found: ${command.accountId}`)

    const account = new Account()
    account.loadFromHistory(history)
    account.unlockBalance(command.amount)

    try {
      await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 8: Criar ReverseTransaction.ts**

```typescript
// src/application/commands/ReverseTransaction.ts
import type { EventStore } from '../ports/EventStore'
import { ConcurrencyError } from '../ports/EventStore'
import { Account } from '../../domain/account/Account'

export type ReverseTransactionCommand = {
  accountId: string
  originalEventId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleReverseTransaction(
  command: ReverseTransactionCommand,
  eventStore: EventStore
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const history = await eventStore.load(command.accountId)
    if (history.length === 0) throw new Error(`Account not found: ${command.accountId}`)

    const account = new Account()
    account.loadFromHistory(history)
    account.reverseTransaction(command.originalEventId, command.amount)

    try {
      await eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add src/application/commands/
git commit -m "feat: command handlers with optimistic concurrency retry (OpenAccount, Deposit, Withdraw, Transfer, LockBalance, UnlockBalance, ReverseTransaction)"
```

---

## Task 12: Rotas HTTP com Elysia

**Files:**
- Create: `src/http/routes/accounts.ts`
- Modify: `server.ts`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p src/http/routes
```

- [ ] **Step 2: Criar accounts.ts**

```typescript
// src/http/routes/accounts.ts
import { Elysia, t } from 'elysia'
import type { EventStore } from '../../application/ports/EventStore'
import { handleOpenAccount } from '../../application/commands/OpenAccount'
import { handleDeposit } from '../../application/commands/Deposit'
import { handleWithdraw } from '../../application/commands/Withdraw'
import { handleTransfer } from '../../application/commands/Transfer'
import { handleLockBalance } from '../../application/commands/LockBalance'
import { handleUnlockBalance } from '../../application/commands/UnlockBalance'
import { handleReverseTransaction } from '../../application/commands/ReverseTransaction'
import { InsufficientFundsError, InvalidAmountError, InvalidReversalError } from '../../domain/account/AccountErrors'

export function accountRoutes(eventStore: EventStore) {
  return new Elysia({ prefix: '/accounts' })
    .post(
      '/',
      async ({ body, set }) => {
        const accountId = crypto.randomUUID()
        await handleOpenAccount({ accountId, ownerId: body.ownerId, initialBalance: body.initialBalance }, eventStore)
        set.status = 202
        return { accountId }
      },
      {
        body: t.Object({
          ownerId: t.String({ minLength: 1 }),
          initialBalance: t.Number({ minimum: 0 }),
        }),
      }
    )
    .post(
      '/:id/deposit',
      async ({ params, body, set }) => {
        await handleDeposit({ accountId: params.id, amount: body.amount }, eventStore)
        set.status = 202
        return { accountId: params.id }
      },
      { body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) }
    )
    .post(
      '/:id/withdraw',
      async ({ params, body, set }) => {
        await handleWithdraw({ accountId: params.id, amount: body.amount }, eventStore)
        set.status = 202
        return { accountId: params.id }
      },
      { body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) }
    )
    .post(
      '/transfer',
      async ({ body, set }) => {
        await handleTransfer({ fromAccountId: body.fromAccountId, toAccountId: body.toAccountId, amount: body.amount }, eventStore)
        set.status = 202
        return { fromAccountId: body.fromAccountId, toAccountId: body.toAccountId }
      },
      {
        body: t.Object({
          fromAccountId: t.String({ minLength: 1 }),
          toAccountId: t.String({ minLength: 1 }),
          amount: t.Number({ exclusiveMinimum: 0 }),
        }),
      }
    )
    .post(
      '/:id/lock',
      async ({ params, body, set }) => {
        await handleLockBalance({ accountId: params.id, amount: body.amount, reason: body.reason }, eventStore)
        set.status = 202
        return { accountId: params.id }
      },
      {
        body: t.Object({
          amount: t.Number({ exclusiveMinimum: 0 }),
          reason: t.String({ minLength: 1 }),
        }),
      }
    )
    .post(
      '/:id/unlock',
      async ({ params, body, set }) => {
        await handleUnlockBalance({ accountId: params.id, amount: body.amount }, eventStore)
        set.status = 202
        return { accountId: params.id }
      },
      { body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) }
    )
    .post(
      '/:id/reverse',
      async ({ params, body, set }) => {
        await handleReverseTransaction({ accountId: params.id, originalEventId: body.originalEventId, amount: body.amount }, eventStore)
        set.status = 202
        return { accountId: params.id }
      },
      {
        body: t.Object({
          originalEventId: t.String({ minLength: 1 }),
          amount: t.Number({ exclusiveMinimum: 0 }),
        }),
      }
    )
    .onError(({ error, set }) => {
      if (error instanceof InvalidAmountError || error instanceof InsufficientFundsError || error instanceof InvalidReversalError) {
        set.status = 422
        return { error: error.name, message: error.message }
      }
      if (error.message.startsWith('Account not found')) {
        set.status = 404
        return { error: 'AccountNotFound', message: error.message }
      }
    })
}
```

- [ ] **Step 3: Atualizar server.ts com wiring completo**

```typescript
// server.ts
import { Elysia } from 'elysia'
import postgres from 'postgres'
import { PostgresEventStore } from './src/infrastructure/postgres/PostgresEventStore'
import { accountRoutes } from './src/http/routes/accounts'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/banking'

const sql = postgres(DATABASE_URL)
const eventStore = new PostgresEventStore(sql)

const app = new Elysia()
  .use(accountRoutes(eventStore))
  .listen(3000)

console.log(`Banking Event Sourcing running on http://localhost:3000`)
```

- [ ] **Step 4: Rodar o servidor**

```bash
bun run dev
```

Expected: `Banking Event Sourcing running on http://localhost:3000`

- [ ] **Step 5: Smoke test manual**

```bash
# Abrir conta
curl -s -X POST http://localhost:3000/accounts \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"owner-1","initialBalance":1000}' | jq

# Copie o accountId retornado e use nos próximos comandos
ACCOUNT_ID="<accountId-retornado>"

# Depositar
curl -s -X POST http://localhost:3000/accounts/$ACCOUNT_ID/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount":500}' | jq

# Sacar
curl -s -X POST http://localhost:3000/accounts/$ACCOUNT_ID/withdraw \
  -H "Content-Type: application/json" \
  -d '{"amount":200}' | jq
```

Expected: todas as respostas com `status 202` e `{ "accountId": "..." }`.

- [ ] **Step 6: Commit**

```bash
git add src/http/routes/accounts.ts server.ts
git commit -m "feat: Elysia HTTP routes for all account commands"
```

---

## Task 13: Merge para Develop e Tag da Fase 1

- [ ] **Step 1: Rodar todos os testes**

```bash
bun test
bun run test:integration
```

Expected: todos os testes unitários e de integração passando.

- [ ] **Step 2: Merge da feature branch para develop**

```bash
git checkout develop
git merge --no-ff feature/domain-core -m "feat: Phase 1 — banking core with Event Sourcing"
```

- [ ] **Step 3: Tag da Phase 1**

```bash
git tag -a v0.1.0 -m "Phase 1: Event Sourcing core — Account aggregate, PostgreSQL Event Store, Elysia HTTP"
```

---

## Checklist de Cobertura do Spec

| Requisito do Spec | Task |
|-------------------|------|
| Operações: abrir, depositar, sacar, transferir | Tasks 4–6 |
| Operações: bloquear, desbloquear, estornar | Task 7 |
| Arquitetura Hexagonal (ports & adapters) | Tasks 2, 8, 10 |
| Event Store Postgres com UNIQUE constraint | Task 9 |
| Controle de concorrência otimista | Tasks 8, 10 |
| metadata JSONB separado do payload | Task 9 (schema) |
| Command handlers com retry | Task 11 |
| HTTP via Elysia, 202 Accepted | Task 12 |
| Testes unitários do domínio | Tasks 4–7 |
| Testes de integração do adapter Postgres | Task 10 |
| GitFlow (develop + feature branches) | Tasks 1, 13 |
