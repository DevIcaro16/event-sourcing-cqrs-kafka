import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { metrics, trace, propagation } from '@opentelemetry/api'

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`
  : 'http://localhost:4318'

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'banking-api',
})

// Metrics
const metricExporter = new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` })
export const meterProvider = new MeterProvider({
  resource,
  readers: [
    new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15_000,
    }),
  ],
})
metrics.setGlobalMeterProvider(meterProvider)

// Tracing
const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
export const tracerProvider = new BasicTracerProvider({
  resource,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
})
trace.setGlobalTracerProvider(tracerProvider)

// W3C traceparent propagator — padrão entre serviços
propagation.setGlobalPropagator(new W3CTraceContextPropagator())
