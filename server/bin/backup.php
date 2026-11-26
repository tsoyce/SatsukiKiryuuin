<?php
/* Резервная копия: дамп базы (mysqldump) + файлы storage/assets → storage/backups/xsatsu-YYYYmmdd-HHMM.tar.gz, хранится 14 дней.
 * Пример cron: 15 3 * * * /opt/brainycp/php84/bin/php /home/tsoy/xsatsu/server/bin/backup.php */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/src/bootstrap.php';
use XSatsu\{App, Jobs};
$c = App::$config;
Jobs::start('backup');
$dir = rtrim($c['storage_dir'], '/') . '/backups';
@mkdir($dir, 0750, true);
preg_match('/dbname=([^;]+)/', $c['db']['dsn'], $m);
preg_match('/host=([^;]+)/', $c['db']['dsn'], $h);
$stamp = gmdate('Ymd-Hi');
$sql = "$dir/xsatsu-$stamp.sql";
$cnf = tempnam(sys_get_temp_dir(), 'xsdb');
file_put_contents($cnf, "[client]\nuser={$c['db']['user']}\npassword=\"" . addcslashes($c['db']['password'], '"\\') . "\"\nhost=" . ($h[1] ?? '127.0.0.1') . "\n");
exec('mysqldump --defaults-extra-file=' . escapeshellarg($cnf) . ' --single-transaction --quick ' . escapeshellarg($m[1] ?? 'xsatsu') . ' > ' . escapeshellarg($sql) . ' 2>&1', $out, $rc);
unlink($cnf);
if ($rc !== 0) { $msg = "mysqldump: " . implode("\n", $out); Jobs::finish('backup', false, $msg); fwrite(STDERR, $msg . "\n"); exit(1); }
$tar = "$dir/xsatsu-$stamp.tar.gz";
exec('tar -czf ' . escapeshellarg($tar) . ' -C ' . escapeshellarg(dirname($sql)) . ' ' . escapeshellarg(basename($sql)) . ' -C ' . escapeshellarg(rtrim($c['storage_dir'], '/')) . ' assets 2>&1', $out, $rc);
unlink($sql);
foreach (glob("$dir/xsatsu-*.tar.gz") ?: [] as $f) if (filemtime($f) < time() - 14 * 86400) unlink($f);
Jobs::finish('backup', $rc === 0, $rc === 0 ? basename($tar) . ' · ' . round(filesize($tar) / 1048576, 1) . ' МБ' : 'Ошибка tar: ' . implode("\n", $out));
echo $rc === 0 ? "Готово: $tar\n" : "Ошибка tar\n";
exit($rc);
