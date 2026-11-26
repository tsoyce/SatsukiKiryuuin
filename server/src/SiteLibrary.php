<?php
/* XSatsu Студия · библиотека сайта: шаблоны и шрифты, которые администратор публикует для всех.
 * Шаблон — снимок документа проекта (с хэшами файлов), превью и подпись; новый проект из шаблона создаёт уже клиент.
 * Шрифт сайта — файл в assets + семейство и начертание; его можно добавить в любой проект.
 * Список и скачивание — без входа (Студия работает и без аккаунта); управление — только админ. */
declare(strict_types=1);

namespace XSatsu;

final class SiteLibrary
{
    public const VARIANTS = ['regular', 'bold', 'italic', 'bolditalic'];

    private static function hashes(array $doc): array
    {
        $out = [];
        foreach (($doc['assets'] ?? []) as $a) if (is_array($a) && isset($a['sha256']) && is_string($a['sha256']) && Assets::validSha($a['sha256'])) $out[] = $a['sha256'];
        foreach (($doc['fonts'] ?? []) as $f) if (is_array($f) && isset($f['sha256']) && is_string($f['sha256']) && Assets::validSha($f['sha256'])) $out[] = $f['sha256'];
        return array_values(array_unique($out));
    }
    private static function templateRow(array $r, bool $admin = false): array
    {
        $row = ['id' => (int)$r['id'], 'title' => $r['title'], 'description' => $r['description'], 'kind' => $r['kind'], 'thumb' => $r['thumb'] ?? '',
            'page' => ['width' => (float)$r['page_w'], 'height' => (float)$r['page_h']], 'updatedAt' => App::iso($r['updated_at'])];
        if ($admin) $row += ['published' => (bool)$r['published'], 'sort' => (int)$r['sort'], 'uses' => (int)$r['uses'], 'sourceProject' => $r['source_project'],
            'sourceTitle' => $r['source_title'] ?? null, 'createdBy' => $r['creator'] ?? null, 'createdAt' => App::iso($r['created_at'])];
        return $row;
    }

    /* ---------- для всех ---------- */
    public static function templates(): array
    {
        $rows = App::all('SELECT id, title, description, kind, thumb, page_w, page_h, updated_at FROM site_templates WHERE published = 1 ORDER BY sort, id');
        return ['templates' => array_map(fn($r) => self::templateRow($r), $rows)];
    }
    public static function template(array $p): array
    {
        $t = App::one('SELECT * FROM site_templates WHERE id = ?', [(int)$p['id']]);
        $u = Auth::current();
        if (!$t || (!$t['published'] && ($u['role'] ?? '') !== 'admin')) throw new HttpError(404, 'Шаблон не найден.');
        App::q('UPDATE site_templates SET uses = uses + 1 WHERE id = ?', [$t['id']]);
        return ['template' => self::templateRow($t), 'doc' => json_decode($t['doc'], true)];
    }
    public static function fonts(): array
    {
        $rows = App::all('SELECT f.*, a.bytes FROM site_fonts f LEFT JOIN assets a ON a.sha256 = f.sha256 ORDER BY f.family, FIELD(f.variant, "regular", "bold", "italic", "bolditalic")');
        $fam = [];
        foreach ($rows as $r) {
            $fam[$r['family']] ??= ['family' => $r['family'], 'category' => $r['category'], 'variants' => []];
            $fam[$r['family']]['variants'][] = ['id' => (int)$r['id'], 'variant' => $r['variant'], 'name' => $r['name'], 'sha256' => $r['sha256'], 'bytes' => (int)$r['bytes'], 'createdAt' => App::iso($r['created_at'])];
        }
        return ['fonts' => array_values($fam)];
    }
    /* Файл открыт всем, если он из опубликованного шаблона или шрифт сайта (Assets::download). */
    public static function publicAsset(string $sha): bool
    {
        try {
            return (bool)App::one('SELECT 1 FROM site_fonts WHERE sha256 = ? LIMIT 1', [$sha])
                || (bool)App::one('SELECT 1 FROM site_template_assets sa JOIN site_templates t ON t.id = sa.template_id WHERE sa.sha256 = ? AND t.published = 1 LIMIT 1', [$sha]);
        } catch (\Throwable) { return false; }
    }

