# progressive-search-form

Author: **Uli Schäffler**  
License: MIT

`progressive-search-form` is a small Web Component for progressively enhancing normal `GET` search forms.

It supports two backend styles:

1. **HTML mode**: the backend returns ready-to-insert HTML. This is the best progressive enhancement mode because the form can still work without JavaScript.
2. **JSON mode**: the backend returns JSON. The component renders the results with a trusted HTML `<template>` inside the custom element.

The component is intentionally framework-free and keeps the actual form in light DOM. That means your normal CSS, labels, inputs, buttons and backend behavior continue to work.

## What it does

- Enhances normal `GET` forms with `fetch()`.
- Keeps native form behavior as the baseline.
- Supports backend-rendered HTML responses.
- Supports JSON responses rendered through templates.
- Supports simple previous / next pagination.
- Supports configurable JSON paths.
- Adds `aria-busy` while loading.
- Adds a polite live region for result announcements.
- Moves focus to results after manual searches.
- Uses `AbortController` to cancel outdated requests.
- Dispatches custom events for analytics and integration.
- Inserts JSON values safely with `textContent`, checked URLs and whitelisted attributes.

## Quick start: HTML backend

HTML mode is the most robust version. The backend renders the complete result markup. Without JavaScript, the browser simply submits the form and receives a normal results page. With JavaScript, only the result section is updated.

```html
<link rel="stylesheet" href="src/progressive-search-form.css">
<script type="module" src="src/progressive-search-form.js"></script>

<progressive-search-form
  response-type="html"
  results="#search-results"
  min-length="2"
  history="push"
>
  <form action="/search.php" method="get" role="search" aria-controls="search-results">
    <input type="hidden" name="backend" value="html">
    <input type="hidden" name="page" value="1" data-search-page-input>

    <label for="q">Search</label>
    <input id="q" name="q" type="search" required minlength="2">

    <button type="submit">Search</button>
    <progress data-search-progress hidden aria-label="Search is running"></progress>
  </form>
</progressive-search-form>

<section id="search-results" aria-labelledby="search-results-heading" tabindex="-1">
  <h2 id="search-results-heading">Search results</h2>
  <p class="search-result-count">Enter a search term.</p>
</section>
```

Your backend can return either the whole page or only the inner result fragment for enhanced requests. The component accepts both. If the response contains an element matching `results`, its children are used. Otherwise the complete response body is used as the new result content.

Enhanced requests include this header:

```http
X-Progressive-Search: 1
```

## Quick start: JSON backend with template

JSON mode is useful when your backend is an API. The output is controlled by a trusted HTML template inside the custom element.

```html
<link rel="stylesheet" href="src/progressive-search-form.css">
<script type="module" src="src/progressive-search-form.js"></script>

<progressive-search-form
  response-type="json"
  results="#search-results"
  items-path="records"
  count-path="count"
  query-path="query"
  min-length="2"
  history="off"
>
  <form action="/search.php" method="get" role="search" aria-controls="search-results">
    <input type="hidden" name="api" value="json">
    <input type="hidden" name="page" value="1" data-search-page-input>
    <input type="hidden" name="limit" value="10">

    <label for="q-json">Search</label>
    <input id="q-json" name="q" type="search" required minlength="2">

    <button type="submit">Search</button>
    <progress data-search-progress hidden aria-label="Search is running"></progress>
  </form>

  <template data-result-template>
    <li class="result-list__item">
      <article class="result-card">
        <h3><a data-href="url" data-text="title"></a></h3>
        <p data-text="excerpt"></p>
        <p class="result-card__meta">
          <span data-text="typeLabel"></span>
          ·
          <time data-text="date" data-attr-datetime="date"></time>
        </p>
      </article>
    </li>
  </template>
</progressive-search-form>

<section id="search-results" aria-labelledby="search-results-heading" tabindex="-1">
  <h2 id="search-results-heading">Search results</h2>
  <p class="search-result-count">Enter a search term.</p>
</section>
```

Expected JSON:

