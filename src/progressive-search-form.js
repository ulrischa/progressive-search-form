/* progressive-search-form
 * Author: Uli Schäffler
 * License: MIT
 */

export class ProgressiveSearchForm extends HTMLElement {
  constructor() {
    super();

    this.form = null;
    this.status = null;
    this.lifecycleController = null;
    this.requestController = null;
    this.inputTimer = null;
    this.messages = null;

    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handlePopState = this.handlePopState.bind(this);
    this.handleResultsClick = this.handleResultsClick.bind(this);
  }

  connectedCallback() {
    this.form = this.querySelector('form');

    if (!this.form) {
      return;
    }

    if (this.getFormMethod(null) !== 'GET') {
      return;
    }

    const resultsElement = this.getResultsElement();

    if (!resultsElement) {
      return;
    }

    if (this.getResponseType() === 'html' && typeof Element.prototype.setHTML !== 'function') {
      return;
    }

    this.lifecycleController = new AbortController();
    this.status = this.ensureStatusElement();
    this.setAttribute('enhanced', '');

    this.form.addEventListener('submit', this.handleSubmit, {
      signal: this.lifecycleController.signal,
    });

    resultsElement.addEventListener('click', this.handleResultsClick, {
      signal: this.lifecycleController.signal,
    });

    if (this.hasAttribute('search-on-input')) {
      this.form.addEventListener('input', this.handleInput, {
        signal: this.lifecycleController.signal,
      });

      this.form.addEventListener('change', this.handleInput, {
        signal: this.lifecycleController.signal,
      });
    }

    if (this.getHistoryMode() !== 'off') {
      window.addEventListener('popstate', this.handlePopState, {
        signal: this.lifecycleController.signal,
      });
    }
  }

  disconnectedCallback() {
    if (this.lifecycleController) {
      this.lifecycleController.abort();
    }

    if (this.requestController) {
      this.requestController.abort();
    }

    window.clearTimeout(this.inputTimer);
  }

  async handleSubmit(event) {
    if (!this.shouldEnhanceSubmit(event.submitter)) {
      return;
    }

    event.preventDefault();

    if (!this.form.checkValidity()) {
      this.form.reportValidity();
      return;
    }

    this.resetPage();

    await this.runSearch({
      submitter: event.submitter,
      requestUrl: null,
      updateHistory: this.getHistoryMode() !== 'off',
      historyAction: 'push',
      focusResults: true,
    });
  }

  handleInput() {
    window.clearTimeout(this.inputTimer);

    this.inputTimer = window.setTimeout(() => {
      if (!this.form.checkValidity()) {
        return;
      }

      if (!this.meetsMinimumSearchLength()) {
        return;
      }

      this.resetPage();

      this.runSearch({
        submitter: null,
        requestUrl: null,
        updateHistory: this.getHistoryMode() !== 'off',
        historyAction: 'replace',
        focusResults: false,
      });
    }, this.getSearchOnInputDelay());
  }

  async handlePopState() {
    const url = new URL(window.location.href);

    this.syncFormFromUrl(url);

    await this.runSearch({
      submitter: null,
      requestUrl: url,
      updateHistory: false,
      historyAction: 'replace',
      focusResults: false,
    });
  }

