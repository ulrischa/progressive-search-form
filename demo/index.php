<?php
/* progressive-search-form demo
 * Author: Uli Schäffler
 * License: MIT
 */

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function contains_text(string $haystack, string $needle): bool
{
    if (function_exists('mb_strpos')) {
        return mb_strpos($haystack, $needle, 0, 'UTF-8') !== false;
    }

    return strpos($haystack, $needle) !== false;
}

function clean_query(string $value): string
{
    $value = trim($value);
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value);

    if ($value === null) {
        $value = '';
    }

    return function_exists('mb_substr') ? mb_substr($value, 0, 100, 'UTF-8') : substr($value, 0, 100);
}

function clean_type(string $value): string
{
    $value = lower(trim($value));
    $allowed = ['', 'article', 'download', 'tool', 'event'];

    return in_array($value, $allowed, true) ? $value : '';
}

function clean_int($value, int $default, int $min, int $max): int
{
    if (!is_numeric($value)) {
        return $default;
    }

    $number = (int) $value;

    return max($min, min($max, $number));
}

function is_fetch_request(): bool
{
    return ($_SERVER['HTTP_X_PROGRESSIVE_SEARCH'] ?? '') === '1';
}

function self_url(): string
{
    return $_SERVER['SCRIPT_NAME'] ?? 'index.php';
}

function demo_items(): array
{
    return [
        ['title' => 'Accessible search forms', 'excerpt' => 'Visible labels, helpful hints and a clear result section improve search usability.', 'url' => '#accessible-search-forms', 'type' => 'article', 'typeLabel' => 'Article', 'date' => '2026-06-01'],
        ['title' => 'Safe PHP output', 'excerpt' => 'Validate input and escape output before rendering user controlled values as HTML.', 'url' => '#safe-php-output', 'type' => 'download', 'typeLabel' => 'Download', 'date' => '2026-05-20'],
        ['title' => 'Mock data generator', 'excerpt' => 'A small tool for creating realistic frontend prototype data.', 'url' => '#mock-data-generator', 'type' => 'tool', 'typeLabel' => 'Tool', 'date' => '2026-05-02'],
        ['title' => 'Progressive enhancement workshop', 'excerpt' => 'Hands-on session about forms, Web Components and robust JavaScript enhancements.', 'url' => '#progressive-enhancement-workshop', 'type' => 'event', 'typeLabel' => 'Event', 'date' => '2026-07-15'],
        ['title' => 'JavaScript as an enhancement layer', 'excerpt' => 'The basic search flow should not depend on JavaScript when an HTML backend is available.', 'url' => '#javascript-enhancement-layer', 'type' => 'article', 'typeLabel' => 'Article', 'date' => '2026-04-18'],
        ['title' => 'Search result checklist', 'excerpt' => 'A compact checklist for headings, result counts, keyboard use and screen reader feedback.', 'url' => '#search-result-checklist', 'type' => 'download', 'typeLabel' => 'Download', 'date' => '2026-03-30'],
        ['title' => 'Backend validation', 'excerpt' => 'Frontend validation helps users but never replaces server-side validation.', 'url' => '#backend-validation', 'type' => 'article', 'typeLabel' => 'Article', 'date' => '2026-03-12'],
        ['title' => 'JSON API search demo', 'excerpt' => 'A search where PHP returns JSON and the component renders the results through a template.', 'url' => '#json-api-search-demo', 'type' => 'tool', 'typeLabel' => 'Tool', 'date' => '2026-02-22'],
        ['title' => 'Editorial search improvements', 'excerpt' => 'Good titles, descriptions and keywords improve search quality.', 'url' => '#editorial-search-improvements', 'type' => 'article', 'typeLabel' => 'Article', 'date' => '2026-02-10'],
        ['title' => 'Secure web form training', 'excerpt' => 'Introduction to safe form handling, encoding, HTTP headers and useful error messages.', 'url' => '#secure-web-form-training', 'type' => 'event', 'typeLabel' => 'Event', 'date' => '2026-08-04'],
        ['title' => 'Paginated search results', 'excerpt' => 'A search should usually return limited pages instead of all results at once.', 'url' => '#paginated-search-results', 'type' => 'article', 'typeLabel' => 'Article', 'date' => '2026-08-10'],
        ['title' => 'CSW GetRecords pagination', 'excerpt' => 'CSW startPosition and maxRecords map cleanly to page and limit values.', 'url' => '#csw-getrecords-pagination', 'type' => 'download', 'typeLabel' => 'Download', 'date' => '2026-08-14'],
    ];
}

