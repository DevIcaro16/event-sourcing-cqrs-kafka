# Phase 5 — Observabilidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar observabilidade completa à stack bancária — kube-prometheus-stack via Helm, OTel Collector intermediário, instrumentação da app com OTel SDK (HTTP + negócio + Kafka) e dashboard Grafana customizado.

**Architecture:** App Elysia exporta métricas via OTel SDK (HTTP/proto) para um OTel Collector no namespace `monitoring`. O Collector expõe um endpoint Prometheus que é scraped via ServiceMonitor. O kube-prometheus-stack (Helm) instala Prometheus + Grafana com dashboards de infra prontos; um ConfigMap adiciona o dashboard bancário customizado.

**Tech Stack:** helm v3, kube-prometheus-stack v61+, otel/opentelemetry-collector-contrib:0.100.0, @opentelemetry/sdk-metrics, @opentelemetry/exporter-metrics-otlp-http, @opentelemetry/api

---

## Arquivos que serão criados/modificados

```
k8s/monitoring/
├── prometheus-values.yaml                   ← Helm values para kube-prometheus-stack
├── grafana-dashboard-banking.yaml           ← ConfigMap com dashboard JSON
└── otel-collector/
    ├── configmap.yaml                       ← config pipeline do Collector
    ├── deployment.yaml                      ← Deployment do Collector
    ├── service.yaml                         ← ClusterIP ports 4317/4318/8889
    └── servicemonitor.yaml                  ← CRD para Prometheus scrape o Collector

src/infrastructure/telemetry/
├── otel.ts                                  ← inicializa MeterProvider (chamado no topo de server.ts)
└── metrics.ts                               ← exporta instâncias dos instrumentos (counters, histogramas)

src/http/middleware/
└── httpMetrics.ts                           ← middleware Elysia que registra latência/status HTTP

k8s/app/configmap.yaml                       ← modificar: adicionar OTEL_* env vars
server.ts                                    ← modificar: import otel.ts na primeira linha
package.json                                 ← modificar: adicionar scripts monitoring:*
```

---

### Task 1: kube-prometheus-stack via Helm

**Files:**
- Create: `k8s/monitoring/prometheus-values.yaml`

- [ ] **Step 1: Verificar que helm está instalado**

```bash
helm version
```

Expected: `version.BuildInfo{Version:"v3.X.X", ...}`

Se não estiver: `curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`

- [ ] **Step 2: Criar `k8s/monitoring/prometheus-values.yaml`**

```yaml
# k8s/monitoring/prometheus-values.yaml
grafana:
  adminPassword: "banking123"
  sidecar:
    dashboards:
      enabled: true
      label: grafana_dashboard
      labelValue: "1"
      searchNamespace: ALL

prometheus:
  prometheusSpec:
    retention: 7d
    storageSpec: {}
    serviceMonitorSelectorNilUsesHelmValues: false
    serviceMonitorSelector: {}
    serviceMonitorNamespaceSelector: {}

alertmanager:
  enabled: true

prometheus-node-exporter:
  enabled: true

kube-state-metrics:
  enabled: true

# Desabilitar PVCs (kind não tem storage class adequado)
prometheus:
  prometheusSpec:
    storageSpec: {}

grafana:
  persistence:
    enabled: false
```

- [ ] **Step 3: Adicionar repo Helm e instalar**

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values k8s/monitoring/prometheus-values.yaml \
  --wait \
  --timeout 5m
```

Expected (últimas linhas):
```
NAME: kube-prometheus-stack
STATUS: deployed
```

- [ ] **Step 4: Verificar pods no namespace monitoring**

```bash
kubectl get pods -n monitoring
```

Expected: pods `prometheus-*`, `grafana-*`, `alertmanager-*`, `kube-state-metrics-*`, `node-exporter-*` todos `Running`.

- [ ] **Step 5: Verificar acesso ao Grafana**

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80 &
sleep 3
curl -s http://localhost:3000/api/health | python3 -m json.tool
kill %1
```

Expected: `{"commit": "...", "database": "ok", "version": "..."}`

- [ ] **Step 6: Commit**

```bash
git add k8s/monitoring/prometheus-values.yaml
git commit -m "feat(monitoring): install kube-prometheus-stack via Helm"
```

