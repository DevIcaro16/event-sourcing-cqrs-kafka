import { describe, it, expect, mock } from 'bun:test'
import { handleDeposit } from '../../../../src/application/commands/Deposit'
import type { MetricsPort } from '../../../../src/application/ports/MetricsPort'
import type { EventStore } from '../../../../src/application/ports/EventStore'
import type { SnapshotStore } from '../../../../src/application/ports/SnapshotStore'
import { METRIC_TRANSACTIONS_TOTAL, METRIC_TRANSACTION_AMOUNT } from '../../../../src/application/constants/metricNames'

const openEvent = {
  type: 'AccountOpened' as const,
  accountId: 'acc-1',
  ownerId: 'owner-1',
  initialBalance: 500,
  occurredAt: new Date(),
  eventId: 'evt-open-1',
}

function makeEventStore(): EventStore {
  return {
    append: mock(async () => {}),
    load: mock(async () => [openEvent]),
    loadFrom: mock(async () => []),
    findEventById: mock(async () => null),
    getLatestSequence: mock(async () => 1),
    computeCanonicalBalance: mock(async () => null),
  }
}

function makeSnapshotStore(): SnapshotStore {
  return {
    get: mock(async () => null),
    save: mock(async () => {}),
  }
}

function makeMetrics(): MetricsPort {
  return {
    increment: mock(() => {}),
    record: mock(() => {}),
  }
}

describe('handleDeposit', () => {
  it('chama metrics.increment e metrics.record com os atributos corretos', async () => {
    const metrics = makeMetrics()

    await handleDeposit(
      { accountId: 'acc-1', amount: 100 },
      { eventStore: makeEventStore(), snapshotStore: makeSnapshotStore(), metrics },
    )

    expect(metrics.increment).toHaveBeenCalledWith(METRIC_TRANSACTIONS_TOTAL, { type: 'deposit' })
    expect(metrics.record).toHaveBeenCalledWith(METRIC_TRANSACTION_AMOUNT, 100, { type: 'deposit' })
  })

  it('completa sem erro quando metrics não é fornecido', async () => {
    await expect(
      handleDeposit(
        { accountId: 'acc-1', amount: 100 },
        { eventStore: makeEventStore(), snapshotStore: makeSnapshotStore() },
      ),
    ).resolves.toBeUndefined()
  })
})
