<?php
/* Локальная разработка: php -S localhost:8091 -t app tools/dev-router.php
 * /api/index.php → сервер (server/public/index.php), остальное — статические файлы Студии.
 * Конфигурация — переменные окружения XS_DB_DSN, XS_DB_USER, XS_DB_PASSWORD, XS_STORAGE_DIR, XS_SETUP_TOKEN, XS_COOKIE_SECURE=0. */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/')) { require __DIR__ . '/../server/public/index.php'; return true; }
return false;
