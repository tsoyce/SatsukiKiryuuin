<?php
/* Применить миграции базы: php bin/migrate.php [--status] */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/src/bootstrap.php';
use XSatsu\Migrate;
if (in_array('--status', $argv, true)) { echo 'Схема: ', Migrate::current() ?? 'пусто', '; не применено: ', count(Migrate::pending()), PHP_EOL; exit(0); }
$done = Migrate::run();
echo $done ? 'Применено: ' . implode(', ', $done) . PHP_EOL : 'База уже актуальна (' . Migrate::current() . ').' . PHP_EOL;
