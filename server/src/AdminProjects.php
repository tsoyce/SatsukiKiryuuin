<?php
/* XSatsu Студия · админка: все проекты (поиск, владелец, корзина, передача другому), все ссылки и доступы
 * (гостевые ссылки, доступ коллегам, анкеты — отзыв, продление, закрытие), хранилище (кто сколько занимает, крупные проекты и файлы). */
declare(strict_types=1);

namespace XSatsu;

final class AdminProjects
{
    /* ---------- проекты ---------- */
    public static function list(): array
    {
        Auth::admin();
        $w = []; $a = [];
        $scope = $_GET['scope'] ?? 'active';
        if ($scope === 'trash') $w[] = 'p.deleted_at IS NOT NULL'; elseif ($scope !== 'all') $w[] = 'p.deleted_at IS NULL';
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') { $like = '%' . addcslashes(mb_substr($q, 0, 100), '%_\\') . '%'; $w[] = '(p.title LIKE ? OR p.id LIKE ? OR o.login LIKE ? OR o.name LIKE ?)'; array_push($a, $like, $like, $like, $like); }
        $owner = (int)($_GET['owner'] ?? 0);
        if ($owner > 0) { $w[] = 'p.owner_id = ?'; $a[] = $owner; }
        if (($_GET['shared'] ?? '') === '1') $w[] = 'EXISTS (SELECT 1 FROM project_shares s WHERE s.project_id = p.id)';
        $order = match ($_GET['sort'] ?? 'updated') { 'size' => 'p.size_bytes DESC', 'title' => 'p.title', 'created' => 'p.created_at DESC', 'rows' => 'p.rows_count DESC', default => 'p.updated_at DESC' };
        $limit = max(10, min(500, (int)($_GET['limit'] ?? 100)));
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $where = $w ? 'WHERE ' . implode(' AND ', $w) : '';
        $total = (int)App::one("SELECT COUNT(*) n FROM projects p JOIN users o ON o.id = p.owner_id $where", $a)['n'];
        $now = App::now();
        $rows = App::all("SELECT p.id, p.title, p.kind, p.revision, p.rows_count, p.sides_count, p.page_w, p.page_h, p.size_bytes, p.created_at, p.updated_at, p.deleted_at, p.updated_by_label,
              o.id owner_id, o.login owner_login, o.name owner_name, o.status owner_status, ub.login updated_login,
              (SELECT COUNT(*) FROM project_shares s WHERE s.project_id = p.id AND s.user_id IS NOT NULL) people,
              (SELECT COUNT(*) FROM project_shares s WHERE s.project_id = p.id AND s.token_hash IS NOT NULL AND (s.expires_at IS NULL OR s.expires_at > ?)) links,
              (SELECT COUNT(*) FROM project_forms f WHERE f.project_id = p.id) forms,
              (SELECT COALESCE(SUM(a.bytes),0) FROM project_assets pa JOIN assets a ON a.sha256 = pa.sha256 WHERE pa.project_id = p.id) files
            FROM projects p JOIN users o ON o.id = p.owner_id LEFT JOIN users ub ON ub.id = p.updated_by $where ORDER BY $order LIMIT $limit OFFSET $offset", array_merge([$now], $a));
        return ['total' => $total, 'trashDays' => (int)Settings::system('trashDays'), 'projects' => array_map(fn($r) => [
            'id' => $r['id'], 'title' => $r['title'], 'kind' => $r['kind'], 'revision' => (int)$r['revision'], 'rows' => (int)$r['rows_count'], 'sides' => (int)$r['sides_count'],
            'page' => ['width' => (float)$r['page_w'], 'height' => (float)$r['page_h']], 'size' => (int)$r['size_bytes'], 'files' => (int)$r['files'],
            'createdAt' => App::iso($r['created_at']), 'updatedAt' => App::iso($r['updated_at']), 'deletedAt' => App::iso($r['deleted_at']),
            'updatedBy' => $r['updated_by_label'] ?: $r['updated_login'], 'updatedByGuest' => (bool)$r['updated_by_label'],
            'owner' => ['id' => (int)$r['owner_id'], 'login' => $r['owner_login'], 'name' => $r['owner_name'], 'blocked' => $r['owner_status'] === 'blocked'],
            'people' => (int)$r['people'], 'links' => (int)$r['links'], 'forms' => (int)$r['forms'],
        ], $rows)];
    }
    /* Передать проект другому пользователю (вместе с версиями, ссылками и анкетами). */
    public static function transfer(array $p): array
    {
        Auth::admin();
        $proj = App::one('SELECT id, title, owner_id FROM projects WHERE id = ?', [$p['id']]);
        if (!$proj) throw new HttpError(404, 'Проект не найден.');
        $b = App::body();
        $to = App::one('SELECT id, login FROM users WHERE id = ?', [(int)($b['to'] ?? 0)]);
        if (!$to) throw new HttpError(422, 'Выберите нового владельца.');
        if ((int)$to['id'] === (int)$proj['owner_id']) throw new HttpError(422, 'Он и так владелец.');
        $from = App::one('SELECT login FROM users WHERE id = ?', [$proj['owner_id']]);
        App::db()->beginTransaction();
        try {
            App::q('DELETE FROM project_shares WHERE project_id = ? AND user_id = ?', [$proj['id'], $to['id']]);
            // Прежний владелец сохраняет доступ на правку, если попросили (по умолчанию — да: проект не пропадает у него внезапно).
            if (!array_key_exists('keepAccess', $b) || $b['keepAccess'])
                App::q('INSERT INTO project_shares (project_id, user_id, permission, created_by, created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE permission = VALUES(permission)',
                    [$proj['id'], $proj['owner_id'], 'edit', App::$user['id'], App::now()]);
            App::q('UPDATE projects SET owner_id = ? WHERE id = ?', [$to['id'], $proj['id']]);
            App::db()->commit();
        } catch (\Throwable $e) { App::db()->rollBack(); throw $e; }
        App::audit('project.transfer', 'project', $proj['id'], ['title' => $proj['title'], 'from' => $from['login'] ?? null, 'to' => $to['login']]);
        return ['ok' => true];
    }

    /* ---------- ссылки, доступы, анкеты ---------- */
    public static function links(): array
    {
        Auth::admin();
        $now = App::now();
        $kind = $_GET['kind'] ?? 'link';
        $state = $_GET['state'] ?? 'active';
        $q = trim((string)($_GET['q'] ?? ''));
        $like = $q !== '' ? '%' . addcslashes(mb_substr($q, 0, 100), '%_\\') . '%' : null;
        $out = [];
        if ($kind === 'form') {
            $w = ['p.deleted_at IS NULL']; $a = [];
            if ($state === 'active') { $w[] = 'f.is_open = 1 AND (f.closes_at IS NULL OR f.closes_at > ?)'; $a[] = $now; }
            elseif ($state === 'expired') { $w[] = '(f.is_open = 0 OR (f.closes_at IS NOT NULL AND f.closes_at <= ?))'; $a[] = $now; }
            if ($like) { $w[] = '(f.title LIKE ? OR p.title LIKE ? OR o.login LIKE ?)'; array_push($a, $like, $like, $like); }
            $rows = App::all('SELECT f.id, f.title, f.is_open, f.closes_at, f.max_responses, f.created_at, p.id pid, p.title ptitle, o.login owner,
                (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = f.id) responses, (SELECT MAX(created_at) FROM form_responses r WHERE r.form_id = f.id) last_at
                FROM project_forms f JOIN projects p ON p.id = f.project_id JOIN users o ON o.id = p.owner_id WHERE ' . implode(' AND ', $w) . ' ORDER BY f.created_at DESC LIMIT 500', $a);
            foreach ($rows as $r) $out[] = ['id' => (int)$r['id'], 'kind' => 'form', 'title' => $r['title'], 'project' => ['id' => $r['pid'], 'title' => $r['ptitle']], 'owner' => $r['owner'],
                'open' => (bool)$r['is_open'] && (!$r['closes_at'] || $r['closes_at'] > $now), 'closesAt' => App::iso($r['closes_at']), 'maxResponses' => $r['max_responses'] !== null ? (int)$r['max_responses'] : null,
                'responses' => (int)$r['responses'], 'lastUsedAt' => App::iso($r['last_at']), 'createdAt' => App::iso($r['created_at'])];
            return ['items' => $out, 'kind' => $kind];
        }
        $w = [$kind === 'user' ? 's.user_id IS NOT NULL' : 's.token_hash IS NOT NULL']; $a = [];
        if ($state === 'active') { $w[] = '(s.expires_at IS NULL OR s.expires_at > ?) AND p.deleted_at IS NULL'; $a[] = $now; }
        elseif ($state === 'expired') { $w[] = '(s.expires_at IS NOT NULL AND s.expires_at <= ?)'; $a[] = $now; }
        if ($like) { $w[] = '(p.title LIKE ? OR s.label LIKE ? OR o.login LIKE ? OR u.login LIKE ?)'; array_push($a, $like, $like, $like, $like); }
        $rows = App::all('SELECT s.*, p.title ptitle, p.deleted_at pdeleted, o.login owner, o.status owner_status, u.login ulogin, u.name uname, c.login creator
            FROM project_shares s JOIN projects p ON p.id = s.project_id JOIN users o ON o.id = p.owner_id LEFT JOIN users u ON u.id = s.user_id LEFT JOIN users c ON c.id = s.created_by
            WHERE ' . implode(' AND ', $w) . ' ORDER BY COALESCE(s.last_used_at, s.created_at) DESC LIMIT 500', $a);
        foreach ($rows as $r) $out[] = ['id' => (int)$r['id'], 'kind' => $kind === 'user' ? 'user' : 'link', 'permission' => $r['permission'], 'label' => $r['label'],
            'user' => $r['ulogin'] ? ['login' => $r['ulogin'], 'name' => $r['uname']] : null, 'project' => ['id' => $r['project_id'], 'title' => $r['ptitle'], 'trashed' => (bool)$r['pdeleted']],
            'owner' => $r['owner'], 'ownerBlocked' => $r['owner_status'] === 'blocked', 'createdBy' => $r['creator'], 'createdAt' => App::iso($r['created_at']), 'expiresAt' => App::iso($r['expires_at']),
            'expired' => $r['expires_at'] !== null && $r['expires_at'] <= $now, 'lastUsedAt' => App::iso($r['last_used_at']), 'opens' => (int)$r['opens'], 'edits' => (int)$r['edits']];
        return ['items' => $out, 'kind' => $kind];
    }
    private static function share(array $p): array
    {
        $s = App::one('SELECT s.*, p.title FROM project_shares s JOIN projects p ON p.id = s.project_id WHERE s.id = ?', [(int)$p['id']]);
        if (!$s) throw new HttpError(404, 'Доступ не найден.');
        return $s;
    }
    public static function revoke(array $p): array
    {
        Auth::admin();
        $s = self::share($p);
        App::q('DELETE FROM project_shares WHERE id = ?', [$s['id']]);
        App::audit('link.revoke', 'project', $s['project_id'], ['title' => $s['title'], 'permission' => $s['permission']] + ($s['label'] ? ['label' => $s['label']] : []));
        return ['ok' => true];
    }
    /* Продлить (days; 0 — бессрочно) или поменять права. */
    public static function updateLink(array $p): array
    {
        Auth::admin();
        $s = self::share($p);
        $b = App::body();
        $perm = array_key_exists('permission', $b) ? ($b['permission'] === 'edit' ? 'edit' : 'view') : $s['permission'];
        $exp = $s['expires_at'];
        if (array_key_exists('days', $b)) { $d = (int)$b['days']; $exp = $d > 0 ? App::now(min($d, Links::MAX_DAYS) * 86400) : null; }
        App::q('UPDATE project_shares SET permission = ?, expires_at = ? WHERE id = ?', [$perm, $exp, $s['id']]);
        App::audit('link.update', 'project', $s['project_id'], ['title' => $s['title'], 'permission' => $perm] + (array_key_exists('days', $b) ? ['days' => (int)$b['days']] : []));
        return ['ok' => true];
    }
    /* Отозвать сразу все истёкшие ссылки (cron делает это через 30 дней после срока). */
    public static function purgeExpired(): array
    {
        Auth::admin();
        $n = App::q('DELETE FROM project_shares WHERE expires_at IS NOT NULL AND expires_at <= ?', [App::now()])->rowCount();
        App::audit('link.revoke', 'system', '', ['expired' => $n]);
        return ['removed' => $n];
    }
    public static function closeForm(array $p): array
    {
        Auth::admin();
        $f = App::one('SELECT f.id, f.title, f.project_id FROM project_forms f WHERE f.id = ?', [(int)$p['id']]);
        if (!$f) throw new HttpError(404, 'Анкета не найдена.');
        $open = !empty(App::body()['open']);
        App::q('UPDATE project_forms SET is_open = ?' . ($open ? ', closes_at = NULL' : '') . ' WHERE id = ?', [$open ? 1 : 0, $f['id']]);
        App::audit('form.' . ($open ? 'open' : 'close'), 'project', $f['project_id'], ['title' => $f['title']]);
        return ['ok' => true];
    }

    /* ---------- хранилище ---------- */
    public static function storage(): array
    {
        Auth::admin();
        $usage = Quota::usageAll();
        $users = App::all('SELECT u.*, (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) projects, (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id AND p.deleted_at IS NOT NULL) trash FROM users u');
        $byUser = array_map(function ($u) use ($usage) {
            $x = $usage[(int)$u['id']] ?? ['docs' => 0, 'files' => 0, 'total' => 0];
            return ['id' => (int)$u['id'], 'login' => $u['login'], 'name' => $u['name'], 'projects' => (int)$u['projects'], 'trash' => (int)$u['trash'],
                'docs' => $x['docs'], 'files' => $x['files'], 'total' => $x['total'], 'limit' => Quota::limit($u), 'quotaMb' => $u['quota_mb'] !== null ? (int)$u['quota_mb'] : null];
        }, $users);
        usort($byUser, fn($a, $b) => $b['total'] <=> $a['total']);
        $big = App::all('SELECT p.id, p.title, p.size_bytes, p.deleted_at, o.login owner, (SELECT COALESCE(SUM(a.bytes),0) FROM project_assets pa JOIN assets a ON a.sha256 = pa.sha256 WHERE pa.project_id = p.id) files
            FROM projects p JOIN users o ON o.id = p.owner_id ORDER BY p.size_bytes + files DESC LIMIT 15');
        $files = App::all('SELECT a.sha256, a.mime, a.bytes, a.created_at, (SELECT COUNT(*) FROM project_assets pa WHERE pa.sha256 = a.sha256) uses,
            (SELECT p.title FROM project_assets pa JOIN projects p ON p.id = pa.project_id WHERE pa.sha256 = a.sha256 LIMIT 1) project
            FROM assets a ORDER BY a.bytes DESC LIMIT 15');
        $types = App::all("SELECT CASE WHEN mime LIKE 'image/%' THEN 'image' WHEN mime = 'application/pdf' THEN 'pdf' WHEN mime LIKE 'font/%' THEN 'font' ELSE 'other' END t, COUNT(*) n, COALESCE(SUM(bytes),0) b FROM assets GROUP BY t ORDER BY b DESC");
        $rev = App::one('SELECT COUNT(*) n, COALESCE(SUM(LENGTH(doc_gz)),0) b FROM project_revisions');
        $orph = App::one('SELECT COUNT(*) n, COALESCE(SUM(a.bytes),0) b FROM assets a LEFT JOIN project_assets pa ON pa.sha256 = a.sha256 WHERE pa.sha256 IS NULL');
        $trash = App::one('SELECT COUNT(*) n, COALESCE(SUM(size_bytes),0) b FROM projects WHERE deleted_at IS NOT NULL');
        return [
            'users' => $byUser, 'defaultQuotaMb' => (int)Settings::system('defaultQuotaMb'),
            'totals' => ['docs' => (int)App::one('SELECT COALESCE(SUM(size_bytes),0) b FROM projects')['b'], 'files' => (int)App::one('SELECT COALESCE(SUM(bytes),0) b FROM assets')['b'],
                'filesCount' => (int)App::one('SELECT COUNT(*) n FROM assets')['n'], 'revisions' => (int)$rev['b'], 'revisionsCount' => (int)$rev['n'],
                'orphans' => (int)$orph['b'], 'orphansCount' => (int)$orph['n'], 'trash' => (int)$trash['b'], 'trashCount' => (int)$trash['n']],
            'types' => array_map(fn($t) => ['type' => $t['t'], 'count' => (int)$t['n'], 'bytes' => (int)$t['b']], $types),
            'bigProjects' => array_map(fn($r) => ['id' => $r['id'], 'title' => $r['title'], 'owner' => $r['owner'], 'size' => (int)$r['size_bytes'], 'files' => (int)$r['files'], 'trashed' => (bool)$r['deleted_at']], $big),
            'bigFiles' => array_map(fn($r) => ['sha' => substr($r['sha256'], 0, 12), 'mime' => $r['mime'], 'bytes' => (int)$r['bytes'], 'uses' => (int)$r['uses'], 'project' => $r['project'], 'createdAt' => App::iso($r['created_at'])], $files),
        ];
    }
    /* Очистить корзину целиком (всех пользователей) — сразу, не дожидаясь срока. */
    public static function emptyTrash(): array
    {
        Auth::admin();
        $n = App::q('DELETE FROM projects WHERE deleted_at IS NOT NULL')->rowCount();
        App::audit('project.purge', 'system', '', ['projects' => $n]);
        return ['removed' => $n];
    }
}
