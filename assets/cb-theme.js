/**
 * Casbasics theme layer — behaviour for cb-* sections.
 * Loaded as a module after Horizon's import map (see layout/theme.liquid).
 */
import { CartLinesUpdateEvent } from '@shopify/events';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* storage unavailable (private mode) — ignore */
    }
  },
};

/* ------------------------------------------------------------------------
   Countdown bar
   ------------------------------------------------------------------------ */
class CbCountdown extends HTMLElement {
  connectedCallback() {
    const raw = (this.dataset.end || '').trim().replace(' ', 'T');
    this.end = raw ? new Date(raw) : null;
    if (!this.end || Number.isNaN(this.end.getTime())) return;

    this.units = {
      days: this.querySelector('[data-unit="days"]'),
      hours: this.querySelector('[data-unit="hours"]'),
      minutes: this.querySelector('[data-unit="minutes"]'),
      seconds: this.querySelector('[data-unit="seconds"]'),
    };
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  disconnectedCallback() {
    window.clearInterval(this.timer);
  }

  tick() {
    const diff = this.end.getTime() - Date.now();

    if (diff <= 0) {
      window.clearInterval(this.timer);
      this.setAttribute('data-expired', '');
      const section = this.closest('.shopify-section');
      if (this.hasAttribute('data-hide-expired') && section && !window.Shopify?.designMode) {
        section.hidden = true;
      }
      return;
    }

    const pad = (value) => String(value).padStart(2, '0');
    const values = {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff / 3600000) % 24),
      minutes: Math.floor((diff / 60000) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };

    for (const [unit, element] of Object.entries(this.units)) {
      if (element) element.textContent = pad(values[unit]);
    }
  }
}

/* ------------------------------------------------------------------------
   Press quotes slider
   ------------------------------------------------------------------------ */
class CbPress extends HTMLElement {
  connectedCallback() {
    this.slides = [...this.querySelectorAll('[data-press-slide]')];
    this.logos = [...this.querySelectorAll('[data-press-logo]')];
    this.index = 0;
    if (this.slides.length < 2) return;

    this.logos.forEach((logo, index) => {
      logo.addEventListener('click', () => {
        this.show(index);
        this.restart();
      });
    });

    this.addEventListener('mouseenter', () => this.stop());
    this.addEventListener('mouseleave', () => this.start());
    this.addEventListener('focusin', () => this.stop());
    this.addEventListener('focusout', () => this.start());
    this.start();
  }

  disconnectedCallback() {
    this.stop();
  }

  show(index) {
    this.index = (index + this.slides.length) % this.slides.length;
    this.slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== this.index)));
    this.logos.forEach((logo, i) => logo.setAttribute('aria-current', String(i === this.index)));
  }

  start() {
    const seconds = Number(this.dataset.autoplay || 0);
    if (!seconds || prefersReducedMotion()) return;
    this.stop();
    this.timer = window.setInterval(() => this.show(this.index + 1), seconds * 1000);
  }

  stop() {
    window.clearInterval(this.timer);
  }

  restart() {
    this.stop();
    this.start();
  }
}

/* ------------------------------------------------------------------------
   Locations — switch image when a store is selected
   ------------------------------------------------------------------------ */
class CbLocations extends HTMLElement {
  connectedCallback() {
    this.stores = [...this.querySelectorAll('[data-store]')];
    this.images = [...this.querySelectorAll('[data-store-image]')];

    this.stores.forEach((store, index) => {
      const button = store.querySelector('button');
      button?.addEventListener('click', () => this.select(index));
      button?.addEventListener('mouseenter', () => this.select(index));
    });

    this.current = 0;
    const step = (delta) => this.select((this.current + delta + this.stores.length) % this.stores.length);
    this.querySelector('[data-store-prev]')?.addEventListener('click', () => step(-1));
    this.querySelector('[data-store-next]')?.addEventListener('click', () => step(1));
  }

  select(index) {
    this.current = index;
    this.stores.forEach((store, i) => store.setAttribute('aria-current', String(i === index)));
    this.images.forEach((image, i) => image.toggleAttribute('data-active', i === index));
  }
}

/* ------------------------------------------------------------------------
   Newsletter popup
   ------------------------------------------------------------------------ */
