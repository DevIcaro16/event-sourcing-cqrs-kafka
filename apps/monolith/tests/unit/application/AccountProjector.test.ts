import { describe, it, expect, beforeEach } from 'bun:test'
import { mock } from 'bun:test'
import { AccountProjector } from '../../../src/application/projectors/AccountProjector'
import type { AccountBalanceData } from '../../../src/application/ports/ReadModelStore'
import type { DomainEvent } from '../../../src/domain/shared/DomainEvent'

function makeReadStore(overrides: Partial<{ balance: AccountBalanceData | null }> = {}) {
  const balance: AccountBalanceData = overrides.balance ?? {
    accountId: 'acc-1', ownerId: 'o', balance: 1000, availableBalance: 800, lockedBalance: 200, lastEventSeq: 5,
  }
  return {
    upsertBalance:    mock(async () => {}),
    appendTransaction: mock(async () => {}),
    getBalance:       mock(async () => balance),
    getStatement:     mock(async () => []),
  }
}

function makeCacheInvalidator() {
  return { invalidateAccount: mock(async () => {}) }
}

describe('AccountProjector.project — AccountOpened', () => {
  it('insere saldo inicial e transação', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-open'

    await projector.project([
      { type: 'AccountOpened', accountId, ownerId: 'owner-x', initialBalance: 500, occurredAt: new Date() } as DomainEvent,
    ], accountId)

    expect(readStore.upsertBalance).toHaveBeenCalledTimes(1)
    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(500)
    expect(balanceArg.availableBalance).toBe(500)
    expect(balanceArg.lockedBalance).toBe(0)

    expect(readStore.appendTransaction).toHaveBeenCalledTimes(1)
    expect(cache.invalidateAccount).toHaveBeenCalledWith(accountId)
  })
})

describe('AccountProjector.project — MoneyDeposited', () => {
  it('atualiza saldo e adiciona transação', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-1'

    await projector.project([
      { type: 'MoneyDeposited', accountId, amount: 200, balanceAfter: 1200, occurredAt: new Date() } as DomainEvent,
    ], accountId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(1200)
    expect(balanceArg.availableBalance).toBe(1000) // 1200 - 200 (lockedBalance)
    expect(readStore.appendTransaction).toHaveBeenCalledTimes(1)
    expect(cache.invalidateAccount).toHaveBeenCalledWith(accountId)
  })
})

describe('AccountProjector.project — BalanceLocked', () => {
  it('ajusta available e locked sem alterar balance', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-1'

    await projector.project([
      { type: 'BalanceLocked', accountId, amount: 100, reason: 'reserva', occurredAt: new Date() } as DomainEvent,
    ], accountId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(1000)
    expect(balanceArg.availableBalance).toBe(700) // 800 - 100
    expect(balanceArg.lockedBalance).toBe(300)    // 200 + 100
  })
})

describe('AccountProjector.project — TransferInitiated', () => {
  it('usa balanceAfter do evento para debitar conta origem', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const fromId = 'acc-1'

    await projector.project([
      { type: 'TransferInitiated', sagaId: 'saga-test', fromAccountId: fromId, toAccountId: 'acc-2', amount: 300, balanceAfter: 700, occurredAt: new Date() } as DomainEvent,
    ], fromId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(700)          // balanceAfter do evento
    expect(balanceArg.availableBalance).toBe(500) // 700 - 200 (lockedBalance)
  })
})

describe('AccountProjector.project — MoneyWithdrawn', () => {
  it('usa balanceAfter do evento e preserva lockedBalance', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-1'

    await projector.project([
      { type: 'MoneyWithdrawn', accountId, amount: 100, balanceAfter: 900, occurredAt: new Date() } as DomainEvent,
    ], accountId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(900)
    expect(balanceArg.availableBalance).toBe(700) // 900 - 200 (lockedBalance)
    expect(readStore.appendTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('AccountProjector.project — TransferReceived', () => {
  it('usa balanceAfter do evento na conta destino', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-1'

    await projector.project([
      { type: 'TransferReceived', accountId, fromAccountId: 'acc-2', amount: 500, balanceAfter: 1500, occurredAt: new Date() } as DomainEvent,
    ], accountId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(1500)
    expect(balanceArg.availableBalance).toBe(1300) // 1500 - 200 (lockedBalance)
    expect(readStore.appendTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('AccountProjector.project — BalanceUnlocked', () => {
  it('libera saldo locked sem alterar balance', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-1'

    await projector.project([
      { type: 'BalanceUnlocked', accountId, amount: 200, occurredAt: new Date() } as DomainEvent,
    ], accountId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(1000)           // inalterado
    expect(balanceArg.availableBalance).toBe(1000)  // 800 + 200 (unlocked)
    expect(balanceArg.lockedBalance).toBe(0)         // 200 - 200
  })
})

describe('AccountProjector.project — TransactionReversed', () => {
  it('usa balanceAfter do evento na reversão', async () => {
    const readStore = makeReadStore()
    const cache = makeCacheInvalidator()
    const projector = new AccountProjector(readStore, cache)
    const accountId = 'acc-1'

    await projector.project([
      { type: 'TransactionReversed', accountId, originalEventId: 'evt-x', amount: 100, balanceAfter: 1100, occurredAt: new Date() } as DomainEvent,
    ], accountId)

    const balanceArg = (readStore.upsertBalance.mock.calls as unknown as AccountBalanceData[][])[0]![0]!
    expect(balanceArg.balance).toBe(1100)
    expect(balanceArg.availableBalance).toBe(900) // 1100 - 200 (lockedBalance)
    expect(readStore.appendTransaction).toHaveBeenCalledTimes(1)
  })
})
