# Pic2Brick – Frontend

Web-Oberfläche für den LEGO-Mosaik-Service: Foto hochladen, Größe, Stil und Farben einstellen und das fertige Mosaik direkt im Browser in 3D erkunden, Schritt für Schritt wie in der Bauanleitung.

| Teil | Repo | Inhalt |
| --- | --- | --- |
| Frontend | [LevinTheDoctor/pic2brick](https://github.com/LevinTheDoctor/pic2brick) (dieses Repo) | React, Vite, three.js; nginx-Image, Helm-Chart, k3s-Deployment |
| Backend | [LevinTheDoctor/lego-mosaik](https://github.com/LevinTheDoctor/lego-mosaik) | Python/FastAPI: Bild → Mosaik, Teilelisten, Bauanleitung, Preise; Helm-Chart mit PostgreSQL und Mosaik-Volume (iSCSI) |

Das Frontend rechnet selbst keine Mosaike. Alles Fachliche (Farben, Teile, Anleitung, Preise) kommt über die HTTP-API des Backends. Die Startseite verlinkt beide Repos.

## Lokal starten

```bash
# Backend (im Repo lego-mosaik)
uv run lego-mosaik server          # http://127.0.0.1:8000

# Frontend (hier)
npm install
npm run dev                        # http://localhost:5173
```

Die API-Adresse kommt aus `VITE_API_URL` (Standard `http://127.0.0.1:8000`), z. B. `VITE_API_URL=http://localhost:8080 npm run dev` für die Cloud-Variante des Backends aus `docker compose`.

Liegt lokal ein Ausgabeordner des Backends unter `backend-docs/2026-10-12_234947_Comic/`, zeigt die Startseite im Dev-Modus „Beispiel ansehen“, auch ohne laufenden Server. `backend-docs/` ist nicht im Repo.

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build` | Typprüfung und Produktions-Build nach `dist/` |
| `npm run lint` | oxlint |
| `npm run gen:api` | TypeScript-Typen aus der OpenAPI des laufenden Backends (`src/api/schema.d.ts`) |

## Container

Das `Dockerfile` baut die App mit `VITE_API_URL=/api` und liefert sie mit nginx (unprivilegiert, Port 8080) aus. nginx leitet `/api/` an das Backend weiter, der Browser sieht also nur eine Origin und braucht kein CORS. Gleichzeitig begrenzt nginx die API-Aufrufe pro Client-IP, weil es keine Anmeldung gibt.

```bash
docker build -t pic2brick:dev .
docker run --rm -p 8088:8080 -e BACKEND_URL=http://host.docker.internal:8080 pic2brick:dev
open http://localhost:8088
```

Die nginx-Konfiguration steht in `deploy/nginx/` und wird beim Start aus Umgebungsvariablen gefüllt (`BACKEND_URL`, Rate Limits, Upload-Größe, Timeout). Standardwerte stehen im `Dockerfile`.

## Deployment auf k3s

Frontend und Backend laufen zusammen in einem Namespace. Von außen erreichbar ist nur das Frontend, über die IP des Servers (Traefik) und über einen Cloudflare Tunnel. Das Backend bleibt intern.

```bash
kubectl create namespace lego
kubectl -n lego create secret generic cloudflared-tunnel --from-literal=token='…'
deploy/k3s/deploy.sh    # baut die Images im Cluster (BuildKit-Pod) und installiert beide Charts
```

Dafür reichen `kubectl` und `helm`, Docker und SSH sind nicht nötig. Die einzelnen Schritte zum Nachmachen stehen in Abschnitt 5 der Anleitung.

Alle Secrets und Einstellungen, die Schritte im Einzelnen, die Rate Limits und die Fehlersuche: **[deploy/KONFIGURATION.md](deploy/KONFIGURATION.md)**.

| Pfad | Inhalt |
| --- | --- |
| `Dockerfile`, `deploy/nginx/` | Image: SPA + Proxy auf das Backend + Rate Limiting |
| `deploy/helm/pic2brick/` | Helm-Chart: nginx, Ingress (Traefik), cloudflared, NetworkPolicy |
| `deploy/k3s/` | Werte für beide Charts, Traefik-Einstellung, `deploy.sh` |
| `deploy/KONFIGURATION.md` | Anleitung und vollständige Konfiguration |

## Was es kann

- **Schnellvorschau:** Das Foto wird sofort im Browser verpixelt. Format, Ausschnitt, Kontrast, Sättigung und Oberflächen wirken ohne Wartezeit. Sind Bildfelder gesetzt, kommt das Foto bearbeitet vom Server (`/bild/vorschau`), die Vorschau zeigt also genau, was ins Mosaik geht.
- **Foto bearbeiten:** In der Ansicht „Foto“ dreht und spiegelt man das Bild und zieht den Ausschnitt direkt auf dem Foto auf, auf Wunsch im Seitenverhältnis des Mosaiks. Farbfilter erscheinen als Kacheln mit Vorschaubild. Helligkeit, Kontrast und Sättigung stellt man mit Reglern ein.
- **Hintergrund:** `/bild/hintergrund` erkennt einen einfarbigen Hintergrund gleich beim Hochladen. Ein Klick ersetzt ihn durch die passende LEGO-Farbe; man kann ihn auch aufhellen, abdunkeln, entsättigen oder weichzeichnen. Die Maske lässt sich über dem Foto einblenden.
- **Presets und Paletten:** Einstellungen speichert man als Preset (mit Favorit und Sternen) und wendet sie mit einem Klick an. Eigene Farbpaletten legt man aus dem Katalog an oder übernimmt sie aus einem fertigen Mosaik.
- **Noppen bearbeiten:** In der Ansicht „Bearbeiten“ färbt man einzelne Noppen mit Pinsel, Rechteck, Farbeimer oder Pipette um, mit Rückgängig (⌘Z). „Übernehmen“ schickt den Endzustand an `/mosaike/{id}/bearbeiten`. Der Server rechnet daraus ein neues Mosaik, und „Vorherige Version“ führt zurück.
- **Einstellungen aus `/optionen`:** Neue Verfahren des Servers erscheinen automatisch. Gesendet wird nur, was geändert wurde. Die Server-Regeln werden schon vorher geprüft.
- **3D-Ansicht der `mosaik.ldr`:** Die Teile werden prozedural mit three.js erzeugt (keine LDraw-Bibliothek nötig). Dazu gibt es einen Bauschritt-Regler mit Abspielen. Beim Überfahren erscheinen Name und Farbe des Teils. Ein Klick auf eine Farbe zeigt, wo sie hinkommt.
- **Draufsicht, Bauanleitung (Seiten blättern), Teileliste und Downloads** für BrickLink, Rebrickable und LEGO Pick a Brick.
- **Kosten:** „Preis schätzen“ fragt über den Server den BrickLink Price Guide ab (Ø Verkäufe der letzten 6 Monate, dazu aktuelle Angebote) und zeigt die Einzelpreise. Der Server braucht dafür BrickLink-Zugangsdaten, ohne sie gehen nur gespeicherte Preise.
- **Bei BrickLink bestellen:** Die Wanted List landet per Klick in der Zwischenablage, danach öffnet man die Upload-Seite von BrickLink und fügt sie dort ein.
- **Zuletzt gebaute Mosaike** merkt sich der Browser, weil das Backend keine Liste hat.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/api/` | Typen aus der OpenAPI des laufenden Servers (`npm run gen:api`) und fetch-Wrapper |
| `src/lib/ldraw.ts` | LDR-Parser mit Bauschritten und Abschnitten |
| `src/lib/parts.ts` | Teilegeometrie: Tabelle der Teilnummern, Fallback über den Teilenamen |
| `src/lib/photo.ts` | Bildfelder, Ausschnitt, Drehen/Spiegeln |
| `src/lib/raster.ts` | Noppen-Editor: Pinsel, Rechteck, Füllen, Änderungen für den Server |
| `src/lib/links.ts` | Links auf die Repos von Frontend und Backend |
| `src/three/MosaicScene.ts` | Szene, Instancing, Bauschritte, Picking, Farbfokus |
| `src/components/` | Glasflächen, Formular, Dock, Ansichten |
| `src/styles/` | Tokens, Liquid-Glass-Material, Layout |
| `deploy/` | Container-Konfiguration, Helm-Chart, k3s (siehe oben) |

Die Ausrichtung der Formteile (Viertelkreis, Halbkreis, Keile) ist an der `vorschau.png` eines Backend-Ergebnisses abgeglichen. Kommt ein unbekanntes Teil vor, liest `parts.ts` die Maße aus dem Namen in `teileliste.csv`. Gelingt auch das nicht, erscheint ein 1×1-Block.
