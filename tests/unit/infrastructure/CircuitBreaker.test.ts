import { describe, it, expect } from 'bun:test'
import { CircuitBreaker, CircuitBreakerOpenError } from '../../../src/infrastructure/CircuitBreaker'

const ok = () => Promise.resolve('ok')
const fail = () => Promise.reject(new Error('dependency down'))

describe('CircuitBreaker', () => {
  it('inicia no estado CLOSED', () => {
    const cb = new CircuitBreaker({ threshold: 3, recoveryMs: 1000 })
    expect(cb.getState()).toBe('CLOSED')
  })

  it('executa com sucesso no estado CLOSED', async () => {
    const cb = new CircuitBreaker({ threshold: 3, recoveryMs: 1000 })
    const result = await cb.execute(ok)
    expect(result).toBe('ok')
    expect(cb.getState()).toBe('CLOSED')
  })

  it('abre o circuito após threshold de falhas consecutivas', async () => {
    const cb = new CircuitBreaker({ threshold: 3, recoveryMs: 1000 })
    for (let i = 0; i < 3; i++) await cb.execute(fail).catch(() => {})
    expect(cb.getState()).toBe('OPEN')
  })

  it('lança CircuitBreakerOpenError quando OPEN sem esperar recovery', async () => {
    const cb = new CircuitBreaker({ threshold: 1, recoveryMs: 60_000 })
    await cb.execute(fail).catch(() => {})
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitBreakerOpenError)
  })

  it('vai para HALF_OPEN após recoveryMs', async () => {
    const cb = new CircuitBreaker({ threshold: 1, recoveryMs: 10 })
    await cb.execute(fail).catch(() => {})
    await Bun.sleep(20)
    await cb.execute(ok)
    expect(cb.getState()).toBe('CLOSED')
  })

  it('retorna a OPEN se falha no estado HALF_OPEN', async () => {
    const cb = new CircuitBreaker({ threshold: 1, recoveryMs: 10 })
    await cb.execute(fail).catch(() => {})
    await Bun.sleep(20)
    await cb.execute(fail).catch(() => {})
    expect(cb.getState()).toBe('OPEN')
  })

  it('fecha o circuito após sucesso no HALF_OPEN', async () => {
    const cb = new CircuitBreaker({ threshold: 1, recoveryMs: 10 })
    await cb.execute(fail).catch(() => {})
    await Bun.sleep(20)
    await cb.execute(ok)
    expect(cb.getState()).toBe('CLOSED')
  })

  it('reseta contador de falhas após sucesso', async () => {
    const cb = new CircuitBreaker({ threshold: 3, recoveryMs: 1000 })
    await cb.execute(fail).catch(() => {})
    await cb.execute(fail).catch(() => {})
    await cb.execute(ok)
    await cb.execute(fail).catch(() => {})
    await cb.execute(fail).catch(() => {})
    expect(cb.getState()).toBe('CLOSED')
  })

  it('chama onStateChange nas transições', async () => {
    const states: string[] = []
    const cb = new CircuitBreaker({ threshold: 1, recoveryMs: 10 }, s => states.push(s))
    await cb.execute(fail).catch(() => {})
    await Bun.sleep(20)
    await cb.execute(ok)
    expect(states).toEqual(['OPEN', 'HALF_OPEN', 'CLOSED'])
  })
})
