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
      // Collapsed (only the title and "View all" rows show): the arrow opens the list first.
      if (this.panel.hasAttribute('data-collapsed')) {
        this.collapse(false);
        storage.set(key, 'open');
        return;
      }
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

/* ------------------------------------------------------------------------
   Video reviews — "spotlight" slider (same maths as the Loox video slider):
   reels are 16px apart, the centre reel is full size and each step away is
   10% smaller; only reels inside the column are visible. The centre reel
   plays its muted preview and the slider moves on when it ends. Clicking a
   side reel centres it; clicking the centre reel plays the full video with
   sound.
   ------------------------------------------------------------------------ */
class CbVideoReviews extends HTMLElement {
  connectedCallback() {
    this.viewport = this.querySelector('[data-reels-viewport]');
    this.slides = [...this.querySelectorAll('[data-reel]')];
    if (!this.viewport || !this.slides.length) return;

    this.gap = 16;
    this.ratio = 1.802816;
    this.index = 0;
    this.fullIndex = -1;
    this.inView = false;
    this.autoplay = this.hasAttribute('data-autoplay') && !prefersReducedMotion();

    this.querySelector('[data-reels-prev]')?.addEventListener('click', () => this.go(this.index - 1));
    this.querySelector('[data-reels-next]')?.addEventListener('click', () => this.go(this.index + 1));

    this.slides.forEach((slide, i) => {
      slide.querySelector('[data-reel-hit]')?.addEventListener('click', () => {
        if (this.dragged) return;
        if (i !== this.index) this.go(i);
        else if (this.fullIndex === i) this.togglePause(slide);
        else this.playFull(slide);
      });
      slide.querySelector('[data-reel-mute]')?.addEventListener('click', () => this.toggleMute(slide));
      slide.querySelector('[data-reel-pause]')?.addEventListener('click', () => this.togglePause(slide));

      const video = slide.querySelector('video');
      if (!video) return;
      video.addEventListener('playing', () => slide.classList.add('is-playing'));
      video.addEventListener('timeupdate', () => {
        if (video.duration) slide.style.setProperty('--reel-progress', String(video.currentTime / video.duration));
      });
      video.addEventListener('ended', () => {
        if (i !== this.index) return;
        if (this.fullIndex === i) {
          this.fullIndex = -1;
          if (this.autoplay) this.go(this.index + 1);
          else this.stop(slide);
        } else if (this.autoplay) {
          this.go(this.index + 1);
        }
      });
    });

    // Swipe
    this.viewport.addEventListener('pointerdown', (event) => {
      this.startX = event.clientX;
      this.dragged = false;
    });
    this.viewport.addEventListener('pointerup', (event) => {
      if (this.startX == null) return;
      const delta = event.clientX - this.startX;
      this.startX = null;
      if (Math.abs(delta) < 40) return;
      this.dragged = true;
      this.go(this.index + (delta < 0 ? 1 : -1));
      setTimeout(() => (this.dragged = false), 0);
    });
    this.viewport.addEventListener('pointercancel', () => (this.startX = null));

    this.resizeObserver = new ResizeObserver(() => this.layout(false));
    this.resizeObserver.observe(this.viewport);

    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          this.inView = entry.isIntersecting;
          this.sync();
        },
        { threshold: 0.25 }
      );
      this.intersectionObserver.observe(this);
    } else {
      this.inView = true;
    }

    this.layout(false);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    clearTimeout(this.timer);
  }

  /** Reels per view by column width, like the Loox breakpoints */
  perView(width) {
    if (width >= 920) return this.slides.length > 5 ? 4.5 : 2.7;
    if (width >= 720) return 2.8;
    if (width >= 700) return 2.6;
    if (width >= 600) return 2.3;
    if (width >= 550) return 2.1;
    if (width >= 490) return 1.8;
    if (width >= 424) return 1.6;
    if (width >= 343) return 1.4;
    return 1.2;
  }

  layout(animate = true) {
    const width = this.viewport.clientWidth;
    if (!width) return;
    const perView = this.perView(width);
    const size = Math.floor((width - (perView - 1) * this.gap) / perView);
    const step = size + this.gap;
    const count = this.slides.length;
    this.style.setProperty('--reel-width', `${size}px`);

    this.slides.forEach((slide, i) => {
      // shortest way round the loop
      let distance = (((i - this.index) % count) + count) % count;
      if (distance > count / 2) distance -= count;

      const left = (width - size) / 2 + distance * step;
      const offset = (-distance * step) / size;
      const scale = Math.max(0, 1 - 0.1 * Math.abs(offset));
      const shift = Math.round(((size - size * scale) / 2) * offset);
      const visible = left + size > 0 && left < width;

      if (!animate) slide.style.transition = 'none';
      slide.style.transform = `translateX(${left + shift}px) scale(${scale})`;
      slide.style.opacity = visible ? '1' : '0';
      slide.style.zIndex = String(1 - Math.abs(Math.round(offset)));
      slide.classList.toggle('is-active', distance === 0);
      slide.setAttribute('aria-hidden', String(!visible));
      slide.querySelectorAll('button').forEach((button) => (button.tabIndex = visible ? 0 : -1));
    });

    if (!animate) {
      this.viewport.offsetWidth; // apply without transition, then restore it
      this.slides.forEach((slide) => (slide.style.transition = ''));
    }
  }

  go(index) {
    const count = this.slides.length;
    this.index = ((index % count) + count) % count;
    this.fullIndex = -1;
    this.layout(true);
    this.sync();
  }

  /** Only the centre reel plays: its muted preview while autoplay is on and the slider is on screen */
  sync() {
    clearTimeout(this.timer);
    this.slides.forEach((slide, i) => {
      if (i !== this.index) this.stop(slide);
    });
    if (this.fullIndex === this.index) return;

    const slide = this.slides[this.index];
    if (!this.autoplay || !this.inView) {
      this.stop(slide);
      return;
    }

    const video = slide.querySelector('video');
    const source = video && (video.dataset.preview || video.dataset.full);
    if (!source) {
      this.timer = setTimeout(() => this.go(this.index + 1), 5000);
      return;
    }
    slide.classList.remove('is-full', 'is-paused');
    this.start(video, source, true);
  }

  playFull(slide) {
    const video = slide.querySelector('video');
    const source = video && (video.dataset.full || video.dataset.preview);
    if (!source) return;
    clearTimeout(this.timer);
    this.fullIndex = this.index;
    slide.classList.add('is-full');
    slide.classList.remove('is-paused', 'is-muted');
    this.start(video, source, false);
  }

  start(video, source, muted) {
    if (video.getAttribute('src') !== source) video.src = source;
    video.muted = muted;
    video.currentTime = 0;
    video.play().catch(() => {
      // sound needs a click on some browsers: fall back to muted
      if (!muted) {
        video.muted = true;
        video.closest('[data-reel]')?.classList.add('is-muted');
        video.play().catch(() => {});
      }
    });
  }

  stop(slide) {
    const video = slide.querySelector('video');
    if (video && video.getAttribute('src')) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    slide.classList.remove('is-playing', 'is-full', 'is-paused', 'is-muted');
    slide.style.removeProperty('--reel-progress');
  }

  toggleMute(slide) {
    const video = slide.querySelector('video');
    if (!video) return;
    video.muted = !video.muted;
    slide.classList.toggle('is-muted', video.muted);
  }

  togglePause(slide) {
    const video = slide.querySelector('video');
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    slide.classList.toggle('is-paused', video.paused);
  }
}

