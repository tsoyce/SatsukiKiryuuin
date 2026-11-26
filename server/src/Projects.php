<?php
/* XSatsu Студия · проекты на сервере: список, чтение, сохранение с проверкой версии (409 при конфликте),
 * история версий и откат, корзина, доступ людям и по ссылке (гостевые ссылки — Links.php). */
declare(strict_types=1);

namespace XSatsu;

final class Projects
{
    /* Права текущего пользователя: owner | edit | view | null. Админ сайта = владелец. */
    public static function permission(array $project, ?array $u): ?string
    {
        if (!$u) return null;
        if ((int)$project['owner_id'] === (int)$u['id'] || $u['role'] === 'admin') return 'owner';
        $s = App::one('SELECT permission FROM project_shares WHERE project_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > ?)', [$project['id'], $u['id'], App::now()]);
        return $s['permission'] ?? null;
    }
    private static function find(string $id, bool $withDeleted = false): array
    {
        $p = App::one('SELECT * FROM projects WHERE id = ?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'), [$id]);
        if (!$p) throw new HttpError(404, 'Проект не найден.');
        return $p;
    }
    public static function need(string $id, string $level, bool $withDeleted = false): array
    {
        $u = Auth::user();
        $p = self::find($id, $withDeleted);
        $perm = self::permission($p, $u);
        $rank = ['view' => 1, 'edit' => 2, 'owner' => 3];
        if (!$perm) throw new HttpError(404, 'Проект не найден.');
        if ($rank[$perm] < $rank[$level]) throw new HttpError(403, $level === 'edit' ? 'У вас доступ только для просмотра.' : 'Это может сделать только владелец проекта.');
        $p['permission'] = $perm;
        return $p;
    }

    /* Проверка документа: формат, размер, ссылки на файлы. Возвращает [json, doc, hashes]. */
    private static function validateDoc(mixed $doc, string $id): array
    {
        if (!is_array($doc) || ($doc['format'] ?? '') !== 'xsatsu-doc') throw new HttpError(422, 'Это не проект XSatsu Студии.');
        $doc['id'] = $id;
        $hashes = [];
        foreach (($doc['assets'] ?? []) as $a) if (is_array($a) && isset($a['sha256']) && is_string($a['sha256'])) $hashes[] = $a['sha256'];
        foreach (($doc['fonts'] ?? []) as $f) if (is_array($f) && isset($f['sha256']) && is_string($f['sha256'])) $hashes[] = $f['sha256'];
        $hashes = array_values(array_unique($hashes));
        foreach ($hashes as $h) if (!Assets::validSha($h)) throw new HttpError(422, 'Неверная ссылка на файл в проекте.');
        if ($hashes) {
            $have = array_column(App::all('SELECT sha256 FROM assets WHERE sha256 IN (' . implode(',', array_fill(0, count($hashes), '?')) . ')', $hashes), 'sha256');
            $missing = array_values(array_diff($hashes, $have));
            if ($missing) throw new HttpError(422, 'Сначала загрузите файлы проекта.', ['missing' => $missing]);
        }
        $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (strlen($json) > (int)App::$config['max_doc_mb'] * 1024 * 1024) throw new HttpError(413, 'Проект слишком большой.');
        return [$json, $doc, $hashes];
    }
    private static function meta(array $doc): array
    {
        return [
            'title' => mb_substr(trim((string)($doc['title'] ?? '')) ?: 'Без названия', 0, 200),
            'kind' => preg_match('/^[a-z]{1,20}$/', (string)($doc['kind'] ?? '')) ? $doc['kind'] : 'custom',
            'rows' => is_array($doc['data']['rows'] ?? null) ? count($doc['data']['rows']) : 0,
            'sides' => is_array($doc['sides'] ?? null) ? min(255, count($doc['sides'])) : 1,
            'w' => (float)($doc['page']['width'] ?? 0), 'h' => (float)($doc['page']['height'] ?? 0),
        ];
    }
    private static function thumb(mixed $t): ?string
    {
        return is_string($t) && strlen($t) < 400000 && preg_match('#^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$#', $t) ? $t : null;
    }
    private static function linkAssets(string $id, array $hashes): void
    {
        App::q('DELETE FROM project_assets WHERE project_id = ?', [$id]);
        foreach ($hashes as $h) App::q('INSERT IGNORE INTO project_assets (project_id, sha256) VALUES (?,?)', [$id, $h]);
    }
    /* Версия в истории. Автор — текущий пользователь, если не передан явно; гость — подписью $label. */
    private static function snapshot(string $id, int $rev, string $json, string $note = '', ?int $authorId = -1, ?string $label = null): void
    {
        if ($authorId === -1) $authorId = isset(App::$user['id']) ? (int)App::$user['id'] : null;
        App::q('INSERT IGNORE INTO project_revisions (project_id, revision, doc_gz, author_id, author_label, created_at, note) VALUES (?,?,?,?,?,?,?)',
            [$id, $rev, gzcompress($json, 6), $authorId, $label, App::now(), mb_substr($note, 0, 200)]);
        $keep = max(5, (int)App::$config['revisions_keep']);
        $old = App::one('SELECT revision FROM project_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1 OFFSET ' . $keep, [$id]);
        if ($old) App::q('DELETE FROM project_revisions WHERE project_id = ? AND revision <= ?', [$id, $old['revision']]);
    }
    private static function row(array $p, string $perm, ?array $owner = null): array
    {
        return [
            'id' => $p['id'], 'title' => $p['title'], 'kind' => $p['kind'], 'revision' => (int)$p['revision'],
            'rows' => (int)$p['rows_count'], 'sides' => (int)$p['sides_count'], 'page' => ['width' => (float)$p['page_w'], 'height' => (float)$p['page_h']],
            'updatedAt' => App::iso($p['updated_at']), 'createdAt' => App::iso($p['created_at']), 'deletedAt' => App::iso($p['deleted_at']),
            'thumb' => $p['thumb'] ?? '', 'permission' => $perm, 'owner' => $owner, 'size' => (int)$p['size_bytes'],
        ];
    }

    /* ---------- API ---------- */
    public static function list(): array
    {
        $u = Auth::user();
        $scope = $_GET['scope'] ?? 'mine';
        $cols = 'p.id, p.owner_id, p.title, p.kind, p.revision, p.rows_count, p.sides_count, p.page_w, p.page_h, p.size_bytes, p.created_at, p.updated_at, p.deleted_at, p.thumb, o.login owner_login, o.name owner_name';
        if ($scope === 'shared') {
            $rows = App::all("SELECT $cols, s.permission perm FROM project_shares s JOIN projects p ON p.id = s.project_id JOIN users o ON o.id = p.owner_id
                WHERE s.user_id = ? AND p.deleted_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY p.updated_at DESC", [$u['id'], App::now()]);
        } elseif ($scope === 'trash') {
            $rows = App::all("SELECT $cols, 'owner' perm FROM projects p JOIN users o ON o.id = p.owner_id WHERE p.owner_id = ? AND p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC", [$u['id']]);
        } elseif ($scope === 'all' && $u['role'] === 'admin') {
            $rows = App::all("SELECT $cols, 'owner' perm FROM projects p JOIN users o ON o.id = p.owner_id WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 1000");
        } else {
            $rows = App::all("SELECT $cols, 'owner' perm, (SELECT COUNT(*) FROM project_shares s WHERE s.project_id = p.id) shares FROM projects p JOIN users o ON o.id = p.owner_id WHERE p.owner_id = ? AND p.deleted_at IS NULL ORDER BY p.updated_at DESC", [$u['id']]);
        }
        return ['projects' => array_map(fn($r) => self::row($r, $r['perm'], ['login' => $r['owner_login'], 'name' => $r['owner_name']]) + ['shared' => (int)($r['shares'] ?? 0)], $rows), 'trashDays' => Settings::system('trashDays')];
    }

    public static function create(): array
    {
        $u = Auth::user();
        $b = App::body();
        $want = is_string($b['doc']['id'] ?? null) && preg_match('/^[A-Za-z0-9_.\-]{4,64}$/', $b['doc']['id']) ? $b['doc']['id'] : '';
        // Номер проекта выдаёт сервер: если такой уже есть (например, тот же файл открыли двое), даём новый.
        $id = ($want && !App::one('SELECT id FROM projects WHERE id = ?', [$want])) ? $want : 'doc-' . strtolower(App::token(12));
        [$json, $doc, $hashes] = self::validateDoc($b['doc'] ?? null, $id);
        $m = self::meta($doc);
        App::db()->beginTransaction();
        try {
            App::q('INSERT INTO projects (id, owner_id, title, kind, revision, doc, thumb, rows_count, sides_count, page_w, page_h, size_bytes, created_at, updated_at, updated_by) VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)',
                [$id, $u['id'], $m['title'], $m['kind'], $json, self::thumb($b['thumb'] ?? null), $m['rows'], $m['sides'], $m['w'], $m['h'], strlen($json), App::now(), App::now(), $u['id']]);
            self::linkAssets($id, $hashes);
            self::snapshot($id, 1, $json, (string)($b['note'] ?? 'Создан'));
            App::db()->commit();
        } catch (\Throwable $e) { App::db()->rollBack(); throw $e; }
        App::audit('project.create', 'project', $id, ['title' => $m['title']]);
        return ['id' => $id, 'revision' => 1, 'updatedAt' => App::iso(App::now())];
    }

    public static function get(array $p): array
    {
        $proj = self::need($p['id'], 'view');
        return ['doc' => json_decode($proj['doc'], true), 'revision' => (int)$proj['revision'], 'permission' => $proj['permission'], 'updatedAt' => App::iso($proj['updated_at'])];
    }

    public static function update(array $p): array
    {
        self::need($p['id'], 'edit');
        return self::write($p['id'], App::body(), null);
    }

    /* Сохранение с проверкой ревизии. Права проверяет вызывающий (update — по аккаунту, Links::save — по ссылке).
     * $label — подпись гостя; null — правит пользователь под своим именем.
     * Когда правит другой человек, чем в прошлый раз, прежнее состояние и новое обязательно попадают в версии:
     * чужую правку всегда можно откатить. */
    public static function write(string $id, array $b, ?string $label): array
    {
        $userId = isset(App::$user['id']) ? (int)App::$user['id'] : null;
        App::db()->beginTransaction();
        try {
            $cur = App::one('SELECT revision, doc, updated_at, updated_by, updated_by_label, deleted_at FROM projects WHERE id = ? FOR UPDATE', [$id]);
            if (!$cur || $cur['deleted_at']) throw new HttpError(404, 'Проект не найден.');
            $base = (int)($b['revision'] ?? 0);
            if ($base !== (int)$cur['revision']) {
                $who = $cur['updated_by_label'] ?: (($w = $cur['updated_by'] ? App::one('SELECT name, login FROM users WHERE id = ?', [$cur['updated_by']]) : null) ? ($w['name'] ?: $w['login']) : null);
                throw new HttpError(409, 'Проект уже изменён в другом окне или другим человеком.', ['revision' => (int)$cur['revision'], 'updatedAt' => App::iso($cur['updated_at']), 'updatedBy' => $who]);
            }
            [$json, $doc, $hashes] = self::validateDoc($b['doc'] ?? null, $id);
            $m = self::meta($doc);
            $rev = $base + 1;
            $thumb = self::thumb($b['thumb'] ?? null);
            App::q('UPDATE projects SET title = ?, kind = ?, revision = ?, doc = ?, rows_count = ?, sides_count = ?, page_w = ?, page_h = ?, size_bytes = ?, updated_at = ?, updated_by = ?, updated_by_label = ?' . ($thumb ? ', thumb = ?' : '') . ' WHERE id = ?',
                array_merge([$m['title'], $m['kind'], $rev, $json, $m['rows'], $m['sides'], $m['w'], $m['h'], strlen($json), App::now(), $userId, $label], $thumb ? [$thumb] : [], [$id]));
            self::linkAssets($id, $hashes);
            $note = trim((string)($b['note'] ?? ''));
            $switch = ($cur['updated_by'] !== null ? (int)$cur['updated_by'] : null) !== $userId || $cur['updated_by_label'] !== $label;
            if ($switch) self::snapshot($id, (int)$cur['revision'], $cur['doc'], '', $cur['updated_by'] !== null ? (int)$cur['updated_by'] : null, $cur['updated_by_label']);
            $last = App::one('SELECT created_at FROM project_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1', [$id]);
            if ($switch || $note !== '' || !$last || $last['created_at'] < App::now(-60 * (int)App::$config['revision_every_minutes'])) self::snapshot($id, $rev, $json, $note, $userId, $label);
            App::db()->commit();
        } catch (\Throwable $e) { if (App::db()->inTransaction()) App::db()->rollBack(); throw $e; }
        if ($note !== '') App::audit('project.version', 'project', $id, ['note' => $note] + ($label ? ['by' => $label] : []));
        return ['id' => $id, 'revision' => $rev, 'updatedAt' => App::iso(App::now())];
    }

    public static function remove(array $p): array
    {
        $u = Auth::user();
        $proj = self::find($p['id'], true);
        $perm = self::permission($proj, $u);
        if (!$perm) throw new HttpError(404, 'Проект не найден.');
        if ($perm !== 'owner') { // не владелец — просто убирает проект из «Доступных мне»
            App::q('DELETE FROM project_shares WHERE project_id = ? AND user_id = ?', [$p['id'], $u['id']]);
            return ['ok' => true, 'unshared' => true];
        }
        if (($_GET['purge'] ?? '') === '1') {
            if (!$proj['deleted_at']) throw new HttpError(409, 'Сначала переместите проект в корзину.');
            App::q('DELETE FROM projects WHERE id = ?', [$p['id']]);
            App::audit('project.purge', 'project', $p['id'], ['title' => $proj['title']]);
            return ['ok' => true, 'purged' => true];
        }
        App::q('UPDATE projects SET deleted_at = ? WHERE id = ?', [App::now(), $p['id']]);
        App::audit('project.trash', 'project', $p['id'], ['title' => $proj['title']]);
        return ['ok' => true, 'trashed' => true];
    }
    public static function restore(array $p): array
    {
        $proj = self::need($p['id'], 'owner', true);
        App::q('UPDATE projects SET deleted_at = NULL WHERE id = ?', [$proj['id']]);
        App::audit('project.restore', 'project', $proj['id']);
        return ['ok' => true];
    }

    /* ---------- версии ---------- */
    public static function revisions(array $p): array
    {
        self::need($p['id'], 'view');
        $rows = App::all('SELECT r.revision, r.created_at, r.note, r.author_label, LENGTH(r.doc_gz) bytes, u.name, u.login FROM project_revisions r LEFT JOIN users u ON u.id = r.author_id WHERE r.project_id = ? ORDER BY r.revision DESC', [$p['id']]);
        return ['revisions' => array_map(fn($r) => ['revision' => (int)$r['revision'], 'at' => App::iso($r['created_at']), 'note' => $r['note'], 'author' => $r['author_label'] ?: ($r['name'] ?: $r['login']), 'guest' => $r['author_label'] !== null, 'bytes' => (int)$r['bytes']], $rows)];
    }
    public static function revision(array $p): array
    {
        self::need($p['id'], 'view');
        $r = App::one('SELECT doc_gz FROM project_revisions WHERE project_id = ? AND revision = ?', [$p['id'], (int)$p['rev']]);
        if (!$r) throw new HttpError(404, 'Версия не найдена.');
        return ['doc' => json_decode(gzuncompress($r['doc_gz']), true), 'revision' => (int)$p['rev']];
    }
    public static function saveVersion(array $p): array
    {
        $proj = self::need($p['id'], 'edit');
        $note = App::str(App::body(), 'note', 200) ?: 'Сохранённая версия';
        App::q('DELETE FROM project_revisions WHERE project_id = ? AND revision = ?', [$proj['id'], $proj['revision']]);
        self::snapshot($proj['id'], (int)$proj['revision'], $proj['doc'], $note);
        App::audit('project.version', 'project', $proj['id'], ['note' => $note]);
        return self::revisions($p);
    }

    /* ---------- доступ ---------- */
    public static function shares(array $p): array
    {
        $proj = self::need($p['id'], 'owner');
        $rows = App::all('SELECT s.id, s.user_id, s.permission, s.label, s.created_at, s.expires_at, s.last_used_at, s.opens, s.edits, s.token_hash IS NOT NULL is_link, u.login, u.name
            FROM project_shares s LEFT JOIN users u ON u.id = s.user_id WHERE s.project_id = ? ORDER BY s.id', [$proj['id']]);
        $now = App::now();
        return ['shares' => array_map(fn($r) => [
            'id' => (int)$r['id'], 'link' => (bool)$r['is_link'], 'login' => $r['login'], 'name' => $r['name'], 'permission' => $r['permission'], 'label' => $r['label'],
            'createdAt' => App::iso($r['created_at']), 'expiresAt' => App::iso($r['expires_at']), 'expired' => $r['expires_at'] !== null && $r['expires_at'] <= $now,
            'lastUsedAt' => App::iso($r['last_used_at']), 'opens' => (int)$r['opens'], 'edits' => (int)$r['edits'],
        ], $rows)];
    }
    private static function expiry(mixed $days): ?string
    {
        $d = (int)$days;
        return $d > 0 ? App::now(min($d, Links::MAX_DAYS) * 86400) : null;
    }
    public static function share(array $p): array
    {
        $proj = self::need($p['id'], 'owner');
        $b = App::body();
        $perm = ($b['permission'] ?? 'view') === 'edit' ? 'edit' : 'view';
        if (!empty($b['link'])) {
            $n = (int)App::one('SELECT COUNT(*) n FROM project_shares WHERE project_id = ? AND token_hash IS NOT NULL', [$proj['id']])['n'];
            if ($n >= 50) throw new HttpError(422, 'У проекта уже 50 ссылок — уберите ненужные.');
            $token = App::token(24); // 192 бита
            $label = App::str($b, 'label', 100) ?: null;
            App::q('INSERT INTO project_shares (project_id, token_hash, permission, label, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?,?)',
                [$proj['id'], hash('sha256', $token), $perm, $label, App::$user['id'], App::now(), self::expiry($b['days'] ?? 0)]);
            App::audit('project.link', 'project', $proj['id'], ['permission' => $perm] + ($label ? ['label' => $label] : []));
            return self::shares($p) + ['token' => $token];
        }
        $login = mb_strtolower(App::str($b, 'login', 100, true));
        $target = App::one('SELECT id FROM users WHERE login = ? AND status = ?', [$login, 'active']);
        if (!$target) throw new HttpError(404, 'Пользователь «' . $login . '» не найден.');
        if ((int)$target['id'] === (int)$proj['owner_id']) throw new HttpError(422, 'Это владелец проекта.');
        App::q('INSERT INTO project_shares (project_id, user_id, permission, created_by, created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE permission = VALUES(permission)',
            [$proj['id'], $target['id'], $perm, App::$user['id'], App::now()]);
        App::audit('project.share', 'project', $proj['id'], ['login' => $login, 'permission' => $perm]);
        return self::shares($p);
    }
    /* PATCH shares/{share}: права, срок (days: 0 — бессрочно) и подпись ссылки. */
    public static function updateShare(array $p): array
    {
        $proj = self::need($p['id'], 'owner');
        $s = App::one('SELECT * FROM project_shares WHERE project_id = ? AND id = ?', [$proj['id'], (int)$p['share']]);
        if (!$s) throw new HttpError(404, 'Доступ не найден.');
        $b = App::body();
        $perm = array_key_exists('permission', $b) ? (($b['permission'] === 'edit') ? 'edit' : 'view') : $s['permission'];
        $expires = array_key_exists('days', $b) ? self::expiry($b['days']) : $s['expires_at'];
        $label = array_key_exists('label', $b) ? (App::str($b, 'label', 100) ?: null) : $s['label'];
        App::q('UPDATE project_shares SET permission = ?, expires_at = ?, label = ? WHERE id = ?', [$perm, $s['token_hash'] ? $expires : $s['expires_at'], $s['token_hash'] ? $label : null, $s['id']]);
        App::audit('project.share.update', 'project', $proj['id'], ['share' => (int)$s['id'], 'permission' => $perm]);
        return self::shares($p);
    }
    public static function unshare(array $p): array
    {
        $proj = self::need($p['id'], 'owner');
        App::q('DELETE FROM project_shares WHERE project_id = ? AND id = ?', [$proj['id'], (int)$p['share']]);
        App::audit('project.unshare', 'project', $proj['id']);
        return self::shares($p);
    }

    /* Корзина старше N дней — навсегда (bin/cleanup.php). */
    public static function purgeTrash(): int
    {
        $days = (int)Settings::system('trashDays');
        return App::q('DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at < ?', [App::now(-$days * 86400)])->rowCount();
    }
}
