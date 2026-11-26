<?php
/* XSatsu Студия · ограничение частоты запросов по IP (гостевые ссылки, загрузки без входа).
 * Хранится в rate_hits; старые записи чистит bin/cleanup.php. */
declare(strict_types=1);

namespace XSatsu;

final class RateLimit
{
    public static function count(string $bucket, int $windowSec): int
    {
        return (int)(App::one('SELECT COUNT(*) n FROM rate_hits WHERE bucket = ? AND ip = ? AND at > ?', [$bucket, App::ip(), App::now(-$windowSec)])['n'] ?? 0);
    }
    /* Бросает 429, если с этого IP за окно уже было $limit запросов в корзину $bucket. */
    public static function check(string $bucket, int $limit, int $windowSec, string $message): void
    {
        if (self::count($bucket, $windowSec) >= $limit) {
            $min = max(1, (int)ceil($windowSec / 60));
            throw new HttpError(429, $message . ' Попробуйте через ' . $min . ' мин.', ['retryAfter' => $windowSec]);
        }
    }
    public static function hit(string $bucket): void
    {
        App::q('INSERT INTO rate_hits (bucket, ip, at) VALUES (?,?,?)', [$bucket, App::ip(), App::now()]);
    }
    /* Проверить и сразу засчитать. */
    public static function take(string $bucket, int $limit, int $windowSec, string $message): void
    {
        self::check($bucket, $limit, $windowSec, $message);
        self::hit($bucket);
    }
    public static function gc(): int
    {
        return App::q('DELETE FROM rate_hits WHERE at < ?', [App::now(-86400)])->rowCount();
    }
}