  handleResultsClick(event) {
    if (this.getResponseType() !== 'html') {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest('a[data-search-page-link]');

    if (!link) {
      return;
    }

    const url = new URL(link.href, window.location.href);

    if (url.origin !== window.location.origin) {
      return;
    }

    event.preventDefault();
    this.syncFormFromUrl(url);

    this.runSearch({
      submitter: null,
      requestUrl: url,
      updateHistory: this.getHistoryMode() !== 'off',
      historyAction: 'push',
      focusResults: true,
    });
  }

  shouldEnhanceSubmit(submitter) {
    if (!this.form || this.hasAttribute('disabled')) {
      return false;
    }

    if (this.form.target && this.form.target !== '_self') {
      return false;
    }

    if (this.getFormMethod(submitter) !== 'GET') {
      return false;
    }

    const url = this.getFormActionUrl(submitter);

    return url.origin === window.location.origin;
  }

  async runSearch(options) {
    const resultsElement = this.getResultsElement();

    if (!resultsElement) {
      return;
    }

    const finalUrl = options.requestUrl || this.createGetUrl(options.submitter);
    const responseType = this.getResponseType();

    const beforeSearchAllowed = this.dispatchSearchEvent('before-search', {
      url: finalUrl,
      responseType,
      form: this.form,
      resultsElement,
    }, true);

    if (!beforeSearchAllowed) {
      return;
    }

    this.abortCurrentRequest();

    const controller = new AbortController();
    this.requestController = controller;
    this.setLoading(true);
    this.announce(this.formatMessage('loading', {}));

    try {
      const response = await fetch(finalUrl, {
        method: 'GET',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          Accept: responseType === 'json' ? 'application/json' : 'text/html',
          'X-Requested-With': 'fetch',
          'X-Progressive-Search': '1',
        },
      });

      if (!response.ok) {
        throw new Error(`Search request failed with status ${response.status}.`);
      }

      if (responseType === 'json') {
        const payload = await response.json();
        this.renderJsonResults(resultsElement, payload);
      } else {
        const html = await response.text();
        const fragment = this.extractHtmlResultsFragment(html);
        resultsElement.replaceChildren(fragment);
      }

      if (!resultsElement.hasAttribute('tabindex')) {
        resultsElement.setAttribute('tabindex', '-1');
      }

      if (options.focusResults) {
        resultsElement.focus({ preventScroll: true });
        resultsElement.scrollIntoView({ block: 'start' });
      }

      this.announceResults(resultsElement);

      if (options.updateHistory) {
        this.updateBrowserHistory(finalUrl, options.historyAction);
      }

      this.dispatchSearchEvent('success', {
        url: finalUrl,
        responseType,
        form: this.form,
        resultsElement,
      }, false);
    } catch (error) {
      if (error.name === 'AbortError') {
        this.dispatchSearchEvent('abort', {
          url: finalUrl,
          responseType,
          form: this.form,
          resultsElement,
          error,
        }, false);
        return;
      }

      this.dispatchSearchEvent('error', {
        url: finalUrl,
        responseType,
        form: this.form,
        resultsElement,
        error,
      }, false);

      if (responseType === 'html') {
        window.location.assign(finalUrl.href);
        return;
      }

      this.renderError(resultsElement);
    } finally {
      if (this.requestController === controller) {
        this.requestController = null;
        this.setLoading(false);
      }
    }
  }

  abortCurrentRequest() {
    if (this.requestController) {
      this.requestController.abort();
    }
  }

  extractHtmlResultsFragment(html) {
    const selector = this.getResultsSelector();
    const temporaryContainer = document.createElement('div');

    temporaryContainer.setHTML(html);

    const incomingResults = temporaryContainer.querySelector(selector);
    const source = incomingResults || temporaryContainer;
    const fragment = document.createDocumentFragment();

    while (source.firstChild) {
      fragment.append(source.firstChild);
    }

    if (!fragment.hasChildNodes()) {
      throw new Error('No result content was found in the HTML response.');
    }

    return fragment;
  }

