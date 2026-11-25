<?php
/* XSatsu Студия · миграции: нумерованные SQL-файлы из server/migrations, учёт в schema_migrations. */
declare(strict_types=1);

namespace XSatsu;

final class Migrate
{
    public static function pending(): array
    {
        App::db()->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(50) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $done = array_column(App::all('SELECT version FROM schema_migrations'), 'version');
        $files = glob(dirname(__DIR__) . '/migrations/*.sql') ?: [];
        sort($files);
        return array_values(array_filter($files, fn($f) => !in_array(basename($f, '.sql'), $done, true)));
    }
    /** @return string[] применённые миграции */
    public static function run(): array
    {
        $applied = [];
        foreach (self::pending() as $file) {
            $sql = (string)file_get_contents($file);
            $sql = preg_replace('/^\s*--.*$/m', '', $sql);
            foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) App::db()->exec($stmt);
            App::q('INSERT INTO schema_migrations (version, applied_at) VALUES (?,?)', [basename($file, '.sql'), App::now()]);
            $applied[] = basename($file);
        }
        return $applied;
    }
    public static function current(): ?string
    {
        try { return App::one('SELECT MAX(version) v FROM schema_migrations')['v'] ?? null; } catch (\Throwable) { return null; }
    }
}
