<?php
/* XSatsu Студия · загрузка классов сервера и конфигурации. */
declare(strict_types=1);

spl_autoload_register(function (string $class): void {
    if (str_starts_with($class, 'XSatsu\\')) {
        $file = __DIR__ . '/' . substr($class, 7) . '.php';
        if (is_file($file)) require $file;
    }
});
require_once __DIR__ . '/App.php'; // HttpError объявлен рядом с App
XSatsu\App::loadConfig();