  renderJsonResults(resultsElement, payload) {
    const heading = document.createElement('h2');
    const count = document.createElement('p');

    heading.id = this.getHeadingId();
    heading.textContent = this.getAttribute('results-heading') || this.formatMessage('heading', {});
    count.className = 'search-result-count';
    resultsElement.replaceChildren(heading, count);

    if (!payload || typeof payload !== 'object') {
      count.textContent = this.formatMessage('invalidResponse', {});
      this.dispatchInvalidResponse(payload, 'Payload is not an object.', resultsElement);
      return;
    }

    const queryValue = this.getValueByPath(payload, this.getQueryPath());
    const items = this.getValueByPath(payload, this.getItemsPath());
    const total = this.getValueByPath(payload, this.getCountPath());
    const page = Number(this.getValueByPath(payload, this.getPagePath()) || 1);
    const limit = Number(this.getValueByPath(payload, this.getLimitPath()) || 0);
    const totalPages = Number(this.getValueByPath(payload, this.getTotalPagesPath()) || 1);
    const queryText = this.valueToText(queryValue) || this.getCurrentSearchTerm();

    if (!Array.isArray(items)) {
      count.textContent = this.formatMessage('invalidResponse', {});
      this.dispatchInvalidResponse(payload, `Items path "${this.getItemsPath()}" did not resolve to an array.`, resultsElement);
      return;
    }

    if (queryText.length === 0 && items.length === 0) {
      count.textContent = this.formatMessage('initial', {});
      return;
    }

    if (queryText.length > 0 && queryText.length < this.getMinimumSearchLengthForMessage() && items.length === 0) {
      count.textContent = this.formatMessage('minLength', {
        minLength: this.getMinimumSearchLengthForMessage(),
      });
      return;
    }

    if (items.length === 0) {
      count.textContent = this.formatMessage('noResults', { query: queryText });
      return;
    }

    const visibleTotal = Number.isFinite(Number(total)) ? Number(total) : items.length;

    count.textContent = this.formatMessage('resultsPaged', {
      count: visibleTotal,
      query: queryText,
      page,
      totalPages,
    });

    const list = document.createElement(this.getListTagName());
    list.className = this.getListClassName();

    if (list.tagName === 'OL' && Number.isFinite(limit) && limit > 0) {
      list.start = ((page - 1) * limit) + 1;
    }

    for (const item of items) {
      list.append(this.createTemplatedResultItem(item));
    }

    resultsElement.append(list);

    const pagination = this.createPagination(payload);

    if (pagination) {
      resultsElement.append(pagination);
    }
  }

  createTemplatedResultItem(item) {
    const template = this.querySelector('template[data-result-template]');

    if (!template) {
      this.dispatchSearchEvent('template-missing', {
        item,
        message: this.formatMessage('templateMissing', {}),
      }, false);
      return this.createFallbackResultItem(item);
    }

    const fragment = template.content.cloneNode(true);
    this.applyTemplateBindings(fragment, item);
    return fragment;
  }

  applyTemplateBindings(root, item) {
    const boundElements = root.querySelectorAll('[data-if], [data-text], [data-href], [data-src]');

    for (const element of boundElements) {
      if (element.hasAttribute('data-if')) {
        const conditionValue = this.getValueByPath(item, element.getAttribute('data-if'));

        if (conditionValue === null || conditionValue === undefined || conditionValue === '' || conditionValue === false) {
          element.remove();
          continue;
        }
      }

      if (element.hasAttribute('data-text')) {
        const value = this.getValueByPath(item, element.getAttribute('data-text'));
        element.textContent = this.valueToText(value);
      }

      if (element.hasAttribute('data-href')) {
        const value = this.getValueByPath(item, element.getAttribute('data-href'));
        element.setAttribute('href', this.getSafeNavigationUrl(value));
      }

      if (element.hasAttribute('data-src')) {
        const value = this.getValueByPath(item, element.getAttribute('data-src'));
        const safeUrl = this.getSafeResourceUrl(value);

        if (safeUrl) {
          element.setAttribute('src', safeUrl);
        } else {
          element.removeAttribute('src');
        }
      }

      for (const attribute of Array.from(element.attributes)) {
        if (!attribute.name.startsWith('data-attr-')) {
          continue;
        }

        const targetAttribute = attribute.name.replace('data-attr-', '');
        const value = this.getValueByPath(item, attribute.value);

        if (!this.isSafeTemplateAttributeName(targetAttribute)) {
          continue;
        }

        if (value === null || value === undefined || value === '') {
          element.removeAttribute(targetAttribute);
          continue;
        }

        element.setAttribute(targetAttribute, this.valueToText(value));
      }
    }
  }

