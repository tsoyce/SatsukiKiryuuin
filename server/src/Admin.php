<?php
/* XSatsu Студия · админка: обзор, пользователи (роль, блокировка, временный пароль, сеансы, квота, удаление с передачей проектов),
 * приглашения (одно- и многоразовые). Журнал — AdminAudit.php, сервер — ServerStatus.php. Все методы — только для администратора. */
declare(strict_types=1);

namespace XSatsu;

final class Admin
{
    /* ---------- обзор ---------- */
    public static function overview(): array
    {
        Auth::admin();
        $n = fn(string $sql, array $a = []) => (int)(App::one($sql, $a)['n'] ?? 0);
        $day = App::now(-86400); $week = App::now(-7 * 86400);
        $events = App::all('SELECT a.*, u.login FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 12');
        return [
            'counts' => [
                'users' => $n('SELECT COUNT(*) n FROM users'), 'admins' => $n("SELECT COUNT(*) n FROM users WHERE role = 'admin'"),
                'blocked' => $n("SELECT COUNT(*) n FROM users WHERE status = 'blocked'"), 'newUsers' => $n('SELECT COUNT(*) n FROM users WHERE created_at > ?', [$week]),
                'activeUsers' => $n('SELECT COUNT(*) n FROM users WHERE last_login_at > ?', [$week]), 'sessions' => $n('SELECT COUNT(*) n FROM sessions WHERE expires_at > ?', [App::now()]),
                'projects' => $n('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL'), 'trash' => $n('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NOT NULL'),
                'changedToday' => $n('SELECT COUNT(*) n FROM projects WHERE updated_at > ? AND deleted_at IS NULL', [$day]),
                'links' => $n('SELECT COUNT(*) n FROM project_shares WHERE token_hash IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)', [App::now()]),
                'forms' => $n('SELECT COUNT(*) n FROM project_forms WHERE is_open = 1'), 'responses' => $n('SELECT COUNT(*) n FROM form_responses WHERE created_at > ?', [$week]),
                'invites' => $n('SELECT COUNT(*) n FROM invites WHERE uses < max_uses AND (expires_at IS NULL OR expires_at > ?)', [App::now()]),
                'failedLogins' => $n('SELECT COUNT(*) n FROM login_attempts WHERE ok = 0 AND at > ?', [$day]),
                'assets' => $n('SELECT COUNT(*) n FROM assets'), 'assetBytes' => $n('SELECT COALESCE(SUM(bytes),0) n FROM assets'),
                'docBytes' => $n('SELECT COALESCE(SUM(size_bytes),0) n FROM projects'),
            ],
            'activity' => self::activity(),
            'events' => array_map([AdminAudit::class, 'row'], $events),
            'warnings' => ServerStatus::warnings(),
            'version' => App::VERSION,
        ];
    }
    /* Сохранения проектов и входы по дням за 14 дней (для графика на обзоре). */
    private static function activity(): array
    {
        $from = gmdate('Y-m-d', time() - 13 * 86400);
        $days = [];
        for ($i = 13; $i >= 0; $i--) $days[gmdate('Y-m-d', time() - $i * 86400)] = ['day' => gmdate('Y-m-d', time() - $i * 86400), 'edits' => 0, 'logins' => 0];
        foreach (App::all('SELECT DATE(created_at) d, COUNT(*) n FROM project_revisions WHERE created_at >= ? GROUP BY DATE(created_at)', [$from]) as $r) if (isset($days[$r['d']])) $days[$r['d']]['edits'] = (int)$r['n'];
        foreach (App::all("SELECT DATE(at) d, COUNT(*) n FROM audit_log WHERE action = 'login' AND at >= ? GROUP BY DATE(at)", [$from]) as $r) if (isset($days[$r['d']])) $days[$r['d']]['logins'] = (int)$r['n'];
        return array_values($days);
    }