---

### Task 2: OTel Collector manifests + deploy

**Files:**
- Create: `k8s/monitoring/otel-collector/configmap.yaml`
- Create: `k8s/monitoring/otel-collector/deployment.yaml`
- Create: `k8s/monitoring/otel-collector/service.yaml`
- Create: `k8s/monitoring/otel-collector/servicemonitor.yaml`

- [ ] **Step 1: Criar `k8s/monitoring/otel-collector/configmap.yaml`**

```yaml
# k8s/monitoring/otel-collector/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-collector-config
  namespace: monitoring
data:
  config.yaml: |
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318

    processors:
      memory_limiter:
        check_interval: 1s
        limit_mib: 256
      batch:
        timeout: 10s

    exporters:
      prometheus:
        endpoint: 0.0.0.0:8889
        namespace: banking
        send_timestamps: true
        metric_expiration: 180m

    service:
      pipelines:
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [prometheus]
```

- [ ] **Step 2: Criar `k8s/monitoring/otel-collector/deployment.yaml`**

```yaml
# k8s/monitoring/otel-collector/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: otel-collector
  template:
    metadata:
      labels:
        app: otel-collector
    spec:
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.100.0
          args: ["--config=/etc/otel/config.yaml"]
          ports:
            - containerPort: 4317
              name: otlp-grpc
            - containerPort: 4318
              name: otlp-http
            - containerPort: 8889
              name: prometheus
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              cpu: 200m
              memory: 256Mi
          volumeMounts:
            - name: config
              mountPath: /etc/otel
          readinessProbe:
            httpGet:
              path: /
              port: 13133
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
```

- [ ] **Step 3: Criar `k8s/monitoring/otel-collector/service.yaml`**

```yaml
# k8s/monitoring/otel-collector/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: otel-collector
  namespace: monitoring
  labels:
    app: otel-collector
spec:
  type: ClusterIP
  selector:
    app: otel-collector
  ports:
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
    - name: otlp-http
      port: 4318
      targetPort: 4318
    - name: prometheus
      port: 8889
      targetPort: 8889
```

- [ ] **Step 4: Criar `k8s/monitoring/otel-collector/servicemonitor.yaml`**

```yaml
# k8s/monitoring/otel-collector/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: otel-collector
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: otel-collector
  endpoints:
    - port: prometheus
      interval: 15s
      path: /metrics
```

- [ ] **Step 5: Aplicar e verificar**

```bash
kubectl apply -f k8s/monitoring/otel-collector/
kubectl wait --for=condition=ready pod -l app=otel-collector -n monitoring --timeout=60s
kubectl get pods -n monitoring | grep otel
```

Expected: `otel-collector-XXXX   1/1   Running`

Nota: o readinessProbe usa porta 13133 (healthcheck extension do collector). Se o pod não ficar Ready, remova o readinessProbe do deployment temporariamente — o Collector pode não ter a health extension habilitada na imagem contrib. Nesse caso, remova o bloco `readinessProbe` e aplique novamente.

- [ ] **Step 6: Verificar que o endpoint Prometheus do Collector existe**

```bash
kubectl port-forward -n monitoring svc/otel-collector 8889:8889 &
sleep 3
curl -s http://localhost:8889/metrics | head -10
kill %1
```

Expected: linhas com `# HELP` e `# TYPE` (endpoint existente, pode estar vazio de métricas por ora).

- [ ] **Step 7: Commit**

```bash
git add k8s/monitoring/otel-collector/
git commit -m "feat(monitoring): add OTel Collector deployment with Prometheus exporter"
```

---

### Task 3: OTel SDK — setup e métricas HTTP

**Files:**
- Create: `src/infrastructure/telemetry/otel.ts`
- Create: `src/infrastructure/telemetry/metrics.ts`
- Create: `src/http/middleware/httpMetrics.ts`
- Modify: `k8s/app/configmap.yaml`
- Modify: `server.ts`

- [ ] **Step 1: Instalar dependências OTel**

```bash
bun add @opentelemetry/sdk-metrics @opentelemetry/exporter-metrics-otlp-http @opentelemetry/api @opentelemetry/resources @opentelemetry/semantic-conventions
```

