<?php
/* Обслуживание по cron (раз в сутки): корзина старше срока, просроченные сессии и попытки входа, неиспользуемые файлы,
 * отметки ограничения частоты старше суток, гостевые ссылки, истёкшие больше 30 дней назад.
 * Пример: 30 4 * * * /opt/brainycp/php84/bin/php /home/tsoy/xsatsu/server/bin/cleanup.php */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/src/bootstrap.php';
use XSatsu\{App, Projects, Assets, RateLimit};
$trash = Projects::purgeTrash();
$sessions = App::q('DELETE FROM sessions WHERE expires_at < ?', [App::now()])->rowCount();
$attempts = App::q('DELETE FROM login_attempts WHERE at < ?', [App::now(-86400 * 7)])->rowCount();
$files = Assets::gc();
$rate = RateLimit::gc();
$links = App::q('DELETE FROM project_shares WHERE token_hash IS NOT NULL AND expires_at IS NOT NULL AND expires_at < ?', [App::now(-86400 * 30)])->rowCount();
echo "Корзина: $trash, сессии: $sessions, попытки входа: $attempts, файлы: $files, отметки частоты: $rate, истёкшие ссылки: $links\n";
