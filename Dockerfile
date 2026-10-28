# Pic2Brick: statische SPA hinter nginx, das /api/ an das Backend (lego-mosaik) weiterreicht.
#
#   docker build -t pic2brick:dev .
#   docker run -p 8088:8080 -e BACKEND_URL=http://host.docker.internal:8080 pic2brick:dev
#
# Die nginx-Konfiguration entsteht beim Start aus deploy/nginx/*.template (envsubst des
# nginx-Images); alle Einstellungen sind Umgebungsvariablen, siehe deploy/KONFIGURATION.md.

# --- Build ------------------------------------------------------------------------------
# Immer auf der Architektur des Build-Rechners: dist/ ist plattformunabhängig, so braucht ein
# Multi-Arch-Build (amd64 + arm64) kein QEMU
FROM --platform=$BUILDPLATFORM node:24-alpine AS build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Gleiche Origin: der Browser ruft /api/… auf, nginx leitet weiter (kein CORS nötig)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# --- Laufzeit ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime

# Standardwerte; im Cluster setzt das Helm-Chart sie aus values.yaml
ENV BACKEND_URL=http://lego-mosaik:80 \
    TRUSTED_PROXY_CIDR=10.42.0.0/16 \
    MAX_UPLOAD=25m \
    PROXY_TIMEOUT=300s \
    RATE_API=120r/m \
    BURST_API=40 \
    RATE_RECHNEN=6r/m \
    BURST_RECHNEN=4 \
    CONN_RECHNEN=2 \
    CONN_RECHNEN_GESAMT=6 \
    RATE_PREISE=3r/m \
    BURST_PREISE=2 \
    RATE_PREISE_GESAMT=1r/m \
    BURST_PREISE_GESAMT=10 \
    RATE_SCHREIBEN=10r/m \
    BURST_SCHREIBEN=5

COPY deploy/nginx/ /etc/nginx/templates/
COPY --from=build /src/dist /usr/share/nginx/html

# 8080: über Traefik (Node-IP), 8081: über den Cloudflare Tunnel
EXPOSE 8080 8081