Expected: pacotes adicionados ao `package.json` e `bun.lock`.

- [ ] **Step 2: Criar `src/infrastructure/telemetry/otel.ts`**

```typescript
// src/infrastructure/telemetry/otel.ts
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
  : 'http://localhost:4318/v1/metrics'

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'banking-api',
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

process.on('SIGTERM', async () => {
  await meterProvider.shutdown()
})
```

- [ ] **Step 3: Criar `src/infrastructure/telemetry/metrics.ts`**

```typescript
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
```

- [ ] **Step 4: Criar `src/http/middleware/httpMetrics.ts`**

```typescript
// src/http/middleware/httpMetrics.ts
import type { Elysia } from 'elysia'
import { httpRequestDuration } from '../../infrastructure/telemetry/metrics'

export function withHttpMetrics(app: Elysia): Elysia {
  return app
    .derive(() => ({ _reqStart: Date.now() }))
    .onAfterHandle({ as: 'global' }, ({ request, set, _reqStart }) => {
      const duration = Date.now() - _reqStart
      const url = new URL(request.url)
      httpRequestDuration.record(duration, {
        'http.method': request.method,
        'http.route': url.pathname,
        'http.status_code': String(set.status ?? 200),
      })
    })
    .onError({ as: 'global' }, ({ request, error, _reqStart }) => {
      const duration = Date.now() - (_reqStart ?? Date.now())
      const url = new URL(request.url)
      const status = 'status' in error ? String((error as any).status) : '500'
      httpRequestDuration.record(duration, {
        'http.method': request.method,
        'http.route': url.pathname,
        'http.status_code': status,
      })
    })
}
```

- [ ] **Step 5: Modificar `server.ts` — adicionar import do otel.ts no topo e middleware**

Adicionar na **primeira linha** do arquivo:

```typescript
import './src/infrastructure/telemetry/otel'
```

Depois do import do `accountRoutes`, adicionar:

```typescript
import { withHttpMetrics } from './src/http/middleware/httpMetrics'
```

No lugar onde o app Elysia é criado (onde está `new Elysia()`), encapsular com `withHttpMetrics`:

```typescript
const app = withHttpMetrics(new Elysia())
  .use(swagger({ ... }))
  // ... resto igual
```

- [ ] **Step 6: Modificar `k8s/app/configmap.yaml` — adicionar vars OTEL**

Adicionar ao final do `data:`:

```yaml
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.monitoring.svc.cluster.local:4318"
  OTEL_SERVICE_NAME: "banking-api"
```

- [ ] **Step 7: Registrar o meterProvider no SDK global**

Em `src/infrastructure/telemetry/otel.ts`, adicionar após criar o `meterProvider`:

```typescript
import { metrics } from '@opentelemetry/api'
// ...após criar meterProvider:
metrics.setGlobalMeterProvider(meterProvider)
```

O arquivo completo fica:

```typescript
// src/infrastructure/telemetry/otel.ts
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { metrics } from '@opentelemetry/api'

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
  : 'http://localhost:4318/v1/metrics'

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'banking-api',
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

process.on('SIGTERM', async () => {
  await meterProvider.shutdown()
})
```

- [ ] **Step 8: Build, load e redeploy**

```bash
bun run k8s:image:load
kubectl apply -f k8s/app/configmap.yaml -n banking
kubectl rollout restart deployment/banking-app -n banking
kubectl rollout status deployment/banking-app -n banking
```

Expected: `deployment "banking-app" successfully rolled out`

- [ ] **Step 9: Gerar tráfego e verificar métricas HTTP no Prometheus**

```bash
EXTERNAL_IP=$(kubectl get svc banking-app -n banking -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
for i in $(seq 1 10); do curl -s http://${EXTERNAL_IP}/swagger -o /dev/null; done

# Aguardar próximo export (até 15s)
sleep 20

kubectl port-forward -n monitoring svc/otel-collector 8889:8889 &
sleep 3
curl -s http://localhost:8889/metrics | grep http_server_request_duration
kill %1
```

Expected: linhas como `banking_http_server_request_duration_ms_bucket{...} X`

- [ ] **Step 10: Commit**

