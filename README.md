# banking-event-sourcing

Sistema bancário de estudo construído sobre **Event Sourcing** e **CQRS**, rodando em um cluster Kubernetes local (kind).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Framework HTTP | [Elysia](https://elysiajs.com) |
| Banco de dados (write) | PostgreSQL 16 |
| Banco de dados (read) | PostgreSQL 16 (read model separado) |
| Cache de read model | Redis 7 |
| Mensageria | Kafka (KRaft mode, sem Zookeeper) |
| ORM / migrations | Drizzle ORM |
| Observabilidade | Prometheus + Grafana + OpenTelemetry |
| Orquestração | Kubernetes (kind) |

---

## Padrões

- **Event Sourcing** — estado da conta reconstruído a partir de eventos imutáveis armazenados no PostgreSQL
- **CQRS** — writes via command handlers com append ao event store; reads via projeção em banco separado
- **Snapshot** — a cada N eventos, snapshot do estado é salvo para evitar replay completo
- **Optimistic Concurrency** — `baseVersion` previne conflitos de escrita concorrente; retry automático com até 3 tentativas
- **Read model cache** — saldo e extrato servidos do Redis com TTL configurável; cache invalidado via projeção Kafka
- **Canonical balance cache** — cache separado de saldo canônico com detecção de drift entre read model e estado reconstruído
- **Ports & Adapters** — domínio isolado de infraestrutura via interfaces (`EventStore`, `MessagePublisher`, `MessageSubscriber`)
- **Observabilidade** — métricas HTTP, de negócio e Kafka exportadas via OTel SDK → OTel Collector → Prometheus

---

## API

Prefixo: `/accounts`

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/` | Abrir conta |
| `POST` | `/:id/deposit` | Depositar |
| `POST` | `/:id/withdraw` | Sacar |
| `POST` | `/transfer` | Transferir entre contas |
| `POST` | `/:id/lock` | Bloquear saldo |
| `POST` | `/:id/unlock` | Desbloquear saldo |
| `POST` | `/:id/reverse` | Estornar transação |
| `GET` | `/:id/balance` | Consultar saldo |
| `GET` | `/:id/statement` | Extrato de eventos |

Documentação interativa: `GET /swagger`

---

## Rodando localmente (Kubernetes)

### Pré-requisitos

`bun`, `docker`, `kind`, `kubectl`, `helm`

### Setup

```bash
# 1. Criar cluster kind
bun run k8s:cluster:create

# 2. Configurar MetalLB + metrics-server
bun run k8s:setup

# 3. Build e load da imagem
bun run k8s:image:load

# 4. Deploy da aplicação
kubectl create namespace banking --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/postgres/ -f k8s/postgres-read/ -f k8s/redis/ -f k8s/kafka/ -f k8s/app/ -n banking

# 5. Instalar observabilidade
bun run monitoring:install
bun run monitoring:collector
bun run monitoring:dashboard
```

### Secrets

Copie os arquivos de exemplo antes do deploy:

```bash
cp k8s/postgres/secret.yaml.example k8s/postgres/secret.yaml
cp k8s/postgres-read/secret.yaml.example k8s/postgres-read/secret.yaml
cp k8s/app/secret.yaml.example k8s/app/secret.yaml
```

### Acesso

```bash
# IP externo da aplicação
kubectl get svc banking-app -n banking

# Grafana  → http://localhost:3000  (admin / banking123)
bun run monitoring:grafana

# Prometheus → http://localhost:9090
bun run monitoring:prometheus
```

---

## Testes

```bash
# Unit
bun test tests/unit

# Integration (requer serviços rodando)
bun run test:integration
```