  createPagination(payload) {
    const template = this.querySelector('template[data-pagination-template]');

    if (!template) {
      return null;
    }

    const page = Number(this.getValueByPath(payload, this.getPagePath()) || 1);
    const limit = Number(this.getValueByPath(payload, this.getLimitPath()) || 0);
    const total = Number(this.getValueByPath(payload, this.getCountPath()) || 0);
    const totalPages = Number(this.getValueByPath(payload, this.getTotalPagesPath()) || 1);
    const hasPreviousPage = Boolean(this.getValueByPath(payload, this.getHasPreviousPath()));
    const hasNextPage = Boolean(this.getValueByPath(payload, this.getHasNextPath()));

    if (!hasPreviousPage && !hasNextPage) {
      return null;
    }

    const fragment = template.content.cloneNode(true);

    for (const element of fragment.querySelectorAll('[data-pagination-text]')) {
      const key = element.getAttribute('data-pagination-text');

      if (key === 'page') element.textContent = String(page);
      if (key === 'totalPages') element.textContent = String(totalPages);
      if (key === 'count') element.textContent = String(total);
      if (key === 'limit') element.textContent = String(limit);
    }

    const previousButton = fragment.querySelector('[data-page-action="previous"]');
    const nextButton = fragment.querySelector('[data-page-action="next"]');

    if (previousButton) {
      previousButton.disabled = !hasPreviousPage;
      previousButton.setAttribute('aria-disabled', hasPreviousPage ? 'false' : 'true');
      previousButton.addEventListener('click', () => this.goToPage(page - 1));
    }

    if (nextButton) {
      nextButton.disabled = !hasNextPage;
      nextButton.setAttribute('aria-disabled', hasNextPage ? 'false' : 'true');
      nextButton.addEventListener('click', () => this.goToPage(page + 1));
    }

    return fragment;
  }

  goToPage(page) {
    const safePage = Math.max(1, page);
    const pageInput = this.querySelector('[data-search-page-input]');

    if (!pageInput) {
      return;
    }

    pageInput.value = String(safePage);

    this.dispatchSearchEvent('page-change', {
      page: safePage,
      form: this.form,
      resultsElement: this.getResultsElement(),
    }, false);

    this.runSearch({
      submitter: null,
      requestUrl: null,
      updateHistory: this.getHistoryMode() !== 'off',
      historyAction: 'push',
      focusResults: true,
    });
  }

  resetPage() {
    const pageInput = this.querySelector('[data-search-page-input]');

    if (pageInput) {
      pageInput.value = '1';
    }
  }

  createFallbackResultItem(item) {
    const listItem = document.createElement('li');
    const pre = document.createElement('pre');

    pre.className = 'result-json-fallback';
    pre.textContent = JSON.stringify(item, null, 2);
    listItem.append(pre);

    return listItem;
  }

  dispatchInvalidResponse(payload, reason, resultsElement) {
    this.dispatchSearchEvent('invalid-response', {
      payload,
      reason,
      resultsElement,
    }, false);
  }

  getValueByPath(source, path) {
    if (!path || !source || typeof source !== 'object') {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(source, path)) {
      return source[path];
    }

    return path.split('.').reduce((current, segment) => {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      return current[segment];
    }, source);
  }