```bash
git add src/infrastructure/telemetry/ src/http/middleware/httpMetrics.ts \
        k8s/app/configmap.yaml server.ts package.json bun.lock
git commit -m "feat(monitoring): add OTel SDK with HTTP metrics middleware"
```

---

### Task 4: Métricas de negócio

**Files:**
- Modify: `src/application/commands/OpenAccount.ts`
- Modify: `src/application/commands/Deposit.ts`
- Modify: `src/application/commands/Withdraw.ts`
- Modify: `src/application/commands/Transfer.ts`
- Modify: `src/application/commands/ReverseTransaction.ts`
- Modify: `src/application/queries/GetBalance.ts`
- Modify: `src/http/routes/accounts.ts`

- [ ] **Step 1: Instrumentar `OpenAccount.ts`**

Adicionar ao final de `handleOpenAccount`, antes do `return` implícito:

```typescript
import { accountsOpenedTotal } from '../../infrastructure/telemetry/metrics'

// no final de handleOpenAccount, após publisher.publish:
accountsOpenedTotal.add(1)
```

O arquivo completo:

```typescript
// src/application/commands/OpenAccount.ts
import type { CommandDeps } from './_loadAccount'
import { Account } from '../../domain/account/Account'
import { accountsOpenedTotal } from '../../infrastructure/telemetry/metrics'

export type OpenAccountCommand = {
  accountId: string
  ownerId: string
  initialBalance: number
}

export async function handleOpenAccount(
  command: OpenAccountCommand,
  deps: CommandDeps,
): Promise<void> {
  const account = Account.open(command.accountId, command.ownerId, command.initialBalance)
  await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
  await deps.publisher.publish(account.pendingEvents, command.accountId)
  accountsOpenedTotal.add(1)
}
```

- [ ] **Step 2: Instrumentar `Deposit.ts`**

```typescript
// src/application/commands/Deposit.ts
import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { transactionsTotal, transactionAmount } from '../../infrastructure/telemetry/metrics'

export type DepositCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleDeposit(
  command: DepositCommand,
  deps: CommandDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.deposit(command.amount)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      await deps.publisher.publish(account.pendingEvents, command.accountId)
      transactionsTotal.add(1, { type: 'deposit' })
      transactionAmount.record(command.amount, { type: 'deposit' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 3: Instrumentar `Withdraw.ts`**

```typescript
// src/application/commands/Withdraw.ts
import type { CommandDeps } from './_loadAccount'
import { loadAccount } from './_loadAccount'
import { ConcurrencyError } from '../ports/EventStore'
import { transactionsTotal, transactionAmount } from '../../infrastructure/telemetry/metrics'

export type WithdrawCommand = {
  accountId: string
  amount: number
}

const MAX_RETRIES = 3

