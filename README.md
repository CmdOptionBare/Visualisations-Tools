# Visualisations-Tools

Deutsches Portal für interaktive Visualisierungen und verlinkte externe Apps. Der Build erzeugt aus `projects/*/project.json` eine Startseite (`src/hub/`) sowie `dist/catalog.json` und kopiert statische Projekte nach `dist/projects/<id>/`.

## Verzeichnisbaum

```text
.
├── src/hub/              # Vite-Hub (TypeScript, Tailwind): index.html, main.ts, styles.css
├── projects/             # Ein Unterordner pro Werkzeug inkl. project.json
├── templates/            # Platzhalter für künftige wiederverwendbare Vorlagen (README only)
├── public/               # Statische Dateien fürs Root (z. B. favicon.ico) → dist/
├── scripts/build.mjs     # Typecheck, Vite-Build, Katalog, Kopie statischer Projekte
├── dist/                 # Build-Ausgabe (generiert, nicht versionieren)
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
└── vercel.json           # trailingSlash, Redirects, CSP-Header
```

`dist/` entsteht nur durch `pnpm run build` und gehört nicht ins Git (siehe `.gitignore`).

Unter `templates/` liegen derzeit **keine** generischen `blank`- oder `hello`-Vorlagen — nur eine Erklärung für spätere Templates (`templates/README.md`).

`projects/c4-studio-diagramm/` ist eine **lokale** Python-/Structurizr-Arbeitsumgebung. Sie wird vom Build **nicht** nach `dist/` kopiert (`kind: "local-tool"`), läuft aber mit `project.json` im Repo, damit der Katalog-Validator sie kennt.

## `project.json`-Schema

Jedes Werkzeug lebt in `projects/<id>/project.json`. Pflichtfelder (Auszug):

| Feld | Bedeutung |
|------|-----------|
| `schemaVersion` | Muss `1` sein |
| `id` | Kleinbuchstaben, Bindestriche; **muss** dem Ordnernamen entsprechen |
| `title`, `summary` | Anzeige im Hub |
| `kind` | `static`, `external` oder `local-tool` |
| `topic`, `format`, `dataSource`, `location` | Filter und Metadaten |
| `tags` | Nicht-leeres String-Array |

Zusätzlich je nach `kind`:

- **`static`**: `entry` (relativer Pfad zur HTML-Datei im Projektordner), `preview` (relatives Vorschaubild, z. B. `preview.webp`)
- **`external`**: `href` (`https://…`), `preview`
- **`local-tool`**: kein Deploy; `preview` optional

Der Build lehnt unbekannte Felder wie `build`, `buildCommand` oder `command` in `project.json` ab.

## Die drei `kind`-Werte

| `kind` | Verhalten |
|--------|-----------|
| `static` | HTML/Assets werden nach `dist/projects/<id>/` kopiert; Hub-Link zeigt auf `/projects/<id>/` (bzw. auf `entry`, wenn nicht `index.html`) |
| `external` | Nur Vorschaubild ins `dist/`; Karte öffnet die `href`-URL in einem neuen Tab |
| `local-tool` | Erscheint nicht unter `dist/projects/`; dokumentiert lokale Tools im Repo |

## Neues statisches HTML-/JSON-Werkzeug

1. Ordner anlegen: `projects/mein-werkzeug/`
2. `projects/mein-werkzeug/project.json` mit `kind: "static"`, passender `id`, Pflichtfeldern, `entry` und `preview`
3. `projects/mein-werkzeug/index.html` (und ggf. JS/CSS) anlegen
4. Vorschaubild `projects/mein-werkzeug/preview.webp` (Querformat 16:10 empfohlen)
5. Lokale Daten per **relativer** Same-Origin-URL laden (wichtig für Vercel mit `trailingSlash`):

   ```js
   const data = await fetch("./data/beispiel.json").then((r) => r.json());
   ```

6. `pnpm run build` — Eintrag landet automatisch in `dist/catalog.json` und die Dateien unter `dist/projects/mein-werkzeug/`.

## Externe App verlinken

1. Ordner `projects/mein-link/` mit `project.json`:
   - `"kind": "external"`
   - `"href": "https://meine-app.vercel.app/"`
   - `"preview": "preview.webp"` (Bild im selben Ordner)
   - übrige Pflicht-Metadaten wie oben
2. `preview.webp` ablegen
3. Build — Hub zeigt die Karte; Klick öffnet die externe `href`.

## Lokale Entwicklung und Build

Voraussetzung: [pnpm](https://pnpm.io/).

```sh
pnpm install --frozen-lockfile
pnpm run build      # dist/ erzeugen (Hub + catalog.json + statische Projekte)
pnpm run preview    # Vite preview auf dist/
pnpm run dev        # Dev-Server für src/hub/ (Katalog/Projekte per Middleware)
```

`pnpm run typecheck` prüft TypeScript ohne Emit.

## Deployment auf Vercel

Im Vercel-Dashboard (Framework Preset **Other**):

| Einstellung | Wert |
|-------------|------|
| Framework Preset | **Other** |
| Root Directory | `.` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | `dist` |

`vercel.json` setzt `trailingSlash: true`, leitet alte Pfade `/first-principles-graph` und `/kognitiv-graph` permanent auf `/projects/…` um und definiert CSP-Header (streng global, angepasst für die beiden Graph-Projekte).

## C4 Studio (lokal)

`projects/c4-studio-diagramm/` enthält Server, DSL-Projekte und Structurizr-Tools zum lokalen Arbeiten. Siehe `projects/c4-studio-diagramm/README.md` und Startskripte dort — **nicht** Teil der statischen Vercel-Auslieferung.