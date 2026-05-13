export const TransferReceivedSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://banking/contracts/v1/TransferReceived.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'occurredAt', 'accountId', 'fromAccountId', 'amount', 'balanceAfter'],
  properties: {
    type: { const: 'TransferReceived' },
    occurredAt: { type: 'string', format: 'date-time' },
    eventId: { type: 'string' },
    accountId: { type: 'string', minLength: 1 },
    fromAccountId: { type: 'string', minLength: 1 },
    amount: { type: 'number', exclusiveMinimum: 0 },
    balanceAfter: { type: 'number' },
  },
} as const
