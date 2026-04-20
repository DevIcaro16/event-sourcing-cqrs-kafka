# Phase 5 — Observabilidade: Prometheus + Grafana + OpenTelemetry

## Objetivo

Adicionar observabilidade completa à stack bancária no cluster kind: métricas de infraestrutura k8s (automáticas via kube-prometheus-stack) e métricas de aplicação (HTTP, negócio, Kafka) via OpenTelemetry SDK com Collector intermediário.

---

## Arquitetura

```
App (Elysia/Bun) — namespace: banking
  └── OTel SDK (@opentelemetry/*)
        └── OTLP/gRPC exporter → otel-collector.monitoring.svc.cluster.local:4317

OTel Collector — namespace: monitoring (Deployment, 1 réplica)
  ├── receiver: otlp (grpc:4317, http:4318)
  ├── processor: batch + memory_limiter
  └── exporter: prometheus (:8889) ← Prometheus scrape via ServiceMonitor

kube-prometheus-stack — namespace: monitoring (Helm)
  ├── Prometheus — scrape Collector + kube-state-metrics + node-exporter
  ├── Grafana — dashboards infra (prontos) + banking app (ConfigMap)
  └── Alertmanager — instalado, não configurado nesta fase

kube-state-metrics + node-exporter (incluídos no Helm chart)
  └── métricas automáticas: pods, nodes, PVCs, HPA, deployments
```

**Namespaces:**
- `monitoring` — toda a stack de observabilidade
- `banking` — app + infra existentes (sem alteração de namespace)

---

## Componentes

### 1. kube-prometheus-stack (Helm)

Instalado via `helm install` no namespace `monitoring`. Valores customizados em `k8s/monitoring/prometheus-values.yaml`:

- Grafana com senha de admin configurada via values
- Retenção do Prometheus: 7 dias
- Persistent volumes desabilitados (kind, ambiente local)
- ServiceMonitor selector abrangente para pegar o Collector
- Grafana com `sidecar.dashboards.enabled: true` para carregar dashboards via ConfigMap

### 2. OTel Collector

Manifests em `k8s/monitoring/otel-collector/`:
- `configmap.yaml` — pipeline de métricas (receivers: otlp, processors: batch+memory_limiter, exporters: prometheus)
- `deployment.yaml` — imagem `otel/opentelemetry-collector-contrib:0.100.0`, 1 réplica
- `service.yaml` — ClusterIP expondo portas 4317 (grpc), 4318 (http), 8889 (prometheus scrape)
- `servicemonitor.yaml` — CRD do Prometheus Operator apontando para porta 8889

### 3. Instrumentação da App (OTel SDK)

**Pacotes adicionados:**
```
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node
@opentelemetry/exporter-trace-otlp-grpc
@opentelemetry/exporter-metrics-otlp-grpc
@opentelemetry/api
```

**Arquivo `src/infrastructure/telemetry/otel.ts`** — inicializa o SDK antes do servidor:
- MeterProvider com OTLPMetricExporter apontando para `OTEL_EXPORTER_OTLP_ENDPOINT`
- Auto-instrumentação HTTP (captura latência/status automaticamente)
- Export interval: 15s

**Env vars adicionadas ao ConfigMap da app:**
```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.monitoring.svc.cluster.local:4317"
OTEL_SERVICE_NAME: "banking-api"
OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=local,k8s.namespace=banking"
```

### 4. Métricas Instrumentadas

**HTTP (automático via auto-instrumentations-node):**
- `http.server.request.duration` — histograma de latência por rota/método/status

**Negócio (registradas na camada application — commands/queries):**

| Métrica | Tipo | Labels | Onde registrar |
|---------|------|--------|----------------|
| `banking_accounts_opened_total` | Counter | — | `OpenAccount` command |
| `banking_transactions_total` | Counter | `type` | `Deposit`, `Withdraw`, `Transfer`, `ReverseTransaction` commands |
| `banking_transaction_amount` | Histogram | `type` | Mesmos commands, valor da transação |
| `banking_errors_total` | Counter | `error_type` | `GetBalance`, commands (erros de domínio) |

**Kafka (registradas nos adapters):**

| Métrica | Tipo | Labels | Onde registrar |
|---------|------|--------|----------------|
| `kafka_messages_published_total` | Counter | `topic` | `KafkaMessagePublisher` |
| `kafka_messages_consumed_total` | Counter | `topic`, `group` | `KafkaMessageSubscriber` |
| `kafka_consumer_lag` | Gauge | `topic`, `partition`, `group` | `KafkaMessageSubscriber` via kafkajs admin |

**Ponto de injeção:** métricas de negócio são recebidas por injeção de dependência nos use cases — o domínio não tem dependência do OTel.

### 5. Dashboard Banking App (Grafana)

Provisionado via ConfigMap com label `grafana_dashboard: "1"`, carregado automaticamente pelo Grafana sidecar.

**3 linhas de painéis:**

**Linha 1 — HTTP:**
- Request rate (req/s) por rota
- Latência p50/p95/p99
- Error rate (%) — status 4xx/5xx

**Linha 2 — Negócio:**
- Contas abertas (total acumulado)
- Transações/s por tipo (deposit/withdraw/transfer/reverse)
- Histograma de valores de transação

**Linha 3 — Kafka:**
- Mensagens publicadas/s por tópico
- Mensagens consumidas/s por grupo
- Consumer lag por partition

---

## Arquivos que serão criados/modificados

```
k8s/monitoring/
├── prometheus-values.yaml
└── otel-collector/
    ├── configmap.yaml
    ├── deployment.yaml
    ├── service.yaml
    └── servicemonitor.yaml

src/infrastructure/telemetry/
└── otel.ts

k8s/app/
└── configmap.yaml            ← modificado (adicionar vars OTEL_*)

server.ts                     ← modificado (importar otel.ts antes de tudo)

package.json                  ← adicionar scripts monitoring:*
```

**Scripts adicionados ao package.json:**
```json
"monitoring:install": "helm repo add prometheus-community https://prometheus-community.github.io/helm-charts && helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f k8s/monitoring/prometheus-values.yaml",
"monitoring:grafana": "kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80",
"monitoring:prometheus": "kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090"
```

---

## Acesso local

```bash
# Grafana
bun run monitoring:grafana
# → http://localhost:3000  (admin / valor definido no values.yaml)

# Prometheus
bun run monitoring:prometheus
# → http://localhost:9090
```

---

## Fora de escopo

- Alertas configurados no Alertmanager
- Tracing distribuído (Jaeger/Tempo) — arquitetura OTel já suporta, adicionável depois
- Logs centralizados (Loki)
- Service mesh (Istio/Linkerd)
