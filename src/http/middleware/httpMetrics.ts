// src/http/middleware/httpMetrics.ts
import type { Elysia } from 'elysia'
import { httpRequestDuration } from '../../infrastructure/telemetry/metrics'

export function withHttpMetrics(app: Elysia): Elysia {
  return app
    .derive({ as: 'global' }, () => ({ _reqStart: Date.now() }))
    .onAfterHandle({ as: 'global' }, ({ request, set, _reqStart }: any) => {
      const duration = Date.now() - _reqStart
      const url = new URL(request.url)
      httpRequestDuration.record(duration, {
        'http.method': request.method,
        'http.route': url.pathname,
        'http.status_code': String(set.status ?? 200),
      })
    })
    .onError({ as: 'global' }, ({ request, error, _reqStart }: any) => {
      if (_reqStart == null) return
      const duration = Date.now() - _reqStart
      const url = new URL(request.url)
      const status = 'status' in error ? String((error as any).status) : '500'
      httpRequestDuration.record(duration, {
        'http.method': request.method,
        'http.route': url.pathname,
        'http.status_code': status,
      })
    }) as unknown as Elysia
}
