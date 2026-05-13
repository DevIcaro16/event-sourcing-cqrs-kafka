import { describe, it, expect } from 'bun:test'
import { createAjv } from '../src/validation/ajv'

describe('createAjv', () => {
  it('returns an AJV instance in strict mode that supports format keyword', () => {
    const ajv = createAjv()
    const validate = ajv.compile({
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid' } },
      required: ['id'],
      additionalProperties: false,
    })
    expect(validate({ id: '00000000-0000-0000-0000-000000000000' })).toBe(true)
    expect(validate({ id: 'not-a-uuid' })).toBe(false)
  })

  it('rejects schemas that violate strict mode (e.g., unknown keyword)', () => {
    const ajv = createAjv()
    expect(() =>
      ajv.compile({
        type: 'object',
        unknownKeyword: 'reject me',
      } as unknown as object),
    ).toThrow()
  })
})
