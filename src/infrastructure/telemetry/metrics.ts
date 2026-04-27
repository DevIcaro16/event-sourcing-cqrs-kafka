// src/infrastructure/telemetry/metrics.ts
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('banking-api', '1.0.0')

// HTTP
export const httpRequestDuration = meter.createHistogram('http_server_request_duration_ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500] },
})

// Negócio
export const accountsOpenedTotal = meter.createCounter('banking_accounts_opened_total', {
  description: 'Total number of accounts opened',
})

export const transactionsTotal = meter.createCounter('banking_transactions_total', {
  description: 'Total transactions by type',
})

export const transactionAmount = meter.createHistogram('banking_transaction_amount', {
  description: 'Transaction amounts by type',
  unit: 'BRL',
  advice: { explicitBucketBoundaries: [10, 50, 100, 500, 1000, 5000, 10000] },
})

export const errorsTotal = meter.createCounter('banking_errors_total', {
  description: 'Total domain errors by type',
})

// Kafka
export const kafkaPublishedTotal = meter.createCounter('kafka_messages_published_total', {
  description: 'Total Kafka messages published by topic',
})

export const kafkaConsumedTotal = meter.createCounter('kafka_messages_consumed_total', {
  description: 'Total Kafka messages consumed by topic and group',
})

export const kafkaConsumerLag = meter.createObservableGauge('kafka_consumer_lag', {
  description: 'Kafka consumer lag by topic, partition and group',
})

export const dlqTotal = meter.createCounter('kafka_dlq_messages_total', {
  description: 'Total messages sent to DLQ by original topic',
})
