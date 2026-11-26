<?php
/* XSatsu Студия · обслуживание: корзина старше срока, просроченные сессии и попытки входа, неиспользуемые файлы,
 * отметки частоты, давно истёкшие гостевые ссылки. Запускается cron-ом (bin/cleanup.php) и кнопкой в админке. */
declare(strict_types=1);

namespace XSatsu;

final class Maintenance
{
    /** @return array<string,int> */
    public static function cleanup(): array
    {
        Jobs::start('cleanup');
        try {
            $r = [
                'trash' => Projects::purgeTrash(),
                'sessions' => App::q('DELETE FROM sessions WHERE expires_at < ?', [App::now()])->rowCount(),
                'attempts' => App::q('DELETE FROM login_attempts WHERE at < ?', [App::now(-86400 * 7)])->rowCount(),
                'files' => Assets::gc(),
                'rate' => RateLimit::gc(),
                'links' => App::q('DELETE FROM project_shares WHERE token_hash IS NOT NULL AND expires_at IS NOT NULL AND expires_at < ?', [App::now(-86400 * 30)])->rowCount(),
                'audit' => self::trimAudit(),
            ];
        } catch (\Throwable $e) { Jobs::finish('cleanup', false, $e->getMessage()); throw $e; }
        Jobs::finish('cleanup', true, self::describe($r));
        return $r;
    }
    public static function describe(array $r): string
    {
        return "Корзина: {$r['trash']}, сессии: {$r['sessions']}, попытки входа: {$r['attempts']}, файлы: {$r['files']}, отметки частоты: {$r['rate']}, истёкшие ссылки: {$r['links']}, журнал: {$r['audit']}";
    }
    /* Журнал хранится auditDays дней (настройка сайта; 0 — бессрочно). */
    private static function trimAudit(): int
    {
        $days = (int)Settings::system('auditDays');
        return $days > 0 ? App::q('DELETE FROM audit_log WHERE at < ?', [App::now(-$days * 86400)])->rowCount() : 0;
    }

    /* Режим обслуживания: менять данные может только администратор (вход и выход работают). */
    public static function guard(string $method, string $path): void
    {
        if ($method === 'GET' || $method === 'HEAD' || str_starts_with($path, '/v1/auth/')) return;
        try { $on = (bool)Settings::system('maintenance'); } catch (\Throwable) { return; }
        if (!$on) return;
        $u = Auth::current();
        if ($u && $u['role'] === 'admin') return;
        $text = (string)Settings::system('maintenanceText');
        throw new HttpError(503, $text !== '' ? $text : 'На сайте идут технические работы: изменения временно не сохраняются. Попробуйте чуть позже.', ['maintenance' => true]);
    }
}
