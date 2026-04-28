import { InvalidAmountError, InsufficientFundsError, InvalidReversalError, AccountNotFoundError } from '../../domain/account/AccountErrors'
import { errorsTotal } from '../../infrastructure/telemetry/metrics'

export function httpErrorHandler({ error, set }: { error: unknown; set: any }) {
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
  if (error instanceof AccountNotFoundError) {
    errorsTotal.add(1, { error_type: 'account_not_found' })
    set.status = 404
    return { error: error.name, message: error.message }
  }
  if (error instanceof Error && error.name === 'SagaNotFoundError') {
    set.status = 404
    return { error: 'SagaNotFoundError', message: error.message }
  }
  if (error instanceof Error && error.name === 'ValidationError') {
    errorsTotal.add(1, { error_type: 'validation_error' })
    set.status = 400
    return { error: 'InvalidAccountId', message: 'Account ID must be a valid UUID.' }
  }
  set.status = 500
  console.error('[unhandled]', error)
  return { error: 'InternalError', message: 'An unexpected error occurred.' }
}
