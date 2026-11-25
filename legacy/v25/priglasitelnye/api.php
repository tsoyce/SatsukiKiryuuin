<?php
/**
 * Пригласительная: файловое хранилище проектов. PHP 7.4+; база данных не нужна.
 * Код проекта передаётся в JSON-теле запроса; старые заголовки тоже принимаются.
 * При смене хостинга перенесите также каталог invite-data.
 */
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

const INVITE_GUARD = "<?php http_response_code(404); exit; __halt_compiler();\n";
const INVITE_DEFAULT_MAX_BYTES = 33554432;

function invite_reply(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function invite_fail(int $status, string $code, string $message, array $extra = []): void
{
    invite_reply($status, array_merge(['ok' => false, 'errorCode' => $code, 'error' => $message], $extra));
}

function invite_write(string $path, string $bytes): void
{
    // Temporary files have the same executable guard as the final files.
    $temporary = dirname($path) . '/.tmp-' . bin2hex(random_bytes(16)) . '.php';
    $stream = @fopen($temporary, 'xb');
    if ($stream === false) {
        throw new RuntimeException('storage_write');
    }
    @chmod($temporary, 0600);
    try {
        $offset = 0;
        $length = strlen($bytes);
        while ($offset < $length) {
            $written = @fwrite($stream, substr($bytes, $offset, 1048576));
            if ($written === false || $written === 0) {
                throw new RuntimeException('storage_write');
            }
            $offset += $written;
        }
        if (!@fflush($stream)) {
            throw new RuntimeException('storage_write');
        }
        fclose($stream);
        $stream = null;
        // Rename within one directory; never truncate a previously saved project.
        if (!@rename($temporary, $path)) {
            throw new RuntimeException('storage_write');
        }
    } finally {
        if (is_resource($stream)) {
            fclose($stream);
        }
        if (is_file($temporary)) {
            @unlink($temporary);
        }
    }
}

function invite_pack($value): string
{
    return INVITE_GUARD . json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function invite_read(string $path, int $maxBytes)
{
    if (!is_file($path)) {
        return null;
    }
    $stream = @fopen($path, 'rb');
    if ($stream === false) {
        throw new RuntimeException('storage_read');
    }
    try {
        // Read the small guard separately: substr() of a 32 MiB JSON document
        // would otherwise keep another complete copy alive during json_decode.
        $guard = fread($stream, strlen(INVITE_GUARD));
        if ($guard !== INVITE_GUARD) {
            throw new RuntimeException('storage_read');
        }
        $bytes = stream_get_contents($stream, max(1, $maxBytes - strlen(INVITE_GUARD) + 1));
    } finally {
        fclose($stream);
    }
    if ($bytes === false || strlen($bytes) + strlen(INVITE_GUARD) > $maxBytes) {
        throw new RuntimeException('storage_read');
    }
    return json_decode($bytes, false, 64, JSON_THROW_ON_ERROR);
}

function invite_origin_parts(string $value, bool $configuration = false): ?array
{
    // Compare scheme/host/effective port; never accept opaque/null origins,
    // userinfo, paths or a comma-separated list of possible origins.
    if ($configuration) $value = rtrim(trim($value), '/');
    if (!preg_match('/\A(https?):\/\/(\[[a-fA-F0-9:.]+\]|[a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?\z/iD', $value, $match)) return null;
    $scheme = strtolower($match[1]); $host = strtolower($match[2]);
    if ($host[0] === '[') {
        $address = substr($host, 1, -1);
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) return null;
        $host = '[' . strtolower(inet_ntop(inet_pton($address))) . ']';
    } elseif ($host === '' || strpos($host, '..') !== false || $host[0] === '.' || !preg_match('/\A[a-z0-9.-]+\z/D', $host)) return null;
    $port = isset($match[3]) ? (int) $match[3] : ($scheme === 'https' ? 443 : 80);
    if ($port < 1 || $port > 65535) return null;
    return ['scheme' => $scheme, 'host' => $host, 'port' => $port];
}

function invite_origin_check(array $config): void
{
    $site = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site === 'cross-site') invite_fail(403, 'origin', 'Откройте редактор на том же сайте, где находится хранилище.');
    if (!isset($_SERVER['HTTP_ORIGIN'])) return;
    $origin = invite_origin_parts((string) $_SERVER['HTTP_ORIGIN']);
    if ($origin === null) invite_fail(403, 'origin', 'Браузер не передал адрес этого сайта. Обновите страницу после обновления редактора.');
    $secure = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
    $configured = trim($config['public_origin']) !== '';
    $expected = invite_origin_parts($configured ? $config['public_origin'] : ($secure ? 'https://' : 'http://') . (string) ($_SERVER['HTTP_HOST'] ?? ''), $configured);
    if ($expected === null) throw new RuntimeException('config');
    if ($origin === $expected) return;
    // TLS may terminate before PHP. Only the exact browser host/effective ports
    // plus forbidden Fetch Metadata corroborate that case automatically.
    // Never trust arbitrary public Forwarded/X-Forwarded-* request headers.
    if (!$configured && $site === 'same-origin' && $origin['host'] === $expected['host'] && $origin['scheme'] === 'https' && $expected['scheme'] === 'http' && ($origin['port'] === $expected['port'] || ($origin['port'] === 443 && $expected['port'] === 80))) return;
    invite_fail(403, 'origin', $configured ? 'Адрес сайта не совпадает с public_origin в config.php. Откройте редактор по настроенному адресу.' : 'Запрос с другого сайта отклонён. Откройте редактор и хранилище по одному адресу.');
}

