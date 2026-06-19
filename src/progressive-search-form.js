/* progressive-search-form
 * Author: Uli Schäffler
 * License: MIT
 */

class ProgressiveSearchForm extends HTMLElement {
  constructor() {
    super();
    this.form = null;
    this.status = null;
    this.requestController = null;
    this.lifecycleController = null;
    this.inputTimer = null;
    this.messages = null;
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.handleResultsClick = this.handleResultsClick.bind(this);
  }

  connectedCallback() {
    this.form = this.querySelector('form');
    if (!this.form || this.method() !== 'GET' || !this.results()) return;
    if (this.responseType() === 'html' && typeof Element.prototype.setHTML !== 'function') return;

    this.lifecycleController = new AbortController();
    this.status = this.ensureStatus();
    this.setAttribute('enhanced', '');

    this.form.addEventListener('submit', this.handleSubmit, { signal: this.lifecycleController.signal });
    this.results().addEventListener('click', this.handleResultsClick, { signal: this.lifecycleController.signal });

    if (this.hasAttribute('search-on-input')) {
      this.form.addEventListener('input', this.handleInput, { signal: this.lifecycleController.signal });
      this.form.addEventListener('change', this.handleInput, { signal: this.lifecycleController.signal });
    }

    if (this.historyMode() !== 'off') {
      window.addEventListener('popstate', this.handlePopState, { signal: this.lifecycleController.signal });
    }
  }

  disconnectedCallback() {
    if (this.lifecycleController) this.lifecycleController.abort();
    if (this.requestController) this.requestController.abort();
    clearTimeout(this.inputTimer);
  }

  async handleSubmit(event) {
    if (!this.canEnhance(event.submitter)) return;
    event.preventDefault();
    if (!this.form.checkValidity()) {
      this.form.reportValidity();
      return;
    }
    this.resetPage();
    await this.search({ submitter: event.submitter, url: null, push: true, focus: true });
  }

  handleInput() {
    clearTimeout(this.inputTimer);
    this.inputTimer = setTimeout(() => {
      if (!this.form.checkValidity() || !this.meetsMinLength()) return;
      this.resetPage();
      this.search({ submitter: null, url: null, push: this.historyMode() !== 'off', focus: false });
    }, this.inputDelay());
  }

  async handlePopState() {
    const url = new URL(location.href);
    this.syncForm(url);
    await this.search({ submitter: null, url, push: false, focus: false });
  }

