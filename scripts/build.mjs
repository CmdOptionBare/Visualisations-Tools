#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { build as viteBuild } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  let projectsDir = path.join(repoRoot, "projects");
  let outDir = path.join(repoRoot, "dist");
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--projects-dir" && argv[i + 1]) {
      projectsDir = path.resolve(argv[++i]);
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    }
  }
  return { projectsDir, outDir };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveInsideProject(projectDir, relPath, manifestPath, fieldName) {
  if (typeof relPath !== "string" || relPath.trim() === "") {
    fail(`${manifestPath}: field "${fieldName}" must be a non-empty string`);
  }
  const trimmed = relPath.trim();
  if (trimmed.startsWith("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    fail(
      `${manifestPath}: field "${fieldName}" must be a relative path inside the project directory`,
    );
  }
  const resolved = path.resolve(projectDir, trimmed);
  const base = path.resolve(projectDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    fail(
      `${manifestPath}: field "${fieldName}" resolves outside the project directory`,
    );
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`${manifestPath}: field "${fieldName}" file not found: ${trimmed}`);
  }
  return trimmed;
}

function requireNonEmptyString(manifestPath, fieldName, value) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${manifestPath}: field "${fieldName}" must be a non-empty string`);
  }
  return value.trim();
}

function loadManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (err) {
    fail(`${manifestPath}: cannot read file (${err.message})`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${manifestPath}: invalid JSON (${err.message})`);
  }
}

const FORBIDDEN_FIELDS = ["build", "buildCommand", "command", "scripts"];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateManifest(manifestPath, projectDir, dirName, seenIds) {
  const m = loadManifest(manifestPath);

  for (const field of FORBIDDEN_FIELDS) {
    if (field in m) {
      fail(`${manifestPath}: field "${field}" is not allowed`);
    }
  }

  if (m.schemaVersion !== 1) {
    fail(`${manifestPath}: field "schemaVersion" must equal 1`);
  }

  const id = requireNonEmptyString(manifestPath, "id", m.id);
  if (!ID_PATTERN.test(id)) {
    fail(`${manifestPath}: field "id" must match slug pattern`);
  }
  if (id !== dirName) {
    fail(
      `${manifestPath}: field "id" must equal folder name "${dirName}"`,
    );
  }
  if (seenIds.has(id)) {
    fail(`${manifestPath}: field "id" duplicate project id "${id}"`);
  }
  seenIds.add(id);

  const title = requireNonEmptyString(manifestPath, "title", m.title);
  const summary = requireNonEmptyString(manifestPath, "summary", m.summary);
  const topic = requireNonEmptyString(manifestPath, "topic", m.topic);
  const format = requireNonEmptyString(manifestPath, "format", m.format);
  const dataSource = requireNonEmptyString(
    manifestPath,
    "dataSource",
    m.dataSource,
  );
  const location = requireNonEmptyString(manifestPath, "location", m.location);

  if (!Array.isArray(m.tags) || m.tags.length === 0) {
    fail(`${manifestPath}: field "tags" must be a non-empty array`);
  }
  const tags = m.tags.map((tag, index) => {
    if (typeof tag !== "string" || tag.trim() === "") {
      fail(
        `${manifestPath}: field "tags[${index}]" must be a non-empty string`,
      );
    }
    return tag.trim();
  });

  const kind = requireNonEmptyString(manifestPath, "kind", m.kind);
  if (kind !== "static" && kind !== "external" && kind !== "local-tool") {
    fail(
      `${manifestPath}: field "kind" must be "static", "external", or "local-tool"`,
    );
  }

  let entry;
  let href;
  let preview;

  if (kind === "static") {
    entry = resolveInsideProject(
      projectDir,
      m.entry,
      manifestPath,
      "entry",
    );
    preview = resolveInsideProject(
      projectDir,
      m.preview,
      manifestPath,
      "preview",
    );
    href =
      entry === "index.html"
        ? `/projects/${id}/`
        : `/projects/${id}/${entry}`;
  } else if (kind === "external") {
    href = requireNonEmptyString(manifestPath, "href", m.href);
    let parsed;
    try {
      parsed = new URL(href);
    } catch {
      fail(`${manifestPath}: field "href" must be a valid URL`);
    }
    if (parsed.protocol !== "https:") {
      fail(`${manifestPath}: field "href" must use https:`);
    }
    preview = resolveInsideProject(
      projectDir,
      m.preview,
      manifestPath,
      "preview",
    );
  } else if (m.preview !== undefined && m.preview !== null && m.preview !== "") {
    preview = resolveInsideProject(
      projectDir,
      m.preview,
      manifestPath,
      "preview",
    );
  }

  return {
    manifest: m,
    id,
    title,
    summary,
    kind,
    topic,
    format,
    dataSource,
    location,
    tags,
    entry,
    href:
      kind === "external"
        ? href
        : entry === "index.html"
          ? `/projects/${id}/`
          : `/projects/${id}/${entry}`,
    previewPath: preview,
    external: kind === "external",
  };
}