```json
{
  "query": "search",
  "count": 12,
  "page": 1,
  "limit": 10,
  "totalPages": 2,
  "hasPreviousPage": false,
  "hasNextPage": true,
  "records": [
    {
      "title": "Accessible search forms",
      "excerpt": "Visible labels and a clear result section improve usability.",
      "url": "/accessible-search-forms",
      "typeLabel": "Article",
      "date": "2026-06-01"
    }
  ]
}
```

## File structure

Recommended project structure:

```text
progressive-search-form/
  src/
    progressive-search-form.js
    progressive-search-form.css
  demo/
    index.php
  README.md
  LICENSE
```

The PHP demo is not part of the library. It is only an example backend.

## Run the demo

From the repository root:

```bash
php -S localhost:8000 -t demo
```

Then open:

```text
http://localhost:8000
```

Because the demo loads files from `../src`, you may also serve the repository root and open `demo/index.php`, depending on your local PHP setup.

## HTML mode

Use HTML mode when you want the strongest progressive enhancement story.

```html
<progressive-search-form response-type="html" results="#search-results">
  <form action="/search.php" method="get" role="search" aria-controls="search-results">
    ...
  </form>
</progressive-search-form>
```

The backend should:

- accept normal `GET` requests
- render a complete usable page without JavaScript
- return a result section with a heading and result count
- optionally return only the result fragment when `X-Progressive-Search: 1` is present
- escape all HTML output
- validate input and filter values
- limit result count
- return normal pagination links for no-JS use

HTML mode uses `Element.setHTML()` for enhanced updates. If `setHTML()` is not available, the component does not enhance the form. The normal browser form submission remains available.

## JSON mode

Use JSON mode when your backend is an API and you want to render results in the browser.

```html
<progressive-search-form
  response-type="json"
  results="#search-results"
  items-path="records"
>
  <form action="/api/search.php" method="get" role="search" aria-controls="search-results">
    ...
  </form>

  <template data-result-template>
    ...
  </template>
</progressive-search-form>
```

In JSON mode, the component needs JavaScript to render useful results. Without JavaScript, the browser will navigate to the JSON endpoint unless you provide a separate HTML fallback.

## Template bindings

The result template is trusted HTML written by you. Data from JSON is inserted safely.

### `data-text`

Sets `textContent` from a JSON value.

```html
<h3 data-text="title"></h3>
```

### `data-href`

Sets `href` from a checked URL. Allowed protocols are `http:`, `https:`, `mailto:` and `tel:`.

```html
<a data-href="url" data-text="title"></a>
```

### `data-src`

Sets `src` from a checked resource URL. Allowed protocols are `http:` and `https:`.

```html
<img data-src="image.url" data-attr-alt="image.alt">
```

### `data-attr-*`

Sets a whitelisted attribute from a JSON value.

```html
<time data-text="date" data-attr-datetime="date"></time>
```

Allowed attributes:

- `alt`
- `aria-label`
- `datetime`
- `hreflang`
- `lang`
- `title`

### `data-if`

Removes the element when the value is missing, empty or false.

```html
<p data-if="description" data-text="description"></p>
```

## JSON paths

Paths can be direct keys or dot paths.

Direct keys are useful for metadata formats such as CSW or Dublin Core:

```json
{
  "dc:title": "Water data",
  "dct:modified": "2026-06-01"
}
```

Template:

```html
<a data-text="dc:title"></a>
<time data-text="dct:modified" data-attr-datetime="dct:modified"></time>
```

Nested paths are also supported:

```json
{
  "metadata": {
    "title": "Water data"
  }
}
```

Template:

```html
<span data-text="metadata.title"></span>
```

## Pagination

Pagination is intentionally simple: previous / next.

### HTML mode pagination

In HTML mode the backend should render normal links.

```html
<nav class="pagination" aria-label="Search result pages">
  <a href="?q=water&page=1" data-search-page-link rel="prev">Previous</a>
  <span aria-current="page">Page 2 of 5</span>
  <a href="?q=water&page=3" data-search-page-link rel="next">Next</a>
</nav>
```

