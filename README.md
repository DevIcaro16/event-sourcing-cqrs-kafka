# banking-event-sourcing

A study banking system built on **Event Sourcing** and **CQRS**, running on a local Kubernetes cluster (kind).

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| HTTP Framework | [Elysia](https://elysiajs.com) |
| Write database | PostgreSQL 16 |
| Read database | PostgreSQL 16 (separate read model) |
| Read model cache | Redis 7 |
| Messaging | Kafka (KRaft mode, no Zookeeper) |
| ORM / migrations | Drizzle ORM |
| Observability | Prometheus + Grafana + OpenTelemetry |
| Orchestration | Kubernetes (kind) |

---

## Patterns

- **Event Sourcing** — account state rebuilt from immutable events stored in PostgreSQL
- **CQRS** — writes via command handlers appending to the event store; reads via a projected read model in a separate database
- **Snapshot** — every N events, a state snapshot is saved to avoid full event replay
- **Optimistic Concurrency** — `baseVersion` prevents concurrent write conflicts; automatic retry up to 3 attempts
- **Read model cache** — balance and statement served from Redis with configurable TTL; cache invalidated via Kafka projection
- **Canonical balance cache** — separate canonical balance cache with drift detection between read model and rebuilt state
- **Ports & Adapters** — domain isolated from infrastructure via interfaces (`EventStore`, `MessagePublisher`, `MessageSubscriber`)
- **Observability** — HTTP, business and Kafka metrics exported via OTel SDK → OTel Collector → Prometheus

---

## API

Base path: `/accounts`

| Method | Route | Description |
|---|---|---|
| `POST` | `/` | Open account |
| `POST` | `/:id/deposit` | Deposit |
| `POST` | `/:id/withdraw` | Withdraw |
| `POST` | `/transfer` | Transfer between accounts |
| `POST` | `/:id/lock` | Lock balance |
| `POST` | `/:id/unlock` | Unlock balance |
| `POST` | `/:id/reverse` | Reverse transaction |
| `GET` | `/:id/balance` | Get balance |
| `GET` | `/:id/statement` | Get event statement |

Interactive docs: `GET /swagger`

---

## Running locally (Kubernetes)

### Prerequisites

`bun`, `docker`, `kind`, `kubectl`, `helm`

### Setup

```bash
# 1. Create kind cluster
bun run k8s:cluster:create

# 2. Configure MetalLB + metrics-server
bun run k8s:setup

# 3. Build and load image
bun run k8s:image:load

# 4. Deploy the application
kubectl create namespace banking --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/postgres/ -f k8s/postgres-read/ -f k8s/redis/ -f k8s/kafka/ -f k8s/app/ -n banking

# 5. Install observability stack
bun run monitoring:install
bun run monitoring:collector
bun run monitoring:dashboard
```

### Secrets

Copy the example files before deploying:

```bash
cp k8s/postgres/secret.yaml.example k8s/postgres/secret.yaml
cp k8s/postgres-read/secret.yaml.example k8s/postgres-read/secret.yaml
cp k8s/app/secret.yaml.example k8s/app/secret.yaml
```

### Access

```bash
# Application external IP
kubectl get svc banking-app -n banking

# Grafana  → http://localhost:3000  (admin / banking123)
bun run monitoring:grafana

# Prometheus → http://localhost:9090
bun run monitoring:prometheus
```

---

## Tests

```bash
# Unit
bun test tests/unit

# Integration (requires services running)
bun run test:integration
```