class CbPopup extends HTMLElement {
  connectedCallback() {
    this.key = `cb-popup-${this.dataset.sectionId}`;
    this.days = Number(this.dataset.days || 7);
    this.closeButtons = this.querySelectorAll('[data-popup-close]');

    this.closeButtons.forEach((button) => button.addEventListener('click', () => this.close(true)));
    this.addEventListener('click', (event) => {
      if (event.target === this) this.close(true);
    });
    this.onKeydown = (event) => {
      if (event.key === 'Escape' && this.hasAttribute('data-open')) this.close(true);
    };
    document.addEventListener('keydown', this.onKeydown);

    if (this.hasAttribute('data-submitted')) {
      this.open();
      storage.set(this.key, String(Date.now() + 365 * 86400000));
      return;
    }

    if (window.Shopify?.designMode) {
      document.addEventListener('shopify:section:select', this.onSectionSelect);
      document.addEventListener('shopify:section:deselect', this.onSectionDeselect);
      return;
    }

    if (this.hasAttribute('data-desktop-only') && window.matchMedia('(max-width: 749px)').matches) return;

    const until = Number(storage.get(this.key) || 0);
    if (until > Date.now()) return;

    this.timer = window.setTimeout(() => this.open(), Number(this.dataset.delay || 5) * 1000);
  }

  disconnectedCallback() {
    window.clearTimeout(this.timer);
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('shopify:section:select', this.onSectionSelect);
    document.removeEventListener('shopify:section:deselect', this.onSectionDeselect);
  }

  onSectionSelect = (event) => {
    if (event.detail?.sectionId === this.dataset.sectionId) this.open();
  };

  onSectionDeselect = (event) => {
    if (event.detail?.sectionId === this.dataset.sectionId) this.close(false);
  };

  open() {
    this.previousFocus = document.activeElement;
    this.setAttribute('data-open', '');
    this.removeAttribute('aria-hidden');
    window.requestAnimationFrame(() => this.querySelector('input[type="email"], [data-popup-close]')?.focus());
  }

  close(remember) {
    this.removeAttribute('data-open');
    this.setAttribute('aria-hidden', 'true');
    if (remember && !window.Shopify?.designMode) {
      storage.set(this.key, String(Date.now() + this.days * 86400000));
    }
    if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus();
  }
}

/* ------------------------------------------------------------------------
   Fundraising goal — animate when visible
   ------------------------------------------------------------------------ */
class CbGoal extends HTMLElement {
  connectedCallback() {
    const fill = this.querySelector('[data-goal-fill]');
    if (!fill) return;
    const target = fill.dataset.progress || '0%';

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      fill.style.setProperty('--cb-progress', target);
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        fill.style.setProperty('--cb-progress', target);
        this.observer.disconnect();
      }
    });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }
}

/* ------------------------------------------------------------------------
   Quick add form (hero best sellers panel)
   Uses Horizon's cart events so the cart drawer + cart icon refresh.
   ------------------------------------------------------------------------ */
class CbQuickAdd extends HTMLElement {
  connectedCallback() {
    this.form = this.querySelector('form');
    this.button = this.querySelector('[data-add-button]');
    this.status = this.querySelector('[data-add-status]');
    this.idInput = this.querySelector('input[name="id"]');
    this.selects = [...this.querySelectorAll('select[data-option-index]')];

    try {
      this.variants = JSON.parse(this.querySelector('script[data-variants]')?.textContent || '[]');
    } catch (error) {
      this.variants = [];
    }

    this.selects.forEach((select) => select.addEventListener('change', () => this.syncVariant()));
    this.form?.addEventListener('submit', (event) => this.onSubmit(event));
    this.syncVariant();
  }

  syncVariant() {
    if (!this.selects.length) return;

    const chosen = this.selects.map((select) => select.value);
    const variant = this.variants.find((item) => item.options.every((value, index) => value === chosen[index]));

    if (!variant) {
      this.idInput.value = '';
      this.setButton(false, this.dataset.textUnavailable);
      return;
    }

    this.idInput.value = variant.id;
    this.setButton(variant.available, variant.available ? this.dataset.textAdd : this.dataset.textSoldOut);
  }

  setButton(enabled, label) {
    if (!this.button) return;
    this.button.disabled = !enabled;
    if (label) this.button.textContent = label;
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message || '';
  }

