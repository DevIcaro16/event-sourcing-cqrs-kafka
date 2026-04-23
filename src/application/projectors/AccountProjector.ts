import type { DomainEvent } from '../../domain/shared/DomainEvent'
import type { AccountEvent } from '../../domain/account/AccountEvents'
import type { ReadModelStore } from '../ports/ReadModelStore'
import type { CacheInvalidator } from '../ports/CacheInvalidator'
import type { ProcessedEventsStore } from '../ports/ProcessedEventsStore'

export class AccountProjector {
  constructor(
    private readonly readStore: ReadModelStore,
    private readonly cacheInvalidator: CacheInvalidator,
    private readonly processedEvents?: ProcessedEventsStore,
  ) {}

  async project(events: DomainEvent[], aggregateId: string): Promise<void> {
    for (const event of events) {
      if (event.eventId && this.processedEvents) {
        const isFirst = await this.processedEvents.tryMarkProcessed(event.eventId)
        if (!isFirst) continue
      }
      await this.projectOne(event as AccountEvent)
    }
    await this.cacheInvalidator.invalidateAccount(aggregateId)
  }

  private async projectOne(event: AccountEvent): Promise<void> {
    switch (event.type) {
      case 'AccountOpened': {
        await this.readStore.upsertBalance({
          accountId:        event.accountId,
          ownerId:          event.ownerId,
          balance:          event.initialBalance,
          availableBalance: event.initialBalance,
          lockedBalance:    0,
          lastEventSeq:     1,
        })
        await this.readStore.appendTransaction({
          accountId:    event.accountId,
          eventType:    'AccountOpened',
          amount:       event.initialBalance,
          balanceAfter: event.initialBalance,
          occurredAt:   event.occurredAt,
        })
        break
      }

      case 'MoneyDeposited': {
        const current = await this.readStore.getBalance(event.accountId)
        if (!current) break
        const newBalance = event.balanceAfter
        await this.readStore.upsertBalance({
          ...current,
          balance:          newBalance,
          availableBalance: newBalance - current.lockedBalance,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:    event.accountId,
          eventType:    'MoneyDeposited',
          amount:       event.amount,
          balanceAfter: event.balanceAfter,
          occurredAt:   event.occurredAt,
        })
        break
      }

      case 'MoneyWithdrawn': {
        const current = await this.readStore.getBalance(event.accountId)
        if (!current) break
        const newBalance = event.balanceAfter
        await this.readStore.upsertBalance({
          ...current,
          balance:          newBalance,
          availableBalance: newBalance - current.lockedBalance,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:    event.accountId,
          eventType:    'MoneyWithdrawn',
          amount:       event.amount,
          balanceAfter: event.balanceAfter,
          occurredAt:   event.occurredAt,
        })
        break
      }

      case 'TransferInitiated': {
        const current = await this.readStore.getBalance(event.fromAccountId)
        if (!current) break
        const newBalance = event.balanceAfter
        await this.readStore.upsertBalance({
          ...current,
          balance:          newBalance,
          availableBalance: newBalance - current.lockedBalance,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:    event.fromAccountId,
          eventType:    'TransferInitiated',
          amount:       event.amount,
          balanceAfter: event.balanceAfter,
          description:  `Transfer to ${event.toAccountId}`,
          occurredAt:   event.occurredAt,
        })
        break
      }

      case 'TransferReceived': {
        const current = await this.readStore.getBalance(event.accountId)
        if (!current) break
        const newBalance = event.balanceAfter
        await this.readStore.upsertBalance({
          ...current,
          balance:          newBalance,
          availableBalance: newBalance - current.lockedBalance,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:    event.accountId,
          eventType:    'TransferReceived',
          amount:       event.amount,
          balanceAfter: event.balanceAfter,
          description:  `Transfer from ${event.fromAccountId}`,
          occurredAt:   event.occurredAt,
        })
        break
      }

      case 'BalanceLocked': {
        const current = await this.readStore.getBalance(event.accountId)
        if (!current) break
        await this.readStore.upsertBalance({
          ...current,
          availableBalance: current.availableBalance - event.amount,
          lockedBalance:    current.lockedBalance + event.amount,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:   event.accountId,
          eventType:   'BalanceLocked',
          amount:      event.amount,
          description: event.reason,
          occurredAt:  event.occurredAt,
        })
        break
      }

      case 'BalanceUnlocked': {
        const current = await this.readStore.getBalance(event.accountId)
        if (!current) break
        await this.readStore.upsertBalance({
          ...current,
          availableBalance: current.availableBalance + event.amount,
          lockedBalance:    current.lockedBalance - event.amount,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:  event.accountId,
          eventType:  'BalanceUnlocked',
          amount:     event.amount,
          occurredAt: event.occurredAt,
        })
        break
      }

      case 'TransactionReversed': {
        const current = await this.readStore.getBalance(event.accountId)
        if (!current) break
        const newBalance = event.balanceAfter
        await this.readStore.upsertBalance({
          ...current,
          balance:          newBalance,
          availableBalance: newBalance - current.lockedBalance,
          lastEventSeq:     current.lastEventSeq + 1,
        })
        await this.readStore.appendTransaction({
          accountId:    event.accountId,
          eventType:    'TransactionReversed',
          amount:       event.amount,
          balanceAfter: event.balanceAfter,
          description:  `Reversal of ${event.originalEventId}`,
          occurredAt:   event.occurredAt,
        })
        break
      }
    }
  }
}
