<?php
/* XSatsu Студия · настройки: сайт (админ) и пользователь. Секреты и база — только в config.php, не здесь. */
declare(strict_types=1);

namespace XSatsu;

final class Settings
{
    /* Настройки сайта: [значение по умолчанию, проверка]. */
    private static function systemSchema(): array
    {
        return [
            'registration' => ['invite', fn($v) => in_array($v, ['open', 'invite', 'closed'], true)],
            'siteName' => ['XSatsu Студия', fn($v) => is_string($v) && mb_strlen($v) <= 100],
            'localMode' => [true, 'is_bool'],                   // можно работать без входа (проекты в браузере)
            'trashDays' => [30, fn($v) => is_int($v) && $v >= 1 && $v <= 365],
            'notice' => ['', fn($v) => is_string($v) && mb_strlen($v) <= 500], // объявление на главной
            'defaultQuotaMb' => [0, fn($v) => is_int($v) && $v >= 0 && $v <= 1000000], // место на пользователя, МБ; 0 — без ограничения
            'maintenance' => [false, 'is_bool'],                // режим обслуживания: менять данные может только админ
            'maintenanceText' => ['', fn($v) => is_string($v) && mb_strlen($v) <= 300],
            'auditDays' => [365, fn($v) => is_int($v) && $v >= 0 && $v <= 3650], // сколько хранить журнал; 0 — бессрочно
        ];
    }
    /* Ключи пользовательских настроек (значение — любой JSON до 64 КБ). */
    private const USER_KEYS = ['prefs', 'printers', 'print'];

    private static array $cache = [];
    public static function system(string $key): mixed
    {
        $schema = self::systemSchema();
        if (!isset($schema[$key])) throw new \InvalidArgumentException($key);
        if (!array_key_exists('system:' . $key, self::$cache)) {
            $row = App::one("SELECT v FROM settings WHERE scope = 'system' AND scope_id = 0 AND k = ?", [$key]);
            $v = $row ? json_decode($row['v'], true) : null;
            self::$cache['system:' . $key] = $row && $schema[$key][1]($v) ? $v : $schema[$key][0];
        }
        return self::$cache['system:' . $key];
    }
    public static function systemAll(): array
    {
        $out = [];
        foreach (array_keys(self::systemSchema()) as $k) $out[$k] = self::system($k);
        return $out;
    }
    private static function put(string $scope, int $id, string $k, mixed $v): void
    {
        App::q('INSERT INTO settings (scope, scope_id, k, v, updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = VALUES(updated_at)',
            [$scope, $id, $k, json_encode($v, JSON_UNESCAPED_UNICODE), App::now()]);
        unset(self::$cache[$scope . ':' . $k]);
    }

    public static function userAll(int $userId): array
    {
        $out = [];
        foreach (App::all("SELECT k, v FROM settings WHERE scope = 'user' AND scope_id = ?", [$userId]) as $r) if (in_array($r['k'], self::USER_KEYS, true)) $out[$r['k']] = json_decode($r['v'], true);
        return $out;
    }

    /* ---------- API ---------- */
    public static function get(): array
    {
        $u = Auth::current();
        return ['system' => self::systemAll(), 'user' => $u ? self::userAll((int)$u['id']) : null];
    }
    public static function putUser(): array
    {
        $u = Auth::user();
        foreach (App::body() as $k => $v) {
            if (!in_array($k, self::USER_KEYS, true)) throw new HttpError(422, 'Неизвестная настройка «' . $k . '».');
            if (strlen(json_encode($v)) > 65536) throw new HttpError(413, 'Настройка «' . $k . '» слишком большая.');
            self::put('user', (int)$u['id'], $k, $v);
        }
        return self::get();
    }
    public static function putSystem(): array
    {
        Auth::admin();
        $schema = self::systemSchema();
        foreach (App::body() as $k => $v) {
            if (!isset($schema[$k])) throw new HttpError(422, 'Неизвестная настройка сайта «' . $k . '».');
            if (!$schema[$k][1]($v)) throw new HttpError(422, 'Недопустимое значение «' . $k . '».');
            self::put('system', 0, $k, $v);
        }
        App::audit('settings', 'system', '', array_keys(App::body()));
        return self::get();
    }
}
