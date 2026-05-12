#!/bin/bash
set -e

echo "=== Instalando MetalLB v0.14.8 ==="
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.8/config/manifests/metallb-native.yaml

echo "=== Aguardando MetalLB controller ficar pronto ==="
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb,component=controller \
  --timeout=90s

echo "=== Detectando subnet Docker do kind ==="
SUBNET=$(docker network inspect kind | python3 -c "import sys,json; nets=json.load(sys.stdin); print(next(c['Subnet'] for c in nets[0]['IPAM']['Config'] if ':' not in c['Subnet']))")
PREFIX=$(echo "$SUBNET" | cut -d. -f1-2)
POOL="${PREFIX}.255.200-${PREFIX}.255.250"
echo "Pool de IPs MetalLB: $POOL"

echo "=== Configurando IPAddressPool e L2Advertisement ==="
kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: banking-pool
  namespace: metallb-system
spec:
  addresses:
  - ${POOL}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: banking-l2
  namespace: metallb-system
spec:
  ipAddressPools:
  - banking-pool
EOF

echo "=== Instalando metrics-server ==="
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

echo "=== Habilitando --kubelet-insecure-tls no metrics-server (necessário para kind) ==="
kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

echo "=== Aguardando metrics-server ficar pronto ==="
kubectl wait --namespace kube-system \
  --for=condition=ready pod \
  --selector=k8s-app=metrics-server \
  --timeout=90s

echo "=== Setup completo ==="