    /* ---------- пользователи ---------- */
    private static function userRow(array $r, array $usage, int $sessions = 0): array
    {
        $limit = Quota::limit($r);
        return ['id' => (int)$r['id'], 'login' => $r['login'], 'name' => $r['name'], 'email' => $r['email'], 'role' => $r['role'], 'status' => $r['status'],
            'note' => $r['note'] ?? '', 'blockedReason' => $r['blocked_reason'] ?? null, 'blockedAt' => App::iso($r['blocked_at'] ?? null),
            'mustChangePassword' => !empty($r['must_change_password']), 'quotaMb' => isset($r['quota_mb']) ? (int)$r['quota_mb'] : null,
            'createdAt' => App::iso($r['created_at']), 'lastLoginAt' => App::iso($r['last_login_at']), 'projects' => (int)($r['projects'] ?? 0),
            'used' => $usage['total'] ?? 0, 'limit' => $limit, 'sessions' => $sessions];
    }
    public static function users(): array
    {
        Auth::admin();
        $rows = App::all('SELECT u.*, (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id AND p.deleted_at IS NULL) projects FROM users u ORDER BY u.id');
        $usage = Quota::usageAll();
        $sess = [];
        foreach (App::all('SELECT user_id, COUNT(*) n FROM sessions WHERE expires_at > ? GROUP BY user_id', [App::now()]) as $s) $sess[(int)$s['user_id']] = (int)$s['n'];
        return ['users' => array_map(fn($r) => self::userRow($r, $usage[(int)$r['id']] ?? [], $sess[(int)$r['id']] ?? 0), $rows), 'defaultQuotaMb' => (int)Settings::system('defaultQuotaMb')];
    }
    private static function target(array $p): array
    {
        $u = App::one('SELECT * FROM users WHERE id = ?', [(int)$p['id']]);
        if (!$u) throw new HttpError(404, 'Пользователь не найден.');
        return $u;
    }
    public static function user(array $p): array
    {
        Auth::admin();
        $u = self::target($p);
        $id = (int)$u['id'];
        $u['projects'] = (int)App::one('SELECT COUNT(*) n FROM projects WHERE owner_id = ? AND deleted_at IS NULL', [$id])['n'];
        $sessions = App::all('SELECT id, created_at, expires_at, ip, user_agent FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC', [$id, App::now()]);
        $projects = App::all('SELECT p.id, p.title, p.kind, p.rows_count, p.size_bytes, p.updated_at, p.deleted_at, (SELECT COUNT(*) FROM project_shares s WHERE s.project_id = p.id) shares
            FROM projects p WHERE p.owner_id = ? ORDER BY p.deleted_at IS NOT NULL, p.updated_at DESC LIMIT 100', [$id]);
        $shared = App::all('SELECT p.id, p.title, s.permission, o.login owner FROM project_shares s JOIN projects p ON p.id = s.project_id JOIN users o ON o.id = p.owner_id WHERE s.user_id = ? AND p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 50', [$id]);
        $events = App::all("SELECT a.*, x.login FROM audit_log a LEFT JOIN users x ON x.id = a.actor_id WHERE a.actor_id = ? OR (a.target_type = 'user' AND a.target_id = ?) ORDER BY a.id DESC LIMIT 40", [$id, (string)$id]);
        $mySession = App::$session['id'] ?? '';
        return [
            'user' => self::userRow($u, Quota::usage($id), count($sessions)) + ['usage' => Quota::usage($id)],
            'sessions' => array_map(fn($s) => ['id' => substr($s['id'], 0, 12), 'createdAt' => App::iso($s['created_at']), 'expiresAt' => App::iso($s['expires_at']), 'ip' => $s['ip'], 'agent' => $s['user_agent'], 'current' => $s['id'] === $mySession], $sessions),
            'projects' => array_map(fn($r) => ['id' => $r['id'], 'title' => $r['title'], 'kind' => $r['kind'], 'rows' => (int)$r['rows_count'], 'size' => (int)$r['size_bytes'], 'updatedAt' => App::iso($r['updated_at']), 'deletedAt' => App::iso($r['deleted_at']), 'shares' => (int)$r['shares']], $projects),
            'shared' => array_map(fn($r) => ['id' => $r['id'], 'title' => $r['title'], 'permission' => $r['permission'], 'owner' => $r['owner']], $shared),
            'events' => array_map([AdminAudit::class, 'row'], $events),
        ];
    }
    public static function tempPassword(): string
    {
        $a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $s = '';
        for ($i = 0; $i < 12; $i++) $s .= $a[random_int(0, strlen($a) - 1)];
        return $s;
    }
    private static function quotaValue(mixed $v): ?int
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v) || (int)$v < 0 || (int)$v > 1000000) throw new HttpError(422, 'Квота — число мегабайт от 0 до 1 000 000 (0 — без ограничения).');
        return (int)$v;
    }
    public static function createUser(): array
    {
        Auth::admin();
        $b = App::body();
        $email = App::str($b, 'email') ?: null;
        if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Неверный адрес почты.');
        $generated = trim((string)($b['password'] ?? '')) === '';
        $password = $generated ? self::tempPassword() : (string)$b['password'];
        $u = Auth::createUser(App::str($b, 'login', 100, true), App::str($b, 'name'), $password, ($b['role'] ?? '') === 'admin' ? 'admin' : 'user', $email);
        $mustChange = $generated || !empty($b['mustChange']);
        App::q('UPDATE users SET note = ?, quota_mb = ?, must_change_password = ? WHERE id = ?', [App::str($b, 'note', 500), self::quotaValue($b['quotaMb'] ?? null), $mustChange ? 1 : 0, $u['id']]);
        App::audit('user.create', 'user', (string)$u['id'], ['login' => $u['login'], 'role' => $u['role']]);
        return self::users() + ['created' => ['id' => (int)$u['id'], 'login' => $u['login'], 'password' => $password, 'mustChange' => $mustChange]];
    }
    private static function activeAdmins(): int
    {
        return (int)App::one("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND status = 'active'")['n'];
    }
    public static function updateUser(array $p): array
    {
        $me = Auth::admin();
        $target = self::target($p);
        $id = (int)$target['id'];
        $self = $id === (int)$me['id'];
        $b = App::body();
        $changed = [];
        if (isset($b['role'])) {
            $role = $b['role'] === 'admin' ? 'admin' : 'user';
            if ($self && $role !== 'admin') throw new HttpError(422, 'Нельзя снять права администратора с себя.');
            if ($role !== $target['role']) {
                if ($role === 'user' && $target['role'] === 'admin' && $target['status'] === 'active' && self::activeAdmins() <= 1) throw new HttpError(422, 'Это последний администратор сайта.');
                App::q('UPDATE users SET role = ? WHERE id = ?', [$role, $id]);
                $changed['role'] = $role;
            }
        }
        if (isset($b['status'])) {
            $status = $b['status'] === 'blocked' ? 'blocked' : 'active';
            if ($self && $status === 'blocked') throw new HttpError(422, 'Нельзя заблокировать себя.');
            if ($status !== $target['status']) {
                if ($status === 'blocked' && $target['role'] === 'admin' && self::activeAdmins() <= 1) throw new HttpError(422, 'Это последний администратор сайта.');
                $reason = $status === 'blocked' ? (App::str($b, 'reason', 190) ?: null) : null;
                App::q('UPDATE users SET status = ?, blocked_reason = ?, blocked_at = ? WHERE id = ?', [$status, $reason, $status === 'blocked' ? App::now() : null, $id]);
                if ($status === 'blocked') App::q('DELETE FROM sessions WHERE user_id = ?', [$id]);
                $changed['status'] = $status;
                if ($reason) $changed['reason'] = $reason;
            }
        }
        if (array_key_exists('name', $b)) { App::q('UPDATE users SET name = ? WHERE id = ?', [App::str($b, 'name'), $id]); $changed['name'] = true; }
        if (array_key_exists('email', $b)) {
            $email = App::str($b, 'email') ?: null;
            if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Неверный адрес почты.');
            App::q('UPDATE users SET email = ? WHERE id = ?', [$email, $id]); $changed['email'] = true;
        }
        if (array_key_exists('note', $b)) { App::q('UPDATE users SET note = ? WHERE id = ?', [App::str($b, 'note', 500), $id]); $changed['note'] = true; }
        if (array_key_exists('quotaMb', $b)) { $q = self::quotaValue($b['quotaMb']); App::q('UPDATE users SET quota_mb = ? WHERE id = ?', [$q, $id]); $changed['quotaMb'] = $q; }
        if (!empty($b['password'])) {
            $pw = (string)$b['password'];
            if (mb_strlen($pw) < 8) throw new HttpError(422, 'Пароль — не короче 8 символов.');
            App::q('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?', [Auth::hash($pw), !empty($b['mustChange']) && !$self ? 1 : 0, $id]);
            if (!$self) App::q('DELETE FROM sessions WHERE user_id = ?', [$id]);
            $changed['password'] = true;
        }
        if ($changed) App::audit('user.update', 'user', (string)$id, ['login' => $target['login']] + $changed);
        return self::users();
    }
    /* Временный пароль: старый перестаёт работать, все сеансы завершаются, при входе человек задаёт свой. */
    public static function resetPassword(array $p): array
    {
        $me = Auth::admin();
        $target = self::target($p);
        if ((int)$target['id'] === (int)$me['id']) throw new HttpError(422, 'Свой пароль меняйте в «Аккаунт и настройки».');
        $pw = self::tempPassword();
        App::q('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [Auth::hash($pw), $target['id']]);
        App::q('DELETE FROM sessions WHERE user_id = ?', [$target['id']]);
        App::q('DELETE FROM login_attempts WHERE login = ?', [$target['login']]);
        App::audit('user.reset', 'user', (string)$target['id'], ['login' => $target['login']]);
        return ['password' => $pw, 'login' => $target['login']];
    }
    /* Завершить сеансы: все или один (session — первые 12 знаков id). Свой текущий сеанс не трогаем. */
    public static function endSessions(array $p): array
    {
        Auth::admin();
        $target = self::target($p);
        $one = preg_replace('/[^0-9a-f]/', '', (string)($_GET['session'] ?? ''));
        $mine = App::$session['id'] ?? '';
        $n = $one !== ''
            ? App::q('DELETE FROM sessions WHERE user_id = ? AND id LIKE ? AND id <> ?', [$target['id'], $one . '%', $mine])->rowCount()
            : App::q('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$target['id'], $mine])->rowCount();
        App::audit('user.sessions', 'user', (string)$target['id'], ['login' => $target['login'], 'ended' => $n]);
        return self::user($p) + ['ended' => $n];
    }
    /* Удалить пользователя. Его проекты: projects=transfer&to=<id> — передать другому, projects=delete — удалить вместе с ним. */
    public static function deleteUser(array $p): array
    {
        $me = Auth::admin();
        $target = self::target($p);
        $id = (int)$target['id'];
        if ($id === (int)$me['id']) throw new HttpError(422, 'Нельзя удалить себя.');
        if ($target['role'] === 'admin' && $target['status'] === 'active' && self::activeAdmins() <= 1) throw new HttpError(422, 'Это последний администратор сайта.');
        $mode = $_GET['projects'] ?? '';
        $count = (int)App::one('SELECT COUNT(*) n FROM projects WHERE owner_id = ?', [$id])['n'];
        $to = null;
        if ($count > 0) {
            if ($mode === 'transfer') {
                $to = App::one("SELECT id, login FROM users WHERE id = ? AND id <> ?", [(int)($_GET['to'] ?? 0), $id]);
                if (!$to) throw new HttpError(422, 'Выберите, кому передать проекты.');
            } elseif ($mode !== 'delete') throw new HttpError(409, 'У пользователя есть проекты: передайте их другому или удалите.', ['projects' => $count]);
        }
        App::db()->beginTransaction();
        try {
            if ($to) {
                // Доступ нового владельца к этим проектам больше не нужен — он владелец.
                App::q('DELETE s FROM project_shares s JOIN projects p ON p.id = s.project_id WHERE p.owner_id = ? AND s.user_id = ?', [$id, $to['id']]);
                App::q('UPDATE projects SET owner_id = ? WHERE owner_id = ?', [$to['id'], $id]);
            } elseif ($count > 0) App::q('DELETE FROM projects WHERE owner_id = ?', [$id]);
            App::q('DELETE FROM settings WHERE scope = ? AND scope_id = ?', ['user', $id]);
            App::q('DELETE FROM users WHERE id = ?', [$id]);
            App::db()->commit();
        } catch (\Throwable $e) { App::db()->rollBack(); throw $e; }
        App::audit('user.delete', 'user', (string)$id, ['login' => $target['login'], 'projects' => $count] + ($to ? ['to' => $to['login']] : []));
        return self::users();
    }

    /* ---------- приглашения ---------- */
    public static function invites(): array
    {
        Auth::admin();
        $rows = App::all('SELECT i.*, u.login used_login, c.login created_login FROM invites i LEFT JOIN users u ON u.id = i.used_by LEFT JOIN users c ON c.id = i.created_by ORDER BY i.created_at DESC LIMIT 300');
        $now = App::now();
        return ['invites' => array_map(fn($r) => ['id' => substr($r['code_hash'], 0, 16), 'role' => $r['role'], 'note' => $r['note'], 'createdAt' => App::iso($r['created_at']), 'expiresAt' => App::iso($r['expires_at']),
            'usedBy' => $r['used_login'], 'usedAt' => App::iso($r['used_at']), 'createdBy' => $r['created_login'], 'uses' => (int)$r['uses'], 'maxUses' => (int)$r['max_uses'],
            'state' => (int)$r['uses'] >= (int)$r['max_uses'] ? 'used' : ($r['expires_at'] !== null && $r['expires_at'] <= $now ? 'expired' : 'active')], $rows),
            'registration' => Settings::system('registration')];
    }
    public static function createInvite(): array
    {
        Auth::admin();
        $b = App::body();
        $code = strtoupper(substr(strtr(App::token(9), '-_', 'XY'), 0, 12));
        $days = max(1, min(365, (int)($b['days'] ?? 14)));
        $uses = max(1, min(500, (int)($b['maxUses'] ?? 1)));
        App::q('INSERT INTO invites (code_hash, role, note, created_by, created_at, expires_at, max_uses) VALUES (?,?,?,?,?,?,?)',
            [hash('sha256', $code), ($b['role'] ?? '') === 'admin' ? 'admin' : 'user', App::str($b, 'note'), App::$user['id'], App::now(), App::now($days * 86400), $uses]);
        App::audit('invite.create', 'invite', substr(hash('sha256', $code), 0, 16), ['note' => App::str($b, 'note'), 'uses' => $uses, 'days' => $days]);
        return self::invites() + ['code' => $code, 'days' => $days, 'maxUses' => $uses];
    }
    /* Отозвать: неиспользованное удаляется, у многоразового — гасится остаток (кто уже зарегистрировался, остаётся). */
    public static function deleteInvite(array $p): array
    {
        Auth::admin();
        $id = preg_replace('/[^0-9a-f]/', '', $p['id']);
        if (strlen($id) < 8) throw new HttpError(404, 'Приглашение не найдено.');
        App::q('DELETE FROM invites WHERE code_hash LIKE ? AND uses = 0', [$id . '%']);
        App::q('UPDATE invites SET max_uses = uses WHERE code_hash LIKE ?', [$id . '%']);
        App::audit('invite.revoke', 'invite', $id);
        return self::invites();
    }

    /* ---------- совместимость: старая вкладка «Сайт» ---------- */
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
