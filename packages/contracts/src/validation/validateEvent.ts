import type { ErrorObject } from 'ajv'
import { createAjv } from './ajv'
import { schemaRegistry } from '../schemas/v1/registry'

const ajv = createAjv()

const compiledCache = new Map<string, ReturnType<typeof ajv.compile>>()

function getValidator(eventType: string, version: number) {
  const key = `${eventType}:${version}`
  const cached = compiledCache.get(key)
  if (cached) return cached
  const schema = schemaRegistry[eventType]?.[version]
  if (!schema) return undefined
  const compiled = ajv.compile(schema)
  compiledCache.set(key, compiled)
  return compiled
}

export type ValidationResult = {
  valid: boolean
  errors?: ErrorObject[]
}

export function validateEvent(eventType: string, version: number, payload: unknown): ValidationResult {
  const validate = getValidator(eventType, version)
  if (!validate) {
    return {
      valid: false,
      errors: [
        {
          instancePath: '',
          schemaPath: '',
          keyword: 'registry',
          params: { eventType, version },
          message: `No schema registered for ${eventType} v${version}`,
        } as ErrorObject,
      ],
    }
  }
  const valid = validate(payload) as boolean
  return valid ? { valid: true } : { valid: false, errors: validate.errors ?? [] }
}
