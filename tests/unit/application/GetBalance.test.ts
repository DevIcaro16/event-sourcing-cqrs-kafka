import { describe, it, expect, mock } from 'bun:test'
import { getBalance } from '../../../src/application/queries/GetBalance'
import { AccountNotFoundError } from '../../../src/domain/account/AccountErrors'
import type { ReadModelStore, AccountBalanceData } from '../../../src/application/ports/ReadModelStore'
import type { EventStore } from '../../../src/application/ports/EventStore'
import type { SnapshotStore } from '../../../src/application/ports/SnapshotStore'
import type { CacheInvalidator } from '../../../src/application/ports/CacheInvalidator'
import type { CanonicalBalanceCache } from '../../../src/application/ports/CanonicalBalanceCache'

const storedBalance: AccountBalanceData = {
  accountId: 'acc-1',
  ownerId: 'owner-1',
  balance: 500,
  availableBalance: 500,
  lockedBalance: 0,
  lastEventSeq: 1,
}

const openEvent = {
  type: 'AccountOpened' as const,
  accountId: 'acc-1',
  ownerId: 'owner-1',
  initialBalance: 500,
  occurredAt: new Date(),
}

function makeReadStore(balance: AccountBalanceData | null): ReadModelStore {
  return {
    getBalance: mock(async () => balance),
    upsertBalance: mock(async () => {}),
    appendTransaction: mock(async () => {}),
    getStatement: mock(async () => []),
  }
}

function makeEventStore(latestSeq: number, events = [openEvent], canonical = { balance: 500, lockedBalance: 0 }): EventStore {
  return {
    append: mock(async () => {}),
    load: mock(async () => events),
    loadFrom: mock(async () => []),
    findEventById: mock(async () => null),
    getLatestSequence: mock(async () => latestSeq),
    computeCanonicalBalance: mock(async () => canonical),
  }
}

function makeSnapshotStore(): SnapshotStore {
  return {
    get: mock(async () => null),
    save: mock(async () => {}),
  }
}

function makeCacheInvalidator(): CacheInvalidator {
  return { invalidateAccount: mock(async () => {}) }
}

// Cache que sempre retorna miss (null) — força o eventStore.computeCanonicalBalance
function makeEmptyCanonicalCache(): CanonicalBalanceCache {
  return {
    get: mock(async () => null),
    set: mock(async () => {}),
  }
}

// Cache que retorna o canonical diretamente — simula cache quente
function makeWarmCanonicalCache(canonical: { balance: number; lockedBalance: number }): CanonicalBalanceCache {
  return {
    get: mock(async () => canonical),
    set: mock(async () => {}),
  }
}

describe('getBalance', () => {
  it('throws AccountNotFoundError when account does not exist', async () => {
    await expect(
      getBalance('acc-1', makeReadStore(null), {
        eventStore: makeEventStore(0, []),
        snapshotStore: makeSnapshotStore(),
        cacheInvalidator: makeCacheInvalidator(),
        canonicalCache: makeEmptyCanonicalCache(),
      }),
    ).rejects.toThrow(AccountNotFoundError)
  })

  it('returns stored balance when canonical is null (no events visible) — no rebuild', async () => {
    const cacheInvalidator = makeCacheInvalidator()
    const readStore = makeReadStore(storedBalance)
    const eventStore = makeEventStore(1, [openEvent], { balance: 500, lockedBalance: 0 })
    eventStore.computeCanonicalBalance = mock(async () => null)

    const result = await getBalance('acc-1', readStore, {
      eventStore,
      snapshotStore: makeSnapshotStore(),
      cacheInvalidator,
      canonicalCache: makeEmptyCanonicalCache(),
    })

    expect(result.balance).toBe(500)
    expect(cacheInvalidator.invalidateAccount).not.toHaveBeenCalled()
    expect(readStore.upsertBalance).not.toHaveBeenCalled()
  })

  it('returns stored balance when it matches canonical — no rebuild', async () => {
    const cacheInvalidator = makeCacheInvalidator()
    const readStore = makeReadStore(storedBalance)

    const result = await getBalance('acc-1', readStore, {
      eventStore: makeEventStore(1, [openEvent], { balance: 500, lockedBalance: 0 }),
      snapshotStore: makeSnapshotStore(),
      cacheInvalidator,
      canonicalCache: makeEmptyCanonicalCache(),
    })

    expect(result.balance).toBe(500)
    expect(cacheInvalidator.invalidateAccount).not.toHaveBeenCalled()
    expect(readStore.upsertBalance).not.toHaveBeenCalled()
  })

  it('rebuilds when balance column was tampered (same seq, wrong balance)', async () => {
    const tampered: AccountBalanceData = { ...storedBalance, balance: 9999, availableBalance: 9999 }
    const readStore = makeReadStore(tampered)
    const cacheInvalidator = makeCacheInvalidator()

    const result = await getBalance('acc-1', readStore, {
      // canonical says 500, stored says 9999 → drift
      eventStore: makeEventStore(1, [openEvent], { balance: 500, lockedBalance: 0 }),
      snapshotStore: makeSnapshotStore(),
      cacheInvalidator,
      canonicalCache: makeEmptyCanonicalCache(),
    })

    expect(result.balance).toBe(500)
    expect(readStore.upsertBalance).toHaveBeenCalledTimes(1)
    expect(cacheInvalidator.invalidateAccount).toHaveBeenCalledWith('acc-1')
  })

  it('rebuilds when lockedBalance column was tampered', async () => {
    const tampered: AccountBalanceData = { ...storedBalance, lockedBalance: 999, availableBalance: -499 }
    const cacheInvalidator = makeCacheInvalidator()

    const result = await getBalance('acc-1', makeReadStore(tampered), {
      eventStore: makeEventStore(1, [openEvent], { balance: 500, lockedBalance: 0 }),
      snapshotStore: makeSnapshotStore(),
      cacheInvalidator,
      canonicalCache: makeEmptyCanonicalCache(),
    })

    expect(result.lockedBalance).toBe(0)
    expect(cacheInvalidator.invalidateAccount).toHaveBeenCalledWith('acc-1')
  })

  it('uses cached canonical — skips SQL computation', async () => {
    const eventStore = makeEventStore(1, [openEvent], { balance: 500, lockedBalance: 0 })
    const warmCache = makeWarmCanonicalCache({ balance: 500, lockedBalance: 0 })

    await getBalance('acc-1', makeReadStore(storedBalance), {
      eventStore,
      snapshotStore: makeSnapshotStore(),
      cacheInvalidator: makeCacheInvalidator(),
      canonicalCache: warmCache,
    })

    expect(eventStore.computeCanonicalBalance).not.toHaveBeenCalled()
    expect(warmCache.get).toHaveBeenCalledWith('acc-1', 1)
  })

  it('stores computed canonical in cache on cache miss', async () => {
    const emptyCache = makeEmptyCanonicalCache()

    await getBalance('acc-1', makeReadStore(storedBalance), {
      eventStore: makeEventStore(1, [openEvent], { balance: 500, lockedBalance: 0 }),
      snapshotStore: makeSnapshotStore(),
      cacheInvalidator: makeCacheInvalidator(),
      canonicalCache: emptyCache,
    })

    expect(emptyCache.set).toHaveBeenCalledWith('acc-1', 1, { balance: 500, lockedBalance: 0 })
  })
})
