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
import { InsufficientFundsError, InvalidAmountError, InvalidReversalError } from '../../domain/account/AccountErrors'
import { errorsTotal } from '../../infrastructure/telemetry/metrics'
import type { CacheInvalidator } from '../../application/ports/CacheInvalidator'
import type { CanonicalBalanceCache } from '../../application/ports/CanonicalBalanceCache'
import type { IdempotencyStore } from '../../application/ports/IdempotencyStore'
import { withIdempotency } from '../middleware/idempotency'

const tags = ['Accounts']

const ErrorResponse = t.Object({ error: t.String(), message: t.String() })

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Shared params schema — rejects non-UUID account IDs before they reach the DB
const AccountIdParams = t.Object({
  id: t.String({ pattern: UUID_PATTERN.source, description: 'UUID da conta' }),
})

export function accountRoutes(
  deps: CommandDeps,
  readStore: ReadModelStore,
  cacheInvalidator: CacheInvalidator,
  canonicalCache: CanonicalBalanceCache,
  idempotencyStore?: IdempotencyStore,
) {
  return new Elysia({ prefix: '/accounts' })
    .post(
      '/',
      async ({ body, headers, set }) => {
        const accountId = crypto.randomUUID()
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts',
          idempotencyStore,
          async () => {
            await handleOpenAccount({ accountId, ownerId: body.ownerId, initialBalance: body.initialBalance }, deps)
            return { accountId }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        body: t.Object({
          ownerId: t.String({ minLength: 1, description: 'ID do proprietário da conta' }),
          initialBalance: t.Number({ minimum: 0, description: 'Saldo inicial em centavos' }),
        }),
        response: {
          202: t.Object({ accountId: t.String() }),
          422: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Abrir conta',
          description: 'Cria uma nova conta bancária com saldo inicial.',
        },
      }
    )
    .post(
      '/:id/deposit',
      async ({ params, body, headers, set }) => {
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts/:id/deposit',
          idempotencyStore,
          async () => {
            await handleDeposit({ accountId: params.id, amount: body.amount }, deps)
            return { accountId: params.id }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        params: AccountIdParams,
        body: t.Object({ amount: t.Number({ exclusiveMinimum: 0, description: 'Valor a depositar (> 0)' }) }),
        response: {
          202: t.Object({ accountId: t.String() }),
          422: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Depositar',
          description: 'Adiciona fundos à conta.',
        },
      }
    )
    .post(
      '/:id/withdraw',
      async ({ params, body, headers, set }) => {
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts/:id/withdraw',
          idempotencyStore,
          async () => {
            await handleWithdraw({ accountId: params.id, amount: body.amount }, deps)
            return { accountId: params.id }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        params: AccountIdParams,
        body: t.Object({ amount: t.Number({ exclusiveMinimum: 0, description: 'Valor a sacar (> 0)' }) }),
        response: {
          202: t.Object({ accountId: t.String() }),
          422: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Sacar',
          description: 'Debita fundos da conta. Requer saldo disponível suficiente.',
        },
      }
    )
    .post(
      '/transfer',
      async ({ body, headers, set }) => {
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts/transfer',
          idempotencyStore,
          async () => {
            await handleTransfer({ sagaId: crypto.randomUUID(), fromAccountId: body.fromAccountId, toAccountId: body.toAccountId, amount: body.amount }, deps)
            return { fromAccountId: body.fromAccountId, toAccountId: body.toAccountId }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        body: t.Object({
          fromAccountId: t.String({ minLength: 1, description: 'Conta de origem' }),
          toAccountId: t.String({ minLength: 1, description: 'Conta de destino' }),
          amount: t.Number({ exclusiveMinimum: 0, description: 'Valor a transferir (> 0)' }),
        }),
        response: {
          202: t.Object({ fromAccountId: t.String(), toAccountId: t.String() }),
          422: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Transferir',
          description: 'Transfere fundos entre duas contas. Ambas devem existir.',
        },
      }
    )
    .post(
      '/:id/lock',
      async ({ params, body, headers, set }) => {
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts/:id/lock',
          idempotencyStore,
          async () => {
            await handleLockBalance({ accountId: params.id, amount: body.amount, reason: body.reason }, deps)
            return { accountId: params.id }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        params: AccountIdParams,
        body: t.Object({
          amount: t.Number({ exclusiveMinimum: 0, description: 'Valor a bloquear (> 0)' }),
          reason: t.String({ minLength: 1, description: 'Motivo do bloqueio' }),
        }),
        response: {
          202: t.Object({ accountId: t.String() }),
          422: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Bloquear saldo',
          description: 'Reserva parte do saldo disponível sem debitá-lo.',
        },
      }
    )
    .post(
      '/:id/unlock',
      async ({ params, body, headers, set }) => {
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts/:id/unlock',
          idempotencyStore,
          async () => {
            await handleUnlockBalance({ accountId: params.id, amount: body.amount }, deps)
            return { accountId: params.id }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        params: AccountIdParams,
        body: t.Object({ amount: t.Number({ exclusiveMinimum: 0, description: 'Valor a desbloquear (> 0)' }) }),
        response: {
          202: t.Object({ accountId: t.String() }),
          422: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Desbloquear saldo',
          description: 'Libera saldo previamente bloqueado, tornando-o disponível novamente.',
        },
      }
    )
    .post(
      '/:id/reverse',
      async ({ params, body, headers, set }) => {
        const result = await withIdempotency(
          headers['idempotency-key'],
          'POST /accounts/:id/reverse',
          idempotencyStore,
          async () => {
            await handleReverseTransaction({ accountId: params.id, originalEventId: body.originalEventId }, deps)
            return { accountId: params.id }
          },
        )
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        params: AccountIdParams,
        body: t.Object({
          originalEventId: t.String({ minLength: 1, description: 'UUID do evento (da tabela events) a ser revertido' }),
        }),
        response: {
          202: t.Object({ accountId: t.String() }),
          422: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Reverter transação',
          description: 'Estorna um débito anterior pelo ID do evento original. O valor é lido automaticamente do event store.',
        },
      }
    )
    .get(
      '/:id/balance',
      async ({ params }) => {
        return getBalance(params.id, readStore, {
          eventStore: deps.eventStore,
          snapshotStore: deps.snapshotStore,
          cacheInvalidator,
          canonicalCache,
        })
      },
      {
        params: AccountIdParams,
        response: {
          200: t.Object({
            accountId: t.String(),
            ownerId: t.String(),
            balance: t.Number({ description: 'Saldo total' }),
            availableBalance: t.Number({ description: 'Saldo disponível (total − bloqueado)' }),
            lockedBalance: t.Number({ description: 'Saldo bloqueado' }),
            lastEventSeq: t.Number(),
          }),
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Consultar saldo',
          description: 'Retorna o saldo atual da conta a partir do read model (cache Redis → Postgres).',
        },
      }
    )
    .get(
      '/:id/statement',
      async ({ params, query }) => {
        return getStatement(params.id, {
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
          type: query.type,
          limit: query.limit ? Number(query.limit) : undefined,
          offset: query.offset ? Number(query.offset) : undefined,
        }, readStore)
      },
      {
        params: AccountIdParams,
        query: t.Object({
          from: t.Optional(t.String({ description: 'Data inicial ISO 8601 (ex: 2025-01-01T00:00:00Z)' })),
          to: t.Optional(t.String({ description: 'Data final ISO 8601' })),
          type: t.Optional(t.String({ description: 'Filtro por tipo de evento (ex: MoneyDeposited)' })),
          limit: t.Optional(t.String({ description: 'Máximo de registros (padrão: 50)' })),
          offset: t.Optional(t.String({ description: 'Offset para paginação (padrão: 0)' })),
        }),
        response: {
          200: t.Array(t.Object({
            accountId: t.String(),
            eventType: t.String(),
            amount: t.Optional(t.Number()),
            balanceAfter: t.Optional(t.Number()),
            description: t.Optional(t.String()),
            occurredAt: t.Date(),
          })),
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Extrato',
          description: 'Lista as transações da conta com filtros opcionais de data, tipo e paginação.',
        },
      }
    )
    .onError(({ error, set }) => {
      if (error instanceof InvalidAmountError) {
        errorsTotal.add(1, { error_type: 'invalid_amount' })
        set.status = 422
        return { error: error.name, message: error.message }
      }
      if (error instanceof InsufficientFundsError) {
        errorsTotal.add(1, { error_type: 'insufficient_funds' })
        set.status = 422
        return { error: error.name, message: error.message }
      }
      if (error instanceof InvalidReversalError) {
        errorsTotal.add(1, { error_type: 'invalid_reversal' })
        set.status = 422
        return { error: error.name, message: error.message }
      }
      if (error instanceof Error && error.name === 'AccountNotFoundError') {
        errorsTotal.add(1, { error_type: 'account_not_found' })
        set.status = 404
        return { error: 'AccountNotFound', message: error.message }
      }
      // Elysia params validation failure (UUID pattern mismatch)
      if (error instanceof Error && error.name === 'ValidationError') {
        errorsTotal.add(1, { error_type: 'validation_error' })
        set.status = 400
        return { error: 'InvalidAccountId', message: 'Account ID must be a valid UUID.' }
      }
      set.status = 500
      console.error('[unhandled]', error)
      return { error: 'InternalError', message: 'An unexpected error occurred.' }
    })
}