function invite_input(int $maxBytes): stdClass
{
    $contentType = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') {
        invite_fail(415, 'content_type', 'Отправьте проект в формате application/json.');
    }
    $declared = (string) ($_SERVER['CONTENT_LENGTH'] ?? '');
    if ($declared !== '' && (!ctype_digit($declared) || (float) $declared > $maxBytes)) {
        invite_fail(413, 'project_too_large', 'Проект превышает допустимый размер.', ['maxBytes' => $maxBytes]);
    }
    $stream = @fopen('php://input', 'rb');
    if ($stream === false) {
        invite_fail(400, 'invalid_json', 'Не удалось прочитать проект.');
    }
    $raw = stream_get_contents($stream, $maxBytes + 1);
    fclose($stream);
    if ($raw === false || strlen($raw) > $maxBytes) {
        invite_fail(413, 'project_too_large', 'Проект превышает допустимый размер.', ['maxBytes' => $maxBytes]);
    }
    try {
        $input = json_decode($raw, false, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $exception) {
        invite_fail(400, 'invalid_json', 'Некорректный JSON или слишком глубокая структура проекта.');
    }
    if (!$input instanceof stdClass) {
        invite_fail(400, 'invalid_json', 'Ожидается JSON-объект.');
    }
    return $input;
}

function invite_project(stdClass $input): stdClass
{
    $project = $input->project ?? null;
    if (!$project instanceof stdClass || ($project->format ?? null) !== 'invite-studio' || ($project->version ?? null) !== 1
        || !isset($project->guests) || !is_array($project->guests) || count($project->guests) > 10000
        || !isset($project->settings) || !$project->settings instanceof stdClass
        || !isset($project->fonts) || !is_array($project->fonts) || count($project->fonts) > 30) {
        invite_fail(400, 'invalid_project', 'Это не проект «Пригласительной» или превышен лимит гостей/шрифтов.');
    }
    foreach ($project->guests as $guest) {
        if (!$guest instanceof stdClass || !isset($guest->name) || !is_string($guest->name)) {
            invite_fail(400, 'invalid_project', 'В списке гостей есть некорректная запись.');
        }
    }
    // Store all fields exactly, including guest IDs, uploaded fonts and image data.
    return $project;
}

