<?php
/* XSatsu Студия · сервер: конфигурация, база, HTTP-ответы, маршрутизация, журнал. Без фреймворка, PHP 8.3+. */
declare(strict_types=1);

namespace XSatsu;

use PDO;

final class HttpError extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}

final class App
{
    public const VERSION = '4.0.0';
    public static array $config = [];
    private static ?PDO $pdo = null;
    public static ?array $user = null;        // текущий пользователь (после Auth::current)
    public static ?array $session = null;

    /* ---------- конфигурация ---------- */
    public static function loadConfig(?string $path = null): array
    {
        $path ??= getenv('XS_CONFIG') ?: dirname(__DIR__, 2) . '/config.php';
        $cfg = is_file($path) ? require $path : [];
        if (!is_array($cfg)) $cfg = [];
        $defaults = [
            'env' => 'production', 'public_origin' => '', 'db' => ['dsn' => '', 'user' => '', 'password' => ''],
            'storage_dir' => dirname(__DIR__, 2) . '/storage', 'setup_token' => '', 'session_days' => 14, 'cookie_secure' => true,
            'max_asset_mb' => 50, 'max_doc_mb' => 16, 'revisions_keep' => 100, 'revision_every_minutes' => 10,
        ];
        $cfg = array_replace_recursive($defaults, $cfg);
        $env = [
            'XS_ENV' => ['env'], 'XS_PUBLIC_ORIGIN' => ['public_origin'], 'XS_DB_DSN' => ['db', 'dsn'], 'XS_DB_USER' => ['db', 'user'],
            'XS_DB_PASSWORD' => ['db', 'password'], 'XS_STORAGE_DIR' => ['storage_dir'], 'XS_SETUP_TOKEN' => ['setup_token'],
            'XS_COOKIE_SECURE' => ['cookie_secure'],
        ];
        foreach ($env as $name => $keys) {
            $v = getenv($name);
            if ($v === false) continue;
            if ($keys === ['cookie_secure']) $v = !in_array(strtolower($v), ['0', 'false', 'no', ''], true);
            if (count($keys) === 1) $cfg[$keys[0]] = $v; else $cfg[$keys[0]][$keys[1]] = $v;
        }
        return self::$config = $cfg;
    }

    public static function db(): PDO
    {
        if (!self::$pdo) {
            $c = self::$config['db'];
            if (!$c['dsn']) throw new HttpError(503, 'Сервер не настроен: нет подключения к базе (config.php).');
            try {
                self::$pdo = new PDO($c['dsn'], $c['user'], $c['password'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_STRINGIFY_FETCHES => false,
                ]);
                self::$pdo->exec("SET time_zone = '+00:00', NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            } catch (\PDOException $e) {
                error_log('XSatsu DB: ' . $e->getMessage());
                throw new HttpError(503, 'База данных недоступна.');
            }
        }
        return self::$pdo;
    }
    public static function setDb(?PDO $pdo): void { self::$pdo = $pdo; }

    /* Короткие помощники для запросов. */
    public static function q(string $sql, array $args = []): \PDOStatement
    {
        $st = self::db()->prepare($sql);
        $st->execute($args);
        return $st;
    }
    public static function one(string $sql, array $args = []): ?array { $r = self::q($sql, $args)->fetch(); return $r === false ? null : $r; }
    public static function all(string $sql, array $args = []): array { return self::q($sql, $args)->fetchAll(); }
    public static function now(int $plusSeconds = 0): string { return gmdate('Y-m-d H:i:s', time() + $plusSeconds); }
    public static function iso(?string $dt): ?string { return $dt ? str_replace(' ', 'T', $dt) . 'Z' : null; }
    public static function ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }
    public static function token(int $bytes = 32): string { return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '='); }

    public static function audit(string $action, string $type = '', string $id = '', array $detail = []): void
    {
        try {
            self::q('INSERT INTO audit_log (at, actor_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?,?)',
                [self::now(), self::$user['id'] ?? null, $action, $type, $id, $detail ? json_encode($detail, JSON_UNESCAPED_UNICODE) : null, self::ip()]);
        } catch (\Throwable $e) { error_log('XSatsu audit: ' . $e->getMessage()); }
    }

    /* ---------- HTTP ---------- */
    private static ?array $jsonBody = null;
    public static function body(): array
    {
        if (self::$jsonBody !== null) return self::$jsonBody;
        $raw = file_get_contents('php://input') ?: '';
        $max = (int)self::$config['max_doc_mb'] * 1024 * 1024 + 2 * 1024 * 1024;
        if (strlen($raw) > $max) throw new HttpError(413, 'Слишком большой запрос.');
        if ($raw === '') return self::$jsonBody = [];
        $data = json_decode($raw, true);
        if (!is_array($data)) throw new HttpError(400, 'Ожидался JSON.');
        return self::$jsonBody = $data;
    }
    public static function str(array $src, string $key, int $max = 190, bool $required = false): string
    {
        $v = $src[$key] ?? '';
        if (!is_string($v) && !is_numeric($v)) $v = '';
        $v = trim((string)$v);
        if ($required && $v === '') throw new HttpError(422, 'Не заполнено поле «' . $key . '».');
        if (mb_strlen($v) > $max) throw new HttpError(422, 'Слишком длинное значение «' . $key . '».');
        return $v;
    }

    public static function send(int $status, mixed $data): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /* ---------- маршруты ---------- */
    /** @var array<int, array{0:string,1:string,2:callable}> */
    private static array $routes = [];
    public static function route(string $method, string $pattern, callable $handler): void
    {
        $re = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[A-Za-z0-9_.\-]+)', $pattern) . '$#';
        self::$routes[] = [$method, $re, $handler];
    }

    public static function handle(string $method, string $path): void
    {
        try {
            $path = '/' . trim($path, '/');
            $allowed = false;
            foreach (self::$routes as [$m, $re, $fn]) {
                if (!preg_match($re, $path, $mm)) continue;
                $allowed = true;
                if ($m !== $method) continue;
                $params = array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY);
                if ($method !== 'GET' && $method !== 'HEAD') Auth::checkWriteRequest();
                $result = $fn($params);
                if ($result !== null) self::send(200, $result);
                return;
            }
            throw new HttpError($allowed ? 405 : 404, $allowed ? 'Метод не поддерживается.' : 'Нет такого адреса API.');
        } catch (HttpError $e) {
            self::send($e->status, ['error' => $e->getMessage()] + $e->extra);
        } catch (\Throwable $e) {
            error_log('XSatsu: ' . $e);
            self::send(500, ['error' => 'Ошибка сервера.' . (self::$config['env'] === 'dev' ? ' ' . $e->getMessage() : '')]);
        }
    }
}