function scanProjects(projectsDir) {
  if (!fs.existsSync(projectsDir)) {
    return [];
  }
  const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const seenIds = new Set();
  const projects = [];

  for (const dirName of dirs) {
    const projectDir = path.join(projectsDir, dirName);
    const manifestPath = path.join(projectDir, "project.json");
    if (!fs.existsSync(manifestPath)) {
      fail(`${manifestPath}: missing project.json in projects/${dirName}/`);
    }
    projects.push(
      validateManifest(manifestPath, projectDir, dirName, seenIds),
    );
  }

  return projects;
}

function catalogEntry(project) {
  if (project.kind === "local-tool") return null;
  return {
    id: project.id,
    title: project.title,
    summary: project.summary,
    kind: project.kind,
    external: project.external,
    href: project.href,
    preview: `/projects/${project.id}/${project.previewPath}`,
    topic: project.topic,
    format: project.format,
    dataSource: project.dataSource,
    location: project.location,
    tags: project.tags,
  };
}

function copyPublic(repoPublic, distDir) {
  if (!fs.existsSync(repoPublic)) return;
  fs.cpSync(repoPublic, distDir, { recursive: true });
}

function shouldSkipCopy(name) {
  return name === "project.json" || name === ".DS_Store";
}

function copyStaticProject(projectDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(projectDir)) {
    if (shouldSkipCopy(name)) continue;
    const src = path.join(projectDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, {
        recursive: true,
        filter: (source) => {
          const base = path.basename(source);
          return !shouldSkipCopy(base);
        },
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function copyExternalPreview(projectDir, destDir, previewRel) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(
    path.join(projectDir, previewRel),
    path.join(destDir, previewRel),
  );
}

async function main() {
  const { projectsDir, outDir } = parseArgs(process.argv);
  const projects = scanProjects(projectsDir);

  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  execSync("pnpm exec tsc --noEmit", { cwd: repoRoot, stdio: "inherit" });

  await viteBuild({
    configFile: path.join(repoRoot, "vite.config.ts"),
    build: {
      outDir,
      emptyOutDir: false,
    },
  });

  copyPublic(path.join(repoRoot, "public"), outDir);

  const projectsOut = path.join(outDir, "projects");
  for (const project of projects) {
    const projectDir = path.join(projectsDir, project.id);
    if (project.kind === "static") {
      copyStaticProject(projectDir, path.join(projectsOut, project.id));
    } else if (project.kind === "external") {
      copyExternalPreview(
        projectDir,
        path.join(projectsOut, project.id),
        project.previewPath,
      );
    }
  }

  const tools = projects
    .map(catalogEntry)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  const catalog = { schemaVersion: 1, tools };
  const catalogPath = path.join(outDir, "catalog.json");
  fs.writeFileSync(
    catalogPath,
    JSON.stringify(catalog, null, 2) + "\n",
    "utf8",
  );

  console.log(`Wrote ${catalogPath} (${tools.length} tools)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});