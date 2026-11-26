/**
 * Ready to Wear collection (sections/cb-rtw-collection.liquid):
 * - "Read More" on the description
 * - filter accordions, "Show more", price slider + fields
 * - filtering and sorting without a page reload (Section Rendering API)
 * - more products loading as the "Loading" row comes into view
 * - filters drawer on small screens
 * Everything is delegated from the section, so it keeps working after the HTML is swapped.
 */
(() => {
  const SELECTOR = '[data-rtw]';

  /* New cards slide in like the first ones (scroll animations in cb-theme.js) */
  const animateCards = (cards) => {
    if (cards.length) document.dispatchEvent(new CustomEvent('cb:animate-cards', { detail: { cards } }));
  };

  const sectionUrl = (url, id) => `${url}${url.includes('?') ? '&' : '?'}section_id=${encodeURIComponent(id)}`;

  const fetchSection = async (url, id) => {
    const response = await fetch(sectionUrl(url, id), { headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error(`Section request failed: ${response.status}`);
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  };

  /* ---------- Price slider ---------- */
  const syncPrice = (price) => {
    if (!price) return;
    const max = Number(price.dataset.max) || 0;
    const lo = price.querySelector('[data-rtw-range-min]');
    const hi = price.querySelector('[data-rtw-range-max]');
    const fill = price.querySelector('[data-rtw-range-fill]');
    if (!lo || !hi || !max) return;
    const a = Math.min(Number(lo.value), Number(hi.value));
    const b = Math.max(Number(lo.value), Number(hi.value));
    if (fill) {
      fill.style.setProperty('--cb-rtw-from', `${(a / max) * 100}%`);
      fill.style.setProperty('--cb-rtw-to', `${100 - (b / max) * 100}%`);
      fill.style.left = `${(a / max) * 100}%`;
      fill.style.right = `${100 - (b / max) * 100}%`;
    }
  };

  const init = (root) => {
    if (!root || root.dataset.rtwInit === 'true') return;
    root.dataset.rtwInit = 'true';
    const id = root.dataset.sectionId;
    let controller = null;

    root.querySelectorAll('[data-rtw-price]').forEach(syncPrice);

    const setOpen = (filter, open) => {
      filter.classList.toggle('is-open', open);
      filter.querySelector('[data-rtw-filter-toggle]')?.setAttribute('aria-expanded', String(open));
      const panel = filter.querySelector('.cb-rtw__filter-panel');
      if (panel) panel.hidden = !open;
    };

    /* On phones every filter starts closed (Size is only open by default on larger screens) */
    if (window.matchMedia('(max-width: 767px)').matches) {
      root.querySelectorAll('[data-rtw-default-open]').forEach((filter) => setOpen(filter, false));
    }

    /* Centre the active colour chip when the row scrolls sideways */
    const centreChip = () => {
      const chipList = root.querySelector('.cb-rtw__colours-list');
      const activeChip = chipList?.querySelector('.cb-rtw__chip.is-active');
      if (!chipList || !activeChip || chipList.scrollWidth <= chipList.clientWidth) return;
      const item = activeChip.parentElement;
      chipList.scrollLeft = Math.max(0, item.offsetLeft - chipList.offsetLeft - (chipList.clientWidth - item.offsetWidth) / 2);
    };
    centreChip();
    document.fonts?.ready.then(centreChip);

    /* Current URL for the filter form (keeps the colour tag in the path) */
    const formUrl = () => {
      const form = root.querySelector('[data-rtw-form]');
      const params = new URLSearchParams();
      if (form) {
        for (const [key, value] of new FormData(form)) {
          if (String(value).trim() === '') continue;
          params.append(key, value);
        }
      }
      const max = root.querySelector('[data-rtw-price]')?.dataset.max;
      if (max && params.get('filter.v.price.lte') === String(max) && !params.get('filter.v.price.gte')) params.delete('filter.v.price.lte');
      const query = params.toString();
      return query ? `${root.dataset.baseUrl}?${query}` : root.dataset.baseUrl;
    };

    /* Swap in the results, filters and count for a new URL, keeping which filters are open */
    const render = async (url, push = true) => {
      const results = root.querySelector('[data-rtw-results]');
      results?.classList.add('is-loading');
      controller?.abort();
      controller = new AbortController();
      try {
        const doc = await fetchSection(url, id);
        const fresh = doc.querySelector(SELECTOR);
        if (!fresh) throw new Error('No section in response');

        const open = new Set([...root.querySelectorAll('.cb-rtw__filter.is-open')].map((f) => f.dataset.rtwFilter));
        const expanded = new Set(
          [...root.querySelectorAll('.cb-rtw__filter-panel.is-expanded')].map((p) => p.closest('[data-rtw-filter]')?.dataset.rtwFilter)
        );

        const swap = (selector) => {
          const current = root.querySelector(selector);
          const next = fresh.querySelector(selector);
          if (current && next) current.replaceWith(next);
        };
        swap('[data-rtw-results]');
        swap('[data-rtw-count]');
        const currentForm = root.querySelector('[data-rtw-form]');
        const nextForm = fresh.querySelector('[data-rtw-form]');
        if (currentForm && nextForm) currentForm.replaceWith(nextForm);

        root.querySelectorAll('[data-rtw-filter]').forEach((filter) => {
          const key = filter.dataset.rtwFilter;
          setOpen(filter, open.has(key));
          const panel = filter.querySelector('.cb-rtw__filter-panel');
          if (panel && expanded.has(key)) {
            panel.classList.add('is-expanded');
            panel.querySelector('[data-rtw-show-more]')?.setAttribute('aria-expanded', 'true');
          }
        });
        root.querySelectorAll('[data-rtw-price]').forEach(syncPrice);
        animateCards([...root.querySelectorAll('[data-rtw-grid] > .cb-rtw__card')]);
        observeLoader();
        if (push) window.history.replaceState({}, '', url);
      } catch (error) {
        if (error.name !== 'AbortError') window.location.href = url;
      } finally {
        root.querySelector('[data-rtw-results]')?.classList.remove('is-loading');
      }
    };

    /* ---------- Clicks ---------- */
    root.addEventListener('click', (event) => {
      const target = event.target;

      const readMore = target.closest('[data-rtw-read-more]');
      if (readMore) {
        const desc = root.querySelector('[data-rtw-desc]');
        const open = !desc.classList.contains('is-open');
        desc.classList.toggle('is-open', open);
        readMore.setAttribute('aria-expanded', String(open));
        readMore.textContent = open ? readMore.dataset.lessLabel : readMore.dataset.moreLabel;
        return;
      }

      const toggle = target.closest('[data-rtw-filter-toggle]');
      if (toggle) {
        const filter = toggle.closest('[data-rtw-filter]');
        setOpen(filter, !filter.classList.contains('is-open'));
        return;
      }

      const more = target.closest('[data-rtw-show-more]');
      if (more) {
        const panel = more.closest('.cb-rtw__filter-panel');
        const open = !panel.classList.contains('is-expanded');
        panel.classList.toggle('is-expanded', open);
        more.setAttribute('aria-expanded', String(open));
        return;
      }

      const sortToggle = target.closest('[data-rtw-sort-toggle]');
      if (sortToggle) {
        const panel = root.querySelector('[data-rtw-sort-panel]');
        const open = panel.hidden;
        panel.hidden = !open;
        sortToggle.setAttribute('aria-expanded', String(open));
        return;
      }

      if (target.closest('[data-rtw-drawer-open]')) {
        root.classList.add('is-drawer-open');
        root.querySelector('.cb-rtw__overlay').hidden = false;
        document.documentElement.style.overflow = 'hidden';
        return;
      }

      if (target.closest('[data-rtw-drawer-close]')) {
        root.classList.remove('is-drawer-open');
        root.querySelector('.cb-rtw__overlay').hidden = true;
        document.documentElement.style.overflow = '';
        return;
      }

      const clear = target.closest('.cb-rtw__clear');
      if (clear) {
        event.preventDefault();
        render(clear.getAttribute('href'));
      }
    });

    /* Close the sort list when clicking elsewhere */
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-rtw-sort]')) return;
      const panel = root.querySelector('[data-rtw-sort-panel]');
      if (panel && !panel.hidden) {
        panel.hidden = true;
        root.querySelector('[data-rtw-sort-toggle]')?.setAttribute('aria-expanded', 'false');
      }
    });

    /* ---------- Changes ---------- */
    let priceTimer;
    root.addEventListener('input', (event) => {
      const target = event.target;
      const price = target.closest('[data-rtw-price]');
      if (!price) return;
      const lo = price.querySelector('[data-rtw-range-min]');
      const hi = price.querySelector('[data-rtw-range-max]');
      const minField = price.querySelector('[data-rtw-price-min]');
      const maxField = price.querySelector('[data-rtw-price-max]');
      if (target === lo || target === hi) {
        if (Number(lo.value) > Number(hi.value)) {
          if (target === lo) lo.value = hi.value;
          else hi.value = lo.value;
        }
        minField.value = Number(lo.value) > 0 ? lo.value : '';
        maxField.value = Number(hi.value) < Number(price.dataset.max) ? hi.value : '';
      } else {
        lo.value = minField.value || 0;
        hi.value = maxField.value || price.dataset.max;
      }
      syncPrice(price);
      clearTimeout(priceTimer);
      priceTimer = setTimeout(() => render(formUrl()), 600);
    });

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-rtw-sort-input]')) {
        root.querySelectorAll('[data-rtw-sort-input]').forEach((radio) => {
          radio.checked = radio.value === target.value;
        });
        const hidden = root.querySelector('[data-rtw-sort-hidden]');
        const form = root.querySelector('[data-rtw-form]');
        if (hidden) hidden.value = target.value;
        else if (form) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'sort_by';
          input.value = target.value;
          input.dataset.rtwSortHidden = '';
          form.prepend(input);
        }
        root.querySelector('[data-rtw-sort-panel]').hidden = true;
        root.querySelector('[data-rtw-sort-toggle]')?.setAttribute('aria-expanded', 'false');
        const url = form ? formUrl() : `${root.dataset.baseUrl}?sort_by=${encodeURIComponent(target.value)}`;
        render(url);
        return;
      }
      if (target.matches('.cb-rtw__check-input')) render(formUrl());
    });

    /* ---------- Infinite loading ---------- */
    let loaderObserver = null;
    let loadingMore = false;
    const loadMore = async (loader) => {
      if (loadingMore || !loader) return;
      loadingMore = true;
      try {
        const doc = await fetchSection(loader.dataset.rtwNext, id);
        const grid = root.querySelector('[data-rtw-grid]');
        const nextGrid = doc.querySelector('[data-rtw-grid]');
        if (grid && nextGrid) {
          const added = [...nextGrid.children];
          grid.append(...added);
          animateCards(added);
        }
        const nextLoader = doc.querySelector('[data-rtw-next]');
        if (nextLoader) loader.replaceWith(nextLoader);
        else loader.remove();
      } catch {
        /* the "Loading" link still goes to the next page */
      } finally {
        loadingMore = false;
        observeLoader();
      }
    };

    const observeLoader = () => {
      loaderObserver?.disconnect();
      const loader = root.querySelector('[data-rtw-next]');
      if (!loader || !('IntersectionObserver' in window)) return;
      loaderObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMore(loader);
        },
        { rootMargin: '300px 0px' }
      );
      loaderObserver.observe(loader);
    };
    observeLoader();

    /* The sticky bar sits under the header, and the filter column under the bar */
    const setStickyTop = () => {
      const header = document.querySelector('#header-component');
      const sticky = header && getComputedStyle(header.closest('.header-section') || header).position === 'sticky';
      root.style.setProperty('--cb-rtw-sticky-top', sticky ? `${header.offsetHeight}px` : '0px');
      const bar = root.querySelector('.cb-rtw__bar');
      if (bar) root.style.setProperty('--cb-rtw-bar-h', `${bar.offsetHeight}px`);
    };
    setStickyTop();
    window.addEventListener('resize', setStickyTop);
  };

  const start = () => document.querySelectorAll(SELECTOR).forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('shopify:section:load', (event) => init(event.target.querySelector(SELECTOR)));
})();
