export const AccountOpenedSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://banking/contracts/v1/AccountOpened.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['type', 'occurredAt', 'accountId', 'ownerId', 'initialBalance'],
  properties: {
    type: { const: 'AccountOpened' },
    occurredAt: { type: 'string', format: 'date-time' },
    eventId: { type: 'string' },
    accountId: { type: 'string', minLength: 1 },
    ownerId: { type: 'string', minLength: 1 },
    initialBalance: { type: 'number', minimum: 0 },
  },
} as const
