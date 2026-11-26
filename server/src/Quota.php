<?php
/* XSatsu Студия · место, занятое пользователем, и квота.
 * Занято = документы его проектов (включая корзину) + файлы этих проектов (каждый файл — один раз, даже если он в нескольких проектах).
 * Версии не считаются: их число ограничено (revisions_keep), а места они занимают мало (сжаты).
 * Квота пользователя — users.quota_mb; NULL — общая квота сайта (defaultQuotaMb); 0 — без ограничения. */
declare(strict_types=1);

namespace XSatsu;

final class Quota
{
    /** @return array<int,array{docs:int,files:int,total:int}> по id владельца */
    public static function usageAll(): array
    {
        $out = [];
        foreach (App::all('SELECT owner_id, COALESCE(SUM(size_bytes),0) b FROM projects GROUP BY owner_id') as $r)
            $out[(int)$r['owner_id']] = ['docs' => (int)$r['b'], 'files' => 0, 'total' => (int)$r['b']];
        foreach (App::all('SELECT x.owner_id, COALESCE(SUM(a.bytes),0) b FROM (SELECT DISTINCT p.owner_id, pa.sha256 FROM project_assets pa JOIN projects p ON p.id = pa.project_id) x
            JOIN assets a ON a.sha256 = x.sha256 GROUP BY x.owner_id') as $r) {
            $id = (int)$r['owner_id'];
            $out[$id] ??= ['docs' => 0, 'files' => 0, 'total' => 0];
            $out[$id]['files'] = (int)$r['b'];
            $out[$id]['total'] = $out[$id]['docs'] + (int)$r['b'];
        }
        return $out;
    }
    public static function usage(int $userId): array
    {
        $docs = (int)App::one('SELECT COALESCE(SUM(size_bytes),0) b FROM projects WHERE owner_id = ?', [$userId])['b'];
        $files = (int)App::one('SELECT COALESCE(SUM(a.bytes),0) b FROM assets a WHERE a.sha256 IN (SELECT pa.sha256 FROM project_assets pa JOIN projects p ON p.id = pa.project_id WHERE p.owner_id = ?)', [$userId])['b'];
        return ['docs' => $docs, 'files' => $files, 'total' => $docs + $files];
    }
    /* Квота в байтах (0 — без ограничения). */
    public static function limit(?array $user): int
    {
        if (!$user) return 0;
        $mb = $user['quota_mb'] ?? null;
        if ($mb === null) $mb = (int)Settings::system('defaultQuotaMb');
        return max(0, (int)$mb) * 1048576;
    }

    /* Перед сохранением проекта: поместится ли он в квоту владельца. Уменьшать проект можно всегда. */
    public static function check(int $ownerId, string $projectId, int $newDocBytes, array $hashes): void
    {
        $owner = App::one('SELECT id, quota_mb FROM users WHERE id = ?', [$ownerId]);
        $limit = self::limit($owner);
        if ($limit <= 0) return;
        $docs = (int)App::one('SELECT COALESCE(SUM(size_bytes),0) b FROM projects WHERE owner_id = ? AND id <> ?', [$ownerId, $projectId])['b'];
        $args = [$ownerId, $projectId];
        $extra = '';
        if ($hashes) { $extra = ' OR a.sha256 IN (' . implode(',', array_fill(0, count($hashes), '?')) . ')'; $args = array_merge($args, $hashes); }
        $files = (int)App::one('SELECT COALESCE(SUM(a.bytes),0) b FROM assets a WHERE a.sha256 IN (SELECT pa.sha256 FROM project_assets pa JOIN projects p ON p.id = pa.project_id WHERE p.owner_id = ? AND p.id <> ?)' . $extra, $args)['b'];
        $after = $docs + $files + $newDocBytes;
        if ($after <= $limit) return;
        $cur = App::one('SELECT size_bytes FROM projects WHERE id = ?', [$projectId]);
        $before = self::usage($ownerId)['total'];
        if ($cur && $after <= $before) return; // проект не растёт — не мешаем сохранять
        $mb = fn($b) => number_format($b / 1048576, 1, ',', ' ');
        throw new HttpError(413, 'Не хватает места в аккаунте владельца: занято ' . $mb($before) . ' из ' . $mb($limit) . ' МБ. Удалите ненужные проекты (и очистите корзину) или попросите администратора увеличить квоту.', ['quota' => true, 'used' => $before, 'limit' => $limit]);
    }
}
