#!/bin/bash
set -e

CLUSTER_NAME="banking"
NAMESPACE_DEV="banking-dev"
NAMESPACE_PROD="banking-prod"
IMAGE="banking-event-sourcing:latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}==>${NC} $1"; }
success() { echo -e "${GREEN}✔${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✘${NC}  $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 1. Pré-requisitos
# ---------------------------------------------------------------------------
info "Verificando pré-requisitos..."
for cmd in bun docker kind kubectl helm; do
  command -v "$cmd" &>/dev/null || error "Pré-requisito ausente: $cmd"
done
if ! command -v argocd &>/dev/null; then
  warn "argocd CLI não encontrado — acesso ao ArgoCD via kubectl port-forward (não obrigatório)"
fi
success "Pré-requisitos verificados"

# ---------------------------------------------------------------------------
# 2. Cluster kind
# ---------------------------------------------------------------------------
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  warn "Cluster '${CLUSTER_NAME}' já existe — pulando criação"
else
  info "Criando cluster kind '${CLUSTER_NAME}'..."
  kind create cluster --config kind-config.yaml --name "$CLUSTER_NAME"
  success "Cluster criado"
fi

# ---------------------------------------------------------------------------
# 3. Contexto kubectl
# ---------------------------------------------------------------------------
info "Configurando contexto kubectl..."
kubectl config use-context "kind-${CLUSTER_NAME}"
success "Contexto: kind-${CLUSTER_NAME}"

# ---------------------------------------------------------------------------
# 4. Secrets
# ---------------------------------------------------------------------------
info "Verificando secrets..."

copy_secret() {
  local src="$1" dst="$2"
  if [ ! -f "$dst" ]; then
    warn "Secret ausente: $dst — copiando de $src"
    cp "$src" "$dst"
    warn "Edite $dst com os valores corretos antes de continuar (Ctrl+C para cancelar)"
    read -r -p "Pressione Enter para continuar..."
  fi
  # Garante que o namespace está correto (migração banking → banking-dev)
  sed -i "s/namespace: banking$/namespace: ${NAMESPACE_DEV}/" "$dst"
}

copy_secret k8s/postgres/secret.yaml.example      k8s/postgres/secret.yaml
copy_secret k8s/postgres-read/secret.yaml.example k8s/postgres-read/secret.yaml
copy_secret k8s/app/secret.yaml.example           k8s/app/secret.yaml

# Atualiza DATABASE_URL no app secret caso ainda referencie o namespace antigo
OLD_DB_URL="cG9zdGdyZXM6Ly9wb3N0Z3Jlczpwb3N0Z3Jlc0Bwb3N0Z3Jlcy5iYW5raW5nLnN2Yy5jbHVzdGVyLmxvY2FsOjU0MzIvYmFua2luZw=="
NEW_DB_URL="cG9zdGdyZXM6Ly9wb3N0Z3Jlczpwb3N0Z3Jlc0Bwb3N0Z3Jlcy5iYW5raW5nLWRldi5zdmMuY2x1c3Rlci5sb2NhbDo1NDMyL2Jhbmtpbmc="
OLD_READ_URL="cG9zdGdyZXM6Ly9wb3N0Z3Jlczpwb3N0Z3Jlc0Bwb3N0Z3Jlcy1yZWFkLmJhbmtpbmcuc3ZjLmNsdXN0ZXIubG9jYWw6NTQzMi9iYW5raW5nX3JlYWQ="
NEW_READ_URL="cG9zdGdyZXM6Ly9wb3N0Z3Jlczpwb3N0Z3Jlc0Bwb3N0Z3Jlcy1yZWFkLmJhbmtpbmctZGV2LnN2Yy5jbHVzdGVyLmxvY2FsOjU0MzIvYmFua2luZ19yZWFk"
sed -i "s|${OLD_DB_URL}|${NEW_DB_URL}|" k8s/app/secret.yaml
sed -i "s|${OLD_READ_URL}|${NEW_READ_URL}|" k8s/app/secret.yaml

success "Secrets OK"

# ---------------------------------------------------------------------------
# 5. MetalLB + metrics-server
# ---------------------------------------------------------------------------
if kubectl get namespace metallb-system &>/dev/null; then
  warn "MetalLB já instalado — pulando setup"
else
  info "Instalando MetalLB e metrics-server..."
  bash "$SCRIPT_DIR/setup-metallb.sh"
  success "MetalLB e metrics-server configurados"
fi

# ---------------------------------------------------------------------------
# 6. Build e carga da imagem
# ---------------------------------------------------------------------------
info "Fazendo build da imagem Docker..."
docker build -t "$IMAGE" .
info "Carregando imagem no kind..."
kind load docker-image "$IMAGE" --name "$CLUSTER_NAME"
success "Imagem carregada"

# ---------------------------------------------------------------------------
# 7. Namespaces
# ---------------------------------------------------------------------------
info "Criando namespaces..."
kubectl create namespace "$NAMESPACE_DEV"  --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "$NAMESPACE_PROD" --dry-run=client -o yaml | kubectl apply -f -
success "Namespaces criados: ${NAMESPACE_DEV}, ${NAMESPACE_PROD}"

# ---------------------------------------------------------------------------
# 8. Infraestrutura (banking-dev)
# ---------------------------------------------------------------------------
info "Aplicando manifests de infraestrutura em '${NAMESPACE_DEV}'..."
kubectl apply \
  -f k8s/postgres/ \
  -f k8s/postgres-read/ \
  -f k8s/redis/ \
  -f k8s/kafka/ \
  -n "$NAMESPACE_DEV"

info "Aguardando infraestrutura ficar pronta..."
kubectl rollout status statefulset/postgres      -n "$NAMESPACE_DEV" --timeout=120s
kubectl rollout status statefulset/postgres-read -n "$NAMESPACE_DEV" --timeout=120s
kubectl rollout status statefulset/redis         -n "$NAMESPACE_DEV" --timeout=120s
kubectl rollout status statefulset/kafka         -n "$NAMESPACE_DEV" --timeout=180s
success "Infraestrutura pronta"

# ---------------------------------------------------------------------------
# 9. ArgoCD
# ---------------------------------------------------------------------------
if kubectl get namespace argocd &>/dev/null; then
  warn "ArgoCD já instalado — pulando instalação"
else
  info "Instalando ArgoCD..."
  kubectl create namespace argocd
  kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

  info "Aguardando ArgoCD ficar pronto (pode levar alguns minutos)..."
  kubectl wait --for=condition=Available deployment/argocd-server \
    -n argocd --timeout=300s
  success "ArgoCD instalado"
fi

info "Registrando Applications no ArgoCD..."
kubectl apply -f k8s/argocd/app-dev.yaml
kubectl apply -f k8s/argocd/app-prod.yaml
success "Applications registradas (banking-dev, banking-prod)"

# ---------------------------------------------------------------------------
# 10. Observabilidade
# ---------------------------------------------------------------------------
info "Instalando stack de observabilidade (Prometheus + Grafana)..."
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts &>/dev/null
helm repo update &>/dev/null
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --values k8s/monitoring/prometheus-values.yaml \
  --wait --timeout 5m

info "Aplicando OTel Collector e dashboard Grafana..."
kubectl apply -f k8s/monitoring/otel-collector/
kubectl apply -f k8s/monitoring/grafana-dashboard-banking.yaml
success "Observabilidade instalada"

# ---------------------------------------------------------------------------
# 11. Status final
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}=============================="
echo -e " Cluster pronto!"
echo -e "==============================${NC}"
echo ""
echo "  Pods (${NAMESPACE_DEV}):"
kubectl get pods -n "$NAMESPACE_DEV"
echo ""
echo "  ArgoCD Applications:"
kubectl get applications -n argocd 2>/dev/null || warn "CRD ainda propagando — tente em instantes: kubectl get applications -n argocd"
echo ""
echo "  IP da aplicação:"
kubectl get svc banking-app -n "$NAMESPACE_DEV" 2>/dev/null \
  || warn "Service ainda provisionando — rode: kubectl get svc banking-app -n ${NAMESPACE_DEV}"
echo ""
echo "  Acesso:"
echo "    Grafana    → bun run monitoring:grafana    (http://localhost:3000  admin/banking123)"
echo "    Prometheus → bun run monitoring:prometheus (http://localhost:9090)"
echo "    ArgoCD     → kubectl port-forward svc/argocd-server -n argocd 8080:443"
echo "                 https://localhost:8080"
echo "                 Senha: kubectl -n argocd get secret argocd-initial-admin-secret \\"
echo "                          -o jsonpath='{.data.password}' | base64 -d"
echo "    Swagger    → http://<EXTERNAL-IP>/swagger"
echo ""
