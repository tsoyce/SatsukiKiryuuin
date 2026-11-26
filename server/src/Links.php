<?php
/* XSatsu Студия · гостевые ссылки: открыть проект без входа, смотреть и печатать (view) или ещё и править (edit).
 * В базе хранится только SHA-256 токена; токен — 192 бита из random_bytes. Токен приходит заголовком X-XS-Link
 * (не попадает в журналы веб-сервера), для старых ссылок — в пути v1/links/{token}.
 * Неверные токены и частые запросы ограничиваются по IP (RateLimit). Правки гостя попадают в версии с его подписью. */
declare(strict_types=1);

namespace XSatsu;

final class Links
{
    public const HEADER = 'HTTP_X_XS_LINK';
    public const MISS_LIMIT = 20;      // неверных токенов с IP за 15 мин
    public const OPEN_LIMIT = 120;     // открытий по ссылке с IP за 15 мин
    public const SAVE_LIMIT = 900;     // сохранений гостя с IP за час (автосохранение после каждой паузы)
    public const UPLOAD_LIMIT = 300;   // файлов от гостя с IP за час
    public const MAX_DAYS = 365;

    /* Токен из заголовка, затем из пути (старые ссылки), затем из ?link= (старые клиенты). */
    public static function tokenFrom(array $p = []): ?string
    {
        $t = $_SERVER[self::HEADER] ?? ($p['token'] ?? ($_GET['link'] ?? null));
        return is_string($t) && $t !== '' ? $t : null;
    }
    public static function present(array $p = []): bool { return self::tokenFrom($p) !== null; }

    /* Действующая ссылка + проект. Иначе 404 (и засчитанный промах). */
    public static function resolve(?string $token, string $need = 'view'): array
    {
        RateLimit::check('link-miss', self::MISS_LIMIT, 900, 'Слишком много неверных ссылок с вашего адреса.');
        $s = null;
        if ($token !== null && preg_match('/^[A-Za-z0-9_\-]{16,64}$/', $token)) {
            $s = App::one('SELECT s.id share_id, s.project_id, s.permission, s.label, s.expires_at, p.*, o.name owner_name, o.login owner_login
                FROM project_shares s JOIN projects p ON p.id = s.project_id JOIN users o ON o.id = p.owner_id
                WHERE s.token_hash = ? AND s.user_id IS NULL AND (s.expires_at IS NULL OR s.expires_at > ?) AND p.deleted_at IS NULL AND o.status = ?',
                [hash('sha256', $token), App::now(), 'active']);
        }
        if (!$s) { RateLimit::hit('link-miss'); throw new HttpError(404, 'Ссылка недействительна: её отозвали, срок истёк или проект удалён.'); }
        if ($need === 'edit' && $s['permission'] !== 'edit') throw new HttpError(403, 'По этой ссылке можно только смотреть и печатать.');
        return $s;
    }

    /* Подпись автора правки: «Имя (гость)», «Гость · для кого» или имя пользователя, если он вошёл. */
    public static function authorLabel(array $share, mixed $guest): string
    {
        $name = is_string($guest) ? trim(preg_replace('/[\x00-\x1F\x7F<>]+/u', ' ', $guest) ?? '') : '';
        $name = mb_substr(preg_replace('/\s+/u', ' ', $name) ?? '', 0, 60);
        $u = Auth::current();
        if ($u) return mb_substr(($u['name'] ?: $u['login']) . ' (по ссылке)', 0, 120);
        if ($name !== '') return mb_substr($name . ' (гость)', 0, 120);
        return $share['label'] ? mb_substr('Гость · ' . $share['label'], 0, 120) : 'Гость по ссылке';
    }

    private static function out(array $s): array
    {
        return [
            'id' => $s['project_id'], 'doc' => json_decode($s['doc'], true), 'title' => $s['title'], 'revision' => (int)$s['revision'],
            'permission' => $s['permission'], 'label' => $s['label'], 'expiresAt' => App::iso($s['expires_at']),
            'owner' => $s['owner_name'] ?: $s['owner_login'], 'updatedAt' => App::iso($s['updated_at']),
        ];
    }

    /* GET v1/link (заголовок X-XS-Link) и GET v1/links/{token}. */
    public static function open(array $p = []): array
    {
        RateLimit::take('link-open', self::OPEN_LIMIT, 900, 'Слишком много открытий по ссылке.');
        $s = self::resolve(self::tokenFrom($p));
        App::q('UPDATE project_shares SET opens = opens + 1, last_used_at = ? WHERE id = ?', [App::now(), $s['share_id']]);
        return self::out($s);
    }

    /* PUT v1/link: сохранить правки гостя (та же проверка ревизии, что у владельца: 409 при конфликте). */
    public static function save(array $p = []): array
    {
        RateLimit::take('link-save', self::SAVE_LIMIT, 3600, 'Слишком много сохранений с вашего адреса.');
        $s = self::resolve(self::tokenFrom($p), 'edit');
        $b = App::body();
        $r = Projects::write($s['project_id'], $b, self::authorLabel($s, $b['guest'] ?? null));
        App::q('UPDATE project_shares SET edits = edits + 1, last_used_at = ? WHERE id = ?', [App::now(), $s['share_id']]);
        return $r;
    }

    /* Для файлов: проект, к которому ведёт ссылка (edit — для загрузки, view — для скачивания). */
    public static function projectFor(string $need): array
    {
        return self::resolve(self::tokenFrom(), $need);
    }
}
