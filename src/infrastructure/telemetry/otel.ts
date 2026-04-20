// src/infrastructure/telemetry/otel.ts
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { metrics } from '@opentelemetry/api'

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
  : 'http://localhost:4318/v1/metrics'

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'banking-api',
})

const exporter = new OTLPMetricExporter({ url: endpoint })

export const meterProvider = new MeterProvider({
  resource,
  readers: [
    new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 15_000,
    }),
  ],
})

metrics.setGlobalMeterProvider(meterProvider)