The `data-search-page-link` attribute tells the component that this link can be fetched and used to update the current result section. Without JavaScript, it is still a normal link.

### JSON mode pagination

Add a hidden page input:

```html
<input type="hidden" name="page" value="1" data-search-page-input>
<input type="hidden" name="limit" value="10">
```

Add a pagination template:

```html
<template data-pagination-template>
  <nav class="pagination" aria-label="Search result pages">
    <button type="button" data-page-action="previous">Previous</button>
    <span aria-current="page">
      Page <span data-pagination-text="page"></span>
      of <span data-pagination-text="totalPages"></span>
    </span>
    <button type="button" data-page-action="next">Next</button>
  </nav>
</template>
```

The backend should return:

```json
{
  "page": 2,
  "limit": 10,
  "totalPages": 5,
  "hasPreviousPage": true,
  "hasNextPage": true
}
```

The component updates the hidden page input and runs the search again.

### CSW mapping

For a CSW `GetRecords` backend, you can map page and limit to `startPosition` and `maxRecords`:

```php
$startPosition = (($page - 1) * $limit) + 1;
$maxRecords = $limit;
```

Then return normalized JSON:

```json
{
  "query": "water",
  "count": 123,
  "page": 2,
  "limit": 10,
  "totalPages": 13,
  "hasPreviousPage": true,
  "hasNextPage": true,
  "records": []
}
```

## Options

| Attribute | Default | Description |
|---|---:|---|
| `response-type` | `html` | Use `html` or `json`. |
| `results` | `#search-results` | Selector for the result container. If omitted, `aria-controls` on the form is used when available. |
| `items-path` | `results` | JSON path to the result array. |
| `count-path` | `count` | JSON path to the total result count. |
| `query-path` | `query` | JSON path to the query string. |
| `page-path` | `page` | JSON path to the current page. |
| `limit-path` | `limit` | JSON path to the current page size. |
| `total-pages-path` | `totalPages` | JSON path to the total number of pages. |
| `has-next-path` | `hasNextPage` | JSON path to a boolean for the next page. |
| `has-previous-path` | `hasPreviousPage` | JSON path to a boolean for the previous page. |
| `list-tag` | `ol` | List wrapper for JSON results. Allowed: `ol`, `ul`, `div`. |
| `list-class` | `result-list` | CSS class for the generated JSON result list. |
| `min-length` | `2` | Minimum search length used for messages and optional input search. |
| `history` | `push` for HTML, `off` for JSON | Browser history behavior. Use `push`, `replace` or `off`. |
| `search-on-input` | not enabled | When present, searches while typing. The value is the debounce delay in milliseconds. Minimum effective delay is 150. |
| `disabled` | not set | Disables enhancement. |
| `results-heading` | message value | Optional heading text for JSON-rendered results. |

## Messages and internationalization

Messages can be configured per instance with JSON:

```html
<script type="application/json" data-search-messages>
  {
    "heading": "Suchergebnisse",
    "initial": "Bitte gib einen Suchbegriff ein.",
    "loading": "Suche läuft.",
    "updated": "Suchergebnisse aktualisiert.",
    "minLength": "Bitte gib mindestens {minLength} Zeichen ein.",
    "noResults": "Keine Treffer für \"{query}\" gefunden.",
    "resultsPaged": "{count} Treffer für \"{query}\" gefunden. Seite {page} von {totalPages}.",
    "invalidResponse": "Die Suchantwort konnte nicht verarbeitet werden.",
    "error": "Die Suche konnte nicht ausgeführt werden. Bitte versuche es erneut.",
    "templateMissing": "Kein Ergebnis-Template gefunden. Rohdaten werden angezeigt."
  }
</script>
```

Supported message keys:

- `heading`
- `initial`
- `loading`
- `updated`
- `minLength`
- `noResults`
- `resultsPaged`
- `invalidResponse`
- `error`
- `templateMissing`

## Events

All events bubble from the custom element.

