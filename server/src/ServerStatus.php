<?php
/* XSatsu Студия · состояние сервера для админки: диск, хранилище, база, резервные копии, фоновые задачи (cron), PHP,
 * безопасность (неудачные входы), и список предупреждений «что требует внимания». Секреты (пароль базы, код установки) не отдаются. */
declare(strict_types=1);

namespace XSatsu;

final class ServerStatus
{
    private static function storage(): string { return rtrim((string)App::$config['storage_dir'], '/'); }

    /* Размер каталога (с ограничением числа файлов, чтобы не зависнуть на огромном дереве). */
    private static function dirSize(string $dir, int $maxFiles = 20000): array
    {
        $bytes = 0; $files = 0;
        if (!is_dir($dir)) return ['bytes' => 0, 'files' => 0, 'partial' => false];
        try {
            $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
            foreach ($it as $f) {
                if (!$f->isFile()) continue;
                $bytes += $f->getSize(); $files++;
                if ($files >= $maxFiles) return ['bytes' => $bytes, 'files' => $files, 'partial' => true];
            }
        } catch (\Throwable) {}
        return ['bytes' => $bytes, 'files' => $files, 'partial' => false];
    }
    private static function backups(): array
    {
        $list = [];
        foreach (glob(self::storage() . '/backups/xsatsu-*.tar.gz') ?: [] as $f) $list[] = ['name' => basename($f), 'bytes' => (int)@filesize($f), 'at' => App::iso(gmdate('Y-m-d H:i:s', (int)@filemtime($f)))];
        usort($list, fn($a, $b) => strcmp($b['at'], $a['at']));
        return $list;
    }
    private static function cronLog(int $lines = 40): array
    {
        $f = self::storage() . '/cron.log';
        if (!is_file($f) || !is_readable($f)) return [];
        $size = filesize($f);
        $h = fopen($f, 'rb');
        if ($size > 32768) fseek($h, -32768, SEEK_END);
        $text = (string)stream_get_contents($h);
        fclose($h);
        $rows = array_values(array_filter(explode("\n", $text), fn($l) => trim($l) !== ''));
        return array_slice($rows, -$lines);
    }
    private static function proc(string $file): ?string
    {
        $ob = (string)ini_get('open_basedir');
        if ($ob !== '') return null; // за пределами open_basedir читать нельзя — не шумим предупреждениями
        $v = @file_get_contents($file);
        return $v === false ? null : $v;
    }
    private static function memory(): ?array
    {
        $m = self::proc('/proc/meminfo');
        if (!$m) return null;
        $get = fn($k) => preg_match('/^' . $k . ':\s+(\d+)/m', $m, $x) ? (int)$x[1] * 1024 : null;
        return ['total' => $get('MemTotal'), 'available' => $get('MemAvailable'), 'swapTotal' => $get('SwapTotal'), 'swapFree' => $get('SwapFree')];
    }
    private static function bytesIni(string $k): int
    {
        $v = trim((string)ini_get($k));
        if ($v === '' || $v === '-1') return -1;
        $n = (int)$v;
        return match (strtolower(substr($v, -1))) { 'g' => $n << 30, 'm' => $n << 20, 'k' => $n << 10, default => $n };
    }
    private static function database(): array
    {
        $tables = App::all('SELECT table_name t, table_rows r, data_length + index_length b FROM information_schema.TABLES WHERE table_schema = DATABASE() ORDER BY b DESC');
        return ['version' => App::one('SELECT VERSION() v')['v'] ?? '', 'bytes' => array_sum(array_map(fn($t) => (int)$t['b'], $tables)),
            'tables' => array_map(fn($t) => ['name' => $t['t'], 'rows' => (int)$t['r'], 'bytes' => (int)$t['b']], $tables),
            'schema' => Migrate::current(), 'pending' => array_map('basename', Migrate::pending())];
    }

