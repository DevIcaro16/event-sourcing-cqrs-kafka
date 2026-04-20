# Phase 4 — Kubernetes com kind

## Goal

Implantar toda a stack bancária (app Bun + Postgres write, Postgres read, Redis, Kafka) em um cluster Kubernetes local criado com kind. O objetivo é aprendizado em profundidade: cada recurso k8s é declarado manualmente em YAML puro (flat manifests), sem Helm ou Kustomize. Inclui Dockerfile multi-stage, MetalLB como LoadBalancer, NetworkPolicy, HPA, PDB e probes de produção.

## Arquitetura

```
Internet / host
      │
      ▼
MetalLB LoadBalancer IP
      │
      ▼
Service (LoadBalancer) → banking-app pods (2–5 réplicas, HPA)
      │                        │
      │              initContainers aguardam
      │              Postgres + Kafka prontos
      │
      ├── ClusterIP → postgres StatefulSet    (PVC 1Gi)
      ├── ClusterIP → postgres-read StatefulSet (PVC 1Gi)
      ├── ClusterIP → redis StatefulSet       (PVC 512Mi)
      └── ClusterIP + Headless → kafka StatefulSet (PVC 2Gi)

NetworkPolicy: cada serviço só aceita tráfego da app (e Kafka de si mesmo).
```

**Tech Stack:** kind v0.23+, kubectl, Docker, MetalLB v0.14, metrics-server (para HPA)

## Estrutura de arquivos

```
Dockerfile
.dockerignore
kind-config.yaml
k8s/
├── namespace.yaml
├── app/
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── hpa.yaml
│   └── pdb.yaml
├── postgres/
│   ├── secret.yaml
│   ├── statefulset.yaml
│   ├── service.yaml
│   └── networkpolicy.yaml
├── postgres-read/
│   ├── secret.yaml
│   ├── statefulset.yaml
│   ├── service.yaml
│   └── networkpolicy.yaml
├── redis/
│   ├── configmap.yaml
│   ├── statefulset.yaml
│   ├── service.yaml
│   └── networkpolicy.yaml
└── kafka/
    ├── configmap.yaml
    ├── statefulset.yaml
    ├── service.yaml        # ClusterIP + Headless
    └── networkpolicy.yaml
```

## Dockerfile

Multi-stage build com imagem base `oven/bun:1.3-alpine`:

- **Stage `build`:** copia `package.json`, `bun.lock`, `patches/` e executa `bun install --frozen-lockfile` (aplica o patch kafkajs automaticamente).
- **Stage `prod`:** copia `node_modules/` do stage anterior e o código-fonte (`src/`, `server.ts`, `tsconfig.json`, `drizzle.config.ts`). Expõe porta 3001. `CMD ["bun", "run", "server.ts"]`.

`.dockerignore` exclui: `node_modules/`, `.env*`, `tests/`, `docs/`, `*.md`, arquivos de editor, `kind-config.yaml`.

A imagem é carregada no cluster com `kind load docker-image banking-event-sourcing:latest --name banking`. O Deployment usa `imagePullPolicy: Never`.

## Cluster kind

