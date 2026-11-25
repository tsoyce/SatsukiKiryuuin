<?php
/* XSatsu Студия 4 · анкеты регистрации. Владелец (или редактор) проекта создаёт анкету из столбцов таблицы,
 * гости заполняют её по ссылке без входа, ответы копятся на сервере. Студия забирает новые ответы
 * и добавляет их записями в документ (сервер документ не меняет — так не ломается проверка версий),
 * затем отмечает ответы перенесёнными. */
declare(strict_types=1);

namespace XSatsu;

final class Forms
{
    private const TYPES = ['text', 'textarea', 'email', 'tel', 'choice', 'date'];
    private const MAX_FIELDS = 30;
    private const MAX_PER_IP_HOUR = 30;
    private const MAX_TOTAL = 5000;

    /* Поля анкеты: [{column, label, type, required, options[], hint}]. column — имя столбца проекта (= поле {…}). */
    private static function cleanFields(mixed $raw): array
    {
        if (!is_array($raw) || !$raw) throw new HttpError(422, 'Добавьте в анкету хотя бы одно поле.');
        $out = [];
        $seen = [];
        foreach (array_slice($raw, 0, self::MAX_FIELDS) as $f) {
            if (!is_array($f)) continue;
            $column = mb_substr(trim((string)($f['column'] ?? '')), 0, 100);
            if ($column === '' || isset($seen[mb_strtolower($column)])) continue;
            $seen[mb_strtolower($column)] = true;
            $type = in_array($f['type'] ?? '', self::TYPES, true) ? $f['type'] : 'text';
            $options = [];
            if ($type === 'choice') {
                foreach ((array)($f['options'] ?? []) as $o) { $o = mb_substr(trim((string)$o), 0, 100); if ($o !== '') $options[] = $o; }
                $options = array_values(array_unique(array_slice($options, 0, 30)));
                if (!$options) $type = 'text';
            }
            $out[] = ['column' => $column, 'label' => mb_substr(trim((string)($f['label'] ?? '')) ?: $column, 0, 200), 'type' => $type,
                'required' => !empty($f['required']), 'options' => $options, 'hint' => mb_substr(trim((string)($f['hint'] ?? '')), 0, 300)];
        }
        if (!$out) throw new HttpError(422, 'Добавьте в анкету хотя бы одно поле.');
        return $out;
    }

    private static function view(array $f, bool $owner = false): array
    {
        $v = [
            'title' => $f['title'], 'intro' => (string)($f['intro'] ?? ''), 'fields' => json_decode($f['fields'], true) ?: [],
            'open' => self::isOpen($f), 'closesAt' => App::iso($f['closes_at']),
        ];
        if ($owner) {
            $c = App::one('SELECT COUNT(*) total, SUM(imported_at IS NULL) pending FROM form_responses WHERE form_id = ?', [$f['id']]);
            $v += ['id' => (int)$f['id'], 'token' => $f['token'], 'isOpen' => (bool)$f['is_open'], 'maxResponses' => $f['max_responses'] !== null ? (int)$f['max_responses'] : null,
                'createdAt' => App::iso($f['created_at']), 'responses' => (int)$c['total'], 'pending' => (int)($c['pending'] ?? 0)];
        }
        return $v;
    }
    private static function isOpen(array $f): bool
    {
        if (!(int)$f['is_open']) return false;
        if ($f['closes_at'] && $f['closes_at'] < App::now()) return false;
        if ($f['max_responses'] !== null) {
            $n = (int)App::one('SELECT COUNT(*) n FROM form_responses WHERE form_id = ?', [$f['id']])['n'];
            if ($n >= (int)$f['max_responses']) return false;
        }
        return true;
    }
    private static function ownForm(array $p, string $level): array
    {
        $proj = Projects::need($p['id'], $level);
        $f = App::one('SELECT * FROM project_forms WHERE id = ? AND project_id = ?', [(int)$p['form'], $proj['id']]);
        if (!$f) throw new HttpError(404, 'Анкета не найдена.');
        return $f;
    }

