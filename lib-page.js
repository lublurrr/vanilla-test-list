/* ============================================================
   Vanilla Case List — standalone library page renderer
   ============================================================
   Powers resources.html and archive.html as real, independent
   pages (their own URL, back button works normally, no JS
   overlay/backdrop). Each page calls initLibPage(config) once.

   The page is built as a stack of folder-tab boxes, the same
   ones the Case List uses: Contents, Resource Types, Filters,
   and the results panel.
   ============================================================ */

(function () {
  'use strict';

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  const externalLinkIcon =
    '<svg width="0.85em" height="0.85em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.05em"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

  function byTitle(a, b) {
    const cmp = String(a.title || '').localeCompare(String(b.title || ''), 'en', { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return String(a.id || '').localeCompare(String(b.id || ''), 'en');
  }

  /* ------------------------------------------------------------
     Entry types. The source docs were written by hand, so the same
     type shows up as "guide"/"Guide" and "Template"/"Templates".
     Fold those together — case first, then a trailing "s" when the
     singular is also in use — so one real type is one box.
     ------------------------------------------------------------ */
  function typeKey(type) {
    return String(type || '').trim().toLowerCase();
  }

  function buildTypeIndex(entries) {
    // Count each spelling so the label can keep the one the data uses most
    // ("VOD" rather than a title-cased "Vod").
    const spellings = new Map(); // key -> Map(originalSpelling -> count)
    entries.forEach(e => {
      const k = typeKey(e.type);
      if (!k) return;
      const seen = spellings.get(k) || new Map();
      const original = String(e.type).trim();
      seen.set(original, (seen.get(original) || 0) + 1);
      spellings.set(k, seen);
    });

    // Fold plurals onto the singular that already exists ("templates" →
    // "template"), but leave "files"/"themes" alone — they have no singular.
    const merged = new Map();
    spellings.forEach((seen, k) => {
      const singular = k.endsWith('s') ? k.slice(0, -1) : null;
      const target = singular && spellings.has(singular) ? singular : k;
      const into = merged.get(target) || new Map();
      seen.forEach((n, original) => into.set(original, (into.get(original) || 0) + n));
      merged.set(target, into);
    });

    return Array.from(merged, ([key, seen]) => {
      let count = 0;
      let label = key;
      let best = 0;
      seen.forEach((n, original) => {
        count += n;
        if (n > best) { best = n; label = original; }
      });
      // The docs are inconsistent about capitalising types, so an all-lowercase
      // winner gets title-cased ("case list" → "Case List") while a spelling
      // that already carries capitals is left as written ("VOD").
      if (label === label.toLowerCase()) label = label.replace(/\b[a-z]/g, ch => ch.toUpperCase());
      return { key, label, count };
    }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en'));
  }

  function entryTypeKey(e, index) {
    const k = typeKey(e.type);
    if (!k) return '';
    if (index.some(t => t.key === k)) return k;
    const singular = k.endsWith('s') ? k.slice(0, -1) : '';
    return index.some(t => t.key === singular) ? singular : k;
  }

  window.initLibPage = function initLibPage(cfg) {
    const state = {
      search: '',
      category: cfg.defaultCategory || 'all',
      type: 'all',
      sort: 'default',
      data: null,
      types: [],
      error: null,
    };

    const body = document.getElementById(cfg.bodyId);
    const tagline = document.getElementById(cfg.taglineId);

    // Restore state from the URL so links are shareable/bookmarkable.
    const params = new URLSearchParams(location.search);
    if (params.get('cat')) state.category = params.get('cat');
    if (params.get('q')) state.search = params.get('q');
    if (params.get('type')) state.type = typeKey(params.get('type'));
    if (params.get('sort')) state.sort = params.get('sort');

    function syncUrl() {
      const p = new URLSearchParams();
      if (state.category && state.category !== 'all') p.set('cat', state.category);
      if (state.search) p.set('q', state.search);
      if (state.type && state.type !== 'all') p.set('type', state.type);
      if (state.sort && state.sort !== 'default') p.set('sort', state.sort);
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }

    function typeBadge(type) {
      if (!type) return '';
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      return `<span class="lib-type-badge lib-type-${escapeAttr(type.toLowerCase())}">${escapeHtml(label)}</span>`;
    }

    function categoryLabel(cat) {
      if (cat === 'all') return 'All';
      if (state.data && state.data.categoryLabels && state.data.categoryLabels[cat]) {
        return state.data.categoryLabels[cat];
      }
      return cat;
    }

    function categoryDescription(cat) {
      const map = state.data && state.data.categoryDescriptions;
      return (map && map[cat]) || '';
    }

    /* ------------------------------------------------------------
     * Filtering: search + category + type, then the chosen sort.
     * ------------------------------------------------------------ */
    function searchedEntries() {
      if (!state.data) return [];
      const q = state.search.trim().toLowerCase();
      const cat = state.category;
      const type = state.type;
      const fields = cfg.searchFields || ['title', 'creator', 'category', 'description', 'language'];
      return state.data.entries.filter(e => {
        if (cat !== 'all' && e.category !== cat) return false;
        if (type !== 'all' && entryTypeKey(e, state.types) !== type) return false;
        if (!q) return true;
        const haystack = fields.map(f => e[f]).filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    function filteredEntries() {
      const list = searchedEntries();
      if (state.sort === 'alpha') return list.slice().sort(byTitle);
      if (state.sort === 'alpha-desc') return list.slice().sort((a, b) => byTitle(b, a));
      return list;
    }

    function countsByCategory() {
      const counts = new Map();
      (state.data.entries || []).forEach(e => {
        counts.set(e.category, (counts.get(e.category) || 0) + 1);
      });
      return counts;
    }

    /* ------------------------------------------------------------
     * Box 1 — Contents. One compact card per category instead of the
     * old long nested list: name, live count, and its blurb, each one
     * a button that filters the results below.
     * ------------------------------------------------------------ */
    function renderContentsBox() {
      if (!cfg.showToc || !state.data) return '';
      const cats = Array.isArray(state.data.categories) ? state.data.categories : [];
      if (!cats.length) return '';
      const counts = countsByCategory();

      const cards = cats.map((cat, i) => {
        const desc = categoryDescription(cat);
        const active = state.category === cat ? ' is-active' : '';
        return `
          <button type="button" class="lib-toc-card${active}" data-lib-cat="${escapeAttr(cat)}" aria-pressed="${state.category === cat}">
            <span class="lib-toc-card-num">${i + 1}</span>
            <span class="lib-toc-card-main">
              <span class="lib-toc-card-name">${escapeHtml(categoryLabel(cat))}</span>
              ${desc ? `<span class="lib-toc-card-desc">${escapeHtml(desc)}</span>` : ''}
            </span>
            <span class="lib-toc-card-count">${counts.get(cat) || 0}</span>
          </button>`;
      }).join('');

      const legend = state.data.legend;
      const legendEntries = legend ? Object.entries(legend) : [];
      const legendHtml = legendEntries.length
        ? `<div class="lib-toc-legend">
             <span class="lib-toc-legend-title">Legend of Initials</span>
             <div class="lib-toc-legend-items">
               ${legendEntries.map(([k, v]) => `<span class="lib-toc-legend-item"><strong>${escapeHtml(k)}</strong> = ${escapeHtml(v)}</span>`).join('')}
             </div>
           </div>`
        : '';

      return `
        <section class="lib-box lib-box-toc" data-tab-label="Contents">
          <div class="lib-toc-cards">${cards}</div>
          ${legendHtml}
        </section>`;
    }

    /* ------------------------------------------------------------
     * Box 2 — Resource Types. One box per kind of resource in the
     * data, each a filter for that type. Skipped when the page only
     * holds one kind of thing (the Archive is all cases).
     * ------------------------------------------------------------ */
    function renderTypesBox() {
      if (!cfg.showTypes || state.types.length < 2) return '';
      const cards = state.types.map(t => {
        const active = state.type === t.key ? ' is-active' : '';
        return `
          <button type="button" class="lib-type-card${active}" data-lib-type="${escapeAttr(t.key)}" aria-pressed="${state.type === t.key}">
            <span class="lib-type-card-name">${escapeHtml(t.label)}</span>
            <span class="lib-type-card-count">${t.count}</span>
          </button>`;
      }).join('');
      const allActive = state.type === 'all' ? ' is-active' : '';
      return `
        <section class="lib-box lib-box-types" data-tab-label="Resource Types">
          <p class="lib-box-lead">Every kind of resource in the library. Pick one to see only those.</p>
          <div class="lib-type-cards">
            <button type="button" class="lib-type-card lib-type-card-all${allActive}" data-lib-type="all" aria-pressed="${state.type === 'all'}">
              <span class="lib-type-card-name">All Types</span>
              <span class="lib-type-card-count">${state.data.entries.length}</span>
            </button>
            ${cards}
          </div>
        </section>`;
    }

    /* ------------------------------------------------------------
     * Box 3 — Filters. Same shape as the Case List's Filters panel:
     * a search row, then labelled filter groups, a sort dropdown and
     * a Reset, with the live count along the bottom.
     * ------------------------------------------------------------ */
    function renderCategoryChips() {
      if (!state.data || !Array.isArray(state.data.categories) || !state.data.categories.length) return '';
      const chips = ['all', ...state.data.categories].map(cat => {
        const active = state.category === cat ? ' is-active' : '';
        return `<button type="button" class="chip${active}" data-lib-cat="${escapeAttr(cat)}" aria-pressed="${state.category === cat}">${escapeHtml(categoryLabel(cat))}</button>`;
      }).join('');
      return `
        <div class="filter-group">
          <span class="filter-label">${escapeHtml(cfg.categoryLabel || 'Category')}</span>
          <div class="chips" role="group" aria-label="Filter by ${escapeAttr(cfg.categoryLabel || 'category')}">${chips}</div>
        </div>`;
    }

    function renderSortGroup() {
      const options = [
        ['default', cfg.sortDefaultLabel || 'Listed Order'],
        ['alpha', 'Alphabetical (A–Z)'],
        ['alpha-desc', 'Alphabetical (Z–A)'],
      ];
      return `
        <div class="filter-group filter-sort">
          <span class="filter-label">Sort</span>
          <select class="lib-sort-select" aria-label="Sort entries">
            ${options.map(([v, label]) => `<option value="${escapeAttr(v)}"${state.sort === v ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
          </select>
        </div>`;
    }

    function renderAboutBox() {
      const text = state.data.description || '';
      if (!text || !cfg.aboutLabel) return '';
      return `
        <section class="lib-box lib-box-about" data-tab-label="${escapeAttr(cfg.aboutLabel)}">
          <p class="lib-about-text">${escapeHtml(text)}</p>
        </section>`;
    }

    // "Showing 12 of 340 cases." — the noun follows the page.
    function countText(list) {
      const noun = cfg.countNoun || 'entry';
      const plural = cfg.countNounPlural || (noun + 's');
      const total = state.data.entries.length;
      return `Showing <strong>${list.length}</strong> of <strong>${total}</strong> ${total === 1 ? noun : plural}.`;
    }

    function renderFiltersBox(list) {
      return `
        <section class="lib-box lib-box-filters" data-tab-label="Filters">
          <div class="toolbar-row toolbar-search">
            <label class="search-wrap">
              <svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm5.5-2.5L21 21" />
              </svg>
              <input type="search" class="lib-search-input" placeholder="${escapeAttr(cfg.searchPlaceholder || ('Search ' + cfg.title + '…'))}" autocomplete="off" value="${escapeAttr(state.search)}" aria-label="Search ${escapeAttr(cfg.title)}" />
              <button type="button" class="lib-search-clear" aria-label="Clear search">&times;</button>
            </label>
          </div>
          <div class="toolbar-row toolbar-filters">
            ${renderCategoryChips()}
            ${renderSortGroup()}
            ${cfg.roulette === false ? '' : '<button type="button" class="btn-random lib-roulette-btn">🎲 Roulette</button>'}
            <button type="button" class="reset-btn lib-reset-btn">Reset</button>
          </div>
          <div class="results-count lib-results-count">${countText(list)}</div>
        </section>`;
    }

    /* ------------------------------------------------------------
     * Box 4 — the results themselves, in the original panel.
     * ------------------------------------------------------------ */
    function renderEntryCard(e) {
      const meta = [];
      if (e.creator) meta.push(`<span class="lib-entry-creator">by ${escapeHtml(e.creator)}</span>`);
      if (e.language) meta.push(`<span class="lib-entry-creator">${escapeHtml(e.language)}</span>`);

      const linkLabel = cfg.linkLabel || 'Open Link';
      const footerHtml = e.url
        ? `<a class="lib-entry-link" href="${escapeAttr(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)} ${externalLinkIcon}</a>`
        : `<span class="lib-entry-link lib-entry-link-disabled" aria-disabled="true">No link available yet</span>`;

      return `
        <article class="lib-entry-card">
          <div class="lib-entry-head">
            <span class="lib-entry-category">${escapeHtml(categoryLabel(e.category) || '')}</span>
            ${typeBadge(e.type)}
          </div>
          <h3 class="lib-entry-title">${escapeHtml(e.title)}</h3>
          ${meta.length ? `<p class="lib-entry-desc lib-entry-meta">${meta.join(' &middot; ')}</p>` : ''}
          ${e.description ? `<p class="lib-entry-desc">${escapeHtml(e.description)}</p>` : ''}
          <div class="lib-entry-footer">${footerHtml}</div>
        </article>`;
    }

    function emptyStateHtml() {
      const narrowed = state.type !== 'all' || state.category !== 'all';
      return `<div class="lib-empty-state">
             <p class="lib-empty-title">No entries match your ${narrowed ? 'filters' : 'search'}.</p>
             <p class="lib-empty-sub">${narrowed ? 'Try a different section or type, or hit Reset to see everything.' : 'Try a different search term.'}</p>
           </div>`;
    }

    function resultsHtml(list) {
      return list.length
        ? `<div class="lib-entries-grid">${list.map(renderEntryCard).join('')}</div>`
        : emptyStateHtml();
    }

    function noteBannerHtml() {
      const desc = categoryDescription(state.category);
      if (state.category !== 'all' && desc) return `<div class="lib-note-banner">${escapeHtml(desc)}</div>`;
      if (state.category === 'Graveyard' && state.data.graveyardNote) {
        return `<div class="lib-note-banner">${escapeHtml(state.data.graveyardNote)}</div>`;
      }
      return '';
    }

    function render() {
      if (state.error) {
        body.innerHTML = `
          <div class="lib-error-state">
            <p class="lib-error-title">Couldn't load ${escapeHtml(cfg.title)}.</p>
            <p class="lib-error-sub"><code>${escapeHtml(state.error.message)}</code></p>
          </div>`;
        return;
      }
      if (!state.data) {
        body.innerHTML = `<div class="lib-loading-state">Loading…</div>`;
        return;
      }

      const list = filteredEntries();

      body.innerHTML = `
        ${renderAboutBox()}
        ${renderContentsBox()}
        ${renderTypesBox()}
        ${renderFiltersBox(list)}
        <div class="lib-page-panel">
          <div class="lib-panel-body">
            ${noteBannerHtml()}
            ${resultsHtml(list)}
          </div>
        </div>
      `;

      bindControls();
    }

    // Only the parts that change while filtering: the results, the count and
    // the note banner. Everything else stays put.
    function renderResultsOnly() {
      const list = filteredEntries();

      const countEl = body.querySelector('.lib-results-count');
      if (countEl) countEl.innerHTML = countText(list);
      const panelBody = body.querySelector('.lib-panel-body');
      if (panelBody) panelBody.innerHTML = noteBannerHtml() + resultsHtml(list);
    }

    function syncChips() {
      body.querySelectorAll('[data-lib-cat]').forEach(btn => {
        const on = state.category === btn.dataset.libCat;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', String(on));
      });
      body.querySelectorAll('[data-lib-type]').forEach(btn => {
        const on = state.type === btn.dataset.libType;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', String(on));
      });
    }

    function scrollToResults() {
      const panel = body.querySelector('.lib-box-filters');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function bindControls() {
      const searchInput = body.querySelector('.lib-search-input');
      const searchClear = body.querySelector('.search-wrap .lib-search-clear');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          state.search = searchInput.value;
          syncUrl();
          renderResultsOnly();
        });
      }
      if (searchClear) {
        searchClear.addEventListener('click', () => {
          state.search = '';
          if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
          }
          syncUrl();
          renderResultsOnly();
        });
      }

      body.querySelectorAll('[data-lib-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
          const fromToc = btn.classList.contains('lib-toc-card');
          state.category = btn.dataset.libCat;
          syncUrl();
          syncChips();
          renderResultsOnly();
          if (fromToc) scrollToResults();
        });
      });

      body.querySelectorAll('[data-lib-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          state.type = btn.dataset.libType;
          syncUrl();
          syncChips();
          renderResultsOnly();
          scrollToResults();
        });
      });

      const sortSelect = body.querySelector('.lib-sort-select');
      if (sortSelect) {
        sortSelect.addEventListener('change', () => {
          state.sort = sortSelect.value;
          syncUrl();
          renderResultsOnly();
        });
      }

      const resetBtn = body.querySelector('.lib-reset-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          state.search = '';
          state.category = 'all';
          state.type = 'all';
          state.sort = 'default';
          syncUrl();
          render();
        });
      }

      const rouletteBtn = body.querySelector('.lib-roulette-btn');
      if (rouletteBtn) rouletteBtn.addEventListener('click', rollRoulette);
    }

    /* ------------------------------------------------------------
     * Roulette — picks a random entry, shown in a modal, similar to
     * the "Roll" random case picker on the main Case List.
     * ------------------------------------------------------------ */
    let rouletteModal = null;

    function ensureRouletteModal() {
      if (rouletteModal) return rouletteModal;
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'lib-roulette-modal';
      modal.hidden = true;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.innerHTML = `
        <div class="modal-backdrop" data-close></div>
        <div class="modal-body">
          <button class="modal-close" data-close aria-label="Close">×</button>
          <h2 class="modal-title">Your Random ${escapeHtml(cfg.rouletteNoun || 'Entry')}</h2>
          <div id="lib-roulette-result"></div>
          <div class="modal-actions">
            <button type="button" class="btn-random" id="lib-roulette-again">Roll Again</button>
            <button type="button" class="btn-secondary" data-close>Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => {
        if (e.target.matches('[data-close]')) closeRouletteModal();
      });
      document.getElementById('lib-roulette-again').addEventListener('click', rollRoulette);
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !modal.hidden) closeRouletteModal();
      });
      rouletteModal = modal;
      return modal;
    }

    function closeRouletteModal() {
      if (rouletteModal) rouletteModal.hidden = true;
      document.body.style.overflow = '';
    }

    function rollRoulette() {
      if (!state.data || !Array.isArray(state.data.entries) || !state.data.entries.length) return;
      const modal = ensureRouletteModal();
      const pool = state.data.entries;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const result = document.getElementById('lib-roulette-result');
      result.innerHTML = renderEntryCard(pick);
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    fetch(cfg.dataUrl, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${cfg.dataUrl} (${res.status})`);
        return res.json();
      })
      .then(json => {
        state.data = json;
        state.types = buildTypeIndex(json.entries || []);
        if (tagline) tagline.textContent = json.tagline || '';
        render();
      })
      .catch(err => {
        state.error = err;
        render();
      });
  };
})();
