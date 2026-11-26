<?php
/* XSatsu Студия · журнал действий в админке: фильтры (действие, кто, объект, текст, даты), страницы «раньше», выгрузка CSV. */
declare(strict_types=1);

namespace XSatsu;

final class AdminAudit
{
    public static function row(array $r): array
    {
        return ['id' => (int)$r['id'], 'at' => App::iso($r['at']), 'actor' => $r['login'] ?? null, 'actorId' => $r['actor_id'] !== null ? (int)$r['actor_id'] : null, 'action' => $r['action'],
            'targetType' => $r['target_type'], 'targetId' => $r['target_id'], 'target' => $r['target_type'] . ($r['target_id'] !== '' ? ':' . $r['target_id'] : ''),
            'detail' => $r['detail'] ? json_decode($r['detail'], true) : null, 'ip' => $r['ip']];
    }

    /** @return array{0:string,1:array} WHERE и параметры по фильтрам из адреса */
    private static function where(): array
    {
        $w = []; $a = [];
        $action = (string)($_GET['action'] ?? '');
        if ($action !== '' && preg_match('/^[a-z.]{1,40}\*?$/', $action)) {
            if (str_ends_with($action, '*')) { $w[] = 'a.action LIKE ?'; $a[] = rtrim($action, '*') . '%'; }
            else { $w[] = 'a.action = ?'; $a[] = $action; }
        }
        $actor = trim((string)($_GET['actor'] ?? ''));
        if ($actor === '-') $w[] = 'a.actor_id IS NULL';
        elseif ($actor !== '') { $w[] = 'u.login = ?'; $a[] = mb_strtolower($actor); }
        $type = (string)($_GET['type'] ?? '');
        if ($type !== '' && preg_match('/^[a-z]{1,20}$/', $type)) { $w[] = 'a.target_type = ?'; $a[] = $type; }
        $target = (string)($_GET['target'] ?? '');
        if ($target !== '') { $w[] = 'a.target_id = ?'; $a[] = mb_substr($target, 0, 64); }
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') { $like = '%' . addcslashes(mb_substr($q, 0, 100), '%_\\') . '%'; $w[] = '(a.ip LIKE ? OR a.detail LIKE ? OR a.target_id LIKE ? OR u.login LIKE ?)'; array_push($a, $like, $like, $like, $like); }
        foreach (['from' => '>=', 'to' => '<'] as $k => $op) {
            $v = (string)($_GET[$k] ?? '');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) { $w[] = "a.at $op ?"; $a[] = $k === 'to' ? gmdate('Y-m-d', strtotime($v . ' +1 day')) : $v; }
        }
        $before = (int)($_GET['before'] ?? 0);
        if ($before > 0) { $w[] = 'a.id < ?'; $a[] = $before; }
        return [$w ? 'WHERE ' . implode(' AND ', $w) : '', $a];
    }

    public static function list(): ?array
    {
        Auth::admin();
        [$where, $args] = self::where();
        if (($_GET['format'] ?? '') === 'csv') return self::csv($where, $args);
        $limit = max(10, min(500, (int)($_GET['limit'] ?? 100)));
        $rows = App::all("SELECT a.*, u.login FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id $where ORDER BY a.id DESC LIMIT " . ($limit + 1), $args);
        $more = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $actions = array_column(App::all('SELECT DISTINCT action FROM audit_log ORDER BY action'), 'action');
        return ['events' => array_map([self::class, 'row'], $rows), 'next' => $more ? (int)end($rows)['id'] : null, 'actions' => $actions];
    }

    private static function csv(string $where, array $args): ?array
    {
        $rows = App::all("SELECT a.*, u.login FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id $where ORDER BY a.id DESC LIMIT 50000", $args);
        App::audit('audit.export', 'system', '', ['rows' => count($rows)]);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="xsatsu-journal-' . gmdate('Ymd-Hi') . '.csv"');
        header('Cache-Control: no-store');
        $out = fopen('php://output', 'wb');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Когда (UTC)', 'Кто', 'Действие', 'Объект', 'Подробности', 'IP'], ';', '"', '\\');
        foreach ($rows as $r) {
            // Значения, начинающиеся с = + - @, Excel принял бы за формулу — экранируем.
            $cell = fn($v) => preg_match('/^[=+\-@\t\r]/', (string)$v) ? "'" . $v : (string)$v;
            fputcsv($out, [$r['at'], $cell($r['login'] ?? ''), $r['action'], $cell($r['target_type'] . ($r['target_id'] !== '' ? ':' . $r['target_id'] : '')), $cell($r['detail'] ?? ''), $r['ip']], ';', '"', '\\');
        }
        fclose($out);
        return null;
    }
}
