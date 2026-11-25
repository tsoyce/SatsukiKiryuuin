<?php
/* Обслуживание по cron (раз в сутки): корзина старше срока, просроченные сессии и попытки входа, неиспользуемые файлы.
 * Пример: 30 4 * * * /opt/brainycp/php84/bin/php /home/tsoy/xsatsu/server/bin/cleanup.php */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/src/bootstrap.php';
use XSatsu\{App, Projects, Assets};
$trash = Projects::purgeTrash();
$sessions = App::q('DELETE FROM sessions WHERE expires_at < ?', [App::now()])->rowCount();
$attempts = App::q('DELETE FROM login_attempts WHERE at < ?', [App::now(-86400 * 7)])->rowCount();
$files = Assets::gc();
echo "Корзина: $trash, сессии: $sessions, попытки входа: $attempts, файлы: $files\n";
