export const TransferCompensatedSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://banking/contracts/v1/TransferCompensated.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'occurredAt', 'sagaId', 'fromAccountId', 'toAccountId', 'amount', 'balanceAfter'],
  properties: {
    type: { const: 'TransferCompensated' },
    occurredAt: { type: 'string', format: 'date-time' },
    eventId: { type: 'string' },
    sagaId: { type: 'string', minLength: 1 },
    fromAccountId: { type: 'string', minLength: 1 },
    toAccountId: { type: 'string', minLength: 1 },
    amount: { type: 'number', exclusiveMinimum: 0 },
    balanceAfter: { type: 'number' },
  },
} as const
