# Visualisations-Tools

Static multi-visualization site for **Vercel**. Each visualization is a folder with an `index.html`, served at `/<slug>/`. The public start page is the German catalog in `data/catalog.json`.

## Werkzeug auf die Startseite setzen

Die Startseite liest nur `data/catalog.json`. Ein weiteres Werkzeug braucht genau zwei Dinge: ein Vorschaubild und einen Eintrag. `index.html` bleibt unverändert. Die Seite zeigt immer höchstens zehn Treffer; ab dem elften erscheint die Blätterleiste von selbst. Filter entstehen aus den Werten, die in der Datei stehen.

1. Bild ablegen, Querformat 16:10: `assets/previews/mein-werkzeug.webp`
2. In `data/catalog.json` im Array `tools` ein Objekt ergänzen:

```json
{
  "id": "mein-werkzeug",
  "title": "Anzeigename",
  "summary": "Ein Satz, was man damit sieht.",
  "href": "/mein-werkzeug/",
  "external": false,
  "preview": "assets/previews/mein-werkzeug.webp",
  "topic": "Thema",
  "format": "Darstellung",
  "dataSource": "Datenquelle",
  "location": "Im Portal",
  "tags": ["Stichwort"]
}
```

Eine Seite außerhalb dieses Portals bekommt `"external": true`, `"location": "Externe App"` und eine volle `https://`-Adresse in `href`. Die Karte öffnet sie dann in einem neuen Fenster.

`examples/blank/` und `examples/hello/` bleiben Kopiervorlagen im Repo. Sie stehen nicht im Katalog und damit nicht auf der Startseite.

## Layout

```text
.
├── index.html                 # German catalog hub
├── data/catalog.json          # Tools shown on the start page
├── assets/previews/           # 16:10 card images
├── vercel.json                # trailingSlash so /slug → /slug/
├── shared/                    # Reusable CSS/JS (relative: ../shared/…)
│   ├── hub.css
│   ├── hub.js                 # Search, filters, 10-per-page catalog
│   └── load-json.js
├── examples/blank/            # Starter template, not listed on the hub
│   ├── index.html
│   └── data/sample.json
├── examples/hello/            # JSON demo, not listed on the hub
│   ├── index.html
│   └── data/sample.json
├── first-principles-graph/    # Existing viz (moved from root HTML)
│   └── index.html
├── kognitiv-graph/            # Existing viz (moved from root HTML)
│   └── index.html
└── c4-studio-diagramm/        # Local Python workbench (not static Vercel)
```

## URL mapping

| Folder | URL on Vercel |
|--------|----------------|
| `index.html` | `https://<project>.vercel.app/` |
| `examples/blank/` | `https://<project>.vercel.app/examples/blank/` |
| `examples/hello/` | `https://<project>.vercel.app/examples/hello/` |
| `first-principles-graph/` | `https://<project>.vercel.app/first-principles-graph/` |
| `kognitiv-graph/` | `https://<project>.vercel.app/kognitiv-graph/` |

Vercel serves each folder’s `index.html` automatically (Framework Preset: **Other** / static). `vercel.json` sets `trailingSlash: true` so relative asset paths stay correct.

## Add a new visualization

1. Create a folder at the repo root (or under `examples/`), e.g. `my-viz/`.
2. Add `my-viz/index.html`.
3. Optional local data: `my-viz/data/*.json` and fetch with a **relative** URL:

   ```js
   const data = await fetch("./data/foo.json").then((r) => r.json());
   // or: import { loadJson } from "../shared/load-json.js";
   //     const data = await loadJson("./data/foo.json");
   ```

4. Optional shared helpers/styles: `../shared/hub.css`, `../shared/load-json.js` (one more `../` if nested under `examples/`).
5. Add the page to `data/catalog.json` and put a preview in `assets/previews/`. See „Werkzeug auf die Startseite setzen“.

### Path rules

- Same-folder data/scripts: `./data/foo.json`, `./chart.js`
- Shared assets from a root-level viz: `../shared/...`
- Shared assets from `examples/<slug>/`: `../../shared/...`
- Prefer relative URLs over absolute `/…` so pages also work when opened from disk or preview paths.

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework Preset: **Other** (static). Build command empty; output directory: `.` (repo root).
3. Deploy. Open `/` for the hub, or any `/<slug>/` above.

Local preview without Vercel:

```sh
npx --yes serve .
# or: python3 -m http.server 8080
```

Then open `http://localhost:3000/` (or the port printed / `8080`).

## c4-studio-diagramm (local only)

`c4-studio-diagramm/` is a Structurizr DSL workbench with a Python server. It is **not** deployed as a static Vercel route. See `c4-studio-diagramm/README.md` and run `bash start.sh` locally.
