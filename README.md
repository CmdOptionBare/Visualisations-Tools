# Visualisations-Tools

Static multi-visualization site for **Vercel**. Each visualization is a folder with an `index.html`, served at `/<slug>/`.

## Layout

```text
.
├── index.html                 # Hub listing available viz pages
├── vercel.json                # trailingSlash so /slug → /slug/
├── shared/                    # Reusable CSS/JS (relative: ../shared/…)
│   ├── hub.css
│   └── load-json.js
├── examples/blank/            # Starter template: local JSON + loadJson
│   ├── index.html
│   └── data/sample.json
├── examples/hello/            # Demo: fetches local JSON
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
5. Link the page from the root `index.html` hub list.

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