/* ------------------------------------------------------------------------
   Social feed — video posts play muted on hover (or while on screen when
   set to play automatically); the video loads only when it first plays.
   ------------------------------------------------------------------------ */
class CbSocialFeed extends HTMLElement {
  connectedCallback() {
    this.items = [...this.querySelectorAll('.cb-social__item--video')];
    if (!this.items.length) return;

    if (this.dataset.video === 'auto' && !prefersReducedMotion() && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => entries.forEach((entry) => (entry.isIntersecting ? this.play(entry.target) : this.pause(entry.target))),
        { threshold: 0.4 }
      );
      this.items.forEach((item) => this.observer.observe(item));
      return;
    }

    this.items.forEach((item) => {
      item.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') this.play(item);
      });
      item.addEventListener('pointerleave', () => this.pause(item));
      item.addEventListener('focusin', () => this.play(item));
      item.addEventListener('focusout', () => this.pause(item));
    });
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  play(item) {
    const video = item.querySelector('video');
    if (!video) return;
    if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
    video.play().then(() => item.classList.add('is-playing')).catch(() => {});
  }

  pause(item) {
    const video = item.querySelector('video');
    if (!video) return;
    video.pause();
    item.classList.remove('is-playing');
  }
}

/* Footer bottom — picking a country or language reloads the store in it */
document.addEventListener('change', (event) => {
  const select = event.target.closest?.('[data-cb-localization]');
  if (select?.form) select.form.submit();
});

