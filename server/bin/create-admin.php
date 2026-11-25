<?php
/* Создать администратора из консоли: php bin/create-admin.php <логин> [имя]   (пароль спросит или возьмёт из XS_ADMIN_PASSWORD) */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require dirname(__DIR__) . '/src/bootstrap.php';
use XSatsu\Auth;
$login = $argv[1] ?? '';
if ($login === '') { fwrite(STDERR, "Использование: php bin/create-admin.php <логин> [имя]\n"); exit(2); }
$password = getenv('XS_ADMIN_PASSWORD') ?: '';
if ($password === '') { echo 'Пароль (не короче 8 символов): '; system('stty -echo 2>/dev/null'); $password = trim((string)fgets(STDIN)); system('stty echo 2>/dev/null'); echo PHP_EOL; }
try { $u = Auth::createUser($login, $argv[2] ?? $login, $password, 'admin'); echo "Администратор {$u['login']} создан.\n"; }
catch (\Throwable $e) { fwrite(STDERR, $e->getMessage() . PHP_EOL); exit(1); }