export async function handleWithdraw(
  command: WithdrawCommand,
  deps: CommandDeps,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const account = await loadAccount(command.accountId, deps.eventStore, deps.snapshotStore)
    account.withdraw(command.amount)
    try {
      await deps.eventStore.append(command.accountId, 'Account', account.pendingEvents, account.baseVersion)
      await deps.publisher.publish(account.pendingEvents, command.accountId)
      transactionsTotal.add(1, { type: 'withdraw' })
      transactionAmount.record(command.amount, { type: 'withdraw' })
      return
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}
```

- [ ] **Step 4: Instrumentar `Transfer.ts`**

Abrir `src/application/commands/Transfer.ts` e adicionar após o `publisher.publish` bem-sucedido:

```typescript
import { transactionsTotal, transactionAmount } from '../../infrastructure/telemetry/metrics'

// após publisher.publish dos dois accounts:
transactionsTotal.add(1, { type: 'transfer' })
transactionAmount.record(command.amount, { type: 'transfer' })
```

- [ ] **Step 5: Instrumentar `ReverseTransaction.ts`**

Adicionar após `publisher.publish` bem-sucedido:

```typescript
import { transactionsTotal } from '../../infrastructure/telemetry/metrics'

// após publisher.publish:
transactionsTotal.add(1, { type: 'reverse' })
```

- [ ] **Step 6: Instrumentar erros em `src/http/routes/accounts.ts`**

O arquivo de rotas tem handlers `onError` por rota. Adicionar importação e contagem de erros no handler global de erro. Localizar onde `InsufficientFundsError`, `InvalidAmountError`, `InvalidReversalError` são capturados e adicionar:

```typescript
import { errorsTotal } from '../../infrastructure/telemetry/metrics'

// no onError de cada rota que captura erros de domínio, por exemplo:
.onError(({ error, set }) => {
  if (error instanceof InsufficientFundsError) {
    set.status = 422
    errorsTotal.add(1, { error_type: 'insufficient_funds' })
    return { error: 'InsufficientFunds', message: error.message }
  }
  if (error instanceof InvalidAmountError) {
    set.status = 422
    errorsTotal.add(1, { error_type: 'invalid_amount' })
    return { error: 'InvalidAmount', message: error.message }
  }
  if (error instanceof InvalidReversalError) {
    set.status = 422
    errorsTotal.add(1, { error_type: 'invalid_reversal' })
    return { error: 'InvalidReversal', message: error.message }
  }
})
```

- [ ] **Step 7: Build, load e redeploy**

```bash
bun run k8s:image:load
kubectl rollout restart deployment/banking-app -n banking
kubectl rollout status deployment/banking-app -n banking
```

- [ ] **Step 8: Verificar métricas de negócio no Collector**

```bash
EXTERNAL_IP=$(kubectl get svc banking-app -n banking -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Criar conta e fazer depósito
ACCOUNT=$(curl -s -X POST http://${EXTERNAL_IP}/accounts \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"metrics-test","initialBalance":500}')
ACCOUNT_ID=$(echo $ACCOUNT | python3 -c "import sys,json; print(json.load(sys.stdin)['accountId'])")

curl -s -X POST http://${EXTERNAL_IP}/accounts/${ACCOUNT_ID}/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount":100}'

sleep 20

kubectl port-forward -n monitoring svc/otel-collector 8889:8889 &
sleep 3
curl -s http://localhost:8889/metrics | grep -E "banking_accounts|banking_transactions"
kill %1
```

Expected: linhas como:
```
banking_banking_accounts_opened_total{...} 1
banking_banking_transactions_total{type="deposit",...} 1
```

- [ ] **Step 9: Commit**

```bash
git add src/application/commands/ src/application/queries/ src/http/routes/
git commit -m "feat(monitoring): add business metrics to commands and error handlers"
```

---

### Task 5: Métricas Kafka

**Files:**
- Modify: `src/infrastructure/kafka/KafkaMessagePublisher.ts`
- Modify: `src/infrastructure/kafka/KafkaMessageSubscriber.ts`

- [ ] **Step 1: Instrumentar `KafkaMessagePublisher.ts`**

```typescript
// src/infrastructure/kafka/KafkaMessagePublisher.ts
import type { Kafka, Producer } from 'kafkajs'
import type { MessagePublisher } from '../../application/ports/MessagePublisher'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { kafkaPublishedTotal } from '../../infrastructure/telemetry/metrics'

export class KafkaMessagePublisher implements MessagePublisher {
  constructor(
    private readonly producer: Producer,
    private readonly topic: string,
  ) { }

  static create(kafka: Kafka, topic: string): KafkaMessagePublisher {
    return new KafkaMessagePublisher(kafka.producer(), topic)
  }

  async connect(): Promise<void> {
    await this.producer.connect()
    console.log(`[kafka:publisher] connected → topic="${this.topic}"`)
  }

  async close(): Promise<void> {
    await this.producer.disconnect()
    console.log(`[kafka:publisher] disconnected → topic="${this.topic}"`)
  }

  async publish(events: DomainEvent[], aggregateId: string): Promise<void> {
    const types = events.map(e => e.type).join(', ')
    console.log(`[kafka:publisher] publishing ${events.length} event(s) [${types}] → aggregateId=${aggregateId}`)
    const value = JSON.stringify({
      aggregateId,
      events: events.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString() })),
      publishedAt: new Date().toISOString(),
    })
    await this.producer.send({
      topic: this.topic,
      messages: [{ key: aggregateId, value }],
    })
    kafkaPublishedTotal.add(events.length, { topic: this.topic })
    console.log(`[kafka:publisher] published → topic="${this.topic}" aggregateId=${aggregateId}`)
  }
}
```

- [ ] **Step 2: Instrumentar `KafkaMessageSubscriber.ts`**

Adicionar imports e instrumentação no subscriber. O consumer lag requer `kafkaAdmin` para consultar offsets. Vamos instrumentar consumed e lag via um `ObservableGauge` com callback.

```typescript
// src/infrastructure/kafka/KafkaMessageSubscriber.ts
import type { Kafka, Consumer, Admin } from 'kafkajs'
import type { MessageSubscriber } from '../../application/ports/MessageSubscriber'
import type { DomainEvent } from '../../domain/shared/DomainEvent'
import { kafkaConsumedTotal, kafkaConsumerLag } from '../../infrastructure/telemetry/metrics'