  valueToText(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map((entry) => this.valueToText(entry)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  getSafeNavigationUrl(value) {
    if (typeof value !== 'string') return '#';

    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : '#';
    } catch {
      return '#';
    }
  }

  getSafeResourceUrl(value) {
    if (typeof value !== 'string') return '';

    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  isSafeTemplateAttributeName(name) {
    return ['alt', 'aria-label', 'datetime', 'hreflang', 'lang', 'title'].includes(name);
  }

  renderError(resultsElement) {
    const message = this.formatMessage('error', {});
    const heading = document.createElement('h2');
    const paragraph = document.createElement('p');

    heading.id = this.getHeadingId();
    heading.textContent = this.getAttribute('results-heading') || this.formatMessage('heading', {});
    paragraph.className = 'search-error';
    paragraph.setAttribute('role', 'alert');
    paragraph.textContent = message;
    resultsElement.replaceChildren(heading, paragraph);
    this.announce(message);
  }

  createGetUrl(submitter) {
    const url = this.getFormActionUrl(submitter);
    const formData = this.createFormData(submitter);
    const params = new URLSearchParams(url.search);

    for (const key of formData.keys()) {
      params.delete(key);
    }

    for (const [key, value] of formData.entries()) {
      if (typeof value === 'string') {
        params.append(key, value);
      }
    }

    url.search = params.toString();
    return url;
  }

  createFormData(submitter) {
    try {
      return new FormData(this.form, submitter);
    } catch {
      const formData = new FormData(this.form);

      if (submitter && submitter.name) {
        formData.append(submitter.name, submitter.value);
      }

      return formData;
    }
  }

  getFormMethod(submitter) {
    return ((submitter && submitter.getAttribute('formmethod')) || this.form.getAttribute('method') || 'get').toUpperCase();
  }

  getFormActionUrl(submitter) {
    const action = (submitter && submitter.getAttribute('formaction')) || this.form.getAttribute('action') || window.location.href;
    return new URL(action, window.location.href);
  }

  getResponseType() {
    return this.getAttribute('response-type') === 'json' ? 'json' : 'html';
  }

  getResultsSelector() {
    const configuredSelector = this.getAttribute('results');

    if (configuredSelector) return configuredSelector;

    const controlledId = this.form ? this.form.getAttribute('aria-controls') : '';

    if (controlledId) return `#${this.escapeCssIdentifier(controlledId)}`;

    return '#search-results';
  }

  getResultsElement() {
    const root = this.getRootNode();
    const selector = this.getResultsSelector();
    return 'querySelector' in root ? root.querySelector(selector) : document.querySelector(selector);
  }

  getHeadingId() {
    const resultsElement = this.getResultsElement();
    return resultsElement && resultsElement.getAttribute('aria-labelledby') ? resultsElement.getAttribute('aria-labelledby') : 'search-results-heading';
  }

  getItemsPath() { return this.getAttribute('items-path') || 'results'; }
  getCountPath() { return this.getAttribute('count-path') || 'count'; }
  getQueryPath() { return this.getAttribute('query-path') || 'query'; }
  getPagePath() { return this.getAttribute('page-path') || 'page'; }
  getLimitPath() { return this.getAttribute('limit-path') || 'limit'; }
  getTotalPagesPath() { return this.getAttribute('total-pages-path') || 'totalPages'; }
  getHasNextPath() { return this.getAttribute('has-next-path') || 'hasNextPage'; }
  getHasPreviousPath() { return this.getAttribute('has-previous-path') || 'hasPreviousPage'; }

  getListTagName() {
    const value = this.getAttribute('list-tag') || 'ol';
    return ['ol', 'ul', 'div'].includes(value) ? value : 'ol';
  }

  getListClassName() { return this.getAttribute('list-class') || 'result-list'; }

  getHistoryMode() {
    if (this.hasAttribute('history')) return this.getAttribute('history') || 'off';
    return this.getResponseType() === 'json' ? 'off' : 'push';
  }

  getSearchOnInputDelay() {
    const value = Number(this.getAttribute('search-on-input'));
    return Number.isFinite(value) && value >= 150 ? value : 350;
  }

  getMinimumSearchLengthForMessage() {
    const value = Number(this.getAttribute('min-length'));
    return Number.isFinite(value) && value >= 1 ? value : 2;
  }

  meetsMinimumSearchLength() {
    const minLength = Number(this.getAttribute('min-length') || 0);

    if (!Number.isFinite(minLength) || minLength <= 0) return true;

    const searchInput = this.form.querySelector('input[type="search"]');
    return searchInput ? searchInput.value.trim().length >= minLength : true;
  }

  getCurrentSearchTerm() {
    const searchInput = this.form.querySelector('input[type="search"]');
    return searchInput ? searchInput.value.trim() : '';
  }

  ensureStatusElement() {
    const existingStatus = this.querySelector('[data-search-status]');

    if (existingStatus) return existingStatus;

    const status = document.createElement('p');
    const baseId = this.form.id || `progressive-search-${Math.random().toString(36).slice(2)}`;

    status.id = `${baseId}-status`;
    status.className = 'visually-hidden';
    status.dataset.searchStatus = '';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    this.form.insertAdjacentElement('afterend', status);

    return status;
  }

  announceResults(resultsElement) {
    const countElement = resultsElement.querySelector('.search-result-count');
    const message = countElement && countElement.textContent ? countElement.textContent.trim() : this.formatMessage('updated', {});
    this.announce(message);
  }

  announce(message) {
    if (!this.status) return;

    window.setTimeout(() => {
      this.status.textContent = message;
    }, 120);
  }

  setLoading(isLoading) {
    const resultsElement = this.getResultsElement();
    const progressElement = this.querySelector('[data-search-progress]');

    this.toggleAttribute('loading', isLoading);

    if (isLoading) {
      this.form.setAttribute('aria-busy', 'true');
      if (resultsElement) resultsElement.setAttribute('aria-busy', 'true');
    } else {
      this.form.removeAttribute('aria-busy');
      if (resultsElement) resultsElement.removeAttribute('aria-busy');
    }

    if (progressElement) progressElement.hidden = !isLoading;
  }

  updateBrowserHistory(url, action) {
    const mode = this.getHistoryMode();

    if (mode === 'off' || url.href === window.location.href) return;

    const state = {
      progressiveSearchForm: true,
      results: this.getResultsSelector(),
    };

    if (action === 'replace' || mode === 'replace') {
      window.history.replaceState(state, '', url);
      return;
    }

    window.history.pushState(state, '', url);
  }

  syncFormFromUrl(url) {
    const params = url.searchParams;
    const controls = Array.from(this.form.elements);

    for (const control of controls) {
      if (!control.name || control.disabled) continue;

      const values = params.getAll(control.name);
      const type = (control.type || '').toLowerCase();

      if (type === 'checkbox' || type === 'radio') {
        control.checked = values.includes(control.value);
        continue;
      }

      if (control.tagName === 'SELECT' && control.multiple) {
        for (const option of control.options) {
          option.selected = values.includes(option.value);
        }
        continue;
      }

      if ('value' in control) {
        control.value = values.length > 0 ? values[values.length - 1] : '';
      }
    }
  }

  dispatchSearchEvent(name, detail, cancelable) {
    return this.dispatchEvent(new CustomEvent(`progressive-search-form:${name}`, {
      bubbles: true,
      cancelable,
      detail,
    }));
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
      error: 'The search could not be performed. Please try again.',
      templateMissing: 'No result template found. Raw data is shown.',
    };

    const messageElement = this.querySelector('script[type="application/json"][data-search-messages]');
    let customMessages = {};

    if (messageElement && messageElement.textContent.trim()) {
      try {
        const parsedMessages = JSON.parse(messageElement.textContent);
        if (parsedMessages && typeof parsedMessages === 'object') customMessages = parsedMessages;
      } catch {
        customMessages = {};
      }
    }

    this.messages = Object.assign({}, defaults, customMessages);
    return this.messages;
  }

  formatMessage(key, values) {
    const messages = this.getMessages();
    const template = messages[key] || key;

    return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, name) => {
      if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
      return String(values[name]);
    });
  }

  escapeCssIdentifier(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
}

if (!customElements.get('progressive-search-form')) {
  customElements.define('progressive-search-form', ProgressiveSearchForm);
}
