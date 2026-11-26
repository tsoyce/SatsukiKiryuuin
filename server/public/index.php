<?php
/* XSatsu Студия · единая точка входа API: api/index.php?r=v1/<путь>.
 * На сервере web-root содержит только заглушку api/index.php, которая подключает этот файл (код и config.php — вне web-root). */
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

use XSatsu\{App, Auth, Projects, Links, Assets, Settings, Admin, AdminAudit, AdminProjects, ServerStatus, SiteLibrary, Migrate, Forms, Fonts, RemoteImage, HttpError};

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
App::route('PATCH', '/v1/projects/{id}/shares/{share}', fn($p) => Projects::updateShare($p));
App::route('DELETE', '/v1/projects/{id}/shares/{share}', fn($p) => Projects::unshare($p));
// Гостевая ссылка без входа: токен — в заголовке X-XS-Link (старые ссылки — в пути)
App::route('GET', '/v1/link', fn() => Links::open());
App::route('PUT', '/v1/link', fn() => Links::save());
App::route('GET', '/v1/links/{token}', fn($p) => Links::open($p));

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

// Шрифты Google Fonts целым файлом (для вёрстки и PDF), без входа: Студия работает и без аккаунта
App::route('GET', '/v1/fonts/google', fn() => Fonts::google());
App::route('GET', '/v1/images/fetch', fn() => RemoteImage::fetch());

// Библиотека сайта: шаблоны и шрифты для всех (без входа), управление — в админке
App::route('GET', '/v1/templates', fn() => SiteLibrary::templates());
App::route('GET', '/v1/templates/{id}', fn($p) => SiteLibrary::template($p));
App::route('GET', '/v1/fonts/site', fn() => SiteLibrary::fonts());

App::route('GET', '/v1/settings', fn() => Settings::get());
App::route('PUT', '/v1/settings/user', fn() => Settings::putUser());
App::route('PUT', '/v1/settings/system', fn() => Settings::putSystem());

App::route('GET', '/v1/admin/overview', fn() => Admin::overview());
App::route('GET', '/v1/admin/users', fn() => Admin::users());
App::route('POST', '/v1/admin/users', fn() => Admin::createUser());
App::route('GET', '/v1/admin/users/{id}', fn($p) => Admin::user($p));
App::route('PATCH', '/v1/admin/users/{id}', fn($p) => Admin::updateUser($p));
App::route('DELETE', '/v1/admin/users/{id}', fn($p) => Admin::deleteUser($p));
App::route('POST', '/v1/admin/users/{id}/reset-password', fn($p) => Admin::resetPassword($p));
App::route('DELETE', '/v1/admin/users/{id}/sessions', fn($p) => Admin::endSessions($p));
App::route('GET', '/v1/admin/invites', fn() => Admin::invites());
App::route('POST', '/v1/admin/invites', fn() => Admin::createInvite());
App::route('DELETE', '/v1/admin/invites/{id}', fn($p) => Admin::deleteInvite($p));
App::route('GET', '/v1/admin/audit', fn() => AdminAudit::list());
App::route('GET', '/v1/admin/stats', fn() => Admin::stats());
App::route('GET', '/v1/admin/projects', fn() => AdminProjects::list());
App::route('POST', '/v1/admin/projects/{id}/transfer', fn($p) => AdminProjects::transfer($p));
App::route('POST', '/v1/admin/trash/empty', fn() => AdminProjects::emptyTrash());
App::route('GET', '/v1/admin/links', fn() => AdminProjects::links());
App::route('PATCH', '/v1/admin/links/{id}', fn($p) => AdminProjects::updateLink($p));
App::route('DELETE', '/v1/admin/links/{id}', fn($p) => AdminProjects::revoke($p));
App::route('POST', '/v1/admin/links/purge-expired', fn() => AdminProjects::purgeExpired());
App::route('PATCH', '/v1/admin/forms/{id}', fn($p) => AdminProjects::closeForm($p));
App::route('GET', '/v1/admin/storage', fn() => AdminProjects::storage());
App::route('GET', '/v1/admin/templates', fn() => SiteLibrary::adminTemplates());
App::route('POST', '/v1/admin/templates', fn() => SiteLibrary::publish());
App::route('POST', '/v1/admin/templates/order', fn() => SiteLibrary::reorder());
App::route('PATCH', '/v1/admin/templates/{id}', fn($p) => SiteLibrary::updateTemplate($p));
App::route('DELETE', '/v1/admin/templates/{id}', fn($p) => SiteLibrary::deleteTemplate($p));
App::route('POST', '/v1/admin/fonts', fn() => SiteLibrary::addFont());
App::route('DELETE', '/v1/admin/fonts/{id}', fn($p) => SiteLibrary::deleteFont($p));
App::route('GET', '/v1/admin/server', fn() => ServerStatus::get());
App::route('POST', '/v1/admin/maintenance/cleanup', fn() => ServerStatus::runCleanup());

$route = $_GET['r'] ?? ($_SERVER['PATH_INFO'] ?? '');
App::handle($_SERVER['REQUEST_METHOD'] ?? 'GET', is_string($route) ? $route : '');