type BrokerMessage = {
  aggregateId: string
  events: Array<Record<string, unknown> & { occurredAt: string }>
  publishedAt: string
}

export class KafkaMessageSubscriber implements MessageSubscriber {
  private admin: Admin
  private groupId: string

  constructor(
    private readonly consumer: Consumer,
    private readonly topic: string,
    kafka: Kafka,
    groupId: string,
  ) {
    this.admin = kafka.admin()
    this.groupId = groupId
  }

  static create(kafka: Kafka, topic: string, groupId: string): KafkaMessageSubscriber {
    return new KafkaMessageSubscriber(kafka.consumer({ groupId }), topic, kafka, groupId)
  }

  async subscribe(
    handler: (events: DomainEvent[], aggregateId: string) => Promise<void>,
  ): Promise<void> {
    await this.admin.connect()
    await this.consumer.connect()
    console.log(`[kafka:consumer] connected → topic="${this.topic}"`)
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false })

    // Registrar callback para consumer lag
    kafkaConsumerLag.addCallback(async (result) => {
      try {
        const offsets = await this.admin.fetchTopicOffsets(this.topic)
        const groupOffsets = await this.admin.fetchOffsets({ groupId: this.groupId, topics: [this.topic] })
        for (const partition of offsets) {
          const groupPartition = groupOffsets[0]?.partitions.find(p => p.partition === partition.partition)
          const lag = groupPartition
            ? Number(partition.high) - Number(groupPartition.offset)
            : 0
          result.observe(Math.max(0, lag), {
            topic: this.topic,
            partition: String(partition.partition),
            group: this.groupId,
          })
        }
      } catch {
        // admin pode não estar pronto ainda
      }
    })

    await new Promise<void>((resolve, reject) => {
      this.consumer.on(this.consumer.events.GROUP_JOIN, ({ payload }) => {
        console.log(`[kafka:consumer] joined group → groupId=${payload.groupId} memberId=${payload.memberId}`)
        resolve()
      })
      this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
        console.error(`[kafka:consumer] crash → ${payload.error?.message}`)
        reject(payload.error)
      })
      this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
          if (!message.value) return
          const { aggregateId, events }: BrokerMessage = JSON.parse(message.value.toString())
          const types = events.map((e: any) => e.type).join(', ')
          console.log(`[kafka:consumer] received ${events.length} event(s) [${types}] ← aggregateId=${aggregateId} offset=${message.offset}`)
          const parsed = events.map(e => ({ ...e, occurredAt: new Date(e.occurredAt) })) as DomainEvent[]
          await handler(parsed, aggregateId)
          await this.consumer.commitOffsets([{
            topic,
            partition,
            offset: (Number(message.offset) + 1).toString(),
          }])
          kafkaConsumedTotal.add(events.length, { topic, group: this.groupId })
          console.log(`[kafka:consumer] committed offset=${Number(message.offset) + 1} partition=${partition}`)
        },
      }).catch(reject)
    })
  }

  async close(): Promise<void> {
    console.log(`[kafka:consumer] disconnecting...`)
    await this.consumer.disconnect()
    await this.admin.disconnect()
  }
}
```

- [ ] **Step 3: Atualizar instanciação do subscriber em `server.ts`**

O `KafkaMessageSubscriber.create` agora precisa do `kafka` instance (já disponível em server.ts). A assinatura mudou para incluir `kafka` no construtor. Verificar a chamada em `server.ts`:

```typescript
// já existente em server.ts — verificar que está assim:
const kafkaSubscriber = KafkaMessageSubscriber.create(kafka, 'banking.account.events', 'banking-projector')
```

Essa chamada já passa `kafka` como primeiro argumento — não precisa mudar.

- [ ] **Step 4: Build, load e redeploy**

```bash
bun run k8s:image:load
kubectl rollout restart deployment/banking-app -n banking
kubectl rollout status deployment/banking-app -n banking
```

- [ ] **Step 5: Verificar métricas Kafka no Collector**

```bash
EXTERNAL_IP=$(kubectl get svc banking-app -n banking -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -s -X POST http://${EXTERNAL_IP}/accounts \
  -H "Content-Type: application/json" \
  -d '{"ownerId":"kafka-metrics-test","initialBalance":200}'

sleep 20

kubectl port-forward -n monitoring svc/otel-collector 8889:8889 &
sleep 3
curl -s http://localhost:8889/metrics | grep -E "kafka_messages|kafka_consumer"
kill %1
```

Expected:
```
banking_kafka_messages_published_total{topic="banking.account.events",...} 1
banking_kafka_messages_consumed_total{topic="banking.account.events",group="banking-projector",...} 1
```

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/kafka/
git commit -m "feat(monitoring): add Kafka published/consumed/lag metrics"
```

---

### Task 6: Dashboard Grafana + scripts package.json

**Files:**
- Create: `k8s/monitoring/grafana-dashboard-banking.yaml`
- Modify: `package.json`

- [ ] **Step 1: Verificar que o Prometheus está scrapeando o Collector**

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090 &
sleep 3
curl -s "http://localhost:9090/api/v1/targets" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['data']['activeTargets']:
    if 'otel' in t.get('labels', {}).get('job', ''):
        print(t['labels']['job'], t['health'])
"
kill %1
```

Expected: linha com `otel-collector  up`

Se não aparecer, o ServiceMonitor pode não ter sido detectado. Verificar com:
```bash
kubectl get servicemonitor -n monitoring
```

- [ ] **Step 2: Criar `k8s/monitoring/grafana-dashboard-banking.yaml`**

Este ConfigMap contém o JSON do dashboard. O Grafana sidecar detecta ConfigMaps com label `grafana_dashboard: "1"` em qualquer namespace e os carrega automaticamente.

```yaml
# k8s/monitoring/grafana-dashboard-banking.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-dashboard-banking
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  banking-app.json: |
    {
      "title": "Banking App",
      "uid": "banking-app-v1",
      "schemaVersion": 37,
      "refresh": "30s",
      "time": { "from": "now-1h", "to": "now" },
      "panels": [
        {
          "id": 1,
          "title": "Request Rate (req/s)",
          "type": "timeseries",
          "gridPos": { "x": 0, "y": 0, "w": 8, "h": 8 },
          "targets": [{
            "expr": "sum(rate(banking_http_server_request_duration_ms_count[1m])) by (http_route)",
            "legendFormat": "{{http_route}}"
          }]
        },
        {
          "id": 2,
          "title": "Latência p95 (ms)",
          "type": "timeseries",
          "gridPos": { "x": 8, "y": 0, "w": 8, "h": 8 },
          "targets": [{
            "expr": "histogram_quantile(0.95, sum(rate(banking_http_server_request_duration_ms_bucket[5m])) by (le, http_route))",
            "legendFormat": "p95 {{http_route}}"
          }]
        },
        {
          "id": 3,
          "title": "Error Rate (%)",
          "type": "timeseries",
          "gridPos": { "x": 16, "y": 0, "w": 8, "h": 8 },
          "targets": [{
            "expr": "sum(rate(banking_banking_errors_total[1m])) by (error_type)",
            "legendFormat": "{{error_type}}"
          }]
        },
        {
          "id": 4,
          "title": "Contas Abertas (total)",
          "type": "stat",
          "gridPos": { "x": 0, "y": 8, "w": 6, "h": 4 },
          "targets": [{
            "expr": "sum(banking_banking_accounts_opened_total)",
            "legendFormat": "Total"
          }]
        },
        {
          "id": 5,
          "title": "Transações/s por tipo",
          "type": "timeseries",
          "gridPos": { "x": 6, "y": 8, "w": 10, "h": 8 },
          "targets": [{
            "expr": "sum(rate(banking_banking_transactions_total[1m])) by (type)",
            "legendFormat": "{{type}}"
          }]
        },
        {
          "id": 6,
          "title": "Valor das Transações (p50/p95)",
          "type": "timeseries",
          "gridPos": { "x": 16, "y": 8, "w": 8, "h": 8 },
          "targets": [
            {
              "expr": "histogram_quantile(0.50, sum(rate(banking_banking_transaction_amount_bucket[5m])) by (le, type))",
              "legendFormat": "p50 {{type}}"
            },
            {
              "expr": "histogram_quantile(0.95, sum(rate(banking_banking_transaction_amount_bucket[5m])) by (le, type))",
              "legendFormat": "p95 {{type}}"
            }
          ]
        },
        {
          "id": 7,
          "title": "Kafka — Mensagens Publicadas/s",
          "type": "timeseries",
          "gridPos": { "x": 0, "y": 16, "w": 8, "h": 8 },
          "targets": [{
            "expr": "sum(rate(banking_kafka_messages_published_total[1m])) by (topic)",
            "legendFormat": "{{topic}}"
          }]
        },
        {
          "id": 8,
          "title": "Kafka — Mensagens Consumidas/s",
          "type": "timeseries",
          "gridPos": { "x": 8, "y": 16, "w": 8, "h": 8 },
          "targets": [{
            "expr": "sum(rate(banking_kafka_messages_consumed_total[1m])) by (topic, group)",
            "legendFormat": "{{topic}} / {{group}}"
          }]
        },
        {
          "id": 9,
          "title": "Kafka — Consumer Lag",
          "type": "timeseries",
          "gridPos": { "x": 16, "y": 16, "w": 8, "h": 8 },
          "targets": [{
            "expr": "banking_kafka_consumer_lag",
            "legendFormat": "{{topic}} p{{partition}} / {{group}}"
          }]
        }
      ]
    }
```

- [ ] **Step 3: Aplicar o ConfigMap do dashboard**

```bash
kubectl apply -f k8s/monitoring/grafana-dashboard-banking.yaml
```

Expected: `configmap/grafana-dashboard-banking created`

- [ ] **Step 4: Verificar que o Grafana carregou o dashboard**

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80 &
sleep 5
curl -s -u admin:banking123 http://localhost:3000/api/dashboards/uid/banking-app-v1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Dashboard:', data.get('dashboard', {}).get('title', 'not found'))
"
kill %1
```

Expected: `Dashboard: Banking App`

- [ ] **Step 5: Adicionar scripts `monitoring:*` ao `package.json`**

Abrir `package.json` e adicionar após os scripts `k8s:*`:

```json
"monitoring:install": "helm repo add prometheus-community https://prometheus-community.github.io/helm-charts && helm repo update && helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace --values k8s/monitoring/prometheus-values.yaml --wait --timeout 5m",
"monitoring:collector": "kubectl apply -f k8s/monitoring/otel-collector/",
"monitoring:dashboard": "kubectl apply -f k8s/monitoring/grafana-dashboard-banking.yaml",
"monitoring:grafana": "kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80",
"monitoring:prometheus": "kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090"
```

- [ ] **Step 6: Verificar scripts**

```bash
bun run monitoring:grafana &
sleep 3
curl -s http://localhost:3000/api/health | python3 -m json.tool
kill %1
```

Expected: `{"database": "ok", ...}`

- [ ] **Step 7: Commit final**

```bash
git add k8s/monitoring/ package.json
git commit -m "feat(monitoring): add Grafana banking dashboard and monitoring:* scripts"
```

---

## Fluxo de trabalho completo (referência rápida)

**Setup inicial (uma única vez após cluster criado):**
```bash
bun run monitoring:install       # instala kube-prometheus-stack
bun run monitoring:collector     # deploy OTel Collector
bun run monitoring:dashboard     # carrega dashboard
```

**Acessar:**
```bash
bun run monitoring:grafana       # http://localhost:3000 (admin / banking123)
bun run monitoring:prometheus    # http://localhost:9090
```

**Após rebuild da imagem:**
```bash
bun run k8s:image:load
bun run k8s:restart
```
