(() => {
    'use strict';

    const SPREADSHEET_ID = '1nuasNX1LQj-OgxAAJsrIOklqbwuWST_I7xR3LEKm_js';
    const FETCH_TIMEOUT_MS = 12000;

    const CATEGORY_COLORS = {
        'Paradigma': '#38bdf8',
        'Form-Bedeutungs-Paar': '#818cf8',
        'Wissensstruktur': '#a78bfa',
        'Körperliche Verankerung': '#34d399',
        'Sensomotorik': '#2dd4bf',
        'Mentale Simulation': '#22d3ee',
        'Interaktion & Dynamik': '#f472b6',
        'Soziale Handlung': '#fb7185',
        'Koordination': '#fbbf24',
        'Klassisch: Form': '#f59e0b',
        'Klassisch: Referenz': '#fb923c',
        'Klassisch: Gebrauch': '#f97316',
    };

    const FALLBACK_COLORS = [
        '#38bdf8', '#34d399', '#a78bfa', '#f472b6',
        '#fbbf24', '#22d3ee', '#fb7185', '#818cf8',
    ];

    const FIELD_LABELS = {
        id: 'ID',
        model: 'Modell',
        category: 'Kategorie',
        theorists: 'Schlüsselautor:innen / Theorie',
        core_concept: 'Kernkonzept',
        sentence_analysis: 'Analyse am Beispielsatz',
        classical_contrast: 'Kontrast zur klassischen Semiotik',
        tooltip_short: 'Kurzfassung',
        relation_type: 'Relationstyp',
        label: 'Beschriftung',
        strength: 'Bindungsstärke',
        description: 'Beschreibung',
        source: 'Quelle',
        target: 'Ziel',
        word_role: 'Grammatische Rolle',
        embodied_layer: 'Verkörperte / sensomotorische Ebene',
        construction_layer: 'Konstruktionsgrammatische Ebene',
        interactional_layer: 'Interaktionale & soziale Ebene',
        classic_morris_split: 'Klassische Morris-Zerlegung (1938)',
        linked_node_ids: 'Verknüpfte Knoten-IDs',
    };

    const state = {
        allNodes: [],
        allEdges: [],
        allTokens: [],
        currentModel: 'modern',
        selection: null, // { type: 'node' | 'edge' | 'token', id: string }
        sourceMode: 'init', // 'init' | 'live' | 'manual' | 'error'
        loadGeneration: 0,
        activeFetchController: null,
        simulation: null,
        svg: null,
        zoomBehavior: null,
        zoomLayer: null,
        activeNodes: [],
        activeEdges: [],
        categoryColorMap: new Map(),
        resizeObserver: null,
        hasAutoFitted: false,
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildSheetCsvUrl(sheetName) {
        return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(SPREADSHEET_ID)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    }

    function parseCsvFallback(text) {
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;
        const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
        for (let i = 0; i < clean.length; i++) {
            const ch = clean[i];
            if (quoted) {
                if (ch === '"' && clean[i + 1] === '"') {
                    field += '"';
                    i++;
                } else if (ch === '"') {
                    quoted = false;
                } else {
                    field += ch;
                }
            } else if (ch === '"' && field === '') {
                quoted = true;
            } else if (ch === ',') {
                row.push(field);
                field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && clean[i + 1] === '\n') i++;
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else {
                field += ch;
            }
        }
        if (quoted) {
            throw new Error('CSV enthält ein nicht abgeschlossenes Anführungszeichen');
        }
        if (field || row.length) {
            row.push(field);
            rows.push(row);
        }
        const headers = (rows.shift() || []).map(h => h.trim());
        return rows
            .filter(values => values.some(v => v.trim() !== ''))
            .map(values => Object.fromEntries(headers.map((h, idx) => [h, values[idx] ?? ''])));
    }

    function parseCsvText(csvText) {
        const trimmed = (csvText || '').trim();
        if (!trimmed) return [];
        if (window.d3 && typeof window.d3.csvParse === 'function') {
            return window.d3.csvParse(trimmed);
        }
        return parseCsvFallback(trimmed);
    }

    function cancelPendingLiveLoad() {
        state.loadGeneration += 1;
        if (state.activeFetchController) {
            state.activeFetchController.abort();
            state.activeFetchController = null;
        }
        return state.loadGeneration;
    }

    async function fetchSheetCsv(sheetName, signal) {
        try {
            const response = await fetch(buildSheetCsvUrl(sheetName), {
                cache: 'no-store',
                signal,
            });
            if (!response.ok) {
                throw new Error(`Tabellenblatt "${sheetName}": HTTP ${response.status}`);
            }
            const csvText = await response.text();
            if (/^\s*<!doctype|^\s*<html/i.test(csvText)) {
                throw new Error(`Tabellenblatt "${sheetName}" ist nicht öffentlich als CSV lesbar (HTML-Antwort erhalten).`);
            }
            return csvText;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error(`Zeitlimit (${FETCH_TIMEOUT_MS / 1000}s) beim Abruf von "${sheetName}" überschritten.`);
            }
            throw err;
        }
    }

    // Adapted from Sheet code_artifacts: art_csv_mapper (mapSheetData)
    function mapSheetData(rawNodes, rawEdges, rawTokens) {
        const normalizeRow = row => {
            const out = {};
            for (const [k, v] of Object.entries(row || {})) {
                const key = String(k).trim();
                if (key) out[key] = typeof v === 'string' ? v.trim() : v;
            }
            return out;
        };

        const nodes = (rawNodes || [])
            .map(normalizeRow)
            .filter(r => r.id)
            .map(r => ({
                ...r,
                model: (r.model || 'modern').toLowerCase(),
                radius: (r.model || 'modern').toLowerCase() === 'classic' ? 32 : 28,
                collisionRadius: 118,
            }));

        const edges = (rawEdges || [])
            .map(normalizeRow)
            .filter(r => r.source && r.target)
            .map((r, idx) => ({
                ...r,
                id: r.id || `edge_${idx + 1}`,
                model: (r.model || 'modern').toLowerCase(),
                sourceId: r.source,
                targetId: r.target,
                strength: Number.isFinite(parseFloat(r.strength)) ? parseFloat(r.strength) : 0.75,
            }));

        const tokens = (rawTokens || [])
            .map(normalizeRow)
            .filter(r => r.token_id)
            .map(r => ({
                ...r,
                linkedIds: (r.linked_node_ids || '')
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean),
            }));

        return { nodes, edges, tokens };
    }

    // Adapted from Sheet code_artifacts: art_force_physics (createAntiOverlapSimulation)
    function createAntiOverlapSimulation(nodes, edges, width, height, model, onTick) {
        const sim = d3.forceSimulation(nodes)
            .force(
                'link',
                d3.forceLink(edges)
                    .id(d => d.id)
                    .distance(d => (model === 'classic' ? 240 : 235 - (d.strength * 35)))
                    .strength(model === 'classic' ? 0.65 : 0.42)
            )
            .force('charge', d3.forceManyBody().strength(model === 'classic' ? -800 : -1150).distanceMax(650))
            .force(
                'collide',
                d3.forceCollide()
                    .radius(d => d.collisionRadius || 118)
                    .strength(1.0)
                    .iterations(4)
            );

        if (model === 'classic') {
            const spacing = Math.min(260, Math.max(180, width * 0.27));
            const startX = width / 2 - ((nodes.length - 1) * spacing) / 2;
            sim
                .force('x', d3.forceX((d, i) => startX + i * spacing).strength(0.35))
                .force('y', d3.forceY(height / 2).strength(0.35));
        } else {
            sim
                .force('x', d3.forceX(width / 2).strength(0.038))
                .force('y', d3.forceY(height / 2).strength(0.095));
        }

        return sim.on('tick', onTick);
    }

    // Adapted from Sheet code_artifacts: art_edge_geometry (computeEdgeGeometry)
    function computeEdgeGeometry(d) {
        const sx = d.source.x;
        const sy = d.source.y;
        const tx = d.target.x;
        const ty = d.target.y;
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const padStart = (d.source.radius || 28) + 4;
        const padEnd = (d.target.radius || 28) + 12;
        const x1 = sx + ux * padStart;
        const y1 = sy + uy * padStart;
        const x2 = tx - ux * padEnd;
        const y2 = ty - uy * padEnd;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 - 8;
        return { x1, y1, x2, y2, mx, my };
    }

    function getCategoryColor(category) {
        const key = category || 'Allgemein';
        if (CATEGORY_COLORS[key]) return CATEGORY_COLORS[key];
        if (!state.categoryColorMap.has(key)) {
            const idx = state.categoryColorMap.size % FALLBACK_COLORS.length;
            state.categoryColorMap.set(key, FALLBACK_COLORS[idx]);
        }
        return state.categoryColorMap.get(key);
    }

    function wrapLabel(text, maxChars = 20) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        if (words.length <= 1) return [text || ''];
        const lines = [];
        let current = '';
        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > maxChars && current) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) lines.push(current);
        return lines.slice(0, 3);
    }

    function setStatus(kind, message) {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        const counters = document.getElementById('dataset-counters');
        if (text) text.textContent = message;
        if (dot) {
            dot.className = 'w-2 h-2 rounded-full';
            if (kind === 'loading') {
                dot.classList.add('bg-amber-400', 'animate-pulse');
            } else if (kind === 'live') {
                dot.classList.add('bg-emerald-400');
            } else if (kind === 'manual') {
                dot.classList.add('bg-sky-400');
            } else {
                dot.classList.add('bg-rose-500');
            }
        }
        if (counters) {
            counters.textContent = `${state.allNodes.length} Nodes | ${state.allEdges.length} Edges | ${state.allTokens.length} Tokens`;
        }
    }

    function showOverlay(title, message, actions = []) {
        const overlay = document.getElementById('canvas-overlay');
        const titleEl = document.getElementById('overlay-title');
        const msgEl = document.getElementById('overlay-message');
        const actionsEl = document.getElementById('overlay-actions');
        if (!overlay) return;
        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (actionsEl) {
            actionsEl.innerHTML = '';
            for (const act of actions) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = act.label;
                btn.className = act.primary
                    ? 'px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium transition-colors'
                    : 'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors';
                btn.addEventListener('click', act.onClick);
                actionsEl.appendChild(btn);
            }
        }
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        const overlay = document.getElementById('canvas-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    function renderSentenceBar() {
        const container = document.getElementById('sentence-container');
        if (!container) return;

        if (!state.allTokens.length) {
            container.innerHTML = '<span class="text-xs text-slate-500 italic">Keine sentence_tokens geladen.</span>';
            return;
        }

        container.innerHTML = '';
        for (const token of state.allTokens) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'token-chip';
            btn.dataset.tokenId = token.token_id;
            btn.title = token.word_role ? `${token.token_text} — ${token.word_role}` : token.token_text;
            btn.textContent = token.token_text;
            btn.addEventListener('click', () => {
                if (state.selection && state.selection.type === 'token' && state.selection.id === token.token_id) {
                    clearSelection();
                } else {
                    selectToken(token.token_id);
                }
            });
            container.appendChild(btn);
        }
        updateTokenChipStates();
    }

    function updateTokenChipStates() {
        const buttons = document.querySelectorAll('#sentence-container .token-chip');
        const activeTokenId = state.selection && state.selection.type === 'token' ? state.selection.id : null;
        for (const btn of buttons) {
            btn.classList.remove('active', 'active-classic');
            if (btn.dataset.tokenId === activeTokenId) {
                btn.classList.add(state.currentModel === 'classic' ? 'active-classic' : 'active');
            }
        }
    }

    function renderCategoryLegend(nodes) {
        const legendEl = document.getElementById('dynamic-category-legend');
        if (!legendEl) return;

        const categories = [...new Set(nodes.map(n => n.category).filter(Boolean))];
        legendEl.innerHTML = categories
            .map(cat => {
                const color = getCategoryColor(cat);
                return `<span class="inline-flex items-center gap-1.5 text-slate-300"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${escapeHtml(color)}"></span><span>${escapeHtml(cat)}</span></span>`;
            })
            .join('');
    }

    function updateModeButtons() {
        const modernBtn = document.getElementById('btn-mode-modern');
        const classicBtn = document.getElementById('btn-mode-classic');
        if (!modernBtn || !classicBtn) return;

        const inactiveCls = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 border border-transparent transition-all';
        const modernActiveCls = 'px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 transition-all';
        const classicActiveCls = 'px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 transition-all';

        if (state.currentModel === 'modern') {
            modernBtn.className = modernActiveCls;
            classicBtn.className = inactiveCls;
            modernBtn.setAttribute('aria-pressed', 'true');
            classicBtn.setAttribute('aria-pressed', 'false');
        } else {
            modernBtn.className = inactiveCls;
            classicBtn.className = classicActiveCls;
            modernBtn.setAttribute('aria-pressed', 'false');
            classicBtn.setAttribute('aria-pressed', 'true');
        }
    }

    function showTooltip(event, badge, title, body) {
        const tip = document.getElementById('d3-tooltip');
        if (!tip) return;
        const badgeEl = document.getElementById('tooltip-badge');
        const titleEl = document.getElementById('tooltip-title');
        const bodyEl = document.getElementById('tooltip-body');
        if (badgeEl) badgeEl.textContent = badge || '';
        if (titleEl) titleEl.textContent = title || '';
        if (bodyEl) bodyEl.textContent = body || '';

        tip.style.opacity = '1';
        moveTooltip(event);
    }

    function moveTooltip(event) {
        const tip = document.getElementById('d3-tooltip');
        if (!tip) return;
        const offset = 16;
        const rect = tip.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 12;
        const maxY = window.innerHeight - rect.height - 12;
        const x = Math.min(Math.max(12, event.clientX + offset), Math.max(12, maxX));
        const y = Math.min(Math.max(12, event.clientY + offset), Math.max(12, maxY));
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
    }

    function hideTooltip() {
        const tip = document.getElementById('d3-tooltip');
        if (tip) tip.style.opacity = '0';
    }

    // Adapted from Sheet code_artifacts: art_context_renderer (renderContextInspector)
    function renderContextInspector(containerEl, selectionModel) {
        if (!containerEl) return;

        if (!selectionModel) {
            const isClassic = state.currentModel === 'classic';
            const modelTitle = isClassic
                ? 'Klassische Semiotik: Morris-Pipeline (1938)'
                : 'Kognitiv-Interaktionales Netzwerk';
            const modelDesc = isClassic
                ? 'Stellt das klassische Stufenmodell dar: Syntax, Semantik und Pragmatik arbeiten als isolierte, nacheinander geschaltete Module.'
                : 'Zeigt Sprache als vernetztes, verkörpertes und sozial ko-konstruiertes System, in dem Form, Bedeutung und Interaktion untrennbar zusammenwirken.';
            const sentenceText = state.allTokens.map(t => t.token_text).join(' ');

            containerEl.innerHTML = `
                <div class="space-y-4">
                    <div class="border-b border-slate-800 pb-3">
                        <span class="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded ${isClassic ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'}">
                            Übersicht · model: ${escapeHtml(state.currentModel)}
                        </span>
                        <h2 class="text-lg font-bold text-white mt-2">${escapeHtml(modelTitle)}</h2>
                        <p class="text-xs text-slate-400 mt-1.5 leading-relaxed">${escapeHtml(modelDesc)}</p>
                    </div>
                    ${sentenceText ? `
                        <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                            <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400">Beispielsatz aus sentence_tokens</div>
                            <div class="text-sm font-semibold text-white">„${escapeHtml(sentenceText)}“</div>
                            <p class="text-xs text-slate-400 leading-relaxed">
                                Klicke oben auf ein Satz-Token, um die verknüpften Theorie-Knoten im Graphen hervorzuheben und die Mehrschicht-Analyse zu öffnen.
                            </p>
                        </div>
                    ` : ''}
                    <div class="grid grid-cols-3 gap-2 text-center">
                        <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                            <div class="text-lg font-bold text-sky-300 font-mono">${state.activeNodes.length}</div>
                            <div class="text-[11px] text-slate-400">Knoten</div>
                        </div>
                        <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                            <div class="text-lg font-bold text-emerald-300 font-mono">${state.activeEdges.length}</div>
                            <div class="text-[11px] text-slate-400">Kanten</div>
                        </div>
                        <div class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                            <div class="text-lg font-bold text-purple-300 font-mono">${state.allTokens.length}</div>
                            <div class="text-[11px] text-slate-400">Tokens</div>
                        </div>
                    </div>
                    <div class="rounded-xl border border-slate-800/80 bg-slate-900/50 p-3.5 text-xs text-slate-400 leading-relaxed">
                        Klicke auf ein Satz-Token oben, einen Knoten oder eine gerichtete Kante im Diagramm, um alle Tabellen-Eigenschaften aus Google Sheets anzuzeigen.
                    </div>
                </div>
            `;
            return;
        }

        const badgeColorCls = selectionModel.accent === 'amber'
            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            : selectionModel.accent === 'purple'
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                : 'bg-sky-500/15 text-sky-300 border border-sky-500/30';

        const rowsHtml = Object.entries(selectionModel.fields)
            .filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== '')
            .map(([key, val]) => {
                const label = FIELD_LABELS[key] || key;
                const highlightCard = key === 'classic_morris_split'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-slate-800 bg-slate-950/70';
                const labelTone = key === 'classic_morris_split' ? 'text-amber-300' : 'text-sky-400';
                return `
                    <div class="rounded-xl border ${highlightCard} p-3.5">
                        <div class="text-[11px] font-mono uppercase tracking-wider ${labelTone} mb-1">${escapeHtml(label)}</div>
                        <div class="text-sm text-slate-200 leading-relaxed">${escapeHtml(val)}</div>
                    </div>
                `;
            })
            .join('');

        const refsHtml = (selectionModel.refs || [])
            .filter(group => group.items.length > 0)
            .map(group => `
                <div class="space-y-2">
                    <div class="text-[11px] font-mono uppercase tracking-wider text-slate-400">${escapeHtml(group.title)}</div>
                    <div class="flex flex-wrap gap-1.5">
                        ${group.items.map(item => `
                            <button type="button"
                                    class="context-ref-chip"
                                    data-ref-type="${escapeHtml(item.type)}"
                                    data-ref-id="${escapeHtml(item.id)}">
                                ${item.dotColor ? `<span class="w-2 h-2 rounded-full shrink-0" style="background:${escapeHtml(item.dotColor)}"></span>` : ''}
                                <span>${escapeHtml(item.label)}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `)
            .join('');

        containerEl.innerHTML = `
            <div class="space-y-4">
                <div class="border-b border-slate-800 pb-3.5">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeColorCls}">
                            ${escapeHtml(selectionModel.badge)}
                        </span>
                        ${selectionModel.meta ? `<span class="text-[11px] font-mono text-slate-500">${escapeHtml(selectionModel.meta)}</span>` : ''}
                    </div>
                    <h2 class="text-lg font-bold text-white mt-2">${escapeHtml(selectionModel.title)}</h2>
                    ${selectionModel.subtitle ? `<p class="text-xs text-slate-400 mt-1">${escapeHtml(selectionModel.subtitle)}</p>` : ''}
                </div>
                <div class="flex flex-col gap-2.5">${rowsHtml}</div>
                ${refsHtml ? `<div class="pt-2 border-t border-slate-800/80 space-y-3">${refsHtml}</div>` : ''}
            </div>
        `;

        containerEl.querySelectorAll('.context-ref-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const refType = btn.dataset.refType;
                const refId = btn.dataset.refId;
                if (refType === 'node') selectNode(refId);
                else if (refType === 'edge') selectEdge(refId);
                else if (refType === 'token') selectToken(refId);
            });
        });
    }

    function extractExtraFields(row, excludedKeys) {
        const fields = {};
        for (const [k, v] of Object.entries(row)) {
            if (excludedKeys.has(k)) continue;
            if (v !== undefined && v !== null && String(v).trim() !== '') {
                fields[k] = v;
            }
        }
        return fields;
    }

    function updateContextPanel() {
        const container = document.getElementById('context-content');
        if (!container) return;

        if (!state.selection) {
            renderContextInspector(container, null);
            return;
        }

        if (state.selection.type === 'node') {
            const node = state.allNodes.find(n => n.id === state.selection.id);
            if (!node) {
                renderContextInspector(container, null);
                return;
            }
            const orderedKeys = ['theorists', 'core_concept', 'sentence_analysis', 'classical_contrast', 'tooltip_short'];
            const fields = {};
            for (const key of orderedKeys) {
                if (node[key]) fields[key] = node[key];
            }
            Object.assign(
                fields,
                extractExtraFields(
                    node,
                    new Set([...orderedKeys, 'id', 'model', 'label', 'category', 'radius', 'collisionRadius', 'x', 'y', 'vx', 'vy', 'fx', 'fy', 'index'])
                )
            );

            const connectedEdges = state.allEdges.filter(
                e => e.model === node.model && (e.sourceId === node.id || e.targetId === node.id)
            );
            const relatedTokens = state.allTokens.filter(t => t.linkedIds.includes(node.id));
            const nodeById = new Map(state.allNodes.map(n => [n.id, n]));

            renderContextInspector(container, {
                badge: `${node.category || 'Knoten'} · ${node.model}`,
                meta: `id: ${node.id}`,
                title: node.label || node.id,
                accent: node.model === 'classic' ? 'amber' : 'sky',
                fields,
                refs: [
                    {
                        title: `Verbundene Relationen (${connectedEdges.length})`,
                        items: connectedEdges.map(e => {
                            const isOut = e.sourceId === node.id;
                            const other = nodeById.get(isOut ? e.targetId : e.sourceId);
                            const arrow = isOut ? '→' : '←';
                            return {
                                type: 'edge',
                                id: e.id,
                                label: `${arrow} ${e.label || e.relation_type}: ${other ? other.label : (isOut ? e.targetId : e.sourceId)}`,
                            };
                        }),
                    },
                    {
                        title: `Verknüpfte Satz-Tokens (${relatedTokens.length})`,
                        items: relatedTokens.map(t => ({
                            type: 'token',
                            id: t.token_id,
                            label: `„${t.token_text}“ (${t.word_role})`,
                        })),
                    },
                ],
            });
            return;
        }

        if (state.selection.type === 'edge') {
            const edge = state.allEdges.find(e => e.id === state.selection.id);
            if (!edge) {
                renderContextInspector(container, null);
                return;
            }
            const sourceNode = state.allNodes.find(n => n.id === edge.sourceId);
            const targetNode = state.allNodes.find(n => n.id === edge.targetId);
            const fields = {
                relation_type: edge.relation_type,
                label: edge.label,
                strength: `${Math.round(edge.strength * 100)} % (${edge.strength.toFixed(2)})`,
                description: edge.description,
                ...extractExtraFields(
                    edge,
                    new Set(['id', 'model', 'source', 'target', 'sourceId', 'targetId', 'relation_type', 'label', 'strength', 'description', 'index'])
                ),
            };

            renderContextInspector(container, {
                badge: `Relation · ${edge.relation_type || edge.model}`,
                meta: `id: ${edge.id}`,
                title: `${sourceNode ? sourceNode.label : edge.sourceId} → ${targetNode ? targetNode.label : edge.targetId}`,
                subtitle: edge.label ? `Kantenbeschriftung: „${edge.label}“` : '',
                accent: edge.model === 'classic' ? 'amber' : 'sky',
                fields,
                refs: [
                    {
                        title: 'Verbundene Knoten',
                        items: [sourceNode, targetNode].filter(Boolean).map(n => ({
                            type: 'node',
                            id: n.id,
                            label: n.label,
                            dotColor: getCategoryColor(n.category),
                        })),
                    },
                ],
            });
            return;
        }

        if (state.selection.type === 'token') {
            const token = state.allTokens.find(t => t.token_id === state.selection.id);
            if (!token) {
                renderContextInspector(container, null);
                return;
            }
            const orderedKeys = state.currentModel === 'classic'
                ? ['classic_morris_split', 'embodied_layer', 'construction_layer', 'interactional_layer']
                : ['embodied_layer', 'construction_layer', 'interactional_layer', 'classic_morris_split'];
            const fields = {};
            for (const key of orderedKeys) {
                if (token[key]) fields[key] = token[key];
            }
            Object.assign(
                fields,
                extractExtraFields(
                    token,
                    new Set([...orderedKeys, 'token_id', 'token_text', 'word_role', 'linked_node_ids', 'linkedIds'])
                )
            );

            const linkedNodes = token.linkedIds
                .map(id => state.allNodes.find(n => n.id === id))
                .filter(Boolean);

            renderContextInspector(container, {
                badge: `Satz-Token · ${token.word_role || 'Token'}`,
                meta: `token_id: ${token.token_id}`,
                title: `„${token.token_text}“`,
                subtitle: state.currentModel === 'classic'
                    ? 'Ansicht: Klassische Morris-Aufteilung (Syntax | Semantik | Pragmatik)'
                    : 'Ansicht: Kognitiv-interaktionale Mehrschicht-Analyse',
                accent: state.currentModel === 'classic' ? 'amber' : 'purple',
                fields,
                refs: [
                    {
                        title: `Aktivierte Theorie-Knoten (${linkedNodes.length})`,
                        items: linkedNodes.map(n => ({
                            type: 'node',
                            id: n.id,
                            label: n.label,
                            dotColor: getCategoryColor(n.category),
                        })),
                    },
                ],
            });
        }
    }

    function applyHighlightState() {
        if (!state.zoomLayer) return;

        const nodeGroups = state.zoomLayer.selectAll('.node-group');
        const edgeGroups = state.zoomLayer.selectAll('.edge-group');
        const sel = state.selection;

        nodeGroups.classed('active', false).classed('highlighted', false).classed('dimmed', false);
        edgeGroups.classed('active', false).classed('highlighted', false).classed('dimmed', false);

        if (!sel) {
            updateTokenChipStates();
            return;
        }

        if (sel.type === 'node') {
            const connectedNodeIds = new Set([sel.id]);
            const connectedEdgeIds = new Set();
            for (const e of state.activeEdges) {
                if (e.sourceId === sel.id || e.targetId === sel.id) {
                    connectedEdgeIds.add(e.id);
                    connectedNodeIds.add(e.sourceId);
                    connectedNodeIds.add(e.targetId);
                }
            }
            nodeGroups
                .classed('active', d => d.id === sel.id)
                .classed('highlighted', d => d.id !== sel.id && connectedNodeIds.has(d.id))
                .classed('dimmed', d => !connectedNodeIds.has(d.id));
            edgeGroups
                .classed('highlighted', d => connectedEdgeIds.has(d.id))
                .classed('dimmed', d => !connectedEdgeIds.has(d.id));
        } else if (sel.type === 'edge') {
            const edge = state.activeEdges.find(e => e.id === sel.id);
            const endpointIds = edge ? new Set([edge.sourceId, edge.targetId]) : new Set();
            nodeGroups
                .classed('highlighted', d => endpointIds.has(d.id))
                .classed('dimmed', d => !endpointIds.has(d.id));
            edgeGroups
                .classed('active', d => d.id === sel.id)
                .classed('dimmed', d => d.id !== sel.id);
        } else if (sel.type === 'token') {
            const token = state.allTokens.find(t => t.token_id === sel.id);
            const linkedSet = new Set(token ? token.linkedIds : []);
            const hasMatchesInActiveModel = state.activeNodes.some(n => linkedSet.has(n.id));

            if (hasMatchesInActiveModel) {
                nodeGroups
                    .classed('highlighted', d => linkedSet.has(d.id))
                    .classed('dimmed', d => !linkedSet.has(d.id));
                edgeGroups
                    .classed('highlighted', d => linkedSet.has(d.sourceId) && linkedSet.has(d.targetId))
                    .classed('dimmed', d => !(linkedSet.has(d.sourceId) && linkedSet.has(d.targetId)));
            } else if (state.currentModel === 'classic') {
                // In classic Morris mode, every token spans Syntax -> Semantik -> Pragmatik
                nodeGroups.classed('highlighted', true);
                edgeGroups.classed('highlighted', true);
            }
        }

        updateTokenChipStates();
    }

    function selectNode(nodeId) {
        const targetNode = state.allNodes.find(n => n.id === nodeId);
        if (!targetNode) return;
        if (targetNode.model !== state.currentModel) {
            state.currentModel = targetNode.model;
            state.selection = { type: 'node', id: nodeId };
            updateModeButtons();
            renderGraph();
            updateContextPanel();
            return;
        }
        state.selection = { type: 'node', id: nodeId };
        applyHighlightState();
        updateContextPanel();
    }

    function selectEdge(edgeId) {
        const targetEdge = state.allEdges.find(e => e.id === edgeId);
        if (!targetEdge) return;
        if (targetEdge.model !== state.currentModel) {
            state.currentModel = targetEdge.model;
            state.selection = { type: 'edge', id: edgeId };
            updateModeButtons();
            renderGraph();
            updateContextPanel();
            return;
        }
        state.selection = { type: 'edge', id: edgeId };
        applyHighlightState();
        updateContextPanel();
    }

    function selectToken(tokenId) {
        state.selection = { type: 'token', id: tokenId };
        applyHighlightState();
        updateContextPanel();
    }

    function clearSelection() {
        state.selection = null;
        applyHighlightState();
        updateContextPanel();
    }

    function setModelMode(mode) {
        if (mode !== 'modern' && mode !== 'classic') return;
        if (state.currentModel === mode && state.svg) return;
        state.currentModel = mode;
        if (state.selection && state.selection.type !== 'token') {
            state.selection = null;
        }
        updateModeButtons();
        renderGraph();
        updateContextPanel();
    }

    function getCanvasSize() {
        const container = document.getElementById('d3-container');
        if (!container) return { width: 960, height: 640 };
        const rect = container.getBoundingClientRect();
        return {
            width: Math.max(360, rect.width || container.clientWidth || 960),
            height: Math.max(540, rect.height || container.clientHeight || 640),
        };
    }

    function resetCanvasZoom(immediate = false) {
        if (!state.svg || !state.zoomBehavior) return;
        const { width, height } = getCanvasSize();
        state.svg.attr('width', width).attr('height', height);
        state.zoomBehavior.extent([[0, 0], [width, height]]);
        const nodes = state.activeNodes;
        if (!nodes.length) {
            if (immediate) {
                state.svg.call(state.zoomBehavior.transform, d3.zoomIdentity);
            } else {
                state.svg.transition().duration(450).call(state.zoomBehavior.transform, d3.zoomIdentity);
            }
            return;
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const n of nodes) {
            if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
            minX = Math.min(minX, n.x - 105);
            maxX = Math.max(maxX, n.x + 105);
            minY = Math.min(minY, n.y - 75);
            maxY = Math.max(maxY, n.y + 85);
        }

        if (!Number.isFinite(minX)) {
            if (immediate) {
                state.svg.call(state.zoomBehavior.transform, d3.zoomIdentity);
            } else {
                state.svg.transition().duration(450).call(state.zoomBehavior.transform, d3.zoomIdentity);
            }
            return;
        }

        const wrapperEl = document.getElementById('canvas-wrapper');
        const hudEl = wrapperEl ? wrapperEl.querySelector('.absolute.top-4.left-4') : null;
        const hudHeight = hudEl ? Math.ceil(hudEl.getBoundingClientRect().height + 24) : 190;
        const topHudReserve = Math.min(Math.max(150, hudHeight), height * 0.34);
        const padX = 56;
        const padBottom = 36;
        const availW = Math.max(200, width - padX * 2);
        const availH = Math.max(200, height - topHudReserve - padBottom);
        const boxW = Math.max(120, maxX - minX);
        const boxH = Math.max(120, maxY - minY);
        const scale = Math.min(1.15, Math.max(0.42, Math.min(availW / boxW, availH / boxH)));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const tx = width / 2 - cx * scale;
        const ty = topHudReserve + availH / 2 - cy * scale;

        const targetTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        if (immediate) {
            state.svg.call(state.zoomBehavior.transform, targetTransform);
        } else {
            state.svg
                .transition()
                .duration(450)
                .call(state.zoomBehavior.transform, targetTransform);
        }
    }

    function renderGraph() {
        const container = document.getElementById('d3-container');
        if (!container || !window.d3) return;

        if (state.simulation) {
            state.simulation.stop();
            state.simulation = null;
        }

        const filteredNodes = state.allNodes
            .filter(n => n.model === state.currentModel)
            .map(n => ({ ...n }));
        const validNodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredEdges = state.allEdges
            .filter(e => e.model === state.currentModel && validNodeIds.has(e.sourceId) && validNodeIds.has(e.targetId))
            .map(e => ({ ...e, source: e.sourceId, target: e.targetId }));

        state.activeNodes = filteredNodes;
        state.activeEdges = filteredEdges;
        renderCategoryLegend(filteredNodes);

        container.innerHTML = '';

        if (!filteredNodes.length) {
            showOverlay(
                `Keine Knoten für model: ${state.currentModel}`,
                'Prüfe die Spalte "model" im Tabellenblatt nodes oder lade eigene CSV-Daten im Drawer.',
                [
                    { label: 'CSV-Import öffnen', primary: true, onClick: () => openDataDrawer() },
                    { label: 'Erneut live abrufen', primary: false, onClick: () => loadAllDataFromGoogleSheets() },
                ]
            );
            return;
        }

        hideOverlay();

        const { width, height } = getCanvasSize();
        const isClassic = state.currentModel === 'classic';

        // Deterministic initial placement for crisp settling
        filteredNodes.forEach((node, idx) => {
            if (isClassic) {
                const spacing = Math.min(260, Math.max(180, width * 0.27));
                const startX = width / 2 - ((filteredNodes.length - 1) * spacing) / 2;
                node.x = startX + idx * spacing;
                node.y = height / 2;
            } else {
                const angle = (idx / filteredNodes.length) * Math.PI * 2 - Math.PI / 2;
                const rx = Math.min(width * 0.38, 360);
                const ry = Math.min(height * 0.22, 165);
                node.x = width / 2 + Math.cos(angle) * rx;
                node.y = height / 2 + Math.sin(angle) * ry;
            }
        });

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('role', 'img')
            .attr('aria-label', isClassic
                ? 'Morris-Pipeline: Syntax, Semantik, Pragmatik'
                : 'Kognitiv-Interaktionales Linguistik-Netzwerk');

        svg.on('click', event => {
            if (event.target === svg.node()) {
                clearSelection();
            }
        });

        const defs = svg.append('defs');
        const addArrowMarker = (id, color) => {
            defs.append('marker')
                .attr('id', id)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8)
                .attr('refY', 0)
                .attr('markerWidth', 7)
                .attr('markerHeight', 7)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-4.5L9,0L0,4.5Z')
                .attr('fill', color);
        };
        addArrowMarker('arrow-modern', '#64748b');
        addArrowMarker('arrow-classic', '#f59e0b');
        addArrowMarker('arrow-active', '#38bdf8');

        const zoomLayer = svg.append('g').attr('class', 'zoom-layer');
        const zoomBehavior = d3.zoom()
            .extent([[0, 0], [width, height]])
            .scaleExtent([0.35, 2.6])
            .on('zoom', event => {
                zoomLayer.attr('transform', event.transform);
            });
        svg.call(zoomBehavior);

        state.svg = svg;
        state.zoomLayer = zoomLayer;
        state.zoomBehavior = zoomBehavior;

        const edgeStrokeDefault = isClassic ? '#f59e0b' : '#475569';
        const markerDefault = isClassic ? 'url(#arrow-classic)' : 'url(#arrow-modern)';

        const edgesLayer = zoomLayer.append('g').attr('class', 'edges-layer');
        const nodesLayer = zoomLayer.append('g').attr('class', 'nodes-layer');

        const edgeGroups = edgesLayer
            .selectAll('.edge-group')
            .data(filteredEdges, d => d.id)
            .join('g')
            .attr('class', 'edge-group')
            .on('mouseenter', (event, d) => {
                const sLabel = d.source.label || d.sourceId;
                const tLabel = d.target.label || d.targetId;
                showTooltip(
                    event,
                    `Relation · ${d.relation_type || d.model}`,
                    `${sLabel} → ${tLabel}${d.label ? ` (${d.label})` : ''}`,
                    d.description || ''
                );
            })
            .on('mousemove', event => moveTooltip(event))
            .on('mouseleave', () => hideTooltip())
            .on('click', (event, d) => {
                event.stopPropagation();
                selectEdge(d.id);
            });

        edgeGroups.append('line').attr('class', 'edge-hitarea');
        edgeGroups.append('line')
            .attr('class', 'edge-line')
            .attr('stroke', edgeStrokeDefault)
            .attr('stroke-width', d => 1.5 + d.strength * 1.8)
            .attr('marker-end', markerDefault);
        edgeGroups.append('text')
            .attr('class', 'edge-label')
            .text(d => d.label || d.relation_type || '');

        const nodeGroups = nodesLayer
            .selectAll('.node-group')
            .data(filteredNodes, d => d.id)
            .join('g')
            .attr('class', 'node-group')
            .attr('tabindex', 0)
            .attr('role', 'button')
            .attr('aria-label', d => `${d.label} (${d.category || d.model})`)
            .on('mouseenter', (event, d) => {
                showTooltip(
                    event,
                    d.category || d.model,
                    d.label,
                    d.tooltip_short || d.core_concept || ''
                );
            })
            .on('mousemove', event => moveTooltip(event))
            .on('mouseleave', () => hideTooltip())
            .on('click', (event, d) => {
                event.stopPropagation();
                selectNode(d.id);
            })
            .on('keydown', (event, d) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectNode(d.id);
                }
            });

        nodeGroups.append('circle')
            .attr('class', 'node-halo')
            .attr('r', d => (d.radius || 28) + 7)
            .attr('stroke', d => getCategoryColor(d.category));

        nodeGroups.append('circle')
            .attr('class', 'node-circle')
            .attr('r', d => d.radius || 28)
            .attr('fill', '#111827')
            .attr('stroke', d => getCategoryColor(d.category))
            .attr('stroke-width', 2.25);

        nodeGroups.append('circle')
            .attr('r', d => Math.max(6, (d.radius || 28) * 0.28))
            .attr('fill', d => getCategoryColor(d.category))
            .attr('fill-opacity', 0.28)
            .attr('pointer-events', 'none');

        nodeGroups.each(function (d) {
            const g = d3.select(this);
            const lines = wrapLabel(d.label, 22);
            const startY = (d.radius || 28) + 17;
            const mainText = g.append('text')
                .attr('class', 'node-label-main')
                .attr('y', startY);
            lines.forEach((line, idx) => {
                mainText.append('tspan')
                    .attr('x', 0)
                    .attr('dy', idx === 0 ? 0 : '1.18em')
                    .text(line);
            });
            if (d.category) {
                g.append('text')
                    .attr('class', 'node-label-sub')
                    .attr('y', startY + lines.length * 14.5 + 3)
                    .text(d.category);
            }
        });

        const updatePositions = () => {
            edgeGroups.each(function (d) {
                const geom = computeEdgeGeometry(d);
                const g = d3.select(this);
                g.select('.edge-hitarea')
                    .attr('x1', geom.x1)
                    .attr('y1', geom.y1)
                    .attr('x2', geom.x2)
                    .attr('y2', geom.y2);
                g.select('.edge-line')
                    .attr('x1', geom.x1)
                    .attr('y1', geom.y1)
                    .attr('x2', geom.x2)
                    .attr('y2', geom.y2);
                g.select('.edge-label')
                    .attr('x', geom.mx)
                    .attr('y', geom.my);
            });

            nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
        };

        const simulation = createAntiOverlapSimulation(
            filteredNodes,
            filteredEdges,
            width,
            height,
            state.currentModel,
            updatePositions
        );

        // Pre-warm layout so the initial frame is already well-separated and centered
        simulation.stop();
        const preTicks = isClassic ? 90 : 180;
        for (let i = 0; i < preTicks; i++) {
            simulation.tick();
        }
        updatePositions();
        resetCanvasZoom(true);
        simulation.alpha(0.05).restart();

        const dragBehavior = d3.drag()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.25).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        nodeGroups.call(dragBehavior);
        state.simulation = simulation;
        applyHighlightState();
    }

    function applyParsedDataset(rawNodes, rawEdges, rawTokens, sourceKind, statusMsg) {
        const mapped = mapSheetData(rawNodes, rawEdges, rawTokens);
        if (!mapped.nodes.length) {
            throw new Error('Keine gültigen Knoten (Spalte "id") in den geladenen CSV-Daten gefunden.');
        }

        if (sourceKind === 'manual') {
            cancelPendingLiveLoad();
        }

        state.allNodes = mapped.nodes;
        state.allEdges = mapped.edges;
        state.allTokens = mapped.tokens;
        state.sourceMode = sourceKind;

        const availableModels = new Set(mapped.nodes.map(n => n.model));
        if (!availableModels.has(state.currentModel)) {
            state.currentModel = availableModels.has('modern') ? 'modern' : [...availableModels][0];
        }

        state.selection = null;
        setStatus(sourceKind, statusMsg);
        updateModeButtons();
        renderSentenceBar();
        renderGraph();
        updateContextPanel();
    }

    async function loadAllDataFromGoogleSheets() {
        const generation = cancelPendingLiveLoad();
        const controller = new AbortController();
        state.activeFetchController = controller;
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        setStatus('loading', 'Lade Live-Daten aus Google Sheets...');
        showOverlay(
            'Lade Daten aus Google Sheets...',
            'Verbinde mit den Tabellenblättern nodes, edges und sentence_tokens.'
        );

        try {
            if (!window.d3) {
                throw new Error('D3.js (https://d3js.org/d3.v7.min.js) konnte nicht geladen werden.');
            }

            const [nodesCsv, edgesCsv, tokensCsv] = await Promise.all([
                fetchSheetCsv('nodes', controller.signal),
                fetchSheetCsv('edges', controller.signal),
                fetchSheetCsv('sentence_tokens', controller.signal),
            ]);

            if (generation !== state.loadGeneration) return;

            const nodesInput = document.getElementById('csv-input-nodes');
            const edgesInput = document.getElementById('csv-input-edges');
            const tokensInput = document.getElementById('csv-input-tokens');
            if (nodesInput) nodesInput.value = nodesCsv;
            if (edgesInput) edgesInput.value = edgesCsv;
            if (tokensInput) tokensInput.value = tokensCsv;

            const rawNodes = parseCsvText(nodesCsv);
            const rawEdges = parseCsvText(edgesCsv);
            const rawTokens = parseCsvText(tokensCsv);

            applyParsedDataset(
                rawNodes,
                rawEdges,
                rawTokens,
                'live',
                'Live synchronisiert (Google Sheets)'
            );
        } catch (error) {
            if (generation !== state.loadGeneration) return;
            console.error('Google Sheets Abruf fehlgeschlagen:', error);
            state.sourceMode = 'error';
            setStatus('error', `Abruf fehlgeschlagen: ${error.message}`);
            showOverlay(
                'Google-Sheets-Abruf fehlgeschlagen',
                `${error.message} Du kannst den Abruf erneut starten oder die drei CSV-Dateien manuell im Drawer importieren.`,
                [
                    { label: 'Erneut live abrufen', primary: true, onClick: () => loadAllDataFromGoogleSheets() },
                    { label: 'CSV-Import öffnen', primary: false, onClick: () => openDataDrawer() },
                ]
            );
        } finally {
            clearTimeout(timeoutId);
            if (state.activeFetchController === controller) {
                state.activeFetchController = null;
            }
        }
    }

    function openDataDrawer() {
        const drawer = document.getElementById('csv-drawer');
        const btn = document.getElementById('btn-toggle-drawer');
        if (drawer) drawer.classList.remove('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    function toggleDataDrawer() {
        const drawer = document.getElementById('csv-drawer');
        const btn = document.getElementById('btn-toggle-drawer');
        if (!drawer) return;
        const nowHidden = drawer.classList.toggle('hidden');
        if (btn) btn.setAttribute('aria-expanded', String(!nowHidden));
    }

    function handleCsvFileUpload(event, target) {
        const file = event && event.target && event.target.files && event.target.files[0];
        if (!file) return;
        const targetId = target === 'nodes'
            ? 'csv-input-nodes'
            : target === 'edges'
                ? 'csv-input-edges'
                : 'csv-input-tokens';
        const textarea = document.getElementById(targetId);
        if (!textarea) return;

        const reader = new FileReader();
        reader.onload = () => {
            textarea.value = typeof reader.result === 'string' ? reader.result : '';
        };
        reader.onerror = () => {
            setStatus('error', `CSV-Datei (${file.name}) konnte nicht gelesen werden.`);
        };
        reader.readAsText(file, 'UTF-8');
    }

    function applyManualCsvData() {
        const nodesCsv = (document.getElementById('csv-input-nodes')?.value || '').trim();
        const edgesCsv = (document.getElementById('csv-input-edges')?.value || '').trim();
        const tokensCsv = (document.getElementById('csv-input-tokens')?.value || '').trim();

        try {
            if (!nodesCsv) {
                throw new Error('Bitte mindestens CSV-Daten für das Tabellenblatt "nodes" einfügen.');
            }
            const rawNodes = parseCsvText(nodesCsv);
            const rawEdges = edgesCsv ? parseCsvText(edgesCsv) : [];
            const rawTokens = tokensCsv ? parseCsvText(tokensCsv) : [];

            applyParsedDataset(
                rawNodes,
                rawEdges,
                rawTokens,
                'manual',
                'Manuelle CSV-Daten aktiv'
            );
            const drawer = document.getElementById('csv-drawer');
            const btn = document.getElementById('btn-toggle-drawer');
            if (drawer) drawer.classList.add('hidden');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        } catch (error) {
            console.error('Manueller CSV-Import fehlgeschlagen:', error);
            setStatus('error', `CSV-Import: ${error.message}`);
        }
    }

    function bindUiControls() {
        document.getElementById('btn-reload-top')?.addEventListener('click', loadAllDataFromGoogleSheets);
        document.getElementById('btn-reload-drawer')?.addEventListener('click', loadAllDataFromGoogleSheets);
        document.getElementById('btn-toggle-drawer')?.addEventListener('click', toggleDataDrawer);
        document.getElementById('btn-close-drawer')?.addEventListener('click', toggleDataDrawer);
        document.getElementById('btn-apply-csv')?.addEventListener('click', applyManualCsvData);
        document.getElementById('btn-clear-selection')?.addEventListener('click', clearSelection);
        document.getElementById('btn-mode-modern')?.addEventListener('click', () => setModelMode('modern'));
        document.getElementById('btn-mode-classic')?.addEventListener('click', () => setModelMode('classic'));
        document.getElementById('btn-reset-zoom')?.addEventListener('click', () => resetCanvasZoom(false));

        document.getElementById('file-input-nodes')?.addEventListener('change', e => handleCsvFileUpload(e, 'nodes'));
        document.getElementById('file-input-edges')?.addEventListener('change', e => handleCsvFileUpload(e, 'edges'));
        document.getElementById('file-input-tokens')?.addEventListener('change', e => handleCsvFileUpload(e, 'tokens'));

        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && state.selection) {
                clearSelection();
            }
        });

        const wrapper = document.getElementById('canvas-wrapper');
        if (wrapper && typeof ResizeObserver === 'function') {
            let resizeTimer = null;
            state.resizeObserver = new ResizeObserver(() => {
                if (!state.activeNodes.length) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => resetCanvasZoom(false), 180);
            });
            state.resizeObserver.observe(wrapper);
        }
    }

    // Expose public control hooks for compatibility and inspection
    window.loadAllDataFromGoogleSheets = loadAllDataFromGoogleSheets;
    window.toggleDataDrawer = toggleDataDrawer;
    window.handleCsvFileUpload = handleCsvFileUpload;
    window.applyManualCsvData = applyManualCsvData;
    window.clearSelection = clearSelection;
    window.setModelMode = setModelMode;
    window.resetCanvasZoom = resetCanvasZoom;

    document.addEventListener('DOMContentLoaded', () => {
        bindUiControls();
        updateModeButtons();
        loadAllDataFromGoogleSheets();
    });
})();
