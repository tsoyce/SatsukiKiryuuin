<?php
/* XSatsu Студия · вход, сессии (cookie HttpOnly + CSRF-токен), регистрация по приглашению, первый администратор. */
declare(strict_types=1);

namespace XSatsu;

final class Auth
{
    public const COOKIE = 'xs_session';

    public static function hash(string $password): string
    {
        return password_hash($password, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
    }

    /* Текущий пользователь по cookie (или null). */
    public static function current(): ?array
    {
        if (App::$user) return App::$user;
        $token = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($token) || strlen($token) < 20 || strlen($token) > 100) return null;
        $row = App::one('SELECT s.id sid, s.csrf, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [hash('sha256', $token)]);
        if (!$row || $row['expires_at'] < App::now() || $row['status'] !== 'active') return null;
        App::$session = ['id' => $row['sid'], 'csrf' => $row['csrf']];
        unset($row['sid'], $row['csrf'], $row['expires_at']);
        return App::$user = $row;
    }
    public static function user(): array
    {
        $u = self::current();
        if (!$u) throw new HttpError(401, 'Войдите в аккаунт.');
        return $u;
    }
    public static function admin(): array
    {
        $u = self::user();
        if ($u['role'] !== 'admin') throw new HttpError(403, 'Нужны права администратора.');
        return $u;
    }
    public static function publicUser(?array $u): ?array
    {
        return $u ? ['id' => (int)$u['id'], 'login' => $u['login'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'mustChangePassword' => !empty($u['must_change_password'])] : null;
    }

    /* Временный пароль (выдал администратор): пока его не сменили, менять можно только сам пароль. */
    public static function guardTempPassword(string $path): void
    {
        $u = self::current();
        if ($u && !empty($u['must_change_password']) && !str_starts_with($path, '/v1/auth/')) throw new HttpError(403, 'Сначала задайте свой пароль вместо временного.', ['mustChangePassword' => true]);
    }

    /* Запросы, меняющие данные: Origin своего сайта и CSRF-токен сессии. */
    public static function checkWriteRequest(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = rtrim((string)App::$config['public_origin'], '/');
        if ($origin !== '' && $allowed !== '' && rtrim($origin, '/') !== $allowed) {
            $host = $_SERVER['HTTP_HOST'] ?? '';
            if (parse_url($origin, PHP_URL_HOST) !== explode(':', $host)[0]) throw new HttpError(403, 'Запрос с чужого сайта отклонён.');
        }
        if (self::current()) {
            $sent = $_SERVER['HTTP_X_XS_CSRF'] ?? '';
            if (!is_string($sent) || !hash_equals(App::$session['csrf'], $sent)) throw new HttpError(403, 'Сессия устарела: обновите страницу.');
        }
    }

    private static function startSession(array $user): void
    {
        $token = App::token(32);
        $csrf = App::token(32);
        $days = max(1, (int)App::$config['session_days']);
        App::q('INSERT INTO sessions (id, user_id, csrf, created_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?)',
            [hash('sha256', $token), $user['id'], $csrf, App::now(), App::now($days * 86400), App::ip(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
        App::q('UPDATE users SET last_login_at = ? WHERE id = ?', [App::now(), $user['id']]);
        if (PHP_SAPI !== 'cli') setcookie(self::COOKIE, $token, ['expires' => time() + $days * 86400, 'path' => '/', 'secure' => (bool)App::$config['cookie_secure'], 'httponly' => true, 'samesite' => 'Lax']);
        $_COOKIE[self::COOKIE] = $token;
        App::$user = null;
        self::current();
    }

    private static function validLogin(string $login): string
    {
        $login = mb_strtolower(trim($login));
        if (!preg_match('/^[\p{L}\p{N}._@\-]{3,100}$/u', $login)) throw new HttpError(422, 'Логин: 3–100 символов — буквы, цифры, точка, дефис, @.');
        return $login;
    }
    private static function validPassword(string $password): string
    {
        if (mb_strlen($password) < 8) throw new HttpError(422, 'Пароль — не короче 8 символов.');
        if (strlen($password) > 200) throw new HttpError(422, 'Слишком длинный пароль.');
        return $password;
    }

    public static function createUser(string $login, string $name, string $password, string $role = 'user', ?string $email = null): array
    {
        $login = self::validLogin($login);
        self::validPassword($password);
        if (App::one('SELECT id FROM users WHERE login = ?', [$login])) throw new HttpError(409, 'Логин «' . $login . '» уже занят.');
        App::q('INSERT INTO users (login, name, email, password_hash, role, status, created_at) VALUES (?,?,?,?,?,?,?)',
            [$login, $name !== '' ? $name : $login, $email ?: null, self::hash($password), $role === 'admin' ? 'admin' : 'user', 'active', App::now()]);
        return App::one('SELECT * FROM users WHERE id = ?', [(int)App::db()->lastInsertId()]);
    }

    /* ---------- обработчики API ---------- */
    public static function state(): array
    {
        $users = (int)(App::one('SELECT COUNT(*) n FROM users')['n'] ?? 0);
        $u = self::current();
        return [
            'user' => self::publicUser($u),
            'csrf' => $u ? App::$session['csrf'] : null,
            'setupNeeded' => $users === 0,
            'setupAllowed' => $users === 0 && App::$config['setup_token'] !== '',
            'registration' => Settings::system('registration'),
            'version' => App::VERSION,
        ];
    }

    public static function setup(): array
    {
        $b = App::body();
        $token = (string)App::$config['setup_token'];
        if ($token === '' || !hash_equals($token, App::str($b, 'token', 200))) throw new HttpError(403, 'Неверный код установки.');
        App::db()->beginTransaction();
        try {
            if ((int)App::one('SELECT COUNT(*) n FROM users FOR UPDATE')['n'] > 0) throw new HttpError(409, 'Администратор уже создан.');
            $u = self::createUser(App::str($b, 'login', 100, true), App::str($b, 'name'), (string)($b['password'] ?? ''), 'admin', App::str($b, 'email') ?: null);
            App::db()->commit();
        } catch (\Throwable $e) { App::db()->rollBack(); throw $e; }
        self::startSession($u);
        App::audit('setup', 'user', (string)$u['id']);
        return self::state();
    }

    public static function login(): array
    {
        $b = App::body();
        $login = mb_strtolower(App::str($b, 'login', 100, true));
        $password = (string)($b['password'] ?? '');
        $since = App::now(-900);
        $byIp = (int)App::one('SELECT COUNT(*) n FROM login_attempts WHERE ip = ? AND at > ? AND ok = 0', [App::ip(), $since])['n'];
        $byLogin = (int)App::one('SELECT COUNT(*) n FROM login_attempts WHERE login = ? AND at > ? AND ok = 0', [$login, $since])['n'];
        if ($byIp >= 20 || $byLogin >= 8) throw new HttpError(429, 'Слишком много попыток входа. Подождите 15 минут.');
        $u = App::one('SELECT * FROM users WHERE login = ?', [$login]);
        $ok = $u && password_verify($password, $u['password_hash']);
        App::q('INSERT INTO login_attempts (ip, login, at, ok) VALUES (?,?,?,?)', [App::ip(), $login, App::now(), $ok ? 1 : 0]);
        if (!$ok) throw new HttpError(401, 'Неверный логин или пароль.');
        if ($u['status'] !== 'active') throw new HttpError(403, 'Учётная запись заблокирована' . (!empty($u['blocked_reason']) ? ': ' . $u['blocked_reason'] : '') . '. Обратитесь к администратору сайта.');
        if (password_needs_rehash($u['password_hash'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) App::q('UPDATE users SET password_hash = ? WHERE id = ?', [self::hash($password), $u['id']]);
        self::startSession($u);
        App::audit('login', 'user', (string)$u['id']);
        return self::state();
    }

    public static function logout(): array
    {
        if (self::current()) App::q('DELETE FROM sessions WHERE id = ?', [App::$session['id']]);
        if (PHP_SAPI !== 'cli') setcookie(self::COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => (bool)App::$config['cookie_secure'], 'httponly' => true, 'samesite' => 'Lax']);
        App::$user = null; App::$session = null; unset($_COOKIE[self::COOKIE]);
        return ['ok' => true];
    }

    public static function register(): array
    {
        $mode = Settings::system('registration');
        $b = App::body();
        if ($mode === 'closed') throw new HttpError(403, 'Регистрация закрыта. Попросите администратора создать учётную запись.');
        $invite = null;
        if ($mode === 'invite') {
            $code = App::str($b, 'invite', 100, true);
            $invite = App::one('SELECT * FROM invites WHERE code_hash = ? AND uses < max_uses AND (expires_at IS NULL OR expires_at > ?)', [hash('sha256', strtoupper(trim($code))), App::now()]);
            if (!$invite) throw new HttpError(403, 'Приглашение не найдено, истекло или уже использовано.');
        }
        $u = self::createUser(App::str($b, 'login', 100, true), App::str($b, 'name'), (string)($b['password'] ?? ''), $invite['role'] ?? 'user', App::str($b, 'email') ?: null);
        if ($invite) App::q('UPDATE invites SET used_by = ?, used_at = ?, uses = uses + 1 WHERE code_hash = ?', [$u['id'], App::now(), $invite['code_hash']]);
        self::startSession($u);
        App::audit('register', 'user', (string)$u['id'], ['login' => $u['login']] + ($invite ? ['invite' => substr($invite['code_hash'], 0, 16)] : []));
        return self::state();
    }

    public static function updateMe(): array
    {
        $u = self::user();
        $b = App::body();
        $name = array_key_exists('name', $b) ? App::str($b, 'name') : $u['name'];
        $email = array_key_exists('email', $b) ? (App::str($b, 'email') ?: null) : $u['email'];
        if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Неверный адрес почты.');
        App::q('UPDATE users SET name = ?, email = ? WHERE id = ?', [$name, $email, $u['id']]);
        if (isset($b['newPassword']) && $b['newPassword'] !== '') {
            if (!password_verify((string)($b['password'] ?? ''), $u['password_hash'])) throw new HttpError(403, 'Текущий пароль неверный.');
            if (password_verify((string)$b['newPassword'], $u['password_hash'])) throw new HttpError(422, 'Новый пароль совпадает с текущим.');
            App::q('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [self::hash(self::validPassword((string)$b['newPassword'])), $u['id']]);
            App::q('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$u['id'], App::$session['id']]);
            App::audit('password', 'user', (string)$u['id']);
        }
        App::$user = null;
        return self::state();
    }
}
