const PAGE_SIZE = 10;

const FILTERS = [
  { key: "topic", label: "Thema" },
  { key: "format", label: "Darstellung" },
  { key: "dataSource", label: "Datenquelle" },
  { key: "location", label: "Bereitstellung" },
];

const state = {
  tools: [],
  query: "",
  page: 1,
  selected: {
    topic: new Set(),
    format: new Set(),
    dataSource: new Set(),
    location: new Set(),
  },
};

const searchInput = document.getElementById("search");
const filtersRoot = document.getElementById("filters");
const countEl = document.getElementById("count");
const resetButton = document.getElementById("reset");
const statusEl = document.getElementById("status");
const emptyEl = document.getElementById("empty");
const gridEl = document.getElementById("grid");
const pagerEl = document.getElementById("pager");
const prevButton = document.getElementById("prev");
const nextButton = document.getElementById("next");
const pageLabel = document.getElementById("page-label");

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
  const button = event.target.closest("button[data-key]");
  if (!button) return;
  const selected = state.selected[button.dataset.key];
  const value = button.dataset.value;
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

function haystack(tool) {
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

function matchingTools() {
  const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
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

function uniqueValues(key) {
  const values = new Set();
  for (const tool of state.tools) {
    const value = String(tool[key] ?? "").trim();
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b, "de"));
}

function buildFilters() {
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

function syncFilterButtons() {
  for (const button of filtersRoot.querySelectorAll("button[data-key]")) {
    const on = state.selected[button.dataset.key].has(button.dataset.value);
    button.classList.toggle("is-selected", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function card(tool) {
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
  badge.textContent = tool.location || (tool.external ? "Externe App" : "Im Portal");
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

function render() {
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

function showStatus(message) {
  statusEl.hidden = false;
  statusEl.textContent = message;
}

async function init() {
  try {
    const url = new URL("../data/catalog.json", import.meta.url);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const catalog = await response.json();
    state.tools = Array.isArray(catalog.tools) ? catalog.tools : [];
    statusEl.hidden = true;
    buildFilters();
    render();
  } catch {
    countEl.textContent = "0 Werkzeuge";
    showStatus("Der Katalog konnte nicht geladen werden.");
  }
}

init();
