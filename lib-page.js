/* ============================================================
   Vanilla Case List — standalone library page renderer
   ============================================================
   Powers resources.html and archive.html as real, independent
   pages (their own URL, back button works normally, no JS
   overlay/backdrop). Each page calls initLibPage(config) once.
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

  /* ------------------------------------------------------------
     Alphabetical index helpers — pure, shared by every page that
     calls initLibPage. The letters are derived from the entries the
     page already loaded, so there is no second data source.
     ------------------------------------------------------------ */
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const OTHER_LETTER = '#'; // titles starting with a digit or symbol

  function normalizeLetter(value) {
    const v = String(value || '').trim().toUpperCase();
    if (v === OTHER_LETTER) return OTHER_LETTER;
    return ALPHABET.includes(v) ? v : 'all';
  }

  // First letter of the title as the reader sees it: accents folded onto their
  // base letter, leading quotes/brackets skipped, and anything that isn't a
  // letter bucketed under "#". Deterministic for any title.
  function entryInitial(e) {
    const title = String((e && e.title) || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    for (const ch of title) {
      if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
      if (/[0-9]/.test(ch)) return OTHER_LETTER;
    }
    return OTHER_LETTER;
  }

  function compareEntries(a, b) {
    const byTitle = String(a.title || '').localeCompare(String(b.title || ''), 'en', { sensitivity: 'base' });
    if (byTitle !== 0) return byTitle;
    return String(a.id || '').localeCompare(String(b.id || ''), 'en');
  }

  window.initLibPage = function initLibPage(cfg) {
    const state = {
      search: '',
      category: cfg.defaultCategory || 'all',
      letter: 'all',
      data: null,
      error: null,
    };

    const body = document.getElementById(cfg.bodyId);
    const tagline = document.getElementById(cfg.taglineId);

    // Restore state from the URL so links are shareable/bookmarkable.
    const params = new URLSearchParams(location.search);
    if (params.get('cat')) state.category = params.get('cat');
    if (params.get('q')) state.search = params.get('q');
    if (params.get('alpha')) state.letter = normalizeLetter(params.get('alpha'));

    function syncUrl() {
      const p = new URLSearchParams();
      if (state.category && state.category !== 'all') p.set('cat', state.category);
      if (state.search) p.set('q', state.search);
      if (state.letter && state.letter !== 'all') p.set('alpha', state.letter);
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

    // Everything matching the search + category filters, before the letter
    // filter — this is what decides which letters are worth offering.
    function searchedEntries() {
      if (!state.data) return [];
      const q = state.search.trim().toLowerCase();
      const cat = state.category;
      const fields = cfg.searchFields || ['title', 'creator', 'category', 'description', 'language'];
      return state.data.entries.filter(e => {
        if (cat !== 'all' && e.category !== cat) return false;
        if (!q) return true;
        const haystack = fields.map(f => e[f]).filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    function availableLetters() {
      const set = new Set();
      searchedEntries().forEach(e => set.add(entryInitial(e)));
      return set;
    }

    function filteredEntries() {
      const list = searchedEntries();
      if (state.letter === 'all') return list;
      return list.filter(e => entryInitial(e) === state.letter).sort(compareEntries);
    }

    function renderAlphaNav() {
      const available = availableLetters();
      const chips = ['all', ...ALPHABET, OTHER_LETTER].map(letter => {
        const isAll = letter === 'all';
        const active = state.letter === letter ? ' is-active' : '';
        const empty = !isAll && !available.has(letter);
        const label = isAll ? 'All' : letter;
        const aria = isAll
          ? 'Show entries starting with any letter'
          : letter === OTHER_LETTER
            ? 'Show entries starting with a number or symbol'
            : `Show entries starting with ${letter}`;
        return `<button type="button" class="lib-chip lib-alpha-chip${active}" data-lib-alpha="${escapeAttr(letter)}" aria-label="${escapeAttr(aria)}" aria-pressed="${state.letter === letter}"${empty ? ' disabled title="No entries"' : ''}>${escapeHtml(label)}</button>`;
      }).join('');
      // Same round "×" control the search box uses, so clearing the letter
      // looks and behaves exactly like clearing the search.
      const clear = `<button type="button" class="lib-search-clear lib-alpha-clear" aria-label="Clear letter filter"${state.letter === 'all' ? ' hidden' : ''}>&times;</button>`;
      return `<div class="lib-alpha" role="group" aria-label="Filter by first letter">
                <span class="lib-alpha-label" aria-hidden="true">A&ndash;Z</span>
                <div class="lib-chips lib-alpha-chips">${chips}</div>
                ${clear}
              </div>`;
    }

    // Cheap in-place refresh: which letters are still reachable, which one is
    // active, and whether the "×" shows — no re-render, no re-binding.
    function syncAlphaNav() {
      const available = availableLetters();
      body.querySelectorAll('[data-lib-alpha]').forEach(btn => {
        const letter = btn.dataset.libAlpha;
        const isActive = state.letter === letter;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
        if (letter !== 'all') btn.disabled = !available.has(letter);
      });
      const clear = body.querySelector('.lib-alpha-clear');
      if (clear) clear.hidden = state.letter === 'all';
    }

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

    function renderCategoryNav() {
      if (!state.data || !Array.isArray(state.data.categories) || !state.data.categories.length) return '';
      const chips = ['all', ...state.data.categories].map(cat => {
        const active = state.category === cat ? ' is-active' : '';
        return `<button type="button" class="lib-chip${active}" data-lib-cat="${escapeAttr(cat)}">${escapeHtml(categoryLabel(cat))}</button>`;
      }).join('');
      return `<div class="lib-chips" role="group" aria-label="Filter by category">${chips}</div>`;
    }

    /* ------------------------------------------------------------
     * Table of Contents — built entirely from the loaded JSON, so it
     * always reflects the real categories, category blurbs, entry
     * types, and initialism legend, with no hard-coded copy.
     * ------------------------------------------------------------ */
    function renderToc() {
      if (!cfg.showToc || !state.data) return '';
      const cats = Array.isArray(state.data.categories) ? state.data.categories : [];
      if (!cats.length) return '';

      const typesByCat = {};
      (state.data.entries || []).forEach(e => {
        if (!e || !e.category) return;
        if (!typesByCat[e.category]) typesByCat[e.category] = new Set();
        if (e.type) typesByCat[e.category].add(String(e.type).trim());
      });

      const items = cats.map(cat => {
        const desc = (state.data.categoryDescriptions && state.data.categoryDescriptions[cat]) || '';
        const types = typesByCat[cat] ? Array.from(typesByCat[cat]).sort((a, b) => a.localeCompare(b)) : [];
        const typesHtml = types.length
          ? `<ul class="lib-toc-types">${types.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
          : '';
        return `
          <li class="lib-toc-item">
            <button type="button" class="lib-toc-cat" data-lib-cat="${escapeAttr(cat)}">${escapeHtml(categoryLabel(cat))}</button>${desc ? `<span class="lib-toc-desc">: ${escapeHtml(desc)}</span>` : ''}
            ${typesHtml}
          </li>`;
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
        <div class="lib-toc">
          <div class="lib-toc-header">Table of Contents</div>
          <ol class="lib-toc-list">${items}</ol>
          ${legendHtml}
        </div>`;
    }

    function emptyStateHtml() {
      const byLetter = state.letter !== 'all';
      return `<div class="lib-empty-state">
             <p class="lib-empty-title">No entries match your ${byLetter ? 'filters' : 'search'}.</p>
             <p class="lib-empty-sub">${byLetter ? 'Try another letter, or pick “All” to see every entry.' : 'Try a different term or clear the category filter.'}</p>
           </div>`;
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
      const count = state.data.entries.length;

      const catDescHtml = (state.category !== 'all' && state.data.categoryDescriptions && state.data.categoryDescriptions[state.category])
        ? `<div class="lib-note-banner">${escapeHtml(state.data.categoryDescriptions[state.category])}</div>`
        : (state.category === 'Graveyard' && state.data.graveyardNote)
          ? `<div class="lib-note-banner">${escapeHtml(state.data.graveyardNote)}</div>`
          : '';

      const resultsHtml = list.length
        ? `<div class="lib-entries-grid">${list.map(renderEntryCard).join('')}</div>`
        : emptyStateHtml();

      body.innerHTML = `
        ${cfg.showToc ? '' : `<p class="lib-panel-desc">${escapeHtml(state.data.description || '')}</p>`}
        ${renderToc()}
        <div class="lib-toolbar">
          <div class="lib-toolbar-row lib-toolbar-search-row">
            <label class="lib-search-wrap">
              <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm5.5-2.5L21 21" />
              </svg>
              <input type="search" class="lib-search-input" placeholder="${escapeAttr(cfg.searchPlaceholder || ('Search ' + cfg.title + '…'))}" autocomplete="off" value="${escapeAttr(state.search)}" aria-label="Search ${escapeAttr(cfg.title)}" />
              <button type="button" class="lib-search-clear" aria-label="Clear search"${state.search ? '' : ' hidden'}>×</button>
            </label>
          </div>
          <div class="lib-toolbar-row lib-toolbar-filters-row">
            ${renderCategoryNav()}
            ${cfg.roulette === false ? '' : '<div class="lib-roulette-wrap"><button type="button" class="btn-random lib-roulette-btn">🎲 Roulette</button></div>'}
          </div>
          <div class="lib-toolbar-row lib-toolbar-alpha-row">
            ${renderAlphaNav()}
          </div>
        </div>
        ${catDescHtml}
        <div class="lib-results-count">Showing <strong>${list.length}</strong> of <strong>${count}</strong> entries.</div>
        ${resultsHtml}
      `;

      const searchInput = body.querySelector('.lib-search-input');
      const searchClear = body.querySelector('.lib-search-clear');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          state.search = searchInput.value;
          if (searchClear) searchClear.hidden = !searchInput.value;
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
          searchClear.hidden = true;
          syncUrl();
          renderResultsOnly();
        });
      }
      body.querySelectorAll('[data-lib-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
          const fromToc = btn.classList.contains('lib-toc-cat');
          state.category = btn.dataset.libCat;
          syncUrl();
          render();
          if (fromToc) {
            const toolbar = body.querySelector('.lib-toolbar');
            if (toolbar) toolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
      body.querySelectorAll('[data-lib-alpha]').forEach(btn => {
        btn.addEventListener('click', () => {
          const letter = btn.dataset.libAlpha;
          // Clicking the active letter again clears it, like a toggle.
          state.letter = (state.letter === letter) ? 'all' : normalizeLetter(letter);
          syncUrl();
          renderResultsOnly();
        });
      });
      const alphaClear = body.querySelector('.lib-alpha-clear');
      if (alphaClear) {
        alphaClear.addEventListener('click', () => {
          state.letter = 'all';
          syncUrl();
          renderResultsOnly();
        });
      }
      const rouletteBtn = body.querySelector('.lib-roulette-btn');
      if (rouletteBtn) {
        rouletteBtn.addEventListener('click', rollRoulette);
      }
    }

    function renderResultsOnly() {
      syncAlphaNav();
      const list = filteredEntries();
      const countEl = body.querySelector('.lib-results-count');
      if (countEl) {
        countEl.innerHTML = `Showing <strong>${list.length}</strong> of <strong>${state.data.entries.length}</strong> entries.`;
      }
      const grid = body.querySelector('.lib-entries-grid');
      const emptyState = body.querySelector('.lib-empty-state');
      const resultsHtml = list.length
        ? `<div class="lib-entries-grid">${list.map(renderEntryCard).join('')}</div>`
        : emptyStateHtml();
      if (grid) grid.outerHTML = resultsHtml;
      else if (emptyState) emptyState.outerHTML = resultsHtml;
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
        if (tagline) tagline.textContent = json.tagline || '';
        render();
      })
      .catch(err => {
        state.error = err;
        render();
      });
  };
})();
