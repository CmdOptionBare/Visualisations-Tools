const PAGE_SIZE = 10;

const FILTERS = [
  { key: "topic" as const, label: "Thema" },
  { key: "format" as const, label: "Darstellung" },
  { key: "dataSource" as const, label: "Datenquelle" },
  { key: "location" as const, label: "Bereitstellung" },
];

type FilterKey = (typeof FILTERS)[number]["key"];

type CatalogTool = {
  id: string;
  title: string;
  summary: string;
  kind?: string;
  href: string;
  external: boolean;
  preview: string;
  topic: string;
  format: string;
  dataSource: string;
  location: string;
  tags: string[];
};

type Catalog = {
  schemaVersion?: number;
  tools: CatalogTool[];
};

const state = {
  tools: [] as CatalogTool[],
  query: "",
  page: 1,
  selected: {
    topic: new Set<string>(),
    format: new Set<string>(),
    dataSource: new Set<string>(),
    location: new Set<string>(),
  } as Record<FilterKey, Set<string>>,
};

const searchInput = document.getElementById("search") as HTMLInputElement;
const filtersRoot = document.getElementById("filters") as HTMLElement;
const countEl = document.getElementById("count") as HTMLElement;
const resetButton = document.getElementById("reset") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;
const emptyEl = document.getElementById("empty") as HTMLElement;
const gridEl = document.getElementById("grid") as HTMLElement;
const pagerEl = document.getElementById("pager") as HTMLElement;
const prevButton = document.getElementById("prev") as HTMLButtonElement;
const nextButton = document.getElementById("next") as HTMLButtonElement;
const pageLabel = document.getElementById("page-label") as HTMLElement;

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  state.page = 1;
  render();
});

resetButton.addEventListener("click", () => {
  state.query = "";
  state.page = 1;
  searchInput.value = "";
  for (const { key } of FILTERS) state.selected[key].clear();
  render();
});

filtersRoot.addEventListener("click", (event) => {
  const button = (event.target as Element).closest(
    "button[data-key]",
  ) as HTMLButtonElement | null;
  if (!button) return;
  const key = button.dataset.key as FilterKey;
  const selected = state.selected[key];
  const value = button.dataset.value ?? "";
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  state.page = 1;
  render();
});

prevButton.addEventListener("click", () => {
  if (state.page <= 1) return;
  state.page -= 1;
  render();
});

nextButton.addEventListener("click", () => {
  state.page += 1;
  render();
});

function haystack(tool: CatalogTool): string {
  return [
    tool.title,
    tool.summary,
    tool.topic,
    tool.format,
    tool.dataSource,
    tool.location,
    ...(Array.isArray(tool.tags) ? tool.tags : []),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function matchingTools(): CatalogTool[] {
  const terms = state.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return state.tools.filter((tool) => {
    for (const { key } of FILTERS) {
      const chosen = state.selected[key];
      if (chosen.size > 0 && !chosen.has(String(tool[key] ?? ""))) return false;
    }
    if (terms.length === 0) return true;
    const text = haystack(tool);
    return terms.every((term) => text.includes(term));
  });
}

function uniqueValues(key: FilterKey): string[] {
  const values = new Set<string>();
  for (const tool of state.tools) {
    const value = String(tool[key] ?? "").trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, "de"));
}

function buildFilters(): void {
  filtersRoot.replaceChildren();
  for (const { key, label } of FILTERS) {
    const group = document.createElement("fieldset");
    group.className = "filter-group";
    const legend = document.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const value of uniqueValues(key)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.dataset.key = key;
      button.dataset.value = value;
      button.textContent = value;
      button.setAttribute("aria-pressed", "false");
      chips.append(button);
    }
    group.append(chips);
    filtersRoot.append(group);
  }
}

function syncFilterButtons(): void {
  for (const button of filtersRoot.querySelectorAll<HTMLButtonElement>(
    "button[data-key]",
  )) {
    const on = state.selected[button.dataset.key as FilterKey].has(
      button.dataset.value ?? "",
    );
    button.classList.toggle("is-selected", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function card(tool: CatalogTool): HTMLElement {
  const article = document.createElement("article");
  article.className = "card";

  const link = document.createElement("a");
  link.className = "card-link";
  link.href = tool.href;
  if (tool.external) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  const frame = document.createElement("div");
  frame.className = "thumb-frame";
  const image = document.createElement("img");
  image.className = "thumb";
  image.src = tool.preview;
  image.alt = "";
  frame.append(image);

  const badge = document.createElement("span");
  badge.className = tool.external ? "badge badge-external" : "badge";
  badge.textContent =
    tool.location || (tool.external ? "Externe App" : "Im Portal");
  frame.append(badge);

  const body = document.createElement("div");
  body.className = "card-body";
  const title = document.createElement("h2");
  title.textContent = tool.title;
  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = tool.summary;
  const chips = document.createElement("ul");
  chips.className = "meta";
  for (const value of [tool.topic, tool.format, tool.dataSource]) {
    if (!value) continue;
    const item = document.createElement("li");
    item.textContent = value;
    chips.append(item);
  }
  body.append(title, summary, chips);
  link.append(frame, body);
  article.append(link);
  return article;
}

function render(): void {
  const matched = matchingTools();
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  if (state.page > pageCount) state.page = pageCount;
  if (state.page < 1) state.page = 1;
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = matched.slice(start, start + PAGE_SIZE);

  const noun = matched.length === 1 ? "Werkzeug" : "Werkzeuge";
  countEl.textContent = `${matched.length} ${noun}`;

  gridEl.replaceChildren(...visible.map(card));
  emptyEl.hidden = matched.length !== 0;

  const showPager = matched.length > PAGE_SIZE;
  pagerEl.hidden = !showPager;
  if (showPager) {
    const end = start + visible.length;
    pageLabel.textContent = `Zeige ${start + 1}–${end} von ${matched.length}`;
    prevButton.disabled = state.page <= 1;
    nextButton.disabled = state.page >= pageCount;
  } else {
    pageLabel.textContent = "";
  }

  syncFilterButtons();
}

function showStatus(message: string): void {
  statusEl.hidden = false;
  statusEl.textContent = message;
}

async function init(): Promise<void> {
  try {
    const response = await fetch("./catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const catalog = (await response.json()) as Catalog;
    state.tools = Array.isArray(catalog.tools) ? catalog.tools : [];
    statusEl.hidden = true;
    buildFilters();
    render();
  } catch {
    countEl.textContent = "0 Werkzeuge";
    showStatus("Der Katalog konnte nicht geladen werden.");
  }
}

void init();