function invite_text($value, int $maximum, string $errorCode, string $message, bool $empty = false): string
{
    if (!is_string($value) || preg_match('//u', $value) !== 1) invite_fail(400, $errorCode, $message);
    $text = preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $value);
    $length = preg_match_all('/./us', $text, $unused);
    if ($length === false || (!$empty && $length < 1) || $length > $maximum || preg_match('/[\x00-\x1F\x7F]/u', $text)) invite_fail(400, $errorCode, $message);
    return $text;
}

function invite_normalize_code($value, bool $empty = false): string
{
    return invite_text($value, 128, 'project_code', 'Введите код проекта: до 128 символов без переводов строк.', $empty);
}

function invite_code(stdClass $input, bool $empty = false): string
{
    if (property_exists($input, 'code')) return invite_normalize_code($input->code, $empty);
    $code = (string) ($_SERVER['HTTP_X_PROJECT_CODE'] ?? '');
    if ($code === '') {
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (preg_match('/^Bearer (.+)$/D', $authorization, $matches)) $code = $matches[1];
    }
    return invite_normalize_code($code, $empty);
}

function invite_valid_record($record): bool
{
    return $record instanceof stdClass && isset($record->revision, $record->updatedAt, $record->project)
        && is_int($record->revision) && $record->revision >= 1 && is_string($record->updatedAt) && $record->project instanceof stdClass;
}

function invite_title(stdClass $project): string
{
    $title = $project->settings->eventName ?? '';
    if (!is_string($title)) return 'Без названия';
    $title = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $title);
    preg_match('/^.{0,160}/us', trim($title), $matches);
    return ($matches[0] ?? '') !== '' ? $matches[0] : 'Без названия';
}

function invite_public_entry(stdClass $entry): array
{
    return ['id' => $entry->id, 'projectId' => $entry->id, 'title' => $entry->title, 'protected' => $entry->protected,
        'revision' => $entry->revision, 'updatedAt' => $entry->updatedAt];
}

function invite_entry_from_record(stdClass $record, string $file, ?stdClass $fallback = null): stdClass
{
    $access = $record->access ?? null;
    $hasAccess = $access instanceof stdClass && isset($access->id, $access->codeHash, $access->version)
        && is_string($access->id) && preg_match('/^p_[a-f0-9]{32}$/D', $access->id)
        && is_string($access->codeHash) && ($access->codeHash === '' || preg_match('/^[a-f0-9]{64}$/D', $access->codeHash))
        && is_int($access->version) && $access->version >= 1;
    if ($hasAccess) {
        $id = $access->id; $hash = $access->codeHash; $version = $access->version;
    } elseif ($fallback !== null) {
        $id = $fallback->id; $hash = $fallback->codeHash; $version = $fallback->accessVersion;
    } elseif (preg_match('/^([a-f0-9]{64})\.project\.php$/D', $file, $matches)) {
        $id = 'p_' . bin2hex(random_bytes(16)); $hash = $matches[1]; $version = 1;
    } else {
        throw new RuntimeException('storage_read');
    }
    return (object) ['id' => $id, 'file' => $file, 'title' => invite_title($record->project), 'protected' => $hash !== '',
        'codeHash' => $hash, 'accessVersion' => $version, 'revision' => $record->revision, 'updatedAt' => $record->updatedAt];
}

