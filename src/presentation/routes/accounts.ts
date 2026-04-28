import { Elysia, t } from 'elysia'
import type { AccountController } from '../controllers/AccountController'

const tags = ['Accounts']

const ErrorResponse = t.Object({ error: t.String(), message: t.String() })

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const AccountIdParams = t.Object({
  id: t.String({ pattern: UUID_PATTERN.source, description: 'UUID da conta' }),
})

export function accountRoutes(controller: AccountController) {
  return new Elysia({ prefix: '/accounts' })
    .post(
      '/',
      async ({ body, headers, set }) => {
        const result = await controller.openAccount(body, headers['idempotency-key'])
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        body: t.Object({
          ownerId:        t.String({ minLength: 1, description: 'ID do proprietário da conta' }),
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
      },
    )
    .post(
      '/:id/deposit',
      async ({ params, body, headers, set }) => {
        const result = await controller.deposit(params.id, body, headers['idempotency-key'])
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
      },
    )
    .post(
      '/:id/withdraw',
      async ({ params, body, headers, set }) => {
        const result = await controller.withdraw(params.id, body, headers['idempotency-key'])
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
      },
    )
    .post(
      '/transfer',
      async ({ body, headers, set }) => {
        const result = await controller.transfer(body, headers['idempotency-key'])
        set.status = result.duplicate ? 200 : 202
        return result
      },
      {
        body: t.Object({
          fromAccountId: t.String({ minLength: 1, description: 'Conta de origem' }),
          toAccountId:   t.String({ minLength: 1, description: 'Conta de destino' }),
          amount:        t.Number({ exclusiveMinimum: 0, description: 'Valor a transferir (> 0)' }),
        }),
        response: {
          202: t.Object({ sagaId: t.String(), status: t.String() }),
          200: t.Object({ sagaId: t.String(), status: t.String(), duplicate: t.Optional(t.Boolean()) }),
          404: ErrorResponse,
          422: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Transferir',
          description: 'Inicia transferência entre contas via saga. Retorna sagaId para acompanhamento. Consulte GET /sagas/:sagaId para status.',
        },
      },
    )
    .post(
      '/:id/lock',
      async ({ params, body, headers, set }) => {
        const result = await controller.lockBalance(params.id, body, headers['idempotency-key'])
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
      },
    )
    .post(
      '/:id/unlock',
      async ({ params, body, headers, set }) => {
        const result = await controller.unlockBalance(params.id, body, headers['idempotency-key'])
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
      },
    )
    .post(
      '/:id/reverse',
      async ({ params, body, headers, set }) => {
        const result = await controller.reverseTransaction(params.id, body, headers['idempotency-key'])
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
      },
    )
    .get(
      '/:id/balance',
      ({ params }) => controller.getBalance(params.id),
      {
        params: AccountIdParams,
        response: {
          200: t.Object({
            accountId:        t.String(),
            ownerId:          t.String(),
            balance:          t.Number({ description: 'Saldo total' }),
            availableBalance: t.Number({ description: 'Saldo disponível (total − bloqueado)' }),
            lockedBalance:    t.Number({ description: 'Saldo bloqueado' }),
            lastEventSeq:     t.Number(),
          }),
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Consultar saldo',
          description: 'Retorna o saldo atual da conta a partir do read model (cache Redis → Postgres).',
        },
      },
    )
    .get(
      '/:id/statement',
      ({ params, query }) => controller.getStatement(params.id, {
        from:   query.from   ? new Date(query.from) : undefined,
        to:     query.to     ? new Date(query.to)   : undefined,
        type:   query.type,
        limit:  query.limit  ? Number(query.limit)  : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      }),
      {
        params: AccountIdParams,
        query: t.Object({
          from:   t.Optional(t.String({ description: 'Data inicial ISO 8601 (ex: 2025-01-01T00:00:00Z)' })),
          to:     t.Optional(t.String({ description: 'Data final ISO 8601' })),
          type:   t.Optional(t.String({ description: 'Filtro por tipo de evento (ex: MoneyDeposited)' })),
          limit:  t.Optional(t.String({ description: 'Máximo de registros (padrão: 50)' })),
          offset: t.Optional(t.String({ description: 'Offset para paginação (padrão: 0)' })),
        }),
        response: {
          200: t.Array(t.Object({
            accountId:    t.String(),
            eventType:    t.String(),
            amount:       t.Optional(t.Number()),
            balanceAfter: t.Optional(t.Number()),
            description:  t.Optional(t.String()),
            occurredAt:   t.Date(),
          })),
          404: ErrorResponse,
        },
        detail: {
          tags,
          summary: 'Extrato',
          description: 'Lista as transações da conta com filtros opcionais de data, tipo e paginação.',
        },
      },
    )
}