function search_items(string $query, string $type): array
{
    if (length($query) < 2) {
        return [];
    }

    $terms = preg_split('/\s+/u', lower($query));

    if ($terms === false) {
        $terms = [];
    }

    $results = [];

    foreach (demo_items() as $item) {
        if ($type !== '' && $item['type'] !== $type) {
            continue;
        }

        $haystack = lower($item['title'] . ' ' . $item['excerpt'] . ' ' . $item['typeLabel'] . ' ' . $item['date']);

        foreach ($terms as $term) {
            if ($term !== '' && contains_text($haystack, $term)) {
                $results[] = $item;
                break;
            }
        }
    }

    return $results;
}

function paginate(array $items, int $page, int $limit): array
{
    $total = count($items);
    $totalPages = max(1, (int) ceil($total / $limit));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * $limit;

    return [
        'items' => array_slice($items, $offset, $limit),
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'totalPages' => $totalPages,
        'hasPreviousPage' => $page > 1,
        'hasNextPage' => $page < $totalPages,
    ];
}

function html_page_url(string $query, string $type, int $page, int $limit): string
{
    return self_url() . '?' . http_build_query([
        'backend' => 'html',
        'q_html' => $query,
        'type_html' => $type,
        'page_html' => $page,
        'limit_html' => $limit,
    ], '', '&', PHP_QUERY_RFC3986);
}

function selected(string $current, string $value): string
{
    return $current === $value ? ' selected' : '';
}

function render_html_pagination(string $query, string $type, array $pagination): void
{
    if ($pagination['total'] === 0 || $pagination['totalPages'] <= 1) {
        return;
    }

    $page = $pagination['page'];
    $limit = $pagination['limit'];
    ?>
    <nav class="pagination" aria-label="Search result pages">
      <?php if ($pagination['hasPreviousPage']): ?>
        <a class="pagination__link" data-search-page-link rel="prev" href="<?= h(html_page_url($query, $type, max(1, $page - 1), $limit)) ?>">Previous</a>
      <?php else: ?>
        <span class="pagination__link is-disabled" aria-disabled="true">Previous</span>
      <?php endif; ?>

      <span class="pagination__status" aria-current="page">Page <?= h((string) $page) ?> of <?= h((string) $pagination['totalPages']) ?></span>

      <?php if ($pagination['hasNextPage']): ?>
        <a class="pagination__link" data-search-page-link rel="next" href="<?= h(html_page_url($query, $type, min($pagination['totalPages'], $page + 1), $limit)) ?>">Next</a>
      <?php else: ?>
        <span class="pagination__link is-disabled" aria-disabled="true">Next</span>
      <?php endif; ?>
    </nav>
    <?php
}

