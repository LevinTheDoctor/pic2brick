#!/usr/bin/env bash
# Installiert Backend und Frontend auf k3s – mit den öffentlichen Images aus GHCR, die GitHub
# Actions bei jedem Push baut. Braucht nur kubectl, helm und curl.
#
#   deploy/k3s/deploy.sh                                # beide, jeweils der aktuelle Commit (HEAD)
#   NUR=frontend deploy/k3s/deploy.sh                   # nur ein Teil (frontend|backend)
#   BACKEND_TAG=latest deploy/k3s/deploy.sh             # anderer Tag statt sha-<HEAD>
#
# Tag = sha-<7 Zeichen von HEAD>. Das Image gibt es erst, wenn der Commit gepusht und der
# CI-Lauf durch ist; das Skript wartet bis zu WARTEN Sekunden darauf (Backend ca. 10 Minuten).
#
# Voraussetzungen und Secrets: deploy/KONFIGURATION.md
set -euo pipefail

NAMESPACE="${NAMESPACE:-lego}"
NUR="${NUR:-alle}"
WARTEN="${WARTEN:-1800}"
FRONTEND_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$FRONTEND_DIR/../Lego-Mosaic}"
K3S_DIR="$FRONTEND_DIR/deploy/k3s"

kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

# Echte Client-IP bei Traefik (für die Rate Limits), idempotent
kubectl apply -f "$K3S_DIR/traefik-config.yaml"

# sha-<HEAD>; warnt, wenn lokale Änderungen nicht im Image sind
tag_for() { # repo-ordner
  if [[ -n "$(git -C "$1" status --porcelain)" ]]; then
    echo "!!  $1: lokale Änderungen sind nicht im Image (nur Commits, die gepusht sind)" >&2
  fi
  if [[ -z "$(git -C "$1" branch -r --contains HEAD 2>/dev/null)" ]]; then
    echo "!!  $1: HEAD ist nicht gepusht – erst git push, dann baut CI das Image" >&2
    exit 1
  fi
  echo "sha-$(git -C "$1" rev-parse --short=7 HEAD)"
}

# Anonym wie k3s: klappt nur, wenn das Paket auf GHCR public ist
image_exists() { # repo tag
  local token
  token="$(curl -fsS "https://ghcr.io/token?scope=repository:$1:pull" 2>/dev/null | sed -E 's/.*"token":"([^"]+)".*/\1/')" || return 1
  curl -fsS -o /dev/null -I -H "Authorization: Bearer $token" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json' \
    "https://ghcr.io/v2/$1/manifests/$2" 2>/dev/null
}

wait_for_image() { # repo tag
  local waited=0
  until image_exists "$1" "$2"; do
    if ((waited >= WARTEN)); then
      echo "!!  ghcr.io/$1:$2 nicht gefunden: CI-Lauf fehlgeschlagen oder Paket nicht public?" >&2
      exit 1
    fi
    ((waited == 0)) && echo "==> Warte auf ghcr.io/$1:$2 (GitHub Actions) …"
    sleep 20
    waited=$((waited + 20))
  done
}

if [[ "$NUR" == alle || "$NUR" == backend ]]; then
  BACKEND_TAG="${BACKEND_TAG:-$(tag_for "$BACKEND_DIR")}"
  wait_for_image levinthedoctor/lego-mosaik "$BACKEND_TAG"
  echo "==> Helm: lego-mosaik ($BACKEND_TAG)"
  helm upgrade --install lego-mosaik "$BACKEND_DIR/deploy/helm/lego-mosaik" \
    -n "$NAMESPACE" -f "$K3S_DIR/lego-mosaik.values.yaml" --set "image.tag=$BACKEND_TAG" \
    --wait --timeout 20m
fi

if [[ "$NUR" == alle || "$NUR" == frontend ]]; then
  FRONTEND_TAG="${FRONTEND_TAG:-$(tag_for "$FRONTEND_DIR")}"
  wait_for_image levinthedoctor/pic2brick "$FRONTEND_TAG"
  # Ohne Tunnel-Token startet cloudflared nicht – dann vorerst ohne Tunnel (nur über die IP)
  tunnel=()
  if ! kubectl -n "$NAMESPACE" get secret cloudflared-tunnel >/dev/null 2>&1; then
    echo "!!  Secret cloudflared-tunnel fehlt: Tunnel bleibt aus (siehe KONFIGURATION.md 3.2)"
    tunnel=(--set cloudflared.enabled=false)
  fi
  echo "==> Helm: pic2brick ($FRONTEND_TAG)"
  helm upgrade --install pic2brick "$FRONTEND_DIR/deploy/helm/pic2brick" \
    -n "$NAMESPACE" -f "$K3S_DIR/pic2brick.values.yaml" --set "image.tag=$FRONTEND_TAG" \
    ${tunnel[@]+"${tunnel[@]}"} --wait --timeout 5m
fi

kubectl -n "$NAMESPACE" get pods,svc,ingress