```yaml
# kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

1 control-plane + 2 workers simulam um cluster real. O MetalLB é instalado via manifests oficiais após a criação do cluster. Um script extrai o range de IPs da subnet Docker do kind e cria o `IPAddressPool` e `L2Advertisement` do MetalLB.

metrics-server é instalado via manifest oficial (com `--kubelet-insecure-tls`) para habilitar o HPA.

## Recursos Kubernetes por camada

### Namespace

`banking` — todos os recursos da Fase 4 ficam aqui. Isolamento lógico do namespace `default`.

### ConfigMap e Secret

**ConfigMap (app):** `DATABASE_URL`, `READ_DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS`, `READ_MODEL_CACHE_TTL`, `SNAPSHOT_THRESHOLD`.

**Secret (app e bancos):** senhas do Postgres (`POSTGRES_PASSWORD`). Armazenados como base64 no Secret k8s, montados como `envFrom` nos pods.

### Deployment (app Bun)

- `replicas: 2` (baseline; HPA escala até 5)
- `image: banking-event-sourcing:latest`, `imagePullPolicy: Never`
- `resources`: `requests: {cpu: 100m, memory: 128Mi}`, `limits: {cpu: 500m, memory: 512Mi}`
- `readinessProbe`: `httpGet /` porta 3001, `initialDelaySeconds: 10`, `periodSeconds: 5`
- `livenessProbe`: `httpGet /` porta 3001, `initialDelaySeconds: 30`, `periodSeconds: 10`, `failureThreshold: 3`
- `initContainers`:
  - `wait-postgres`: imagem `busybox`, executa `until nc -z postgres 5432; do sleep 2; done`
  - `wait-kafka`: imagem `busybox`, executa `until nc -z kafka 9092; do sleep 2; done`

### StatefulSets (Postgres write, Postgres read, Redis, Kafka)

Cada StatefulSet:
- `replicas: 1` (aprendizado; HA requer replicação configurada no próprio serviço)
- `serviceName` aponta para o headless Service correspondente
- `volumeClaimTemplates`: cria PVC automaticamente por réplica

| Serviço       | Imagem                        | PVC    | Porta |
|---------------|-------------------------------|--------|-------|
| postgres      | postgres:16-alpine            | 1Gi    | 5432  |
| postgres-read | postgres:16-alpine            | 1Gi    | 5432  |
| redis         | redis:7-alpine                | 512Mi  | 6379  |
| kafka         | confluentinc/cp-kafka:7.6.0   | 2Gi    | 9092  |

Kafka usa as mesmas variáveis de ambiente do `docker-compose.yml` (KRaft mode). O `KAFKA_ADVERTISED_LISTENERS` aponta para o nome DNS interno do Service: `kafka.banking.svc.cluster.local:9092`.

### Services

- **app** (`LoadBalancer`): MetalLB aloca IP externo. Porta 80 → container 3001.
- **postgres, postgres-read, redis** (`ClusterIP`): acesso interno apenas. DNS: `<nome>.<namespace>.svc.cluster.local`.
- **kafka** (`ClusterIP`): acesso interno para a app.
- **kafka-headless** (`ClusterIP: None`): resolve diretamente para o IP do pod `kafka-0`. Necessário para o KRaft bootstrap.

### NetworkPolicy

Cada banco/serviço tem uma NetworkPolicy com `podSelector` próprio e `ingress` restrito:

- **postgres / postgres-read**: aceita ingress apenas de pods com label `app: banking-app`
- **redis**: aceita ingress apenas de pods com label `app: banking-app`
- **kafka**: aceita ingress de `app: banking-app` + de si mesmo (label `app: kafka`) para comunicação interna KRaft

Egress não é restrito (pods podem fazer chamadas externas livremente).

### HorizontalPodAutoscaler

```yaml
minReplicas: 2
maxReplicas: 5
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

Requer metrics-server instalado no cluster.

### PodDisruptionBudget

```yaml
minAvailable: 1
selector:
  matchLabels:
    app: banking-app
```

Garante que durante `kubectl drain` ou rolling update, ao menos 1 pod da app continue disponível.

## Scripts de operação

Adicionados ao `package.json` como scripts `k8s:*`:

```
k8s:cluster:create   kind create cluster --config kind-config.yaml --name banking
k8s:cluster:delete   kind delete cluster --name banking
k8s:setup            instala MetalLB + metrics-server + configura IPAddressPool
k8s:image:load       docker build -t banking-event-sourcing:latest . && kind load docker-image ...
k8s:deploy           kubectl apply -f k8s/ -R -n banking  # namespace.yaml aplicado separadamente no setup
k8s:undeploy         kubectl delete -f k8s/ -R -n banking
k8s:status           kubectl get all -n banking
k8s:logs             kubectl logs -f deployment/banking-app -n banking
k8s:restart          kubectl rollout restart deployment/banking-app -n banking
```

Um script shell `scripts/setup-metallb.sh` extrai o range de IPs da subnet Docker do kind e aplica o `IPAddressPool` e `L2Advertisement`.

## Fluxo de trabalho

**Setup inicial (uma vez):**
1. `bun run k8s:cluster:create`
2. `bun run k8s:setup` (MetalLB + metrics-server)
3. `bun run k8s:image:load`
4. `kubectl apply -f k8s/namespace.yaml`
5. `bun run k8s:deploy`
6. Aguardar pods ficarem `Running`: `kubectl get pods -n banking -w`
7. Obter IP externo: `kubectl get svc banking-app -n banking`
8. Testar: `curl http://<EXTERNAL-IP>/swagger`

**Ciclo de desenvolvimento:**
1. Alterar código
2. `bun run k8s:image:load`
3. `bun run k8s:restart`
4. `kubectl rollout status deployment/banking-app -n banking`

## Testes de validação

Cada recurso tem um teste de validação manual documentado no plano:

- NetworkPolicy: `kubectl exec` em pod não-autorizado tentando conectar no Postgres → deve ser recusado
- HPA: `kubectl run` com `stress` gerando carga CPU → observar escala automática
- PDB: `kubectl drain <worker-node>` → verificar que 1 réplica permanece disponível
- StatefulSet PVC: deletar pod kafka-0 e verificar que ele reinicia com os mesmos dados
- MetalLB: `curl` via IP externo do LoadBalancer

## O que esta fase não inclui

- Observabilidade (Prometheus + Grafana) — Fase 5
- TLS/HTTPS — requer cert-manager, escopo de fase separada
- Alta disponibilidade real dos bancos (Postgres HA, Redis Sentinel, Kafka multi-broker)
- Registry de imagens (harbor, registry local) — imagem carregada diretamente via kind load
- GitOps (ArgoCD, Flux) — além do escopo