/* Reviews wall — masonry like the Loox widget: each card goes into the shortest column
   (column count comes from --cb-rw-cols, set by container width in CSS). Also "Show more",
   sorting, filtering by star rating from the breakdown, and playing review videos. */
class CbReviewsWall extends HTMLElement {
  connectedCallback() {
    this.grid = this.querySelector('[data-rw-grid]');
    if (!this.grid) return;
    this.items = [...this.grid.querySelectorAll('[data-rw-item]')];
    this.featured = [...this.items];
    this.limit = Number(this.dataset.initial) || 20;
    this.step = Number(this.dataset.step) || 20;
    this.rating = 0;
    this.moreButton = this.querySelector('[data-rw-more]');

    this.moreButton?.addEventListener('click', () => {
      this.limit += this.step;
      this.apply();
    });

    this.querySelectorAll('[data-rw-toggle]').forEach((button) =>
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.toggle(button);
      })
    );

    this.querySelectorAll('[data-rw-sort]').forEach((button) =>
      button.addEventListener('click', () => {
        this.sort(button.dataset.rwSort);
        this.querySelectorAll('[data-rw-sort]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        this.closeAll();
      })
    );

    this.querySelectorAll('[data-rw-rating]').forEach((row) => {
      const pick = () => {
        const rating = Number(row.dataset.rwRating);
        this.rating = this.rating === rating ? 0 : rating;
        this.querySelectorAll('[data-rw-rating]').forEach((r) =>
          r.setAttribute('aria-pressed', String(Number(r.dataset.rwRating) === this.rating))
        );
        this.limit = Number(this.dataset.initial) || 20;
        this.apply();
      };
      row.addEventListener('click', pick);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      });
    });

    this.grid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rw-play]');
      const video = button?.parentElement.querySelector('video');
      if (!video) return;
      button.hidden = true;
      video.controls = true;
      video.play().catch(() => {});
    });

    this.onDocumentClick = (event) => {
      if (!event.target.closest('.cb-rw__dropdown')) this.closeAll();
    };
    this.onKeydown = (event) => {
      if (event.key === 'Escape') this.closeAll();
    };
    document.addEventListener('click', this.onDocumentClick);
    document.addEventListener('keydown', this.onKeydown);

    this.grid.classList.add('is-masonry');
    this.width = 0;
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.grid.clientWidth !== this.width) this.layout();
      });
      this.resizeObserver.observe(this.grid);
    }
    this.grid.addEventListener('load', () => this.layout(), true);
    document.fonts?.ready.then(() => this.layout());
    this.apply();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('keydown', this.onKeydown);
  }

  toggle(button) {
    const panel = this.querySelector(`#${button.getAttribute('aria-controls')}`);
    if (!panel) return;
    const open = panel.hidden;
    this.closeAll();
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  closeAll() {
    this.querySelectorAll('.cb-rw__dropdown').forEach((panel) => (panel.hidden = true));
    this.querySelectorAll('[data-rw-toggle]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  }

  sort(order) {
    const date = (item) => {
      const [m, d, y] = (item.dataset.date || '').split('/').map(Number);
      return y ? new Date(y, m - 1, d).getTime() : 0;
    };
    const rank = (item) => this.featured.indexOf(item);
    this.items = [...this.featured];
    if (order === 'newest') this.items.sort((a, b) => date(b) - date(a) || rank(a) - rank(b));
    if (order === 'highest') this.items.sort((a, b) => b.dataset.rating - a.dataset.rating || rank(a) - rank(b));
    if (order === 'lowest') this.items.sort((a, b) => a.dataset.rating - b.dataset.rating || rank(a) - rank(b));
    this.apply();
  }

  apply() {
    const list = this.items.filter((item) => !this.rating || Number(item.dataset.rating) === this.rating);
    this.items.forEach((item) => {
      item.hidden = true;
      this.grid.append(item);
    });
    list.slice(0, this.limit).forEach((item) => (item.hidden = false));
    if (this.moreButton) this.moreButton.hidden = list.length <= this.limit;
    this.layout();
  }

  layout() {
    const cols = parseInt(getComputedStyle(this.grid).getPropertyValue('--cb-rw-cols'), 10) || 1;
    this.width = this.grid.clientWidth;
    const columnWidth = this.width / cols;
    const heights = new Array(cols).fill(0);
    this.items.forEach((item) => {
      if (item.hidden) return;
      const column = heights.indexOf(Math.min(...heights));
      item.style.left = `${column * columnWidth}px`;
      item.style.top = `${heights[column]}px`;
      heights[column] += item.getBoundingClientRect().height;
    });
    this.grid.style.height = `${Math.max(0, ...heights)}px`;
  }
}

/* Product page — gallery (arrows wrap round, thumbnails follow), option buttons pick the variant,
   buy it now (add, then checkout), file name on the upload box, "Complete your look" dots and
   quick buy, and the size chart drawer. */
class CbProduct extends HTMLElement {
  connectedCallback() {
    try {
      this.variants = JSON.parse(this.querySelector('[data-cb-variants]')?.textContent || '[]');
    } catch {
      this.variants = [];
    }
    this.form = this.querySelector('form.cb-pdp__form');
    this.idInput = this.querySelector('[data-variant-id]');

    this.setupGallery();
    this.setupOptions();
    this.setupUpsell();
    this.setupDrawer();

    const upload = this.querySelector('[data-upload-input]');
    const uploadName = this.querySelector('[data-upload-name]');
    if (upload && uploadName) {
      const label = uploadName.textContent;
      upload.addEventListener('change', () => {
        uploadName.textContent = upload.files?.[0]?.name || label;
      });
    }

    this.querySelector('[data-buy-now]')?.addEventListener('click', (event) => this.buyNow(event.currentTarget));
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this.onKeydown);
  }

  /* Gallery */
  setupGallery() {
    this.track = this.querySelector('[data-gallery-track]');
    if (!this.track) return;
    this.slides = [...this.track.querySelectorAll('[data-gallery-slide]')];
    this.thumbs = [...this.querySelectorAll('[data-gallery-thumb]')];
    this.querySelector('[data-gallery-prev]')?.addEventListener('click', () => this.goTo(this.index() - 1));
    this.querySelector('[data-gallery-next]')?.addEventListener('click', () => this.goTo(this.index() + 1));
    this.thumbs.forEach((thumb) => thumb.addEventListener('click', () => this.goTo(Number(thumb.dataset.galleryThumb))));
    this.track.addEventListener('scroll', () => {
      window.cancelAnimationFrame(this.frame);
      this.frame = window.requestAnimationFrame(() => this.markThumb());
    }, { passive: true });
  }

  index() {
    return Math.round(this.track.scrollLeft / Math.max(1, this.track.clientWidth));
  }

  goTo(index) {
    const count = this.slides.length;
    if (!count) return;
    const target = (index + count) % count;
    this.track.scrollTo({ left: target * this.track.clientWidth, behavior: 'smooth' });
    this.markThumb(target);
  }

  markThumb(index = this.index()) {
    this.thumbs.forEach((thumb, i) => thumb.classList.toggle('is-active', i === index));
  }

  /* Variant picking */
  setupOptions() {
    this.groups = [...this.querySelectorAll('[data-option-index]')];
    if (!this.groups.length) return;
    this.groups.forEach((group) => group.addEventListener('change', () => this.updateVariant()));
    this.markAvailability();
  }

  selectedOptions() {
    return this.groups.map((group) => group.querySelector('[data-option-value]:checked')?.value);
  }

  updateVariant() {
    const selected = this.selectedOptions();
    const variant = this.variants.find((v) => v.options.every((value, i) => value === selected[i]));
    const add = this.querySelector('[data-add-button]');
    const addLabel = this.querySelector('[data-add-label]');
    const buy = this.querySelector('[data-buy-now]');
    if (!add) return;
    if (!this.addText) this.addText = addLabel.textContent;

    if (!variant) {
      add.disabled = true;
      if (buy) buy.disabled = true;
      addLabel.textContent = 'Unavailable';
      return;
    }

    this.idInput.value = variant.id;
    const price = this.querySelector('[data-price]');
    if (price) price.textContent = variant.price;
    const compare = this.querySelector('[data-compare-price]');
    if (compare) {
      compare.hidden = !variant.compare;
      compare.textContent = variant.compare || '';
    }
    add.disabled = !variant.available;
    if (buy) buy.disabled = !variant.available;
    addLabel.textContent = variant.available ? this.addText : 'Sold out';

    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.id);
    window.history.replaceState({}, '', url);
    this.markAvailability();
  }

  /* Options that make no available variant with the other choices are struck through */
  markAvailability() {
    const selected = this.selectedOptions();
    this.groups.forEach((group, index) => {
      group.querySelectorAll('[data-option-value]').forEach((input) => {
        const choice = [...selected];
        choice[index] = input.value;
        const match = this.variants.find((v) => v.options.every((value, i) => value === choice[i]));
        input.nextElementSibling?.classList.toggle('is-unavailable', !match || !match.available);
      });
    });
  }

  async buyNow(button) {
    if (!this.form) return;
    if (!this.form.reportValidity()) return;
    button.classList.add('is-loading');
    try {
      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(this.form),
      });
      if (!response.ok) throw new Error('add failed');
      window.location.href = '/checkout';
    } catch {
      button.classList.remove('is-loading');
      this.form.requestSubmit();
    }
  }

  /* Complete your look */
  setupUpsell() {
    const track = this.querySelector('[data-upsell-track]');
    if (!track) return;
    const dots = [...this.querySelectorAll('[data-upsell-dot]')];
    const slides = [...track.querySelectorAll('[data-upsell-slide]')];
    const step = () => (slides[1] ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth);
    dots.forEach((dot) =>
      dot.addEventListener('click', () => track.scrollTo({ left: Number(dot.dataset.upsellDot) * step(), behavior: 'smooth' }))
    );
    track.addEventListener('scroll', () => {
      const current = Math.round(track.scrollLeft / Math.max(1, step()));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
    }, { passive: true });

    track.querySelectorAll('[data-quick-buy]').forEach((button) =>
      button.addEventListener('click', async () => {
        button.classList.add('is-loading');
        try {
          const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: [{ id: Number(button.dataset.quickBuy), quantity: 1 }] }),
          });
          if (!response.ok) throw new Error('add failed');
          button.classList.add('is-added');
          document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
          setTimeout(() => button.classList.remove('is-added'), 2500);
        } catch {
          window.location.href = button.closest('[data-upsell-slide]')?.querySelector('a')?.href || '/cart';
        } finally {
          button.classList.remove('is-loading');
        }
      })
    );
  }

  /* Size chart drawer */
  setupDrawer() {
    this.drawer = this.querySelector('[data-size-chart]');
    if (!this.drawer) return;
    this.querySelectorAll('[data-size-chart-open]').forEach((button) =>
      button.addEventListener('click', () => this.openDrawer(button))
    );
    this.drawer.querySelectorAll('[data-size-chart-close]').forEach((button) =>
      button.addEventListener('click', () => this.closeDrawer())
    );
    this.onKeydown = (event) => {
      if (event.key === 'Escape' && !this.drawer.hidden) this.closeDrawer();
    };
    document.addEventListener('keydown', this.onKeydown);
  }

  openDrawer(opener) {
    this.opener = opener;
    this.drawer.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      this.drawer.classList.add('is-open');
      this.drawer.querySelector('[role="dialog"]')?.focus();
    });
  }

  closeDrawer() {
    this.drawer.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    setTimeout(() => {
      this.drawer.hidden = true;
      this.opener?.focus();
    }, 300);
  }
}

