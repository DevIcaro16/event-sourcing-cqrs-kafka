import type { CommandDeps } from '../../application/commands/_loadAccount'
import { loadAccount } from '../../application/commands/_loadAccount'
import type { ReadModelStore } from '../../application/ports/ReadModelStore'
import type { CacheInvalidator } from '../../application/ports/CacheInvalidator'
import type { CanonicalBalanceCache } from '../../application/ports/CanonicalBalanceCache'
import type { IdempotencyStore } from '../../application/ports/IdempotencyStore'
import type { SagaStore } from '../../application/ports/SagaStore'
import { handleOpenAccount } from '../../application/commands/OpenAccount'
import { handleDeposit } from '../../application/commands/Deposit'
import { handleWithdraw } from '../../application/commands/Withdraw'
import { handleTransfer } from '../../application/commands/Transfer'
import { handleLockBalance } from '../../application/commands/LockBalance'
import { handleUnlockBalance } from '../../application/commands/UnlockBalance'
import { handleReverseTransaction } from '../../application/commands/ReverseTransaction'
import { getBalance } from '../../application/queries/GetBalance'
import { getStatement } from '../../application/queries/GetStatement'
import { withIdempotency } from '../middleware/idempotency'

export class AccountController {
  constructor(
    private readonly deps: CommandDeps,
    private readonly readStore: ReadModelStore,
    private readonly cacheInvalidator: CacheInvalidator,
    private readonly canonicalCache: CanonicalBalanceCache,
    private readonly idempotencyStore?: IdempotencyStore,
    private readonly sagaStore?: SagaStore,
  ) {}

  async openAccount(body: { ownerId: string; initialBalance: number }, idempotencyKey?: string) {
    const accountId = crypto.randomUUID()
    return withIdempotency(idempotencyKey, 'POST /accounts', this.idempotencyStore, async () => {
      await handleOpenAccount({ accountId, ownerId: body.ownerId, initialBalance: body.initialBalance }, this.deps)
      return { accountId }
    })
  }

  async deposit(accountId: string, body: { amount: number }, idempotencyKey?: string) {
    return withIdempotency(idempotencyKey, 'POST /accounts/:id/deposit', this.idempotencyStore, async () => {
      await handleDeposit({ accountId, amount: body.amount }, this.deps)
      return { accountId }
    })
  }

  async withdraw(accountId: string, body: { amount: number }, idempotencyKey?: string) {
    return withIdempotency(idempotencyKey, 'POST /accounts/:id/withdraw', this.idempotencyStore, async () => {
      await handleWithdraw({ accountId, amount: body.amount }, this.deps)
      return { accountId }
    })
  }

  async transfer(body: { fromAccountId: string; toAccountId: string; amount: number }, idempotencyKey?: string) {
    await loadAccount(body.toAccountId, this.deps.eventStore, this.deps.snapshotStore)

    return withIdempotency(idempotencyKey, 'POST /accounts/transfer', this.idempotencyStore, async () => {
      const sagaId = crypto.randomUUID()
      if (this.sagaStore) {
        await this.sagaStore.create({
          sagaId,
          fromAccountId: body.fromAccountId,
          toAccountId:   body.toAccountId,
          amount:        body.amount,
          status:        'PENDING',
          attempt:       0,
          nextRetryAt:   null,
        })
      }
      try {
        await handleTransfer({ sagaId, fromAccountId: body.fromAccountId, toAccountId: body.toAccountId, amount: body.amount }, this.deps)
      } catch (err) {
        if (this.sagaStore) {
          try {
            await this.sagaStore.update(sagaId, { status: 'FAILED', attempt: 0, nextRetryAt: null })
          } catch {
            // best-effort — saga permanece PENDING se este update falhar
          }
        }
        throw err
      }
      return { sagaId, status: 'PENDING' as const }
    })
  }

  async lockBalance(accountId: string, body: { amount: number; reason: string }, idempotencyKey?: string) {
    return withIdempotency(idempotencyKey, 'POST /accounts/:id/lock', this.idempotencyStore, async () => {
      await handleLockBalance({ accountId, amount: body.amount, reason: body.reason }, this.deps)
      return { accountId }
    })
  }

  async unlockBalance(accountId: string, body: { amount: number }, idempotencyKey?: string) {
    return withIdempotency(idempotencyKey, 'POST /accounts/:id/unlock', this.idempotencyStore, async () => {
      await handleUnlockBalance({ accountId, amount: body.amount }, this.deps)
      return { accountId }
    })
  }

  async reverseTransaction(accountId: string, body: { originalEventId: string }, idempotencyKey?: string) {
    return withIdempotency(idempotencyKey, 'POST /accounts/:id/reverse', this.idempotencyStore, async () => {
      await handleReverseTransaction({ accountId, originalEventId: body.originalEventId }, this.deps)
      return { accountId }
    })
  }

  async getBalance(accountId: string) {
    return getBalance(accountId, this.readStore, {
      eventStore:       this.deps.eventStore,
      snapshotStore:    this.deps.snapshotStore,
      cacheInvalidator: this.cacheInvalidator,
      canonicalCache:   this.canonicalCache,
    })
  }

  async getStatement(accountId: string, filters: {
    from?: Date
    to?: Date
    type?: string
    limit?: number
    offset?: number
  }) {
    return getStatement(accountId, filters, this.readStore)
  }
}
