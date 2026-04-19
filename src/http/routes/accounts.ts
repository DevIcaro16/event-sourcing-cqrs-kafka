// src/http/routes/accounts.ts
import { Elysia, t } from 'elysia'
import type { CommandDeps } from '../../application/commands/_loadAccount'
import type { ReadModelStore } from '../../application/ports/ReadModelStore'
import { handleOpenAccount } from '../../application/commands/OpenAccount'
import { handleDeposit } from '../../application/commands/Deposit'
import { handleWithdraw } from '../../application/commands/Withdraw'
import { handleTransfer } from '../../application/commands/Transfer'
import { handleLockBalance } from '../../application/commands/LockBalance'
import { handleUnlockBalance } from '../../application/commands/UnlockBalance'
import { handleReverseTransaction } from '../../application/commands/ReverseTransaction'
import { getBalance } from '../../application/queries/GetBalance'
import { getStatement } from '../../application/queries/GetStatement'
import { InsufficientFundsError, InvalidAmountError, InvalidReversalError, AccountNotFoundError } from '../../domain/account/AccountErrors'

export function accountRoutes(deps: CommandDeps, readStore: ReadModelStore) {
  return new Elysia({ prefix: '/accounts' })
    .post(
      '/',
      async ({ body, set }) => {
        const accountId = crypto.randomUUID()
        await handleOpenAccount({ accountId, ownerId: body.ownerId, initialBalance: body.initialBalance }, deps)
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
        await handleDeposit({ accountId: params.id, amount: body.amount }, deps)
        set.status = 202
        return { accountId: params.id }
      },
      { body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) }
    )
    .post(
      '/:id/withdraw',
      async ({ params, body, set }) => {
        await handleWithdraw({ accountId: params.id, amount: body.amount }, deps)
        set.status = 202
        return { accountId: params.id }
      },
      { body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) }
    )
    .post(
      '/transfer',
      async ({ body, set }) => {
        await handleTransfer({ fromAccountId: body.fromAccountId, toAccountId: body.toAccountId, amount: body.amount }, deps)
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
        await handleLockBalance({ accountId: params.id, amount: body.amount, reason: body.reason }, deps)
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
        await handleUnlockBalance({ accountId: params.id, amount: body.amount }, deps)
        set.status = 202
        return { accountId: params.id }
      },
      { body: t.Object({ amount: t.Number({ exclusiveMinimum: 0 }) }) }
    )
    .post(
      '/:id/reverse',
      async ({ params, body, set }) => {
        await handleReverseTransaction({ accountId: params.id, originalEventId: body.originalEventId, amount: body.amount }, deps)
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
    .get(
      '/:id/balance',
      async ({ params }) => {
        return getBalance(params.id, readStore)
      }
    )
    .get(
      '/:id/statement',
      async ({ params, query }) => {
        return getStatement(params.id, {
          from:   query.from   ? new Date(query.from)   : undefined,
          to:     query.to     ? new Date(query.to)     : undefined,
          type:   query.type,
          limit:  query.limit  ? Number(query.limit)  : undefined,
          offset: query.offset ? Number(query.offset) : undefined,
        }, readStore)
      },
      {
        query: t.Object({
          from:   t.Optional(t.String()),
          to:     t.Optional(t.String()),
          type:   t.Optional(t.String()),
          limit:  t.Optional(t.String()),
          offset: t.Optional(t.String()),
        }),
      }
    )
    .onError(({ error, set }) => {
      if (error instanceof InvalidAmountError || error instanceof InsufficientFundsError || error instanceof InvalidReversalError) {
        set.status = 422
        return { error: error.name, message: error.message }
      }
      if (error instanceof AccountNotFoundError) {
        set.status = 404
        return { error: 'AccountNotFound', message: error.message }
      }
    })
}
