import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import type { Options } from 'ajv'

export function createAjv(options?: Options) {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    ...options,
  })
  addFormats(ajv)
  return ajv
}