    /* ---------- владелец ---------- */
    public static function list(array $p): array
    {
        $proj = Projects::need($p['id'], 'view');
        $rows = App::all('SELECT * FROM project_forms WHERE project_id = ? ORDER BY id DESC', [$proj['id']]);
        return ['forms' => array_map(fn($f) => self::view($f, true), $rows)];
    }
    public static function create(array $p): array
    {
        $proj = Projects::need($p['id'], 'edit');
        $b = App::body();
        if ((int)App::one('SELECT COUNT(*) n FROM project_forms WHERE project_id = ?', [$proj['id']])['n'] >= 20) throw new HttpError(422, 'У проекта уже 20 анкет — удалите ненужные.');
        $fields = self::cleanFields($b['fields'] ?? null);
        $title = App::str($b, 'title', 200) ?: $proj['title'];
        $max = isset($b['maxResponses']) && (int)$b['maxResponses'] > 0 ? min((int)$b['maxResponses'], self::MAX_TOTAL) : null;
        $closes = self::date($b['closesAt'] ?? null);
        $token = App::token(12);
        App::q('INSERT INTO project_forms (project_id, token, title, intro, fields, is_open, max_responses, closes_at, created_by, created_at) VALUES (?,?,?,?,?,1,?,?,?,?)',
            [$proj['id'], $token, $title, App::str($b, 'intro', 2000), json_encode($fields, JSON_UNESCAPED_UNICODE), $max, $closes, App::$user['id'], App::now()]);
        App::audit('form.create', 'project', $proj['id'], ['title' => $title]);
        return self::list($p) + ['token' => $token];
    }
    public static function update(array $p): array
    {
        $f = self::ownForm($p, 'edit');
        $b = App::body();
        $set = [];
        $args = [];
        if (array_key_exists('isOpen', $b)) { $set[] = 'is_open = ?'; $args[] = $b['isOpen'] ? 1 : 0; }
        if (array_key_exists('title', $b)) { $set[] = 'title = ?'; $args[] = App::str($b, 'title', 200) ?: $f['title']; }
        if (array_key_exists('intro', $b)) { $set[] = 'intro = ?'; $args[] = App::str($b, 'intro', 2000); }
        if (array_key_exists('fields', $b)) { $set[] = 'fields = ?'; $args[] = json_encode(self::cleanFields($b['fields']), JSON_UNESCAPED_UNICODE); }
        if (array_key_exists('maxResponses', $b)) { $set[] = 'max_responses = ?'; $args[] = (int)$b['maxResponses'] > 0 ? min((int)$b['maxResponses'], self::MAX_TOTAL) : null; }
        if (array_key_exists('closesAt', $b)) { $set[] = 'closes_at = ?'; $args[] = self::date($b['closesAt']); }
        if ($set) App::q('UPDATE project_forms SET ' . implode(', ', $set) . ' WHERE id = ?', [...$args, $f['id']]);
        return self::list($p);
    }
    public static function remove(array $p): array
    {
        $f = self::ownForm($p, 'edit');
        App::q('DELETE FROM project_forms WHERE id = ?', [$f['id']]);
        App::audit('form.delete', 'project', $f['project_id'], ['title' => $f['title']]);
        return self::list($p);
    }
    /* Ответы: ?pending=1 — только не перенесённые в проект. */
    public static function responses(array $p): array
    {
        $f = self::ownForm($p, 'view');
        $pending = ($_GET['pending'] ?? '') === '1';
        $rows = App::all('SELECT id, answers, created_at, imported_at FROM form_responses WHERE form_id = ?' . ($pending ? ' AND imported_at IS NULL' : '') . ' ORDER BY id LIMIT 5000', [$f['id']]);
        return ['responses' => array_map(fn($r) => ['id' => (int)$r['id'], 'answers' => json_decode($r['answers'], true) ?: [], 'at' => App::iso($r['created_at']), 'importedAt' => App::iso($r['imported_at'])], $rows)];
    }
    /* Отметить ответы перенесёнными (после того как Студия сохранила их в проект). */
    public static function ack(array $p): array
    {
        $f = self::ownForm($p, 'edit');
        $ids = array_values(array_filter(array_map('intval', (array)(App::body()['ids'] ?? [])), fn($x) => $x > 0));
        $n = 0;
        foreach (array_chunk($ids, 500) as $chunk) {
            $n += App::q('UPDATE form_responses SET imported_at = ? WHERE form_id = ? AND imported_at IS NULL AND id IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', [App::now(), $f['id'], ...$chunk])->rowCount();
        }
        return ['ok' => true, 'marked' => $n];
    }