function render_html_results(string $query, string $type, array $pagination): void
{
    $start = (($pagination['page'] - 1) * $pagination['limit']) + 1;
    ?>
    <h2 id="search-results-html-heading">Search results</h2>

    <?php if ($query === ''): ?>
      <p class="search-result-count">Enter a search term.</p>
    <?php elseif (length($query) < 2): ?>
      <p class="search-result-count">Enter at least 2 characters.</p>
    <?php elseif ($pagination['total'] === 0): ?>
      <p class="search-result-count">No results found for "<?= h($query) ?>".</p>
    <?php else: ?>
      <p class="search-result-count"><?= h((string) $pagination['total']) ?> results found for "<?= h($query) ?>". Page <?= h((string) $pagination['page']) ?> of <?= h((string) $pagination['totalPages']) ?>.</p>
      <ol class="result-list" start="<?= h((string) $start) ?>">
        <?php foreach ($pagination['items'] as $item): ?>
          <li class="result-list__item">
            <article class="result-card">
              <h3><a href="<?= h($item['url']) ?>"><?= h($item['title']) ?></a></h3>
              <p class="result-card__meta"><?= h($item['typeLabel']) ?> · <?= h($item['date']) ?></p>
              <p><?= h($item['excerpt']) ?></p>
            </article>
          </li>
        <?php endforeach; ?>
      </ol>
      <?php render_html_pagination($query, $type, $pagination); ?>
    <?php endif; ?>
    <?php
}