function invite_index(string $directory, int $maxBytes): array
{
    $path = $directory . '/.project-index.php';
    $record = invite_read($path, 1048576);
    $entries = [];
    if ($record !== null) {
        if (!$record instanceof stdClass || ($record->version ?? null) !== 2 || !isset($record->projects) || !$record->projects instanceof stdClass) throw new RuntimeException('storage_read');
        foreach (get_object_vars($record->projects) as $id => $entry) {
            if (!$entry instanceof stdClass || ($entry->id ?? '') !== $id || !preg_match('/^p_[a-f0-9]{32}$/D', $id)
                || !isset($entry->file, $entry->title, $entry->protected, $entry->codeHash, $entry->accessVersion, $entry->revision, $entry->updatedAt)
                || !is_string($entry->file) || !preg_match('/^(?:[a-f0-9]{64}|p_[a-f0-9]{32})\.project\.php$/D', $entry->file)
                || !is_string($entry->title) || !is_bool($entry->protected) || !is_string($entry->codeHash)
                || ($entry->codeHash !== '' && !preg_match('/^[a-f0-9]{64}$/D', $entry->codeHash)) || $entry->protected !== ($entry->codeHash !== '')
                || !is_int($entry->accessVersion) || $entry->accessVersion < 1 || !is_int($entry->revision) || $entry->revision < 1 || !is_string($entry->updatedAt)) throw new RuntimeException('storage_read');
            $entries[$id] = $entry;
        }
    }
    // Recover the small metadata transaction if a previous process stopped after
    // writing a project but before its catalogue. The project record is canonical.
    $pendingPath = $directory . '/.index-pending.php';
    $pending = invite_read($pendingPath, 16384);
    $changed = $record === null;
    if ($pending !== null) {
        if (!$pending instanceof stdClass || !isset($pending->id, $pending->file) || !is_string($pending->id) || !preg_match('/^p_[a-f0-9]{32}$/D', $pending->id)
            || !is_string($pending->file) || !preg_match('/^(?:[a-f0-9]{64}|p_[a-f0-9]{32})\.project\.php$/D', $pending->file)) throw new RuntimeException('storage_read');
        $projectRecord = invite_read($directory . '/' . $pending->file, $maxBytes + 4096);
        if ($projectRecord !== null) {
            if (!invite_valid_record($projectRecord)) throw new RuntimeException('storage_read');
            $entries[$pending->id] = invite_entry_from_record($projectRecord, $pending->file, $entries[$pending->id] ?? null); $changed = true;
        }
        unset($projectRecord);
    }
    $known = [];
    foreach ($entries as $id => $entry) {
        if (!is_file($directory . '/' . $entry->file)) { unset($entries[$id]); $changed = true; }
        else $known[$entry->file] = true;
    }
    $files = glob($directory . '/*.project.php');
    if ($files === false) throw new RuntimeException('storage_read');
    foreach ($files as $filePath) {
        $file = basename($filePath);
        if (isset($known[$file])) continue;
        $projectRecord = invite_read($filePath, $maxBytes + 4096);
        if (!invite_valid_record($projectRecord)) throw new RuntimeException('storage_read');
        $entry = invite_entry_from_record($projectRecord, $file);
        if (isset($entries[$entry->id])) throw new RuntimeException('storage_read');
        $entries[$entry->id] = $entry; $changed = true; unset($projectRecord);
    }
    if ($changed) invite_write($path, invite_pack(['version' => 2, 'projects' => (object) $entries]));
    if ($pending !== null && is_file($pendingPath) && !@unlink($pendingPath)) throw new RuntimeException('storage_write');
    return $entries;
}

function invite_commit(string $directory, stdClass $entry, stdClass $record, array &$entries, int $maxBytes): void
{
    $bytes = invite_pack($record);
    if (strlen($bytes) > $maxBytes) invite_fail(413, 'project_too_large', 'Проект превышает допустимый размер.', ['maxBytes' => $maxBytes]);
    invite_write($directory . '/.index-pending.php', invite_pack(['id' => $entry->id, 'file' => $entry->file]));
    invite_write($directory . '/' . $entry->file, $bytes);
    $entries[$entry->id] = $entry;
    invite_write($directory . '/.project-index.php', invite_pack(['version' => 2, 'projects' => (object) $entries]));
    if (!@unlink($directory . '/.index-pending.php')) throw new RuntimeException('storage_write');
}