/* Product page "You may also like" / "Recently viewed": tabs with a sliding bar, Shopify's
   recommendations swapped in when they load, and recently viewed products from this browser. */
class CbRelated extends HTMLElement {
  connectedCallback() {
    this.tabs = [...this.querySelectorAll('[data-related-tab]')];
    this.thumb = this.querySelector('[data-related-thumb]');
    this.tabs.forEach((tab) => tab.addEventListener('click', () => this.select(tab)));
    this.moveBar(this.tabs[0]);
    window.addEventListener('resize', () => this.moveBar(this.tabs.find((t) => t.classList.contains('is-active'))));
    document.fonts?.ready.then(() => this.moveBar(this.tabs.find((t) => t.classList.contains('is-active'))));

    this.remember();
    if (this.dataset.url) this.loadRecommendations();
  }

  select(tab) {
    this.tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
      const panel = this.querySelector(`#${t.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !active;
    });
    this.moveBar(tab);
    if (tab.getAttribute('aria-controls')?.startsWith('CbRecent')) this.showRecent();
  }

  moveBar(tab) {
    if (!tab || !this.thumb) return;
    const bar = this.thumb.parentElement.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    this.thumb.style.left = `${box.left - bar.left}px`;
    this.thumb.style.width = `${box.width}px`;
  }

  async loadRecommendations() {
    try {
      const html = await (await fetch(this.dataset.url)).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const grid = doc.querySelector('[data-related-grid]');
      if (grid && grid.children.length) this.querySelector('[data-related-grid]').innerHTML = grid.innerHTML;
    } catch {
      /* keep the products already shown */
    }
  }

  recentKey() {
    return 'cb-recently-viewed';
  }

  remember() {
    const handle = this.dataset.handle;
    if (!handle) return;
    try {
      const list = JSON.parse(localStorage.getItem(this.recentKey()) || '[]').filter((h) => h !== handle);
      list.unshift(handle);
      localStorage.setItem(this.recentKey(), JSON.stringify(list.slice(0, 12)));
    } catch {
      /* storage unavailable */
    }
  }

  async showRecent() {
    const grid = this.querySelector('[data-recent-grid]');
    const empty = this.querySelector('[data-recent-empty]');
    if (!grid || this.recentLoaded) return;
    this.recentLoaded = true;
    let handles = [];
    try {
      handles = JSON.parse(localStorage.getItem(this.recentKey()) || '[]').filter((h) => h !== this.dataset.handle);
    } catch {
      handles = [];
    }
    handles = handles.slice(0, Number(this.dataset.limit) || 4);
    const products = (
      await Promise.all(
        handles.map((handle) =>
          fetch(`${window.Shopify?.routes?.root || '/'}products/${handle}.js`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      )
    ).filter(Boolean);
    if (!products.length) {
      if (empty) empty.hidden = false;
      return;
    }
    const currency = window.Shopify?.currency?.active || 'AED';
    const money = (cents) => `${currency} ${(cents / 100).toFixed(2)}`;
    const sized = (src, width) => (src ? `${src}${src.includes('?') ? '&' : '?'}width=${width}` : '');
    const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    grid.innerHTML = products
      .map((p) => {
        const image = p.featured_image ? `<img class="cb-related-card__img" src="${sized(p.featured_image, 700)}" alt="${escape(p.title)}" loading="lazy">` : '';
        const hover = p.images?.[1] ? `<img class="cb-related-card__img cb-related-card__img--hover" src="${sized(p.images[1], 700)}" alt="" loading="lazy">` : '';
        return `<div class="cb-related-card"><div class="cb-related-card__image"><div class="cb-related-card__frame"><a class="cb-related-card__media" href="${p.url}" aria-label="${escape(p.title)}">${image}${hover}</a></div></div><div class="cb-related-card__info"><a class="cb-related-card__title" href="${p.url}">${escape(p.title)}</a><a class="cb-related-card__price" href="${p.url}">${money(p.price)}</a></div></div>`;
      })
      .join('');
  }
}

/* Scroll animations, like the live store's AOS setup: when a section is 10% in view its parts
   fade in once, 20px travel over 0.5s. Headings, lines, text and buttons rise (fade-up) 150ms
   apart, repeated items follow on in the same rhythm, product cards slide in from the right
   (fade-left) 150ms apart along each row, and pictures beside text fade. The product page
   column comes in as a sequence (heroFade timings). Runs when layout/theme.liquid adds .cb-aos. */
const CbAnimate = (() => {
  const STEP = 150;
  const SKIP_SECTIONS = '.cb-video-reviews, .cb-social, cb-popup, .cb-popup, .cb-hero, .cb-strip';
  const SKIP_INSIDE = 'cb-reels, .cb-rw__grid, .cb-pdp-drawer, .cb-related__panel[hidden], dialog, details:not([open]) .cb-accordion__body';
  const HEAD =
    '.cb-subheading, .cb-heading, .cb-heading-line, .cb-page-title__title, .cb-reviews-wall__title, .cb-size-chart__title, ' +
    '.cb-loyalty__heading, .cb-loyalty__text, .cb-rte, .cb-buttons, .cb-text__block--button, .cb-related__head, .cb-rw__header, ' +
    '.cb-reviews-wall__text, .cb-goal-card, .cb-loyalty-hero__card';
  const ITEMS =
    '.cb-accordion, .cb-icons__item, .cb-columns__item, .cb-tiles__card, .cb-banners__item, .cb-features__item, .cb-report__card, ' +
    '.cb-locations__store, .cb-loyalty-card, .cb-loyalty-step, .cb-loyalty-faq__entry, .cb-size-chart__table, .cb-compare__table, ' +
    '.cb-press__slide, .cb-size-chart__diagram';
  const CARDS = 'product-card, .cb-related-card';
  const FADE = '.cb-iwt__media, .cb-overlap__image, .cb-locations__gallery';
  const FADE_UP = '.cb-image__frame';

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enabled = () => document.documentElement.classList.contains('cb-aos') && !reduced();

  const tag = (el, type, delay) => {
    if (!el || el.hasAttribute('data-cb-aos')) return false;
    el.setAttribute('data-cb-aos', type);
    el.style.setProperty('--cb-aos-delay', `${delay}ms`);
    return true;
  };

  /* Keep only the innermost matches, outside cards / items, so nothing animates twice */
  const leaves = (root, selector, exclude) =>
    [...root.querySelectorAll(selector)].filter(
      (el) =>
        !el.querySelector(selector) &&
        !el.closest(SKIP_INSIDE) &&
        !(exclude && el.parentElement?.closest(exclude))
    );

  /* "hero" sequence on the product page: 0.1s, then gaps shrinking from 88.5ms by 3ms */
  const heroDelay = (order) => {
    let delay = 100;
    for (let i = 1; i < order; i += 1) delay += 88.5 - 3 * (i - 1);
    return Math.round(delay);
  };

  const prepareProduct = (section) => {
    const gallery = section.querySelector('.cb-pdp__gallery');
    tag(gallery, 'fade', 100);
    const parts = [
      ...section.querySelectorAll(
        '.cb-pdp__info > .cb-pdp__block, .cb-pdp__option, .cb-pdp__form-body > *, .cb-pdp__info > .cb-pdp__block--stylist'
      ),
    ].filter((el) => !el.classList.contains('cb-pdp__block--spacer'));
    parts.forEach((el, i) => tag(el, 'hero', heroDelay(i + 2)));
  };

  const prepare = (section) => {
    if (section.querySelector('.cb-pdp')) {
      prepareProduct(section);
      return;
    }
    if (section.querySelector(SKIP_SECTIONS)) return;

    let delay = STEP;
    const itemSel = `${ITEMS}, ${CARDS}`;

    section.querySelectorAll(FADE).forEach((el) => tag(el, 'fade', STEP));
    section.querySelectorAll(FADE_UP).forEach((el) => tag(el, 'fade-up', STEP));

    leaves(section, HEAD, itemSel).forEach((el) => {
      if (tag(el, 'fade-up', delay)) delay += STEP;
    });

    leaves(section, ITEMS, CARDS).forEach((el) => {
      if (tag(el, 'fade-up', delay)) delay += STEP;
    });

    /* Product cards: 0, 150, 300… along each row, starting again on the next row */
    let rowTop = null;
    let column = 0;
    [...section.querySelectorAll(CARDS)]
      .filter((el) => !el.closest(SKIP_INSIDE))
      .forEach((card) => {
        const top = Math.round(card.getBoundingClientRect().top);
        if (rowTop === null || Math.abs(top - rowTop) > 4) {
          rowTop = top;
          column = 0;
        }
        if (tag(card, 'fade-left', Math.min(column, 4) * STEP)) card.setAttribute('data-cb-aos-self', '');
        column += 1;
      });
  };

  /* Show and then let go of the attributes, so hover transitions keep their own timing */
  const reveal = (root) => {
    const parts = root.hasAttribute('data-cb-aos-self')
      ? [root]
      : root.querySelectorAll('[data-cb-aos]:not(.cb-aos-animate):not([data-cb-aos-self])');
    parts.forEach((el) => {
      el.classList.add('cb-aos-animate');
      const delay = parseFloat(el.style.getPropertyValue('--cb-aos-delay')) || 0;
      setTimeout(() => {
        el.removeAttribute('data-cb-aos');
        el.removeAttribute('data-cb-aos-self');
        el.classList.remove('cb-aos-animate');
        el.style.removeProperty('--cb-aos-delay');
      }, delay + 650);
    });
  };

  const init = () => {
    if (!enabled() || !('IntersectionObserver' in window)) {
      document.documentElement.classList.remove('cb-aos');
      return;
    }
    const sections = [...document.querySelectorAll('#MainContent > .shopify-section')];
    sections.forEach(prepare);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const tallEnough = entry.intersectionRect.height > window.innerHeight * 0.25;
          if (entry.isIntersecting && (entry.intersectionRatio > 0.1 || tallEnough)) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach((section) => observer.observe(section));
    /* Each product card comes in when it is itself in view, as on the live store */
    document.querySelectorAll('[data-cb-aos-self]').forEach((card) => observer.observe(card));
  };

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CbAnimate.init(), { once: true });
} else {
  CbAnimate.init();
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
define('cb-video-reviews', CbVideoReviews);
define('cb-social-feed', CbSocialFeed);
define('cb-reviews-wall', CbReviewsWall);
define('cb-product', CbProduct);
define('cb-related', CbRelated);
