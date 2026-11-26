/**
 * Ready to Wear Collection interactions:
 * - Read More / Read Less description toggle
 * - Accordion expand/collapse
 * - Show More / Show Less per filter group (10 items limit)
 * - AJAX Section Rendering API filter, price range, sort, and colour chip updates
 */
(() => {
  const initSection = (root) => {
    if (!root || root.dataset.rtwInit === 'true') return;
    root.dataset.rtwInit = 'true';
    const sectionId = root.dataset.sectionId;

    const bindReadMore = () => {
      const btn = root.querySelector('[data-rtw-read-more]');
      const desc = root.querySelector('[data-rtw-desc]');
      if (!btn || !desc) return;
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        desc.classList.toggle('is-clamped', expanded);
        btn.textContent = expanded ? btn.dataset.moreLabel : btn.dataset.lessLabel;
      });
    };

    const bindAccordions = () => {
      root.querySelectorAll('[data-rtw-acc-btn]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const panel = btn.nextElementSibling;
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!expanded));
          if (panel) panel.hidden = expanded;
        });
      });

      root.querySelectorAll('[data-rtw-show-more]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const panel = btn.closest('.cb-rtw__acc-panel');
          if (!panel) return;
          const isExpanded = panel.classList.toggle('is-expanded');
          btn.textContent = isExpanded ? 'SHOW LESS' : 'SHOW MORE';
        });
      });
    };

    const buildUrlFromForm = () => {
      const form = root.querySelector('[data-rtw-form]');
      const url = new URL(window.location.href);
      const baseParams = new URLSearchParams();
      if (url.searchParams.has('sort_by')) {
        baseParams.set('sort_by', url.searchParams.get('sort_by'));
      }
      if (form) {
        const data = new FormData(form);
        for (const [key, value] of data.entries()) {
          if (String(value).trim() !== '') {
            baseParams.append(key, String(value));
          }
        }
      }
      url.search = baseParams.toString();
      return url.toString();
    };

    const swapFromUrl = async (targetUrl, push = true) => {
      const gridArea = root.querySelector('[data-rtw-grid-area]');
      if (gridArea) gridArea.classList.add('is-loading');

      try {
        const fetchUrl = new URL(targetUrl, window.location.origin);
        fetchUrl.searchParams.set('section_id', sectionId);
        const res = await fetch(fetchUrl.toString());
        if (!res.ok) throw new Error('Failed to load');
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const nextRoot = doc.querySelector(`[data-section-id="${sectionId}"]`);
        if (!nextRoot) return;

        // Preserve open accordion states & expanded "Show More" groups across AJAX swap
        const openStates = new Map();
        root.querySelectorAll('[data-rtw-acc-btn]').forEach((b) => {
          openStates.set(b.dataset.filterKey, {
            open: b.getAttribute('aria-expanded') === 'true',
            expanded: b.nextElementSibling?.classList.contains('is-expanded') || false,
          });
        });

        root.replaceWith(nextRoot);
        nextRoot.querySelectorAll('[data-rtw-acc-btn]').forEach((b) => {
          const prev = openStates.get(b.dataset.filterKey);
          if (prev) {
            b.setAttribute('aria-expanded', String(prev.open));
            if (b.nextElementSibling) {
              b.nextElementSibling.hidden = !prev.open;
              b.nextElementSibling.classList.toggle('is-expanded', prev.expanded);
              const sm = b.nextElementSibling.querySelector('[data-rtw-show-more]');
              if (sm) sm.textContent = prev.expanded ? 'SHOW LESS' : 'SHOW MORE';
            }
          }
        });

        if (push) {
          const cleanUrl = new URL(targetUrl, window.location.origin);
          cleanUrl.searchParams.delete('section_id');
          window.history.pushState({}, '', cleanUrl.toString());
        }

        initSection(nextRoot);
      } catch {
        window.location.href = targetUrl;
      }
    };

    const bindAjaxEvents = () => {
      const form = root.querySelector('[data-rtw-form]');
      if (form) {
        form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
          input.addEventListener('change', () => swapFromUrl(buildUrlFromForm()));
        });
        let priceTimer;
        form.querySelectorAll('.cb-rtw__price-input').forEach((input) => {
          input.addEventListener('input', () => {
            clearTimeout(priceTimer);
            priceTimer = setTimeout(() => swapFromUrl(buildUrlFromForm()), 450);
          });
        });
      }

      root.querySelectorAll('[data-rtw-ajax-link]').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          swapFromUrl(link.getAttribute('href'));
        });
      });
    };

    bindReadMore();
    bindAccordions();
    bindAjaxEvents();
  };

  const boot = () => {
    document.querySelectorAll('.cb-rtw[data-section-id]').forEach(initSection);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener('popstate', () => {
    window.location.reload();
  });
})();