function invite_audit(string $directory, string $projectId, string $actor, string $action, string $detail, int $revision, int $deduplicateSeconds = 0): array
{
    $path = $directory . '/.' . $projectId . '.audit.php';
    $stored = invite_read($path, 1048576);
    if ($stored !== null && !is_array($stored)) throw new RuntimeException('storage_read');
    $events = $stored ?? [];
    $last = $events ? $events[count($events) - 1] : null;
    if ($deduplicateSeconds > 0 && $last instanceof stdClass && ($last->actor ?? '') === $actor && ($last->action ?? '') === $action
        && ($last->detail ?? '') === $detail && strtotime((string) ($last->at ?? '')) >= time() - $deduplicateSeconds) return get_object_vars($last);
    $event = ['id' => bin2hex(random_bytes(8)), 'at' => gmdate('Y-m-d\TH:i:s\Z'), 'actor' => $actor, 'action' => $action, 'detail' => $detail, 'revision' => $revision];
    $events[] = $event;
    $events = array_slice($events, -1000); $packed = invite_pack($events);
    while (strlen($packed) > 900000 && count($events) > 1) { array_shift($events); $packed = invite_pack($events); }
    invite_write($path, $packed);
    return $event;
}

function invite_secret(string $directory): string
{
    $path = $directory . '/.session-secret.php'; $value = invite_read($path, 4096);
    if ($value === null) { $value = (object) ['secret' => bin2hex(random_bytes(32))]; invite_write($path, invite_pack($value)); }
    if (!$value instanceof stdClass || !isset($value->secret) || !is_string($value->secret) || !preg_match('/^[a-f0-9]{64}$/D', $value->secret)) throw new RuntimeException('storage_read');
    return $value->secret;
}