    /* ---------- админ: шаблоны ---------- */
    public static function adminTemplates(): array
    {
        Auth::admin();
        $rows = App::all('SELECT t.*, p.title source_title, u.login creator FROM site_templates t LEFT JOIN projects p ON p.id = t.source_project LEFT JOIN users u ON u.id = t.created_by ORDER BY t.sort, t.id');
        return ['templates' => array_map(fn($r) => self::templateRow($r, true), $rows)];
    }
    /* Снимок проекта → данные шаблона. */
    private static function snapshot(string $projectId): array
    {
        $p = App::one('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [$projectId]);
        if (!$p) throw new HttpError(404, 'Проект не найден.');
        $doc = json_decode($p['doc'], true);
        if (!is_array($doc)) throw new HttpError(422, 'Проект повреждён.');
        // Шаблон не уносит личные данные: оставляем столбцы и одну пустую строку (или первую — как образец, если попросили).
        return [$p, $doc];
    }
    private static function cleanDoc(array $doc, bool $keepRows): array
    {
        unset($doc['id']);
        $doc['data'] = $doc['data'] ?? [];
        if (!$keepRows) {
            $rows = $doc['data']['rows'] ?? [];
            // Фото людей из таблицы (asset:<id> в ячейках) в шаблон не попадают, если макет сам их не использует.
            preg_match_all('/asset:([A-Za-z0-9_.\-]+)/', json_encode($rows, JSON_UNESCAPED_UNICODE), $m);
            $rest = json_encode(array_diff_key($doc, ['data' => 1, 'assets' => 1]), JSON_UNESCAPED_UNICODE);
            foreach (array_unique($m[1]) as $aid) if (!str_contains($rest, '"' . $aid . '"')) unset($doc['assets'][$aid]);
            $doc['data']['rows'] = $rows ? [array_merge($rows[0], ['cells' => array_map(fn() => '', $rows[0]['cells'] ?? []) ?: (object)[]])] : [];
            $doc['data']['current'] = 0;
        }
        return $doc;
    }
    private static function linkAssets(int $id, array $hashes): void
    {
        App::q('DELETE FROM site_template_assets WHERE template_id = ?', [$id]);
        foreach ($hashes as $h) App::q('INSERT IGNORE INTO site_template_assets (template_id, sha256) VALUES (?,?)', [$id, $h]);
    }
    public static function publish(): array
    {
        Auth::admin();
        $b = App::body();
        [$p, $doc] = self::snapshot(App::str($b, 'projectId', 64, true));
        $doc = self::cleanDoc($doc, !empty($b['keepRows']));
        $title = App::str($b, 'title', 200) ?: $p['title'];
        $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $sort = (int)(App::one('SELECT COALESCE(MAX(sort),0) + 10 n FROM site_templates')['n']);
        App::q('INSERT INTO site_templates (title, description, kind, doc, thumb, page_w, page_h, source_project, published, sort, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$title, App::str($b, 'description', 500), $p['kind'], $json, $p['thumb'], $p['page_w'], $p['page_h'], $p['id'], empty($b['draft']) ? 1 : 0, $sort, App::$user['id'], App::now(), App::now()]);
        $id = (int)App::db()->lastInsertId();
        self::linkAssets($id, self::hashes($doc));
        App::audit('template.publish', 'template', (string)$id, ['title' => $title]);
        return self::adminTemplates() + ['id' => $id];
    }
    public static function updateTemplate(array $p): array
    {
        Auth::admin();
        $t = App::one('SELECT * FROM site_templates WHERE id = ?', [(int)$p['id']]);
        if (!$t) throw new HttpError(404, 'Шаблон не найден.');
        $b = App::body();
        $set = []; $args = [];
        if (array_key_exists('title', $b)) { $v = App::str($b, 'title', 200); if ($v === '') throw new HttpError(422, 'Нужно название.'); $set[] = 'title = ?'; $args[] = $v; }
        if (array_key_exists('description', $b)) { $set[] = 'description = ?'; $args[] = App::str($b, 'description', 500); }
        if (array_key_exists('published', $b)) { $set[] = 'published = ?'; $args[] = $b['published'] ? 1 : 0; }
        if (array_key_exists('sort', $b)) { $set[] = 'sort = ?'; $args[] = (int)$b['sort']; }
        if (!empty($b['refresh'])) { // обновить из проекта-источника
            if (!$t['source_project']) throw new HttpError(422, 'Проект-источник не сохранился.');
            [$src, $doc] = self::snapshot($t['source_project']);
            $doc = self::cleanDoc($doc, !empty($b['keepRows']));
            array_push($set, 'doc = ?', 'thumb = ?', 'page_w = ?', 'page_h = ?', 'kind = ?');
            array_push($args, json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $src['thumb'], $src['page_w'], $src['page_h'], $src['kind']);
            self::linkAssets((int)$t['id'], self::hashes($doc));
        }
        if ($set) {
            $set[] = 'updated_at = ?'; $args[] = App::now(); $args[] = $t['id'];
            App::q('UPDATE site_templates SET ' . implode(', ', $set) . ' WHERE id = ?', $args);
            App::audit('template.update', 'template', (string)$t['id'], ['title' => $t['title']] + (!empty($b['refresh']) ? ['refresh' => true] : []));
        }
        return self::adminTemplates();
    }
    /* Порядок: ids — в нужной последовательности. */
    public static function reorder(): array
    {
        Auth::admin();
        $ids = App::body()['ids'] ?? [];
        if (!is_array($ids)) throw new HttpError(422, 'Ожидался список.');
        foreach (array_values($ids) as $i => $id) App::q('UPDATE site_templates SET sort = ? WHERE id = ?', [($i + 1) * 10, (int)$id]);
        return self::adminTemplates();
    }
    public static function deleteTemplate(array $p): array
    {
        Auth::admin();
        $t = App::one('SELECT id, title FROM site_templates WHERE id = ?', [(int)$p['id']]);
        if (!$t) throw new HttpError(404, 'Шаблон не найден.');
        App::q('DELETE FROM site_templates WHERE id = ?', [$t['id']]);
        App::audit('template.delete', 'template', (string)$t['id'], ['title' => $t['title']]);
        return self::adminTemplates();
    }

    /* ---------- админ: шрифты ---------- */
    public static function addFont(): array
    {
        Auth::admin();
        $b = App::body();
        $sha = (string)($b['sha256'] ?? '');
        if (!Assets::validSha($sha)) throw new HttpError(422, 'Неверный хэш файла.');
        $a = App::one('SELECT mime FROM assets WHERE sha256 = ?', [$sha]);
        if (!$a) throw new HttpError(422, 'Сначала загрузите файл шрифта.', ['missing' => [$sha]]);
        if (!str_starts_with($a['mime'], 'font/')) throw new HttpError(415, 'Это не файл шрифта.');
        $family = App::str($b, 'family', 100, true);
        $variant = in_array($b['variant'] ?? '', self::VARIANTS, true) ? $b['variant'] : 'regular';
        App::q('INSERT INTO site_fonts (family, variant, category, name, sha256, created_by, created_at) VALUES (?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE sha256 = VALUES(sha256), name = VALUES(name), category = VALUES(category), created_at = VALUES(created_at)',
            [$family, $variant, preg_match('/^[a-z]{0,20}$/', (string)($b['category'] ?? '')) ? (string)($b['category'] ?? '') : '', App::str($b, 'name'), $sha, App::$user['id'], App::now()]);
        App::audit('font.add', 'font', $family, ['family' => $family, 'variant' => $variant]);
        return self::fonts();
    }
    public static function deleteFont(array $p): array
    {
        Auth::admin();
        $f = App::one('SELECT * FROM site_fonts WHERE id = ?', [(int)$p['id']]);
        if (!$f) throw new HttpError(404, 'Шрифт не найден.');
        App::q('DELETE FROM site_fonts WHERE id = ?', [$f['id']]);
        App::audit('font.delete', 'font', $f['family'], ['family' => $f['family'], 'variant' => $f['variant']]);
        return self::fonts();
    }
}
