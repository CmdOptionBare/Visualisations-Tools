import path from "node:path";
import fs from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const repoRoot = import.meta.dirname;

function readCatalogTools(projectsDir: string): unknown[] {
  if (!fs.existsSync(projectsDir)) return [];
  const tools: unknown[] = [];
  const dirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  for (const dirName of dirs) {
    const manifestPath = path.join(projectsDir, dirName, "project.json");
    if (!fs.existsSync(manifestPath)) continue;
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      continue;
    }
    const kind = manifest.kind;
    if (kind === "local-tool") continue;
    if (kind !== "static" && kind !== "external") continue;

    const id = String(manifest.id ?? dirName);
    const preview = String(manifest.preview ?? "");
    const previewHref = preview ? `/projects/${id}/${preview}` : "";

    let href: string;
    let external = false;
    if (kind === "static") {
      const entry = String(manifest.entry ?? "index.html");
      href =
        entry === "index.html"
          ? `/projects/${id}/`
          : `/projects/${id}/${entry}`;
    } else {
      href = String(manifest.href ?? "");
      external = true;
    }

    tools.push({
      id,
      title: manifest.title,
      summary: manifest.summary,
      kind,
      external,
      href,
      preview: previewHref,
      topic: manifest.topic,
      format: manifest.format,
      dataSource: manifest.dataSource,
      location: manifest.location,
      tags: manifest.tags,
    });
  }

  tools.sort((a, b) =>
    String((a as { id: string }).id).localeCompare(
      String((b as { id: string }).id),
    ),
  );
  return tools;
}

function catalogDevMiddleware(projectsDir: string): Plugin {
  return {
    name: "catalog-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url === "/catalog.json") {
          const body = JSON.stringify(
            { schemaVersion: 1, tools: readCatalogTools(projectsDir) },
            null,
            2,
          );
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(body + "\n");
          return;
        }
        const projectsMatch = /^\/projects\/([^/]+)\/(.*)$/.exec(url);
        if (projectsMatch) {
          const [, projectId, rel] = projectsMatch;
          if (!rel || rel.includes("..")) {
            res.statusCode = 404;
            res.end();
            return;
          }
          const filePath = path.join(projectsDir, projectId, rel);
          const resolved = path.resolve(filePath);
          const base = path.resolve(projectsDir, projectId);
          if (!resolved.startsWith(base + path.sep)) {
            res.statusCode = 403;
            res.end();
            return;
          }
          if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            const ext = path.extname(resolved).toLowerCase();
            const types: Record<string, string> = {
              ".html": "text/html; charset=utf-8",
              ".webp": "image/webp",
              ".js": "text/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".json": "application/json; charset=utf-8",
            };
            res.setHeader(
              "Content-Type",
              types[ext] ?? "application/octet-stream",
            );
            fs.createReadStream(resolved).pipe(res);
            return;
          }
        }
        if (url === "/favicon.ico") {
          const favicon = path.join(repoRoot, "public", "favicon.ico");
          if (fs.existsSync(favicon)) {
            res.setHeader("Content-Type", "image/x-icon");
            fs.createReadStream(favicon).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), catalogDevMiddleware(path.join(repoRoot, "projects"))],
  root: path.resolve(repoRoot, "src/hub"),
  publicDir: false,
  build: {
    outDir: path.resolve(repoRoot, "dist"),
    emptyOutDir: false,
    assetsInlineLimit: 0,
  },
});