  async onSubmit(event) {
    if (!this.idInput?.value) {
      event.preventDefault();
      return;
    }

    // Without Horizon's runtime we fall back to the native form post.
    if (!window.Theme?.routes?.cart_add_url) return;

    event.preventDefault();
    this.button.disabled = true;
    this.setStatus('');

    const formData = new FormData(this.form);
    const sectionIds = [...document.querySelectorAll('cart-items-component')]
      .map((element) => element.dataset.sectionId)
      .filter(Boolean);
    if (sectionIds.length) formData.append('sections', sectionIds.join(','));

    const quantity = Number(formData.get('quantity')) || 1;
    const deferred = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: [{ merchandiseId: String(formData.get('id')), quantity }],
        promise: deferred.promise,
      })
    );

    try {
      const response = await fetch(window.Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { Accept: 'application/javascript', 'X-Requested-With': 'XMLHttpRequest' },
        body: formData,
      });
      const data = await response.json();
      const cartResponse = await fetch(`${window.Theme.routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
      const cart = await cartResponse.json();

      deferred.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
        detail: {
          items: cart.items,
          source: 'cb-quick-add',
          sourceId: this.id || 'cb-quick-add',
          itemCount: quantity,
          productId: this.dataset.productId,
          sections: data.sections,
          didError: Boolean(data.status),
        },
      });

      if (data.status) {
        this.setStatus(data.description || data.message || this.dataset.textError);
      } else {
        this.setStatus(this.dataset.textAdded);
        window.setTimeout(() => this.setStatus(''), 2500);
      }
    } catch (error) {
      deferred.reject(error);
      this.setStatus(this.dataset.textError);
    } finally {
      this.button.disabled = false;
      this.syncVariant();
    }
  }
}

/* ------------------------------------------------------------------------
   Collapsible hero panel
   ------------------------------------------------------------------------ */
class CbHeroPanel extends HTMLElement {
  connectedCallback() {
    this.panel = this.querySelector('[data-panel]');
    this.toggle = this.querySelector('[data-panel-toggle]');
    if (!this.panel || !this.toggle) return;

    const key = `cb-hero-panel-${this.dataset.sectionId}`;
    const remembered = storage.get(key);
    if (remembered === 'collapsed' || (remembered === null && this.hasAttribute('data-start-collapsed'))) {
      this.collapse(true);
    }

    this.toggle.addEventListener('click', () => {
      const collapsed = !this.panel.hasAttribute('data-collapsed');
      this.collapse(collapsed);
      storage.set(key, collapsed ? 'collapsed' : 'open');
    });

    // "Show more" button in the panel footer scrolls the product list down one view (back to top at the end)
    const list = this.querySelector('.cb-hero__list');
    this.querySelector('[data-panel-scroll]')?.addEventListener('click', () => {
      if (!list) return;
      const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
      list.scrollTo({ top: atEnd ? 0 : list.scrollTop + list.clientHeight * 0.8, behavior: 'smooth' });
    });
  }

  collapse(collapsed) {
    this.panel.toggleAttribute('data-collapsed', collapsed);
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? this.toggle.dataset.labelExpand : this.toggle.dataset.labelCollapse;
    if (label) this.toggle.setAttribute('aria-label', label);
  }
}

/**
 * Clamps rich text to a few lines and shows a "Read more" toggle only when the text overflows.
 * Markup: <cb-read-more><div data-content>…</div><button data-toggle data-more="…" data-less="…" hidden></button></cb-read-more>
 */
class CbReadMore extends HTMLElement {
  connectedCallback() {
    this.content = this.querySelector('[data-content]');
    this.toggle = this.querySelector('[data-toggle]');
    if (!this.content || !this.toggle) return;

    this.toggle.addEventListener('click', () => this.setExpanded(!this.hasAttribute('expanded')));
    this.refresh = () => {
      if (this.hasAttribute('expanded')) return;
      this.toggle.hidden = this.content.scrollHeight <= this.content.clientHeight + 1;
    };
    this.refresh();
    this.observer = new ResizeObserver(this.refresh);
    this.observer.observe(this.content);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  setExpanded(expanded) {
    this.toggleAttribute('expanded', expanded);
    this.toggle.setAttribute('aria-expanded', String(expanded));
    this.toggle.textContent = expanded ? this.toggle.dataset.less : this.toggle.dataset.more;
  }
}

const define = (name, constructor) => {
  if (!customElements.get(name)) customElements.define(name, constructor);
};

define('cb-countdown', CbCountdown);
define('cb-press', CbPress);
define('cb-locations', CbLocations);
define('cb-popup', CbPopup);
define('cb-goal', CbGoal);
define('cb-quick-add', CbQuickAdd);
define('cb-hero-panel', CbHeroPanel);
define('cb-read-more', CbReadMore);
