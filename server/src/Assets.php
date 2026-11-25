<?php
/* XSatsu Студия · файлы проектов (фоны, картинки, PDF, шрифты) на диске по SHA-256.
 * Один и тот же файл хранится один раз на все проекты; в документе — только хэш. */
declare(strict_types=1);

namespace XSatsu;

final class Assets
{
    public static function dir(): string { return rtrim((string)App::$config['storage_dir'], '/') . '/assets'; }
    public static function path(string $sha): string { return self::dir() . '/' . substr($sha, 0, 2) . '/' . $sha; }
    public static function validSha(string $sha): bool { return (bool)preg_match('/^[0-9a-f]{64}$/', $sha); }

    /* Тип по содержимому, а не по заголовку клиента. Разрешены только картинки, PDF и шрифты. */
    public static function sniff(string $head): ?string
    {
        if (str_starts_with($head, '%PDF-')) return 'application/pdf';
        if (str_starts_with($head, "\x89PNG\r\n\x1a\n")) return 'image/png';
        if (str_starts_with($head, "\xFF\xD8\xFF")) return 'image/jpeg';
        if (str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a')) return 'image/gif';
        if (str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP') return 'image/webp';
        if (str_starts_with($head, "\x00\x01\x00\x00") || str_starts_with($head, 'true')) return 'font/ttf';
        if (str_starts_with($head, 'OTTO')) return 'font/otf';
        if (str_starts_with($head, 'wOFF')) return 'font/woff';
        if (str_starts_with($head, 'wOF2')) return 'font/woff2';
        $t = ltrim(substr($head, 0, 512), "\xEF\xBB\xBF \t\r\n");
        if (preg_match('/^(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/is', $t)) return 'image/svg+xml';
        return null;
    }

    public static function missing(): array
    {
        Auth::user();
        $hashes = App::body()['hashes'] ?? [];
        if (!is_array($hashes) || count($hashes) > 2000) throw new HttpError(422, 'Ожидался список хэшей.');
        $hashes = array_values(array_unique(array_filter($hashes, fn($h) => is_string($h) && self::validSha($h))));
        if (!$hashes) return ['missing' => []];
        $have = array_column(App::all('SELECT sha256 FROM assets WHERE sha256 IN (' . implode(',', array_fill(0, count($hashes), '?')) . ')', $hashes), 'sha256');
        $have = array_filter($have, fn($h) => is_file(self::path($h)));
        return ['missing' => array_values(array_diff($hashes, $have))];
    }

    /* PUT assets/{sha}: тело — сам файл. Хэш проверяется на сервере. */
    public static function upload(array $p): array
    {
        $u = Auth::user();
        $sha = $p['sha'];
        if (!self::validSha($sha)) throw new HttpError(422, 'Неверный хэш.');
        $max = (int)App::$config['max_asset_mb'] * 1024 * 1024;
        $in = fopen('php://input', 'rb');
        $dir = self::dir() . '/' . substr($sha, 0, 2);
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) throw new HttpError(500, 'Хранилище файлов недоступно.');
        $tmp = $dir . '/.up-' . bin2hex(random_bytes(6));
        $out = fopen($tmp, 'wb');
        $ctx = hash_init('sha256');
        $size = 0; $head = '';
        while (!feof($in)) {
            $chunk = fread($in, 1 << 16);
            if ($chunk === false || $chunk === '') break;
            $size += strlen($chunk);
            if ($size > $max) { fclose($out); @unlink($tmp); throw new HttpError(413, 'Файл больше ' . App::$config['max_asset_mb'] . ' МБ.'); }
            if (strlen($head) < 1024) $head .= substr($chunk, 0, 1024 - strlen($head));
            hash_update($ctx, $chunk);
            fwrite($out, $chunk);
        }
        fclose($out);
        if (hash_final($ctx) !== $sha) { @unlink($tmp); throw new HttpError(422, 'Хэш файла не совпал: файл повреждён при передаче.'); }
        $mime = self::sniff($head);
        if (!$mime) { @unlink($tmp); throw new HttpError(415, 'Этот тип файла не поддерживается (нужны PDF, картинки или шрифты).'); }
        if (is_file(self::path($sha))) @unlink($tmp); else rename($tmp, self::path($sha));
        App::q('INSERT IGNORE INTO assets (sha256, mime, bytes, created_by, created_at) VALUES (?,?,?,?,?)', [$sha, $mime, $size, $u['id'], App::now()]);
        return ['sha256' => $sha, 'mime' => $mime, 'bytes' => $size];
    }

    /* GET assets/{sha}: участникам проекта, где этот файл используется, или по ссылке доступа (?link=). */
    public static function download(array $p): ?array
    {
        $sha = $p['sha'];
        if (!self::validSha($sha)) throw new HttpError(404, 'Файл не найден.');
        $u = Auth::current();
        $ok = false;
        if ($u) {
            $ok = $u['role'] === 'admin' || (bool)App::one(
                'SELECT 1 FROM project_assets pa JOIN projects p ON p.id = pa.project_id LEFT JOIN project_shares s ON s.project_id = p.id AND s.user_id = ?
                 WHERE pa.sha256 = ? AND (p.owner_id = ? OR s.id IS NOT NULL) LIMIT 1', [$u['id'], $sha, $u['id']])
                || (bool)App::one('SELECT 1 FROM assets WHERE sha256 = ? AND created_by = ?', [$sha, $u['id']]);
        }
        if (!$ok && isset($_GET['link']) && is_string($_GET['link'])) {
            $ok = (bool)App::one('SELECT 1 FROM project_shares s JOIN project_assets pa ON pa.project_id = s.project_id WHERE s.token_hash = ? AND pa.sha256 = ? AND (s.expires_at IS NULL OR s.expires_at > ?)',
                [hash('sha256', $_GET['link']), $sha, App::now()]);
        }
        $row = $ok ? App::one('SELECT mime, bytes FROM assets WHERE sha256 = ?', [$sha]) : null;
        $file = self::path($sha);
        if (!$row || !is_file($file)) throw new HttpError(404, 'Файл не найден.');
        // Отдаём как двоичные данные: клиент сам превращает их в картинку/шрифт, браузер ничего не исполняет (SVG в том числе).
        header('Content-Type: application/octet-stream');
        header('X-XS-Mime: ' . $row['mime']);
        header('Content-Length: ' . filesize($file));
        header('Cache-Control: private, max-age=31536000, immutable');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        header('Content-Disposition: attachment; filename="' . $sha . '"');
        readfile($file);
        return null;
    }

    /* Удаляет файлы, на которые не ссылается ни один проект (и которым больше суток). */
    public static function gc(): int
    {
        $n = 0;
        foreach (App::all('SELECT a.sha256 FROM assets a LEFT JOIN project_assets pa ON pa.sha256 = a.sha256 WHERE pa.sha256 IS NULL AND a.created_at < ?', [App::now(-86400)]) as $r) {
            @unlink(self::path($r['sha256']));
            App::q('DELETE FROM assets WHERE sha256 = ?', [$r['sha256']]);
            $n++;
        }
        return $n;
    }
}