function invite_session(stdClass $entry, string $actor, string $secret): string
{
    $payload = rtrim(strtr(base64_encode(json_encode(['id' => $entry->id, 'actor' => $actor, 'version' => $entry->accessVersion, 'expires' => time() + 43200], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    return $payload . '.' . hash_hmac('sha256', $payload, $secret);
}

function invite_session_valid($token, stdClass $entry, string $actor, string $secret): bool
{
    if (!is_string($token) || strlen($token) > 2048 || !preg_match('/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/D', $token, $matches)) return false;
    if (!hash_equals(hash_hmac('sha256', $matches[1], $secret), $matches[2])) return false;
    $raw = base64_decode(strtr($matches[1], '-_', '+/'), true);
    if ($raw === false) return false;
    $data = json_decode($raw);
    return $data instanceof stdClass && ($data->id ?? null) === $entry->id && ($data->actor ?? null) === $actor
        && ($data->version ?? null) === $entry->accessVersion && isset($data->expires) && is_int($data->expires) && $data->expires >= time();
}

function invite_save_detail(stdClass $before, stdClass $after): string
{
    $changes = [];
    if (invite_title($before) !== invite_title($after)) $changes[] = 'название проекта';
    if (($before->guests ?? []) != ($after->guests ?? [])) $changes[] = 'гости (' . count($before->guests ?? []) . ' → ' . count($after->guests ?? []) . ')';
    if (($before->blocks ?? null) != ($after->blocks ?? null)) $changes[] = 'текстовые блоки и оформление';
    if (($before->settings ?? null) != ($after->settings ?? null) && !in_array('текстовые блоки и оформление', $changes, true)) $changes[] = 'настройки и текст';
    if (($before->fonts ?? []) != ($after->fonts ?? [])) $changes[] = 'шрифты';
    if (($before->template ?? '') !== ($after->template ?? '')) $changes[] = 'фоновый макет';
    return $changes ? 'Изменено: ' . implode(', ', $changes) . '.' : 'Сохранён проект.';
}

function invite_creation_limit(string $directory, array $config): void
{
    $now = time(); $ratePath = $directory . '/.create-rate.php'; $rateRecord = invite_read($ratePath, 262144);
    $rates = $rateRecord instanceof stdClass ? get_object_vars($rateRecord) : [];
    foreach ($rates as $key => $entry) if (!$entry instanceof stdClass || !isset($entry->resetAt, $entry->count) || !is_int($entry->resetAt) || !is_int($entry->count) || $entry->resetAt <= $now) unset($rates[$key]);
    $ipHash = 'ip_' . hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $entry = $rates[$ipHash] ?? (object) ['resetAt' => $now + 3600, 'count' => 0];
    if ($entry->count >= $config['create_per_hour'] || (!isset($rates[$ipHash]) && count($rates) >= 1024)) {
        $retryAfter = max(1, $entry->resetAt - $now); header('Retry-After: ' . $retryAfter);
        invite_fail(429, 'create_limit', 'Слишком много новых проектов. Продолжайте работу с существующим проектом или повторите создание позже.', ['retryAfter' => $retryAfter]);
    }
    $entry->count++; $rates[$ipHash] = $entry; invite_write($ratePath, invite_pack((object) $rates));
}

try {
    $config = ['storage_dir' => __DIR__ . '/invite-data', 'public_origin' => '', 'max_bytes' => INVITE_DEFAULT_MAX_BYTES, 'max_projects' => 100, 'max_storage_bytes' => 536870912, 'create_per_hour' => 10];
    if (is_file(__DIR__ . '/config.php')) { $override = require __DIR__ . '/config.php'; if (!is_array($override)) throw new RuntimeException('config'); $config = array_merge($config, $override); }
    if (!is_string($config['storage_dir']) || trim($config['storage_dir']) === '' || !is_string($config['public_origin'])) throw new RuntimeException('config');
    foreach (['max_bytes', 'max_projects', 'max_storage_bytes', 'create_per_hour'] as $setting) if (!is_int($config[$setting]) || $config[$setting] < 1) throw new RuntimeException('config');
    $action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : '';
    if (!in_array($action, ['status', 'catalog', 'create', 'load', 'save', 'rename_code', 'history', 'activity'], true)) invite_fail(404, 'action', 'Неизвестное действие.');
    $requiredMethod = $action === 'status' ? 'GET' : 'POST';
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $requiredMethod) { header('Allow: ' . $requiredMethod); invite_fail(405, 'method', 'Этот HTTP-метод не поддерживается.'); }
    invite_origin_check($config);
    $input = $action === 'status' ? null : invite_input($config['max_bytes']);
    $actor = $input === null ? '' : invite_text($input->actor ?? '', 80, 'actor_required', 'Укажите имя или login: от 1 до 80 символов.');
    $project = in_array($action, ['create', 'save'], true) ? invite_project($input) : null;
    if (in_array($action, ['save', 'rename_code'], true) && (!isset($input->expectedRevision) || !is_int($input->expectedRevision) || $input->expectedRevision < 1)) invite_fail(400, 'revision', 'Сначала откройте проект и получите его текущую версию.');
    $directory = rtrim($config['storage_dir'], '/\\');
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('storage_write');
    if (!is_writable($directory) || !is_readable($directory)) throw new RuntimeException('storage_write');
    $lock = @fopen($directory . '/.storage-lock.php', 'c+b');
    if ($lock === false || !@flock($lock, LOCK_EX)) throw new RuntimeException('storage_lock');
    try {
        $lockStat = fstat($lock);
        if ($lockStat !== false && $lockStat['size'] === 0) { if (fwrite($lock, INVITE_GUARD) !== strlen(INVITE_GUARD) || !fflush($lock)) throw new RuntimeException('storage_write'); @chmod($directory . '/.storage-lock.php', 0600); }
        if (!is_file($directory . '/.htaccess')) {
            $denial = "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n";
            if (@file_put_contents($directory . '/.htaccess', $denial, LOCK_EX) !== strlen($denial)) throw new RuntimeException('storage_write');
        }
        if (!is_file($directory . '/index.php')) invite_write($directory . '/index.php', INVITE_GUARD);
        if ($action === 'status') invite_reply(200, ['ok' => true, 'available' => true, 'maxBytes' => $config['max_bytes'], 'maxProjects' => $config['max_projects'], 'auth' => 'project-session', 'protocol' => 2, 'actorRequired' => true, 'optionalCodes' => true]);
        $entries = invite_index($directory, $config['max_bytes']);
        $secret = invite_secret($directory);
        if ($action === 'catalog') {
            invite_audit($directory, 'site', $actor, 'login', 'Открыт список проектов.', 0, 60);
            $list = array_map('invite_public_entry', array_values($entries));
            usort($list, static function (array $a, array $b): int { return strcmp($b['updatedAt'], $a['updatedAt']) ?: strcmp($a['title'], $b['title']); });
            invite_reply(200, ['ok' => true, 'projects' => $list]);
        }
        if ($action === 'create') {
            $code = invite_code($input, true); $hash = $code === '' ? '' : hash('sha256', $code);
            foreach ($entries as $entry) if ($hash !== '' && $entry->codeHash === $hash) invite_fail(409, 'code_taken', 'Этот код уже используется. Выберите другой код проекта.');
            if (count($entries) >= $config['max_projects']) invite_fail(507, 'storage_full', 'Достигнут лимит проектов на сервере. Сохраните проект в файл.');
            $entry = (object) ['id' => 'p_' . bin2hex(random_bytes(16)), 'file' => '', 'title' => invite_title($project), 'protected' => $hash !== '', 'codeHash' => $hash, 'accessVersion' => 1, 'revision' => 1, 'updatedAt' => gmdate('Y-m-d\TH:i:s\Z')];
            $entry->file = $entry->id . '.project.php';
            $record = (object) ['revision' => 1, 'updatedAt' => $entry->updatedAt, 'access' => ['id' => $entry->id, 'codeHash' => $hash, 'version' => 1], 'project' => $project];
        } else {
            $id = $input->projectId ?? $input->id ?? '';
            if ($id === '' && $action === 'history' && ($input->scope ?? '') === 'site') {
                $events = invite_read($directory . '/.site.audit.php', 1048576) ?? [];
                invite_reply(200, ['ok' => true, 'events' => array_reverse($events)]);
            }
            if ($id === '') {
                $code = invite_code($input); $hash = hash('sha256', $code);
                foreach ($entries as $candidate) if ($candidate->codeHash === $hash) { $id = $candidate->id; break; }
            }
            if (!is_string($id) || !preg_match('/^p_[a-f0-9]{32}$/D', $id) || !isset($entries[$id])) invite_fail(404, 'project_not_found', 'Проект не найден. Обновите список проектов или проверьте код.');
            $entry = $entries[$id]; $record = invite_read($directory . '/' . $entry->file, $config['max_bytes'] + 4096);
            if (!invite_valid_record($record)) throw new RuntimeException('storage_read');
            $entry = invite_entry_from_record($record, $entry->file, $entry); $entries[$id] = $entry;
            $validSession = invite_session_valid($input->sessionToken ?? null, $entry, $actor, $secret);
            if ($action === 'load') {
                if (!$validSession && $entry->protected) {
                    $code = invite_code($input, true);
                    if ($code === '' || !hash_equals($entry->codeHash, hash('sha256', $code))) invite_fail(401, 'project_code', 'Введите правильный код этого проекта.');
                }
                invite_audit($directory, $entry->id, $actor, 'open', 'Открыт проект.', $entry->revision);
                invite_reply(200, array_merge(['ok' => true, 'project' => $record->project, 'sessionToken' => invite_session($entry, $actor, $secret)], invite_public_entry($entry)));
            }
            if (!$validSession) invite_fail(401, 'session_expired', 'Сеанс доступа завершён. Откройте проект ещё раз; для защищённого проекта введите код.');
            if ($action === 'history') {
                $events = invite_read($directory . '/.' . $entry->id . '.audit.php', 1048576) ?? [];
                invite_reply(200, ['ok' => true, 'projectId' => $entry->id, 'events' => array_reverse($events)]);
            }
            if ($action === 'activity') {
                $allowed = ['export_image','export_zip','export_pdf','export_foil','export_blank_pdf','export_blank_png','guest_import','guest_export','gender_update','project_import','project_download','login','font_add','font_remove','template_upload','print_browser'];
                if (!isset($input->action) || !is_string($input->action) || !in_array($input->action, $allowed, true)) invite_fail(400, 'activity_action', 'Неизвестный тип действия для журнала.');
                $detail = invite_text($input->detail ?? '', 320, 'activity_detail', 'Описание действия должно содержать не более 320 символов.', true);
                $event = invite_audit($directory, $entry->id, $actor, $input->action, $detail, $entry->revision);
                invite_reply(200, ['ok' => true, 'event' => $event]);
            }
            if ($input->expectedRevision !== $record->revision) invite_fail(409, 'revision_conflict', 'На сервере есть более новая версия. Откройте её перед дальнейшим сохранением.', ['revision' => $record->revision, 'updatedAt' => $record->updatedAt]);
            if ($action === 'rename_code') {
                $code = invite_normalize_code($input->newCode ?? '', true); $hash = $code === '' ? '' : hash('sha256', $code);
                if ($hash !== $entry->codeHash) {
                    foreach ($entries as $other) if ($other->id !== $entry->id && $hash !== '' && $other->codeHash === $hash) invite_fail(409, 'code_taken', 'Этот код уже используется. Выберите другой код проекта.');
                    $entry->codeHash = $hash; $entry->protected = $hash !== ''; $entry->accessVersion++; $entry->revision++; $entry->updatedAt = gmdate('Y-m-d\TH:i:s\Z');
                    $record->revision = $entry->revision; $record->updatedAt = $entry->updatedAt; $record->access = ['id' => $entry->id, 'codeHash' => $hash, 'version' => $entry->accessVersion];
                    invite_commit($directory, $entry, $record, $entries, $config['max_bytes']);
                    invite_audit($directory, $entry->id, $actor, 'access', $hash === '' ? 'Код снят. Проект открывается без кода.' : 'Код доступа изменён.', $entry->revision);
                }
                invite_reply(200, array_merge(['ok' => true, 'code' => $code, 'sessionToken' => invite_session($entry, $actor, $secret)], invite_public_entry($entry)));
            }
            $detail = invite_save_detail($record->project, $project);
            unset($record->project);
            $entry->title = invite_title($project); $entry->revision++; $entry->updatedAt = gmdate('Y-m-d\TH:i:s\Z');
            $record = (object) ['revision' => $entry->revision, 'updatedAt' => $entry->updatedAt, 'access' => ['id' => $entry->id, 'codeHash' => $entry->codeHash, 'version' => $entry->accessVersion], 'project' => $project];
        }
        unset($input);
        $total = 0; $files = glob($directory . '/*.project.php');
        if ($files === false) throw new RuntimeException('storage_read');
        foreach ($files as $file) { $size = @filesize($file); if ($size === false) throw new RuntimeException('storage_read'); $total += $size; }
        $previousSize = is_file($directory . '/' . $entry->file) ? @filesize($directory . '/' . $entry->file) : 0;
        if ($previousSize === false) throw new RuntimeException('storage_read');
        // Check the encoded size before any project mutation. The temporary
        // encoded value is released before invite_commit allocates its bytes.
        $estimated = strlen(invite_pack($record));
        if ($estimated > $config['max_bytes']) invite_fail(413, 'project_too_large', 'Проект превышает допустимый размер.', ['maxBytes' => $config['max_bytes']]);
        if ($total - $previousSize + $estimated > $config['max_storage_bytes']) invite_fail(507, 'storage_full', 'Хранилище сервера заполнено. Сохраните проект в файл.');
        if ($action === 'create') invite_creation_limit($directory, $config);
        invite_commit($directory, $entry, $record, $entries, $config['max_bytes']);
        invite_audit($directory, $entry->id, $actor, $action === 'create' ? 'create' : 'save', $action === 'create' ? 'Создан проект.' : $detail, $entry->revision);
        invite_reply($action === 'create' ? 201 : 200, array_merge(['ok' => true, 'code' => $action === 'create' ? $code : '', 'sessionToken' => invite_session($entry, $actor, $secret)], invite_public_entry($entry)));
    } finally { flock($lock, LOCK_UN); fclose($lock); }
} catch (Throwable $exception) {
    invite_fail(503, 'storage_unavailable', 'Хранилище сервера недоступно. Проверьте права PHP на каталог invite-data и настройки config.php. Пока сохраните проект в файл.', ['available' => false]);
}