  handleResultsClick(event) {
    if (this.responseType() !== 'html' || !(event.target instanceof Element)) return;
    const link = event.target.closest('a[data-search-page-link]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    this.syncForm(url);
    this.search({ submitter: null, url, push: this.historyMode() !== 'off', focus: true });
  }

  canEnhance(submitter) {
    if (!this.form || this.hasAttribute('disabled')) return false;
    if (this.form.target && this.form.target !== '_self') return false;
    if (this.method(submitter) !== 'GET') return false;
    return this.actionUrl(submitter).origin === location.origin;
  }

  async search(options) {
    const resultsElement = this.results();
    if (!resultsElement) return;

    const url = options.url || this.buildUrl(options.submitter);
    const responseType = this.responseType();

    if (!this.emit('before-search', { url, responseType, form: this.form, resultsElement }, true)) return;

    if (this.requestController) this.requestController.abort();
    const controller = new AbortController();
    this.requestController = controller;
    this.loading(true);
    this.announce(this.t('loading'));

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          Accept: responseType === 'json' ? 'application/json' : 'text/html',
          'X-Requested-With': 'fetch',
          'X-Progressive-Search': '1'
        }
      });
      if (!response.ok) throw new Error(`Search failed with status ${response.status}`);

      if (responseType === 'json') {
        this.renderJson(resultsElement, await response.json());
      } else {
        resultsElement.replaceChildren(this.extractHtml(await response.text()));
      }

      if (!resultsElement.hasAttribute('tabindex')) resultsElement.setAttribute('tabindex', '-1');
      if (options.focus) {
        resultsElement.focus({ preventScroll: true });
        resultsElement.scrollIntoView({ block: 'start' });
      }
      this.announceResults(resultsElement);
      if (options.push) this.updateHistory(url);
      this.emit('success', { url, responseType, form: this.form, resultsElement }, false);
    } catch (error) {
      if (error.name === 'AbortError') {
        this.emit('abort', { url, responseType, form: this.form, resultsElement, error }, false);
        return;
      }
      this.emit('error', { url, responseType, form: this.form, resultsElement, error }, false);
      if (responseType === 'html') {
        location.assign(url.href);
        return;
      }
      this.renderError(resultsElement);
    } finally {
      if (this.requestController === controller) {
        this.requestController = null;
        this.loading(false);
      }
    }
  }

  extractHtml(html) {
    const box = document.createElement('div');
    box.setHTML(html);
    const match = box.querySelector(this.resultsSelector());
    const source = match || box;
    const fragment = document.createDocumentFragment();
    while (source.firstChild) fragment.append(source.firstChild);
    if (!fragment.hasChildNodes()) throw new Error('Empty HTML result.');
    return fragment;
  }

  renderJson(resultsElement, payload) {
    const heading = document.createElement('h2');
    const count = document.createElement('p');
    heading.id = this.headingId();
    heading.textContent = this.getAttribute('results-heading') || this.t('heading');
    count.className = 'search-result-count';
    resultsElement.replaceChildren(heading, count);

    if (!payload || typeof payload !== 'object') {
      count.textContent = this.t('invalidResponse');
      this.emit('invalid-response', { payload, reason: 'Payload is not an object.', resultsElement }, false);
      return;
    }

    const items = this.path(payload, this.attr('items-path', 'results'));
    const query = this.text(this.path(payload, this.attr('query-path', 'query'))) || this.currentQuery();
    const total = Number(this.path(payload, this.attr('count-path', 'count')) || 0);
    const page = Number(this.path(payload, this.attr('page-path', 'page')) || 1);
    const limit = Number(this.path(payload, this.attr('limit-path', 'limit')) || 0);
    const totalPages = Number(this.path(payload, this.attr('total-pages-path', 'totalPages')) || 1);

    if (!Array.isArray(items)) {
      count.textContent = this.t('invalidResponse');
      this.emit('invalid-response', { payload, reason: 'Items path is not an array.', resultsElement }, false);
      return;
    }
    if (query.length === 0 && items.length === 0) {
      count.textContent = this.t('initial');
      return;
    }
    if (items.length === 0) {
      count.textContent = this.t('noResults', { query });
      return;
    }

    count.textContent = this.t('resultsPaged', { count: total || items.length, query, page, totalPages });
    const list = document.createElement(this.attr('list-tag', 'ol'));
    list.className = this.attr('list-class', 'result-list');
    if (list.tagName === 'OL' && limit > 0) list.start = ((page - 1) * limit) + 1;
    for (const item of items) list.append(this.resultFromTemplate(item));
    resultsElement.append(list);

    const pagination = this.paginationFromTemplate(payload);
    if (pagination) resultsElement.append(pagination);
  }

  resultFromTemplate(item) {
    const template = this.querySelector('template[data-result-template]');
    if (!template) {
      this.emit('template-missing', { item }, false);
      const li = document.createElement('li');
      const pre = document.createElement('pre');
      pre.className = 'result-json-fallback';
      pre.textContent = JSON.stringify(item, null, 2);
      li.append(pre);
      return li;
    }
    const fragment = template.content.cloneNode(true);
    this.bindTemplate(fragment, item);
    return fragment;
  }

  bindTemplate(root, item) {
    for (const el of root.querySelectorAll('[data-if], [data-text], [data-href], [data-src]')) {
      if (el.hasAttribute('data-if')) {
        const value = this.path(item, el.getAttribute('data-if'));
        if (value === null || value === undefined || value === '' || value === false) {
          el.remove();
          continue;
        }
      }
      if (el.hasAttribute('data-text')) el.textContent = this.text(this.path(item, el.getAttribute('data-text')));
      if (el.hasAttribute('data-href')) el.setAttribute('href', this.safeNavigationUrl(this.path(item, el.getAttribute('data-href'))));
      if (el.hasAttribute('data-src')) {
        const url = this.safeResourceUrl(this.path(item, el.getAttribute('data-src')));
        if (url) el.setAttribute('src', url); else el.removeAttribute('src');
      }
      for (const attribute of Array.from(el.attributes)) {
        if (!attribute.name.startsWith('data-attr-')) continue;
        const target = attribute.name.replace('data-attr-', '');
        if (!this.safeAttribute(target)) continue;
        const value = this.text(this.path(item, attribute.value));
        if (value) el.setAttribute(target, value); else el.removeAttribute(target);
      }
    }
  }

  paginationFromTemplate(payload) {
    const template = this.querySelector('template[data-pagination-template]');
    if (!template) return null;
    const page = Number(this.path(payload, this.attr('page-path', 'page')) || 1);
    const totalPages = Number(this.path(payload, this.attr('total-pages-path', 'totalPages')) || 1);
    const total = Number(this.path(payload, this.attr('count-path', 'count')) || 0);
    const limit = Number(this.path(payload, this.attr('limit-path', 'limit')) || 0);
    const hasPrev = Boolean(this.path(payload, this.attr('has-previous-path', 'hasPreviousPage')));
    const hasNext = Boolean(this.path(payload, this.attr('has-next-path', 'hasNextPage')));
    if (!hasPrev && !hasNext) return null;

    const fragment = template.content.cloneNode(true);
    for (const el of fragment.querySelectorAll('[data-pagination-text]')) {
      const key = el.getAttribute('data-pagination-text');
      el.textContent = String({ page, totalPages, count: total, limit }[key] || '');
    }
    this.bindPageButton(fragment, 'previous', hasPrev, page - 1);
    this.bindPageButton(fragment, 'next', hasNext, page + 1);
    return fragment;
  }

  bindPageButton(root, action, enabled, page) {
    const button = root.querySelector(`[data-page-action="${action}"]`);
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.addEventListener('click', () => this.goToPage(page));
  }

  goToPage(page) {
    const input = this.querySelector('[data-search-page-input]');
    if (!input) return;
    const safePage = Math.max(1, page);
    input.value = String(safePage);
    this.emit('page-change', { page: safePage, form: this.form, resultsElement: this.results() }, false);
    this.search({ submitter: null, url: null, push: this.historyMode() !== 'off', focus: true });
  }

  resetPage() {
    const input = this.querySelector('[data-search-page-input]');
    if (input) input.value = '1';
  }

  renderError(resultsElement) {
    const heading = document.createElement('h2');
    const paragraph = document.createElement('p');
    heading.id = this.headingId();
    heading.textContent = this.getAttribute('results-heading') || this.t('heading');
    paragraph.className = 'search-error';
    paragraph.setAttribute('role', 'alert');
    paragraph.textContent = this.t('error');
    resultsElement.replaceChildren(heading, paragraph);
    this.announce(paragraph.textContent);
  }

  buildUrl(submitter) {
    const url = this.actionUrl(submitter);
    const formData = this.formData(submitter);
    const params = new URLSearchParams(url.search);
    for (const key of formData.keys()) params.delete(key);
    for (const [key, value] of formData.entries()) if (typeof value === 'string') params.append(key, value);
    url.search = params.toString();
    return url;
  }

  formData(submitter) {
    try { return new FormData(this.form, submitter); }
    catch {
      const data = new FormData(this.form);
      if (submitter && submitter.name) data.append(submitter.name, submitter.value);
      return data;
    }
  }

  syncForm(url) {
    for (const control of Array.from(this.form.elements)) {
      if (!control.name || control.disabled) continue;
      const values = url.searchParams.getAll(control.name);
      const type = (control.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        control.checked = values.includes(control.value);
      } else if (control.tagName === 'SELECT' && control.multiple) {
        for (const option of control.options) option.selected = values.includes(option.value);
      } else if ('value' in control) {
        control.value = values.length ? values[values.length - 1] : '';
      }
    }
  }

  loading(isLoading) {
    const resultsElement = this.results();
    const progress = this.querySelector('[data-search-progress]');
    this.toggleAttribute('loading', isLoading);
    this.form.toggleAttribute('aria-busy', isLoading);
    if (resultsElement) resultsElement.toggleAttribute('aria-busy', isLoading);
    if (progress) progress.hidden = !isLoading;
  }

  ensureStatus() {
    const existing = this.querySelector('[data-search-status]');
    if (existing) return existing;
    const status = document.createElement('p');
    status.className = 'visually-hidden';
    status.dataset.searchStatus = '';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    this.form.insertAdjacentElement('afterend', status);
    return status;
  }

  announceResults(resultsElement) {
    const count = resultsElement.querySelector('.search-result-count');
    this.announce(count && count.textContent ? count.textContent.trim() : this.t('updated'));
  }

  announce(message) {
    if (!this.status) return;
    setTimeout(() => { this.status.textContent = message; }, 120);
  }

  path(source, path) {
    if (!path || !source || typeof source !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
    return path.split('.').reduce((current, part) => current && typeof current === 'object' ? current[part] : undefined, source);
  }

  text(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map((entry) => this.text(entry)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  safeNavigationUrl(value) {
    if (typeof value !== 'string') return '#';
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '#';
    } catch { return '#'; }
  }

  safeResourceUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  safeAttribute(name) {
    return ['alt', 'aria-label', 'datetime', 'hreflang', 'lang', 'title'].includes(name);
  }

  updateHistory(url) {
    if (this.historyMode() === 'off' || url.href === location.href) return;
    history.pushState({ progressiveSearchForm: true, results: this.resultsSelector() }, '', url);
  }

  t(key, values = {}) {
    const template = this.getMessages()[key] || key;
    return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  }

  getMessages() {
    if (this.messages) return this.messages;
    const defaults = {
      heading: 'Search results',
      initial: 'Enter a search term.',
      loading: 'Search is running.',
      updated: 'Search results updated.',
      minLength: 'Enter at least {minLength} characters.',
      noResults: 'No results found for "{query}".',
      resultsPaged: '{count} results found for "{query}". Page {page} of {totalPages}.',
      invalidResponse: 'The search response could not be processed.',
      error: 'The search could not be performed. Please try again.'
    };
    const element = this.querySelector('script[type="application/json"][data-search-messages]');
    let custom = {};
    if (element && element.textContent.trim()) {
      try { custom = JSON.parse(element.textContent); }
      catch { custom = {}; }
    }
    this.messages = Object.assign({}, defaults, custom);
    return this.messages;
  }

  emit(name, detail, cancelable) {
    return this.dispatchEvent(new CustomEvent(`progressive-search-form:${name}`, { bubbles: true, cancelable, detail }));
  }

  method(submitter = null) {
    return ((submitter && submitter.getAttribute('formmethod')) || this.form.getAttribute('method') || 'get').toUpperCase();
  }

  actionUrl(submitter = null) {
    return new URL((submitter && submitter.getAttribute('formaction')) || this.form.getAttribute('action') || location.href, location.href);
  }

  responseType() { return this.getAttribute('response-type') === 'json' ? 'json' : 'html'; }
  attr(name, fallback) { return this.getAttribute(name) || fallback; }
  resultsSelector() { return this.getAttribute('results') || (this.form.getAttribute('aria-controls') ? `#${this.cssEscape(this.form.getAttribute('aria-controls'))}` : '#search-results'); }
  results() { return document.querySelector(this.resultsSelector()); }
  headingId() { const results = this.results(); return results && results.getAttribute('aria-labelledby') ? results.getAttribute('aria-labelledby') : 'search-results-heading'; }
  historyMode() { return this.hasAttribute('history') ? (this.getAttribute('history') || 'off') : (this.responseType() === 'json' ? 'off' : 'push'); }
  inputDelay() { const value = Number(this.getAttribute('search-on-input')); return Number.isFinite(value) && value >= 150 ? value : 350; }
  meetsMinLength() { const min = Number(this.getAttribute('min-length') || 0); const input = this.form.querySelector('input[type="search"]'); return !input || !Number.isFinite(min) || min <= 0 || input.value.trim().length >= min; }
  currentQuery() { const input = this.form.querySelector('input[type="search"]'); return input ? input.value.trim() : ''; }
  getMinimumSearchLengthForMessage() { const value = Number(this.getAttribute('min-length')); return Number.isFinite(value) && value > 0 ? value : 2; }
  getListTagName() { const value = this.attr('list-tag', 'ol'); return ['ol', 'ul', 'div'].includes(value) ? value : 'ol'; }
  getListClassName() { return this.attr('list-class', 'result-list'); }
  cssEscape(value) { return window.CSS && window.CSS.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
}

if (!customElements.get('progressive-search-form')) {
  customElements.define('progressive-search-form', ProgressiveSearchForm);
}