    public static function get(): array
    {
        Auth::admin();
        $dir = self::storage();
        $free = @disk_free_space($dir); $total = @disk_total_space($dir);
        $day = App::now(-86400);
        $ext = [];
        foreach (['pdo_mysql', 'mbstring', 'zlib', 'sodium', 'openssl', 'curl', 'intl', 'gd', 'zip'] as $e) $ext[$e] = extension_loaded($e);
        $opcache = function_exists('opcache_get_status') ? @opcache_get_status(false) : false;
        $disabled = array_filter(array_map('trim', explode(',', (string)ini_get('disable_functions'))));
        return [
            'version' => App::VERSION, 'time' => App::iso(App::now()), 'env' => App::$config['env'],
            'disk' => ['free' => $free === false ? null : (int)$free, 'total' => $total === false ? null : (int)$total, 'path' => $dir],
            'storage' => [
                'assets' => self::dirSize($dir . '/assets') + ['db' => (int)App::one('SELECT COALESCE(SUM(bytes),0) n FROM assets')['n'], 'rows' => (int)App::one('SELECT COUNT(*) n FROM assets')['n']],
                'fontCache' => self::dirSize($dir . '/font-cache'), 'backups' => self::dirSize($dir . '/backups', 2000),
                'orphans' => (int)App::one('SELECT COUNT(*) n FROM assets a LEFT JOIN project_assets pa ON pa.sha256 = a.sha256 WHERE pa.sha256 IS NULL')['n'],
            ],
            'database' => self::database(),
            'backups' => array_slice(self::backups(), 0, 20),
            'jobs' => Jobs::all(), 'cronLog' => self::cronLog(),
            'php' => ['version' => PHP_VERSION, 'sapi' => PHP_SAPI, 'memoryLimit' => ini_get('memory_limit'), 'uploadMax' => ini_get('upload_max_filesize'), 'postMax' => ini_get('post_max_size'),
                'maxExecution' => (int)ini_get('max_execution_time'), 'opcache' => is_array($opcache) && !empty($opcache['opcache_enabled']), 'extensions' => $ext,
                'execAllowed' => function_exists('exec') && !in_array('exec', $disabled, true), 'openBasedir' => (string)ini_get('open_basedir') !== ''],
            'system' => ['load' => function_exists('sys_getloadavg') ? (@sys_getloadavg() ?: null) : null, 'memory' => self::memory(), 'os' => PHP_OS_FAMILY, 'host' => gethostname() ?: ''],
            'security' => [
                'failed24h' => (int)App::one('SELECT COUNT(*) n FROM login_attempts WHERE ok = 0 AND at > ?', [$day])['n'],
                'topIps' => App::all('SELECT ip, COUNT(*) n, MAX(at) last FROM login_attempts WHERE ok = 0 AND at > ? GROUP BY ip ORDER BY n DESC LIMIT 8', [$day]),
                'topLogins' => App::all('SELECT login, COUNT(*) n FROM login_attempts WHERE ok = 0 AND at > ? GROUP BY login ORDER BY n DESC LIMIT 8', [$day]),
                'sessions' => (int)App::one('SELECT COUNT(*) n FROM sessions WHERE expires_at > ?', [App::now()])['n'],
                'setupTokenSet' => (string)App::$config['setup_token'] !== '', 'cookieSecure' => (bool)App::$config['cookie_secure'],
                'publicOrigin' => (string)App::$config['public_origin'],
            ],
            'limits' => ['maxAssetMb' => (int)App::$config['max_asset_mb'], 'maxDocMb' => (int)App::$config['max_doc_mb'], 'revisionsKeep' => (int)App::$config['revisions_keep'],
                'revisionEveryMinutes' => (int)App::$config['revision_every_minutes'], 'sessionDays' => (int)App::$config['session_days']],
            'warnings' => self::warnings(),
        ];
    }

    /* Что требует внимания: [{level: warn|error|info, text, section}] */
    public static function warnings(): array
    {
        $w = [];
        $dir = self::storage();
        $free = @disk_free_space($dir); $total = @disk_total_space($dir);
        if ($free !== false && $total) {
            if ($free < 1 << 30 || $free / $total < .05) $w[] = ['level' => 'error', 'text' => 'На диске почти не осталось места: свободно ' . round($free / (1 << 30), 1) . ' ГБ.', 'section' => 'server'];
            elseif ($free < 3 << 30 || $free / $total < .12) $w[] = ['level' => 'warn', 'text' => 'Места на диске мало: свободно ' . round($free / (1 << 30), 1) . ' ГБ.', 'section' => 'server'];
        }
        try { $pending = count(Migrate::pending()); } catch (\Throwable) { $pending = 0; }
        if ($pending) $w[] = ['level' => 'error', 'text' => 'Не применены миграции базы: ' . $pending . '. Запустите server/bin/migrate.php.', 'section' => 'server'];
        $jobs = [];
        foreach (Jobs::all() as $j) $jobs[$j['name']] = $j;
        $backups = self::backups();
        $lastBackup = $jobs['backup']['finishedAt'] ?? null;
        if ($backups) $lastBackup = max((string)$lastBackup, $backups[0]['at']);
        if (!$lastBackup) $w[] = ['level' => 'warn', 'text' => 'Резервных копий пока нет. Включите cron (server-install.sh … --with-cron).', 'section' => 'server'];
        elseif (strtotime($lastBackup) < time() - 36 * 3600) $w[] = ['level' => 'warn', 'text' => 'Последняя резервная копия старше полутора суток.', 'section' => 'server'];
        if (($jobs['backup']['ok'] ?? null) === false) $w[] = ['level' => 'error', 'text' => 'Последняя резервная копия завершилась ошибкой.', 'section' => 'server'];
        $clean = $jobs['cleanup']['finishedAt'] ?? null;
        if ($clean && strtotime($clean) < time() - 72 * 3600) $w[] = ['level' => 'warn', 'text' => 'Обслуживание (cron) не запускалось больше трёх суток.', 'section' => 'server'];
        $users = (int)(App::one('SELECT COUNT(*) n FROM users')['n'] ?? 0);
        if ($users > 0 && (string)App::$config['setup_token'] !== '') $w[] = ['level' => 'info', 'text' => 'В config.php остался код установки (setup_token). Администратор уже создан — код можно убрать.', 'section' => 'server'];
        if (App::$config['env'] !== 'dev' && !App::$config['cookie_secure']) $w[] = ['level' => 'warn', 'text' => 'cookie_secure выключен: вход работает и по HTTP без шифрования.', 'section' => 'server'];
        $failed = (int)(App::one('SELECT COUNT(*) n FROM login_attempts WHERE ok = 0 AND at > ?', [App::now(-86400)])['n'] ?? 0);
        if ($failed >= 50) $w[] = ['level' => 'warn', 'text' => 'Неудачных попыток входа за сутки: ' . $failed . '. Возможен подбор паролей.', 'section' => 'server'];
        if (Settings::system('maintenance')) $w[] = ['level' => 'info', 'text' => 'Включён режим обслуживания: пользователи не могут сохранять изменения.', 'section' => 'settings'];
        return $w;
    }

    /* Кнопка «Обслуживание сейчас». */
    public static function runCleanup(): array
    {
        Auth::admin();
        $r = Maintenance::cleanup();
        App::audit('maintenance.cleanup', 'system', '', $r);
        return ['result' => $r, 'text' => Maintenance::describe($r)];
    }
}
