<?php
/* Обслуживание по cron (раз в сутки): см. src/Maintenance.php. Результат виден в админке → «Сервер».
 * Пример: 30 4 * * * /opt/brainycp/php84/bin/php /home/tsoy/xsatsu/server/bin/cleanup.php */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/src/bootstrap.php';
use XSatsu\Maintenance;
echo Maintenance::describe(Maintenance::cleanup()) . "\n";
