# Pic2Brick – Frontend

Web-Oberfläche für den lokalen `lego-mosaik`-Server: Foto hochladen, Größe, Stil und Farben einstellen und das fertige Mosaik direkt im Browser in 3D erkunden, Schritt für Schritt wie in der Bauanleitung.

## Starten

```bash
# Backend (im Backend-Ordner)
uv run lego-mosaik server          # http://127.0.0.1:8000

# Frontend
npm install
npm run dev                        # http://localhost:5173
```

Eine andere API-Adresse setzt man mit `VITE_API_URL=http://… npm run dev`.

Liegt lokal ein Ausgabeordner des Backends unter `backend-docs/2026-10-12_234947_Comic/`, zeigt die Startseite im Dev-Modus „Beispiel ansehen“, auch ohne laufenden Server. `backend-docs/` ist nicht im Repo.

## Was es kann

- **Schnellvorschau:** Das Foto wird sofort im Browser verpixelt. Format, Ausschnitt, Kontrast, Sättigung und Oberflächen wirken ohne Wartezeit.
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
| `src/three/MosaicScene.ts` | Szene, Instancing, Bauschritte, Picking, Farbfokus |
| `src/components/` | Glasflächen, Formular, Dock, Ansichten |
| `src/styles/` | Tokens, Liquid-Glass-Material, Layout |

Die Ausrichtung der Formteile (Viertelkreis, Halbkreis, Keile) ist an der `vorschau.png` eines Backend-Ergebnisses abgeglichen. Kommt ein unbekanntes Teil vor, liest `parts.ts` die Maße aus dem Namen in `teileliste.csv`. Gelingt auch das nicht, erscheint ein 1×1-Block.
