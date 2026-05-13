export const TransactionReversedSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://banking/contracts/v1/TransactionReversed.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'occurredAt', 'accountId', 'originalEventId', 'amount', 'balanceAfter'],
  properties: {
    type: { const: 'TransactionReversed' },
    occurredAt: { type: 'string', format: 'date-time' },
    eventId: { type: 'string' },
    accountId: { type: 'string', minLength: 1 },
    originalEventId: { type: 'string', minLength: 1 },
    amount: { type: 'number', exclusiveMinimum: 0 },
    balanceAfter: { type: 'number' },
  },
} as const
