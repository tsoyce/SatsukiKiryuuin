<?php
/* XSatsu Студия · учёт фоновых задач (резервная копия, обслуживание): когда запускалась, чем закончилась.
 * Пишут bin/backup.php и bin/cleanup.php (и кнопка «Обслуживание сейчас» в админке); читает раздел «Сервер». */
declare(strict_types=1);

namespace XSatsu;

final class Jobs
{
    public const NAMES = ['backup' => 'Резервная копия', 'cleanup' => 'Обслуживание'];

    public static function start(string $name): void
    {
        try { App::q('INSERT INTO server_jobs (name, started_at) VALUES (?,?) ON DUPLICATE KEY UPDATE started_at = VALUES(started_at)', [$name, App::now()]); }
        catch (\Throwable $e) { error_log('XSatsu jobs: ' . $e->getMessage()); }
    }
    public static function finish(string $name, bool $ok, string $message = ''): void
    {
        try {
            App::q('INSERT INTO server_jobs (name, started_at, finished_at, ok, message) VALUES (?,?,?,?,?)
                ON DUPLICATE KEY UPDATE finished_at = VALUES(finished_at), ok = VALUES(ok), message = VALUES(message)', [$name, App::now(), App::now(), $ok ? 1 : 0, mb_substr($message, 0, 1000)]);
        } catch (\Throwable $e) { error_log('XSatsu jobs: ' . $e->getMessage()); }
    }
    public static function all(): array
    {
        $rows = [];
        try { foreach (App::all('SELECT * FROM server_jobs') as $r) $rows[$r['name']] = $r; } catch (\Throwable) {}
        $out = [];
        foreach (self::NAMES as $name => $title) {
            $r = $rows[$name] ?? null;
            $out[] = ['name' => $name, 'title' => $title, 'startedAt' => App::iso($r['started_at'] ?? null), 'finishedAt' => App::iso($r['finished_at'] ?? null),
                'ok' => isset($r['ok']) ? (bool)$r['ok'] : null, 'message' => $r['message'] ?? ''];
        }
        return $out;
    }
}