if (($_GET['api'] ?? '') === 'json') {
    $query = clean_query($_GET['q_json'] ?? '');
    $type = clean_type($_GET['type_json'] ?? '');
    $page = clean_int($_GET['page_json'] ?? 1, 1, 1, 1000);
    $limit = clean_int($_GET['limit_json'] ?? 4, 4, 1, 50);
    $pagination = paginate(search_items($query, $type), $page, $limit);

    header('Content-Type: application/json; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');

    echo json_encode([
        'query' => $query,
        'count' => $pagination['total'],
        'page' => $pagination['page'],
        'limit' => $pagination['limit'],
        'totalPages' => $pagination['totalPages'],
        'hasPreviousPage' => $pagination['hasPreviousPage'],
        'hasNextPage' => $pagination['hasNextPage'],
        'records' => $pagination['items'],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$htmlQuery = '';
$htmlType = '';
$htmlLimit = 4;
$htmlPagination = paginate([], 1, $htmlLimit);

if (($_GET['backend'] ?? '') === 'html') {
    $htmlQuery = clean_query($_GET['q_html'] ?? '');
    $htmlType = clean_type($_GET['type_html'] ?? '');
    $htmlPage = clean_int($_GET['page_html'] ?? 1, 1, 1, 1000);
    $htmlLimit = clean_int($_GET['limit_html'] ?? 4, 4, 1, 50);
    $htmlPagination = paginate(search_items($htmlQuery, $htmlType), $htmlPage, $htmlLimit);

    if (is_fetch_request()) {
        header('Content-Type: text/html; charset=UTF-8');
        header('X-Content-Type-Options: nosniff');
        render_html_results($htmlQuery, $htmlType, $htmlPagination);
        exit;
    }
}

?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>progressive-search-form demo</title>
  <link rel="stylesheet" href="../src/progressive-search-form.css">
  <script type="module" src="../src/progressive-search-form.js"></script>
  <style>
    body { max-width: 76rem; margin-inline: auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.5; }
    .demo-stack { display: grid; gap: 3rem; }
    .demo-panel { padding: 1rem; border: 1px solid #d1d5db; border-radius: 0.75rem; }
  </style>
</head>
<body>
  <main>
    <h1>progressive-search-form demo</h1>
    <p>Author: Uli Schäffler. Try: search, PHP, form, demo, safety, workshop, pagination, CSW.</p>

    <div class="demo-stack">
      <section class="demo-panel" aria-labelledby="html-demo-heading">
        <h2 id="html-demo-heading">HTML backend</h2>
        <p>This version works without JavaScript. JavaScript only enhances the result updates.</p>

        <progressive-search-form response-type="html" results="#search-results-html" min-length="2" history="push">
          <form id="html-search" class="search-form" action="<?= h(self_url()) ?>" method="get" role="search" aria-controls="search-results-html">
            <input type="hidden" name="backend" value="html">
            <input type="hidden" name="page_html" value="1" data-search-page-input>
            <input type="hidden" name="limit_html" value="<?= h((string) $htmlLimit) ?>">

            <div class="search-form__field">
              <label for="q-html">Search term</label>
              <p id="q-html-hint" class="search-form__hint">Enter at least 2 characters.</p>
              <input id="q-html" name="q_html" type="search" value="<?= h($htmlQuery) ?>" required minlength="2" maxlength="100" aria-describedby="q-html-hint">
            </div>

            <div class="search-form__field">
              <label for="type-html">Type</label>
              <select id="type-html" name="type_html">
                <option value=""<?= selected($htmlType, '') ?>>All</option>
                <option value="article"<?= selected($htmlType, 'article') ?>>Article</option>
                <option value="download"<?= selected($htmlType, 'download') ?>>Download</option>
                <option value="tool"<?= selected($htmlType, 'tool') ?>>Tool</option>
                <option value="event"<?= selected($htmlType, 'event') ?>>Event</option>
              </select>
            </div>

            <button class="search-form__button" type="submit">Search</button>
            <progress class="search-form__progress" data-search-progress hidden aria-label="Search is running"></progress>
          </form>
        </progressive-search-form>

        <section id="search-results-html" class="search-results" aria-labelledby="search-results-html-heading" tabindex="-1">
          <?php render_html_results($htmlQuery, $htmlType, $htmlPagination); ?>
        </section>
      </section>

      <section class="demo-panel" aria-labelledby="json-demo-heading">
        <h2 id="json-demo-heading">JSON backend with template</h2>
        <p>This version needs JavaScript because the result HTML is rendered in the browser.</p>

        <progressive-search-form response-type="json" results="#search-results-json" items-path="records" count-path="count" query-path="query" min-length="2" history="off">
          <form id="json-search" class="search-form" action="<?= h(self_url()) ?>" method="get" role="search" aria-controls="search-results-json">
            <input type="hidden" name="api" value="json">
            <input type="hidden" name="page_json" value="1" data-search-page-input>
            <input type="hidden" name="limit_json" value="4">

            <div class="search-form__field">
              <label for="q-json">Search term</label>
              <p id="q-json-hint" class="search-form__hint">Enter at least 2 characters.</p>
              <input id="q-json" name="q_json" type="search" required minlength="2" maxlength="100" aria-describedby="q-json-hint">
            </div>

            <div class="search-form__field">
              <label for="type-json">Type</label>
              <select id="type-json" name="type_json">
                <option value="">All</option>
                <option value="article">Article</option>
                <option value="download">Download</option>
                <option value="tool">Tool</option>
                <option value="event">Event</option>
              </select>
            </div>

            <button class="search-form__button" type="submit">Search</button>
            <progress class="search-form__progress" data-search-progress hidden aria-label="Search is running"></progress>
          </form>

          <template data-result-template>
            <li class="result-list__item">
              <article class="result-card">
                <h3><a data-href="url" data-text="title"></a></h3>
                <p data-text="excerpt"></p>
                <p class="result-card__meta"><span data-text="typeLabel"></span> · <time data-text="date" data-attr-datetime="date"></time></p>
              </article>
            </li>
          </template>

          <template data-pagination-template>
            <nav class="pagination" aria-label="Search result pages">
              <button type="button" data-page-action="previous">Previous</button>
              <span class="pagination__status" aria-current="page">Page <span data-pagination-text="page"></span> of <span data-pagination-text="totalPages"></span></span>
              <button type="button" data-page-action="next">Next</button>
            </nav>
          </template>
        </progressive-search-form>

        <section id="search-results-json" class="search-results" aria-labelledby="search-results-json-heading" tabindex="-1">
          <h2 id="search-results-json-heading">Search results</h2>
          <p class="search-result-count">Enter a search term.</p>
        </section>
      </section>
    </div>
  </main>
</body>
</html>