| Event | Cancelable | When |
|---|---:|---|
| `progressive-search-form:before-search` | yes | Before a fetch request starts. Call `preventDefault()` to cancel. |
| `progressive-search-form:success` | no | After a successful update. |
| `progressive-search-form:error` | no | When a request fails. In HTML mode the component then falls back to normal navigation. |
| `progressive-search-form:abort` | no | When a previous request is aborted. |
| `progressive-search-form:invalid-response` | no | When a JSON response cannot be processed. |
| `progressive-search-form:template-missing` | no | When JSON mode has no result template. |
| `progressive-search-form:page-change` | no | When JSON pagination changes the page input. |

Example:

```js
const search = document.querySelector('progressive-search-form');

search.addEventListener('progressive-search-form:success', (event) => {
  console.log(event.detail.url);
  console.log(event.detail.resultsElement);
});
```

Cancel a request:

```js
search.addEventListener('progressive-search-form:before-search', (event) => {
  if (!window.confirm('Run search?')) {
    event.preventDefault();
  }
});
```

## Accessibility checklist

Recommended markup:

- Use a real `<form>` with `method="get"`.
- Use `role="search"` on the form or wrap it in a search landmark.
- Provide visible labels for all controls.
- Connect hints with `aria-describedby` when useful.
- Connect the form to the result section with `aria-controls`.
- Give the result section a heading.
- Give the result section `tabindex="-1"` so focus can move there after a manual search.
- Include a result count in `.search-result-count`.
- Use normal links for HTML pagination.
- Use buttons for JSON pagination.

The component adds:

- `aria-busy` on the form and result section while loading
- a polite live region after the form
- focus movement to results after manual search
- result count announcements

## Backend requirements

A production backend should:

- accept normal `GET` requests
- validate and normalize query values
- whitelist filter values
- limit query length
- limit page size
- enforce server-side pagination
- set the correct `Content-Type`
- set `X-Content-Type-Options: nosniff`
- escape all HTML output in HTML mode
- return valid JSON in JSON mode
- avoid leaking internal error details to users
- use timeouts for external services
- handle empty, invalid and too-short queries consistently

## Backend tips

### Query normalization

```php
$query = trim($_GET['q'] ?? '');
$query = mb_substr($query, 0, 100, 'UTF-8');
```

### Filter whitelist

```php
$allowedTypes = ['', 'article', 'download', 'tool', 'event'];
$type = $_GET['type'] ?? '';

if (!in_array($type, $allowedTypes, true)) {
    $type = '';
}
```

### Page and limit

```php
$page = max(1, (int) ($_GET['page'] ?? 1));
$limit = min(50, max(1, (int) ($_GET['limit'] ?? 10)));
$offset = ($page - 1) * $limit;
```

### JSON headers

```php
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
```

### HTML headers

```php
header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
```

## Security model

JSON values are not inserted as HTML.

The component supports:

- `textContent` through `data-text`
- checked navigation URLs through `data-href`
- checked resource URLs through `data-src`
- a small whitelist of safe attributes through `data-attr-*`

The component intentionally does not provide `data-html`.

The template itself must be trusted HTML. Do not allow untrusted users to edit templates unless you sanitize and review that content on the server.

The backend still has to validate inputs, enforce limits and escape HTML output. Frontend safety does not replace backend safety.

## Browser support

The component uses modern browser APIs:

- Custom Elements
- Fetch
- AbortController
- FormData
- URL and URLSearchParams
- HTML templates
- `replaceChildren()`
- `Element.setHTML()` for enhanced HTML mode

Important distinction:

- JSON mode does not need `setHTML()`.
- HTML enhancement needs `setHTML()`.
- If `setHTML()` is missing, HTML mode is not enhanced and the normal form fallback remains available.

## Design goals

`progressive-search-form` is meant to stay small and understandable.

It intentionally does not support:

- POST requests
- cross-origin API calls
- arbitrary HTML insertion from JSON
- complex numbered pagination
- Shadow DOM styling isolation
- client-side search indexing
- automatic backend-specific transformations

For v0.1, the goal is a clear progressive enhancement pattern, not a full search framework.

## Author

Created by **Uli Schäffler**.
