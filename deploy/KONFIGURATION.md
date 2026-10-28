# Pic2Brick + lego-mosaik auf k3s

Anleitung und vollständige Konfiguration für den gemeinsamen Betrieb von Frontend
([Pic2Brick](https://github.com/LevinTheDoctor/pic2brick)) und Backend
([lego-mosaik](https://github.com/LevinTheDoctor/lego-mosaik)) auf einem k3s-Cluster.

- Erreichbar ist **nur das Frontend**: über die IP des k3s-Servers (LAN) und über einen
  Cloudflare Tunnel (Internet).
- Das Backend ist ein reiner `ClusterIP`-Service. Der Browser spricht es über `/api/` an; nginx
  im Frontend-Pod leitet die Aufrufe weiter.
- Es gibt **keine Anmeldung**. Deshalb begrenzt nginx die Anfragen pro Client-IP, sperrt
  Betriebs-Endpunkte und bremst teure Aufrufe stark.
- Alle Zugangsdaten liegen in Kubernetes-Secrets, nie in Git oder in `values.yaml`.

## Inhalt

1. [Aufbau](#1-aufbau)
2. [Voraussetzungen](#2-voraussetzungen)
3. [Secrets](#3-secrets)
4. [Einstellungen](#4-einstellungen)
5. [Deployment Schritt für Schritt](#5-deployment-schritt-für-schritt)
6. [Rate Limiting](#6-rate-limiting)
7. [Updates, Backup, Fehlersuche](#7-updates-backup-fehlersuche)
8. [Grenzen](#8-grenzen)

## 1. Aufbau

```
Internet ── Cloudflare ── cloudflared (Pod) ──► pic2brick:8081 ─┐  Client-IP aus CF-Connecting-IP
LAN: http://<node-ip>/ ── Traefik (k3s) ─────► pic2brick:80   ─┤  Client-IP aus X-Forwarded-For
                                                                ▼
                 nginx (pic2brick): SPA ausliefern, /api/ → http://lego-mosaik:80/
                 Rate Limits · Sperrliste · 25 MB Upload · 300 s Timeout
                                                                ▼
                 lego-mosaik (ClusterIP) ──► lego-mosaik-postgresql, Synology-iSCSI (PVC lego-mosaik-mosaike)
                 Jobs: katalog-import (+ täglicher CronJob)
```

| Teil | Chart | Release | Namespace |
|---|---|---|---|
| Backend + PostgreSQL + Mosaik-Volume | `lego-mosaik/deploy/helm/lego-mosaik` | `lego-mosaik` | `lego` |
| Frontend (nginx) + cloudflared | `pic2brick/deploy/helm/pic2brick` | `pic2brick` | `lego` |

Dateien in diesem Repo:

| Pfad | Zweck |
|---|---|
| `Dockerfile` | Frontend-Image: Vite-Build mit `VITE_API_URL=/api`, danach nginx (unprivilegiert) |
| `.github/workflows/ci.yml` | Lint, Build, Helm-Lint; baut bei jedem Push das Image (amd64 + arm64) nach GHCR |
| `deploy/nginx/*.template` | nginx-Konfiguration; `${…}` füllt das nginx-Image beim Start aus Umgebungsvariablen |
| `deploy/helm/pic2brick/` | Helm-Chart des Frontends (Deployment, Service, Ingress, cloudflared, NetworkPolicy) |
| `deploy/k3s/lego-mosaik.values.yaml` | Backend-Werte für k3s |
| `deploy/k3s/pic2brick.values.yaml` | Frontend-Werte für k3s |
| `deploy/k3s/traefik-config.yaml` | Traefik so einstellen, dass die echte Client-IP ankommt |
| `deploy/k3s/deploy.sh` | Schritte 5.1 und 5.3–5.4b in einem Befehl |

## 2. Voraussetzungen

- **k3s** mit dem mitgelieferten Traefik und ServiceLB (Standardinstallation).
- Auf dem Rechner, von dem aus du deployst, reichen **`kubectl`, `helm` und `curl`** mit
  Admin-Zugriff auf den Cluster. Docker und SSH sind nicht nötig: Die Images baut GitHub Actions
  und legt sie öffentlich in die GitHub Container Registry (Abschnitt 5.3). Die Kubeconfig liegt
  auf dem Server unter `/etc/rancher/k3s/k3s.yaml`; kopieren und `server:` auf die IP des
  Servers ändern.
- Beide Repos nebeneinander, z. B. `…/LEGO-GEN/Pic2Brick` und `…/LEGO-GEN/Lego-Mosaic`.
  Alle Befehle unten laufen im Ordner `Pic2Brick`.
- Die Images gibt es für **amd64 und arm64**; die Pods dürfen also auf `tc-k3s` und auf den
  Raspberry Pi. Das Backend bevorzugt `tc-k3s` (Rechenleistung), PostgreSQL ist dort fest, weil
  sein `local-path`-Volume auf dem Node liegt.
- **Synology CSI** (Namespace `synology-csi`, StorageClass `synology-iscsi-storage`) für die
  Mosaik-Dateien: Es legt die iSCSI-LUN beim ersten Install selbst an. Wer stattdessen eine
  vorhandene LUN nutzen will, trägt Portal, IQN und LUN unter `persistence.iscsi` ein und lässt
  `persistence.storageClass` weg (dann braucht jeder Node **open-iscsi**).
- **Cloudflare**: ein Konto mit einer Domain, deren DNS bei Cloudflare liegt.

## 3. Secrets

Alle Secrets liegen im Namespace `lego`. Zwei legst du selbst an, die übrigen erzeugt das
Backend-Chart beim ersten Install und behält sie bei Upgrades.

| Secret | Schlüssel | Angelegt von | Wofür | Pflicht |
|---|---|---|---|---|
| `cloudflared-tunnel` | `token` | **du** | Anmeldung des Tunnel-Connectors bei Cloudflare | ja, wenn `cloudflared.enabled` |
| `lego-mosaik-bricklink` | `BRICKLINK_CONSUMER_KEY`, `BRICKLINK_CONSUMER_SECRET`, `BRICKLINK_TOKEN_VALUE`, `BRICKLINK_TOKEN_SECRET` | **du** | BrickLink-API für „Preis schätzen“ | nein; ohne sie nur gespeicherte Preise |
| `lego-mosaik-postgresql` | `password` | Helm (zufällig) | Passwort des Datenbanknutzers `lego` | automatisch |

Die automatischen Secrets tragen `helm.sh/resource-policy: keep`. Sie bleiben bei
`helm uninstall` erhalten, weil sie zu den Daten in den Volumes passen müssen.

### 3.1 Namespace anlegen

```bash
kubectl create namespace lego
```

### 3.2 Cloudflare-Tunnel-Token

1. Im [Cloudflare-Dashboard](https://one.dash.cloudflare.com/) **Zero Trust → Networks →
   Tunnels → Create a tunnel** öffnen, Typ **Cloudflared** wählen und einen Namen vergeben,
   z. B. `pic2brick`.
2. Bei „Install and run a connector“ steht ein Befehl mit `--token eyJ…`. Den Token (alles
   nach `--token`) kopieren. Den Befehl selbst nicht ausführen, der Connector läuft im Cluster.
3. Secret anlegen:

   ```bash
   kubectl -n lego create secret generic cloudflared-tunnel \
     --from-literal=token='eyJ…'
   ```

4. Die Route (Public Hostname) richtest du nach dem Deploy ein, siehe [Schritt 5.6](#56-cloudflare-public-hostname).

### 3.3 BrickLink-Zugangsdaten (optional)

Unter <https://www.bricklink.com/v2/api/register_consumer.page> registrieren. Als erlaubte IP
die öffentliche IP des k3s-Servers eintragen; BrickLink prüft sie beim Access Token.

```bash
kubectl -n lego create secret generic lego-mosaik-bricklink \
  --from-literal=BRICKLINK_CONSUMER_KEY='…' \
  --from-literal=BRICKLINK_CONSUMER_SECRET='…' \
  --from-literal=BRICKLINK_TOKEN_VALUE='…' \
  --from-literal=BRICKLINK_TOKEN_SECRET='…'
```

Das Backend liest das Secret über `config.extraEnvFrom` (mit `optional: true`, es startet
also auch ohne). Wenn du das Secret später anlegst oder änderst, das Backend neu starten:
`kubectl -n lego rollout restart deploy/lego-mosaik`.

### 3.4 Secrets aus Dateien statt Shell-Verlauf

Damit Schlüssel nicht im Shell-Verlauf landen, gehen auch Dateien. `deploy/k3s/*.secret.*`
steht in `.gitignore`:

```bash
# deploy/k3s/bricklink.secret.env  (eine Zeile pro Wert: BRICKLINK_CONSUMER_KEY=…)
kubectl -n lego create secret generic lego-mosaik-bricklink \
  --from-env-file=deploy/k3s/bricklink.secret.env
```

### 3.5 Secrets ansehen, ändern, eigene vorgeben

```bash
kubectl -n lego get secrets
# Einen Wert lesen (z. B. das Datenbank-Passwort)
kubectl -n lego get secret lego-mosaik-postgresql -o jsonpath='{.data.password}' | base64 -d; echo
# Ein Secret ersetzen
kubectl -n lego create secret generic cloudflared-tunnel --from-literal=token='…' \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n lego rollout restart deploy/pic2brick-cloudflared
```

Eigene Werte statt der erzeugten setzt du **vor dem ersten Install** über `existingSecret` im
Backend-Chart: `postgresql.auth.existingSecret` (Schlüssel `password`). Später lässt es sich
nicht einfach tauschen: PostgreSQL behält das Passwort aus dem ersten Start im Volume.

## 4. Einstellungen

### 4.1 Frontend (`deploy/k3s/pic2brick.values.yaml`, Chart `deploy/helm/pic2brick`)

| Wert | Standard | Bedeutung |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/levinthedoctor/pic2brick` / `sha-<commit>` | Image aus GHCR (`deploy.sh` setzt den Tag) |
| `replicaCount` | `1` | Pods. Die Rate Limits gelten pro Pod, bei 2 Pods also doppelt |
| `backend.url` | `http://lego-mosaik:80` | Backend-Service im selben Namespace |
| `trustedProxyCidr` | `10.42.0.0/16` | Pod-Netz von k3s (`--cluster-cidr`). Nur von dort wird `X-Forwarded-For`/`CF-Connecting-IP` geglaubt |
| `proxy.maxUpload` | `25m` | Größte Anfrage (Backend erlaubt 20 MB pro Bild) |
| `proxy.timeout` | `300s` | Wartezeit auf das Backend (Mosaike entstehen synchron) |
| `rateLimits.*` | siehe [Abschnitt 6](#6-rate-limiting) | Limits pro Client-IP |
| `service.port` / `service.tunnelPort` | `80` / `8081` | Eingang für Traefik bzw. cloudflared |
| `ingress.enabled` | `true` | Ingress für Traefik (Zugriff über die Node-IP) |
| `ingress.hosts[].host` | `""` | Leer = jede Adresse, auch `http://<node-ip>/`; zusätzlich z. B. `pic2brick.lan` möglich |
| `ingress.annotations` | `router.entrypoints: web` | Nur Port 80 (kein selbstsigniertes HTTPS im LAN) |
| `cloudflared.enabled` | `true` | Tunnel-Connector im Cluster |
| `cloudflared.replicaCount` | `2` | Zwei Connectoren für Ausfallsicherheit |
| `cloudflared.image.tag` | `2026.10.0` | Version von `cloudflare/cloudflared` |
| `cloudflared.existingSecret` / `existingSecretKey` | `cloudflared-tunnel` / `token` | Secret mit dem Tunnel-Token |
| `networkPolicy.enabled` | `true` | Port 8080 nur aus `kube-system` (Traefik), Port 8081 nur von cloudflared |
| `networkPolicy.ingressNamespace` | `kube-system` | Namespace des Ingress-Controllers |

Die gleichen Werte gibt es beim reinen `docker run` als Umgebungsvariablen (`BACKEND_URL`,
`TRUSTED_PROXY_CIDR`, `MAX_UPLOAD`, `PROXY_TIMEOUT`, `RATE_*`, `BURST_*`, `CONN_*`;
Standardwerte im `Dockerfile`).

### 4.2 Backend (`deploy/k3s/lego-mosaik.values.yaml`, Chart im Repo lego-mosaik)

Nur die Werte, die für k3s vom Chart-Standard abweichen oder wichtig sind. Alle weiteren stehen
in `lego-mosaik/deploy/helm/lego-mosaik/values.yaml` und `lego-mosaik/docs/cloud.md`.

| Wert | k3s | Bedeutung |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/levinthedoctor/lego-mosaik` / `sha-<commit>` | Image aus GHCR |
| `affinity` | bevorzugt `tc-k3s` | Weicht nur bei Ausfall auf den Raspberry Pi aus |
| `replicaCount` | `1` | API-Pods (Chart-Standard 2) |
| `service.type` | `ClusterIP` | Backend nicht von außen erreichbar |
| `ingress.enabled` | `false` | Kein eigener Ingress, Zugriff nur über das Frontend |
| `config.corsOrigins` | `""` | Kein CORS nötig, der Browser sieht nur eine Origin |
| `config.extraEnvFrom` | Secret `lego-mosaik-bricklink`, optional | BrickLink-Zugang |
| `podDisruptionBudget.enabled` | `false` | Mit 1 Replica würde das PDB `kubectl drain` blockieren |
| `postgresql.persistence.size` | `8Gi` | Volume der Datenbank (k3s: `local-path`) |
| `persistence.size` | `20Gi` | Volume für die Mosaik-Dateien |
| `persistence.storageClass` | `synology-iscsi-storage` | Synology CSI legt die LUN an (`Retain`) |
| `persistence.iscsi.*` | – | Alternative: vorhandene LUN als statisches PV (dann `storageClass` weglassen) |
| `catalogImport.schedule` | `17 3 * * *` (Standard) | Täglicher Import der Rebrickable-Daten |
| `config.logLevel` / `logFormat` | `INFO` / `json` (Standard) | Logs |

## 5. Deployment Schritt für Schritt

### 5.1 Traefik: echte Client-IP

Ohne diese Einstellung sieht nginx bei ServiceLB die IP des Nodes statt der des Besuchers.
Dann teilen sich alle Besucher ein Rate Limit.

```bash
kubectl apply -f deploy/k3s/traefik-config.yaml
kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'; echo   # → Local
```

Gibt es schon eine `HelmChartConfig` namens `traefik`, ergänze dort den Abschnitt
`service.spec.externalTrafficPolicy: Local`, statt sie zu überschreiben.

### 5.2 Secrets

Siehe [Abschnitt 3](#3-secrets): Namespace, `cloudflared-tunnel` und optional `lego-mosaik-bricklink`.

### 5.3 Images aus GitHub Actions

Beide Repos haben einen Workflow (`.github/workflows/ci.yml`). Bei jedem Push laufen Tests und
Lint, danach baut er das Image für amd64 und arm64 und legt es in die GitHub Container Registry:

| Image | Tags |
|---|---|
| `ghcr.io/levinthedoctor/lego-mosaik` | `sha-<7 Zeichen>` je Commit, `<branch>`, `latest` (master), `1.2.3` bei Tag `v1.2.3` |
| `ghcr.io/levinthedoctor/pic2brick` | `sha-<7 Zeichen>` je Commit, `<branch>`, `latest` (main), `1.2.3` bei Tag `v1.2.3` |

Das Backend baut auf zwei nativen Runnern (amd64, arm64) und führt die beiden danach zu einem
Image zusammen, weil scikit-image für Python 3.15 kompiliert werden muss. Ein Lauf dauert
ca. 10 Minuten, das Frontend ca. 3 Minuten. Fortschritt: `gh run watch` im jeweiligen Repo.

**Public**: Die Pakete übernehmen die Sichtbarkeit des öffentlichen Repos, k3s lädt sie ohne
Zugangsdaten. Ist ein Paket doch privat (`ImagePullBackOff` mit `401`/`403`), auf
<https://github.com/users/LevinTheDoctor/packages/container/lego-mosaik/settings> (bzw.
`…/pic2brick/settings`) unter **Danger Zone → Change visibility → Public** umstellen.

Welcher Tag gehört zum aktuellen Stand?

```bash
TAG_BACKEND=sha-$(git -C ../Lego-Mosaic rev-parse --short=7 HEAD)
TAG_FRONTEND=sha-$(git rev-parse --short=7 HEAD)
```

### 5.4 Backend installieren und Teilekatalog abwarten

```bash
helm upgrade --install lego-mosaik ../Lego-Mosaic/deploy/helm/lego-mosaik -n lego \
  -f deploy/k3s/lego-mosaik.values.yaml --set image.tag=$TAG_BACKEND --wait --timeout 20m
```

`--wait` endet, sobald PostgreSQL und die API bereit sind (die API erst, wenn die iSCSI-LUN
angelegt und eingehängt ist). Parallel lädt der Job `lego-mosaik-katalog-import-1`
die Rebrickable-Daten (einige Minuten). Bis er fertig ist, meldet `/api/gesundheit` den
Katalog als unbekannt.

```bash
kubectl -n lego get pods,jobs
kubectl -n lego logs job/lego-mosaik-katalog-import-1 -f
```

### 5.4b Frontend installieren

```bash
helm upgrade --install pic2brick deploy/helm/pic2brick -n lego \
  -f deploy/k3s/pic2brick.values.yaml --set image.tag=$TAG_FRONTEND --wait
```

Hast du das Secret `cloudflared-tunnel` noch nicht angelegt, hänge
`--set cloudflared.enabled=false` an. Die App ist dann erst einmal nur über die IP
erreichbar. Später das Secret anlegen und denselben Befehl ohne diesen Zusatz wiederholen.

### Alles in einem Befehl

`deploy/k3s/deploy.sh` macht 5.1 und 5.3 bis 5.4b auf einmal. Es nimmt `sha-<HEAD>` beider
Repos, wartet, bis GitHub Actions das Image fertig hat, und lässt den Tunnel automatisch weg,
solange das Secret fehlt:

```bash
deploy/k3s/deploy.sh                 # alles
NUR=frontend deploy/k3s/deploy.sh    # nur ein Teil (frontend|backend)
BACKEND_TAG=latest deploy/k3s/deploy.sh   # anderer Tag
```

### 5.5 Prüfen über die IP

```bash
kubectl -n lego get pods,svc,ingress                  # lego-mosaik*: nur ClusterIP
curl -s http://192.168.178.97/ | head -5               # HTML der App
curl -s http://192.168.178.97/api/gesundheit           # JSON vom Backend
curl -si http://192.168.178.97/api/actuator/health | head -1   # 404 (gesperrt)
helm test pic2brick -n lego
helm test lego-mosaik -n lego
```

Im Browser: **http://192.168.178.97/** (IP von `tc-k3s`).

**Welche Node-IP?** Mit `externalTrafficPolicy: Local` (Schritt 5.1) antwortet nur ein Node,
auf dem ein Traefik-Pod läuft. Welcher das ist:

```bash
kubectl -n kube-system get pods -l app.kubernetes.io/name=traefik -o wide   # Spalte NODE
kubectl get nodes -o wide                                                   # INTERNAL-IP
```

Soll die App immer unter derselben IP erreichbar sein, Traefik auf diesen Node festlegen
(in `traefik-config.yaml` unter `valuesContent` z. B. `nodeSelector:
{kubernetes.io/hostname: tc-k3s}`) oder eine feste DHCP-Reservierung dafür nutzen.

### 5.6 Cloudflare: Public Hostname

Im Tunnel unter **Public Hostname → Add a public hostname**:

| Feld | Wert |
|---|---|
| Subdomain / Domain | z. B. `pic2brick` / `deine-domain.de` |
| Service Type | `HTTP` |
| URL | `pic2brick.lego.svc.cluster.local:8081` |

Wichtig ist **Port 8081**. Nur dort wertet nginx `CF-Connecting-IP` aus. Über Port 80 sähen
alle Tunnel-Besucher wie ein einziger Client aus.

Danach `https://pic2brick.deine-domain.de` öffnen. Status des Connectors:

```bash
kubectl -n lego logs deploy/pic2brick-cloudflared --tail=20   # "Registered tunnel connection"
```

Optional, aber empfehlenswert, solange es kein Login gibt: in Cloudflare **Zero Trust → Access**
eine Application für den Hostnamen anlegen (z. B. Login per E-Mail-Code). Dann kommen nur
freigegebene Personen über das Internet an die App; im LAN bleibt sie offen.

## 6. Rate Limiting

nginx im Frontend-Pod begrenzt jede Anfrage an `/api/` pro Client-IP. Statische Dateien
(HTML, JS, Bilder) sind nicht begrenzt. Werte in `rateLimits` (Helm) bzw. als
Umgebungsvariablen:

| Zone | Pfade | Standard | Helm-Wert |
|---|---|---|---|
| `api` | alle `/api/*` | 120/min, Burst 40 | `rateLimits.api` |
| `rechnen` | POST `/api/mosaike`, `/api/mosaike/{id}/bearbeiten`, `/api/bild/vorschau`, `/api/bild/hintergrund` | 6/min, Burst 4 | `rateLimits.rechnen` |
| `rechnen_conn` | dieselben, gleichzeitig pro IP | 2 | `rateLimits.rechnenGleichzeitig` |
| `rechnen_conn_gesamt` | dieselben, gleichzeitig insgesamt | 6 | `rateLimits.rechnenGleichzeitigGesamt` |
| `preise` | POST `/api/mosaike/{id}/preise` (BrickLink-API) | 3/min, Burst 2 | `rateLimits.preise` |
| `preise_gesamt` | dieselben, alle Besucher zusammen | 1/min, Burst 10 | `rateLimits.preiseGesamt` |
| `schreiben` | POST/PUT/PATCH/DELETE `/api/presets*`, `/api/paletten*`, POST `/api/mosaike/{id}/preset` | 10/min, Burst 5 | `rateLimits.schreiben` |

Gesperrt (immer 404): `/api/actuator/*` (Health, Metriken, Log-Level) und
`/api/teile/aktualisieren`. Den Katalog aktualisiert der CronJob.

Wer ein Limit überschreitet, bekommt `429` mit `{"fehler": "Zu viele Anfragen. …"}` und
`Retry-After: 60`. Das Frontend zeigt die Meldung direkt an.

Rate-Werte in nginx-Schreibweise: `Nr/s` oder `Nr/m`. Burst = so viele Anfragen dürfen
kurzzeitig über der Rate liegen, bevor 429 kommt.

Testen:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<node-ip>/api/bild/vorschau
done
# Erst 422 (kein Bild gesendet), nach Rate + Burst nur noch 429
kubectl -n lego logs deploy/pic2brick | grep limiting   # "limiting requests, … client: <deine IP>"
```

Steht dort die IP des Nodes statt deiner eigenen, fehlt [Schritt 5.1](#51-traefik-echte-client-ip).

Zusätzlich lässt sich in Cloudflare unter **Security → WAF → Rate limiting rules** eine Regel
für `/api/` anlegen (im Free-Plan eine Regel). Sie greift, bevor Anfragen den Server erreichen.

## 7. Updates, Backup, Fehlersuche

**Update**: Committen, `git push`, dann `deploy/k3s/deploy.sh` (oder `NUR=frontend|backend`).
Das Skript wartet auf den CI-Lauf. Lokale, nicht gepushte Änderungen landen nie im Image.

**Zurückrollen**: `helm rollback lego-mosaik -n lego` bzw. ein älterer Tag, z. B.
`BACKEND_TAG=sha-abc1234 NUR=backend deploy/k3s/deploy.sh`.

**Alte Images aufräumen**: k3s räumt ungenutzte Images selbst auf, sobald die Platte voll wird.
Alte Versionen in GHCR löschen: Paketseite → **Package settings → Manage versions**.

**Backup**: Die Volumes liegen bei `local-path` unter `/var/lib/rancher/k3s/storage/` auf dem
Node. Die Datenbank sichert man am besten mit einem Dump:

```bash
kubectl -n lego exec lego-mosaik-postgresql-0 -- pg_dump -U lego lego_mosaik | gzip > lego_mosaik.sql.gz
```

Zusätzlich die Secrets sichern (`kubectl -n lego get secret -o yaml > secrets.yaml`, sicher
aufbewahren). Ohne sie passen Volumes und Zugangsdaten nicht mehr zusammen.

**Komplett entfernen**:

```bash
helm uninstall pic2brick lego-mosaik -n lego
kubectl delete namespace lego      # löscht auch Secrets und Volumes (Daten weg!)
```

| Problem | Ursache / Lösung |
|---|---|
| `ImagePullBackOff` mit `401`/`403` | Paket auf GHCR privat, siehe 5.3 („Public“) |
| `ImagePullBackOff` mit `not found` | Tag gibt es nicht: CI-Lauf fehlgeschlagen oder noch nicht fertig (`gh run list`), Commit nicht gepusht |
| `deploy.sh`: „HEAD ist nicht gepusht“ | Erst `git push`, dann baut CI das Image |
| PVC `lego-mosaik-mosaike` bleibt `Pending` | Synology CSI prüfen: `kubectl -n synology-csi logs synology-csi-controller-0 -c csi-plugin` |
| `http://<node-ip>/` antwortet nicht | Auf diesem Node läuft kein Traefik-Pod, siehe 5.5 |
| Frontend-Pod startet nicht: `host not found in upstream "lego-mosaik"` | Backend noch nicht installiert oder anderer Release-Name → `backend.url` anpassen |
| Seite lädt, aber „Der Server ist nicht erreichbar“ | `kubectl -n lego get pods`; Backend-Logs: `kubectl -n lego logs deploy/lego-mosaik` |
| Alle Besucher teilen ein Limit | Client-IP kommt nicht an, siehe [5.1](#51-traefik-echte-client-ip) bzw. Tunnel nicht auf Port 8081 |
| Probes des Frontends schlagen fehl, nachdem die NetworkPolicy aktiv ist | Netzwerk-Plugin blockiert Kubelet-Probes: `networkPolicy.enabled=false` setzen und melden |
| Cloudflare zeigt `502 Bad Gateway` | Public-Hostname-URL prüfen (`…svc.cluster.local:8081`), cloudflared-Logs ansehen |
| Cloudflare zeigt `524` bei großen Mosaiken | Siehe [Grenzen](#8-grenzen) |
| `413` beim Hochladen | Bild größer als 20 MB |
| Preise: „BrickLink-Zugangsdaten fehlen“ | Secret `lego-mosaik-bricklink` fehlt oder Backend nicht neu gestartet |

## 8. Grenzen

- **Cloudflare bricht Antworten nach 100 Sekunden ab** (Fehler 524, im Free/Pro-Plan nicht
  änderbar). Mosaike entstehen synchron in der Anfrage. Sehr große Mosaike (viele Platten,
  Anleitung) können länger brauchen und gelingen dann nur über die IP im LAN (Timeout 300 s).
  Abhilfe wäre eine Job-Queue im Backend.
- **Kein Login**: Presets und Paletten teilen sich alle Besucher. Jeder kann sie ändern oder
  löschen, nur gebremst durch das Rate Limit. Für das Internet Cloudflare Access vorschalten
  (siehe 5.6).
- **Limits pro Pod**: Mit mehreren Frontend-Replicas vervielfachen sich die Limits.
- **PostgreSQL hängt an `tc-k3s`**: Sein `local-path`-Volume liegt auf dem Node. Fällt er aus,
  steht die Datenbank, bis er wieder da ist.
- **Deploy nicht automatisch**: GitHub Actions baut nur die Images. Der Cluster ist von GitHub
  aus nicht erreichbar, deshalb startet man `deploy.sh` selbst. Ein Self-hosted Runner im
  Cluster ginge, ist bei öffentlichen Repos aber riskant (fremde Pull Requests).
- Das Backend hat selbst kein Rate Limit. Es ist nur geschützt, solange es ausschließlich über
  das Frontend erreichbar ist (`ClusterIP`, kein Ingress).
