<?php
/* XSatsu Студия · единая точка входа API: api/index.php?r=v1/<путь>.
 * На сервере web-root содержит только заглушку api/index.php, которая подключает этот файл (код и config.php — вне web-root). */
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

use XSatsu\{App, Auth, Projects, Assets, Settings, Admin, Migrate, Forms, HttpError};

App::route('GET', '/v1/health', function () {
    $db = false; $schema = null; $pending = null;
    try { App::db()->query('SELECT 1'); $db = true; $schema = Migrate::current(); $pending = count(Migrate::pending()); } catch (\Throwable) {}
    $dir = rtrim((string)App::$config['storage_dir'], '/');
    $storage = (is_dir($dir) || @mkdir($dir, 0750, true)) && is_writable($dir);
    return ['ok' => $db && $storage && $pending === 0, 'version' => App::VERSION, 'db' => $db, 'schema' => $schema, 'pendingMigrations' => $pending, 'storage' => $storage, 'time' => App::iso(App::now())];
});
App::route('GET', '/v1/auth/state', fn() => Auth::state());
App::route('POST', '/v1/auth/setup', fn() => Auth::setup());
App::route('POST', '/v1/auth/login', fn() => Auth::login());
App::route('POST', '/v1/auth/logout', fn() => Auth::logout());
App::route('POST', '/v1/auth/register', fn() => Auth::register());
App::route('PATCH', '/v1/auth/me', fn() => Auth::updateMe());

App::route('GET', '/v1/projects', fn() => Projects::list());
App::route('POST', '/v1/projects', fn() => Projects::create());
App::route('GET', '/v1/projects/{id}', fn($p) => Projects::get($p));
App::route('PUT', '/v1/projects/{id}', fn($p) => Projects::update($p));
App::route('DELETE', '/v1/projects/{id}', fn($p) => Projects::remove($p));
App::route('POST', '/v1/projects/{id}/restore', fn($p) => Projects::restore($p));
App::route('GET', '/v1/projects/{id}/revisions', fn($p) => Projects::revisions($p));
App::route('POST', '/v1/projects/{id}/revisions', fn($p) => Projects::saveVersion($p));
App::route('GET', '/v1/projects/{id}/revisions/{rev}', fn($p) => Projects::revision($p));
App::route('GET', '/v1/projects/{id}/shares', fn($p) => Projects::shares($p));
App::route('POST', '/v1/projects/{id}/shares', fn($p) => Projects::share($p));
App::route('DELETE', '/v1/projects/{id}/shares/{share}', fn($p) => Projects::unshare($p));
App::route('GET', '/v1/links/{token}', fn($p) => Projects::byLink($p));

// v4: анкеты регистрации (владелец/редактор) и публичная анкета (без входа)
App::route('GET', '/v1/projects/{id}/forms', fn($p) => Forms::list($p));
App::route('POST', '/v1/projects/{id}/forms', fn($p) => Forms::create($p));
App::route('PATCH', '/v1/projects/{id}/forms/{form}', fn($p) => Forms::update($p));
App::route('DELETE', '/v1/projects/{id}/forms/{form}', fn($p) => Forms::remove($p));
App::route('GET', '/v1/projects/{id}/forms/{form}/responses', fn($p) => Forms::responses($p));
App::route('POST', '/v1/projects/{id}/forms/{form}/ack', fn($p) => Forms::ack($p));
App::route('GET', '/v1/f/{token}', fn($p) => Forms::publicGet($p));
App::route('POST', '/v1/f/{token}', fn($p) => Forms::submit($p));

App::route('POST', '/v1/assets/missing', fn() => Assets::missing());
App::route('PUT', '/v1/assets/{sha}', fn($p) => Assets::upload($p));
App::route('GET', '/v1/assets/{sha}', fn($p) => Assets::download($p));

App::route('GET', '/v1/settings', fn() => Settings::get());
App::route('PUT', '/v1/settings/user', fn() => Settings::putUser());
App::route('PUT', '/v1/settings/system', fn() => Settings::putSystem());

App::route('GET', '/v1/admin/users', fn() => Admin::users());
App::route('POST', '/v1/admin/users', fn() => Admin::createUser());
App::route('PATCH', '/v1/admin/users/{id}', fn($p) => Admin::updateUser($p));
App::route('GET', '/v1/admin/invites', fn() => Admin::invites());
App::route('POST', '/v1/admin/invites', fn() => Admin::createInvite());
App::route('DELETE', '/v1/admin/invites/{id}', fn($p) => Admin::deleteInvite($p));
App::route('GET', '/v1/admin/audit', fn() => Admin::audit());
App::route('GET', '/v1/admin/stats', fn() => Admin::stats());

$route = $_GET['r'] ?? ($_SERVER['PATH_INFO'] ?? '');
App::handle($_SERVER['REQUEST_METHOD'] ?? 'GET', is_string($route) ? $route : '');
