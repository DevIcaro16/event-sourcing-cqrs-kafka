#!/bin/bash
set -e

CLUSTER_NAME="banking"
NAMESPACE="banking"
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
success "Todos os pré-requisitos encontrados"

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
}
copy_secret k8s/postgres/secret.yaml.example      k8s/postgres/secret.yaml
copy_secret k8s/postgres-read/secret.yaml.example k8s/postgres-read/secret.yaml
copy_secret k8s/app/secret.yaml.example           k8s/app/secret.yaml
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
# 7. Namespace e deploy
# ---------------------------------------------------------------------------
info "Criando namespace '${NAMESPACE}'..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

info "Aplicando manifests..."
kubectl apply \
  -f k8s/postgres/ \
  -f k8s/postgres-read/ \
  -f k8s/redis/ \
  -f k8s/kafka/ \
  -f k8s/app/ \
  -n "$NAMESPACE"
success "Manifests aplicados"

# ---------------------------------------------------------------------------
# 8. Observabilidade
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
# 9. Status final
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}=============================="
echo -e " Cluster pronto!"
echo -e "==============================${NC}"
echo ""
echo "  Pods:"
kubectl get pods -n "$NAMESPACE"
echo ""
echo "  IP da aplicação:"
kubectl get svc banking-app -n "$NAMESPACE" 2>/dev/null || warn "Service ainda provisionando — rode: kubectl get svc banking-app -n ${NAMESPACE}"
echo ""
echo "  Acesso:"
echo "    Grafana    → bun run monitoring:grafana   (http://localhost:3000  admin/banking123)"
echo "    Prometheus → bun run monitoring:prometheus (http://localhost:9090)"
echo "    Swagger    → http://<EXTERNAL-IP>/swagger"
echo ""