    /* ---------- гость (без входа) ---------- */
    private static function byToken(string $token): array
    {
        $f = App::one('SELECT f.*, p.deleted_at FROM project_forms f JOIN projects p ON p.id = f.project_id WHERE f.token = ?', [$token]);
        if (!$f || $f['deleted_at']) throw new HttpError(404, 'Анкета не найдена или удалена.');
        return $f;
    }
    public static function publicGet(array $p): array
    {
        return self::view(self::byToken($p['token']));
    }
    public static function submit(array $p): array
    {
        $f = self::byToken($p['token']);
        if (!self::isOpen($f)) throw new HttpError(410, 'Регистрация закрыта.');
        $b = App::body();
        if (trim((string)($b['website'] ?? '')) !== '') return ['ok' => true]; // ловушка для ботов: поле скрыто от людей
        $ip = App::ip();
        $recent = (int)App::one('SELECT COUNT(*) n FROM form_responses WHERE form_id = ? AND ip = ? AND created_at > ?', [$f['id'], $ip, App::now(-3600)])['n'];
        if ($recent >= self::MAX_PER_IP_HOUR) throw new HttpError(429, 'Слишком много ответов с этого адреса. Попробуйте через час.');
        if ((int)App::one('SELECT COUNT(*) n FROM form_responses WHERE form_id = ?', [$f['id']])['n'] >= self::MAX_TOTAL) throw new HttpError(410, 'Регистрация закрыта: достигнут предел ответов.');
        $answers = is_array($b['answers'] ?? null) ? $b['answers'] : [];
        $out = [];
        foreach (json_decode($f['fields'], true) ?: [] as $field) {
            $v = $answers[$field['column']] ?? '';
            if (!is_string($v) && !is_numeric($v)) $v = '';
            $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$v) ?? '');
            $max = $field['type'] === 'textarea' ? 2000 : 300;
            if (mb_strlen($v) > $max) throw new HttpError(422, 'Слишком длинный ответ: «' . $field['label'] . '».');
            if ($field['required'] && $v === '') throw new HttpError(422, 'Заполните поле «' . $field['label'] . '».', ['field' => $field['column']]);
            if ($v !== '' && $field['type'] === 'email' && !filter_var($v, FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Проверьте адрес почты.', ['field' => $field['column']]);
            if ($v !== '' && $field['type'] === 'tel' && !preg_match('/^[0-9+()\-\s]{5,30}$/', $v)) throw new HttpError(422, 'Проверьте номер телефона.', ['field' => $field['column']]);
            if ($v !== '' && $field['type'] === 'choice' && !in_array($v, $field['options'], true)) throw new HttpError(422, 'Выберите вариант из списка: «' . $field['label'] . '».', ['field' => $field['column']]);
            if ($v !== '' && $field['type'] === 'date' && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) $v = $m[3] . '.' . $m[2] . '.' . $m[1];
            $out[$field['column']] = $v;
        }
        if (!array_filter($out, fn($v) => $v !== '')) throw new HttpError(422, 'Анкета пустая.');
        App::q('INSERT INTO form_responses (form_id, answers, ip, created_at) VALUES (?,?,?,?)', [$f['id'], json_encode($out, JSON_UNESCAPED_UNICODE), $ip, App::now()]);
        return ['ok' => true];
    }

    private static function date(mixed $v): ?string
    {
        if (!is_string($v) || $v === '') return null;
        $t = strtotime($v);
        return $t ? gmdate('Y-m-d H:i:s', $t) : null;
    }
}
