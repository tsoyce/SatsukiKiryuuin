<?php
/* XSatsu Студия · администрирование: пользователи, приглашения, журнал действий, статистика. */
declare(strict_types=1);

namespace XSatsu;

final class Admin
{
    public static function users(): array
    {
        Auth::admin();
        $rows = App::all('SELECT u.id, u.login, u.name, u.email, u.role, u.status, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id AND p.deleted_at IS NULL) projects FROM users u ORDER BY u.id');
        return ['users' => array_map(fn($r) => ['id' => (int)$r['id'], 'login' => $r['login'], 'name' => $r['name'], 'email' => $r['email'], 'role' => $r['role'], 'status' => $r['status'],
            'createdAt' => App::iso($r['created_at']), 'lastLoginAt' => App::iso($r['last_login_at']), 'projects' => (int)$r['projects']], $rows)];
    }
    public static function createUser(): array
    {
        Auth::admin();
        $b = App::body();
        $u = Auth::createUser(App::str($b, 'login', 100, true), App::str($b, 'name'), (string)($b['password'] ?? ''), ($b['role'] ?? '') === 'admin' ? 'admin' : 'user', App::str($b, 'email') ?: null);
        App::audit('user.create', 'user', (string)$u['id'], ['login' => $u['login']]);
        return self::users();
    }
    public static function updateUser(array $p): array
    {
        $me = Auth::admin();
        $id = (int)$p['id'];
        $target = App::one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$target) throw new HttpError(404, 'Пользователь не найден.');
        $b = App::body();
        if (isset($b['role'])) {
            $role = $b['role'] === 'admin' ? 'admin' : 'user';
            if ($id === (int)$me['id'] && $role !== 'admin') throw new HttpError(422, 'Нельзя снять права администратора с себя.');
            App::q('UPDATE users SET role = ? WHERE id = ?', [$role, $id]);
        }
        if (isset($b['status'])) {
            $status = $b['status'] === 'blocked' ? 'blocked' : 'active';
            if ($id === (int)$me['id'] && $status === 'blocked') throw new HttpError(422, 'Нельзя заблокировать себя.');
            App::q('UPDATE users SET status = ? WHERE id = ?', [$status, $id]);
            if ($status === 'blocked') App::q('DELETE FROM sessions WHERE user_id = ?', [$id]);
        }
        if (isset($b['name'])) App::q('UPDATE users SET name = ? WHERE id = ?', [App::str($b, 'name'), $id]);
        if (!empty($b['password'])) {
            $pw = (string)$b['password'];
            if (mb_strlen($pw) < 8) throw new HttpError(422, 'Пароль — не короче 8 символов.');
            App::q('UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($pw), $id]);
            App::q('DELETE FROM sessions WHERE user_id = ?', [$id]);
        }
        App::audit('user.update', 'user', (string)$id, array_keys(array_diff_key($b, ['password' => 1])) + (isset($b['password']) ? ['password'] : []));
        return self::users();
    }

    public static function invites(): array
    {
        Auth::admin();
        $rows = App::all('SELECT i.*, u.login used_login, c.login created_login FROM invites i LEFT JOIN users u ON u.id = i.used_by LEFT JOIN users c ON c.id = i.created_by ORDER BY i.created_at DESC LIMIT 200');
        return ['invites' => array_map(fn($r) => ['id' => substr($r['code_hash'], 0, 16), 'role' => $r['role'], 'note' => $r['note'], 'createdAt' => App::iso($r['created_at']), 'expiresAt' => App::iso($r['expires_at']),
            'usedBy' => $r['used_login'], 'usedAt' => App::iso($r['used_at']), 'createdBy' => $r['created_login']], $rows)];
    }
    public static function createInvite(): array
    {
        Auth::admin();
        $b = App::body();
        $code = strtoupper(substr(strtr(App::token(9), '-_', 'XY'), 0, 12));
        $days = max(1, min(90, (int)($b['days'] ?? 14)));
        App::q('INSERT INTO invites (code_hash, role, note, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?)',
            [hash('sha256', $code), ($b['role'] ?? '') === 'admin' ? 'admin' : 'user', App::str($b, 'note'), App::$user['id'], App::now(), App::now($days * 86400)]);
        App::audit('invite.create', 'invite', substr(hash('sha256', $code), 0, 16));
        return self::invites() + ['code' => $code];
    }
    public static function deleteInvite(array $p): array
    {
        Auth::admin();
        App::q('DELETE FROM invites WHERE code_hash LIKE ? AND used_at IS NULL', [preg_replace('/[^0-9a-f]/', '', $p['id']) . '%']);
        return self::invites();
    }

    public static function audit(): array
    {
        Auth::admin();
        $limit = max(10, min(500, (int)($_GET['limit'] ?? 200)));
        $rows = App::all("SELECT a.*, u.login FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT $limit");
        return ['events' => array_map(fn($r) => ['at' => App::iso($r['at']), 'actor' => $r['login'], 'action' => $r['action'], 'target' => $r['target_type'] . ($r['target_id'] !== '' ? ':' . $r['target_id'] : ''), 'detail' => $r['detail'] ? json_decode($r['detail'], true) : null, 'ip' => $r['ip']], $rows)];
    }

    public static function stats(): array
    {
        Auth::admin();
        $n = fn($sql) => (int)(App::one($sql)['n'] ?? 0);
        return [
            'users' => $n('SELECT COUNT(*) n FROM users'), 'projects' => $n('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL'),
            'trash' => $n('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NOT NULL'), 'revisions' => $n('SELECT COUNT(*) n FROM project_revisions'),
            'assets' => $n('SELECT COUNT(*) n FROM assets'), 'assetBytes' => $n('SELECT COALESCE(SUM(bytes),0) n FROM assets'),
            'docBytes' => $n('SELECT COALESCE(SUM(size_bytes),0) n FROM projects'), 'version' => App::VERSION, 'php' => PHP_VERSION,
            'db' => App::one('SELECT VERSION() v')['v'], 'schema' => App::one('SELECT MAX(version) v FROM schema_migrations')['v'] ?? null,
        ];
    }
}
