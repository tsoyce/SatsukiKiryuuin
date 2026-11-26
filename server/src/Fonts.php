<?php
/* XSatsu Студия · шрифты Google Fonts для редактора.
 * Браузер получает от Google только «нарезанные» по алфавитам WOFF2 (кириллица и латиница — разными файлами),
 * а для вёрстки и PDF Студии нужен один целый файл. Сервер запрашивает у Google CSS так же, как старый браузер,
 * получает ссылку на целый TTF нужного начертания, скачивает его и кэширует на диске.
 * Адреса жёстко ограничены fonts.googleapis.com и fonts.gstatic.com; имя семейства — только буквы, цифры и пробелы. */
declare(strict_types=1);

namespace XSatsu;

final class Fonts
{
    private const CSS = 'https://fonts.googleapis.com/css2';
    private const MAX_FONT = 15 * 1024 * 1024;
    private const CACHE_LIMIT = 400 * 1024 * 1024;

    public static function dir(): string { return rtrim((string)App::$config['storage_dir'], '/') . '/font-cache'; }

    /* Проверка параметров: возвращает [семейство, вес, курсив] или бросает 422. */
    public static function params(array $q): array
    {
        $family = trim((string)($q['family'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 ]{0,62}$/', $family)) throw new HttpError(422, 'Неверное название шрифта.');
        $weight = (int)($q['weight'] ?? 400);
        if ($weight < 100 || $weight > 900 || $weight % 100) throw new HttpError(422, 'Неверная насыщенность шрифта (100…900).');
        $italic = ($q['italic'] ?? '0') === '1';
        return [preg_replace('/ +/', ' ', $family), $weight, $italic];
    }

    /* GET v1/fonts/google?family=Rubik&weight=700&italic=1 → TTF (двоичные данные). */
    public static function google(): ?array
    {
        [$family, $weight, $italic] = self::params($_GET);
        $key = sha1(strtolower($family) . '|' . $weight . '|' . ($italic ? 1 : 0));
        $file = self::dir() . '/' . $key . '.ttf';
        if (!is_file($file)) {
            $spec = $italic ? 'ital,wght@1,' . $weight : 'wght@' . $weight;
            $css = self::fetch(self::CSS . '?family=' . rawurlencode($family) . ':' . $spec, 200 * 1024);
            if ($css === null) {
                // Семейство без выбора насыщенности (только 400) — пробуем без оси.
                if ($weight === 400 && !$italic) $css = self::fetch(self::CSS . '?family=' . rawurlencode($family), 200 * 1024);
                if ($css === null) throw new HttpError(404, 'У шрифта «' . $family . '» нет такого начертания в Google Fonts.');
            }
            if (!preg_match('#url\((https://fonts\.gstatic\.com/[A-Za-z0-9_./\-]+\.(?:ttf|otf))\)#', $css, $m)) throw new HttpError(502, 'Google Fonts не дал файл шрифта.');
            $bytes = self::fetch($m[1], self::MAX_FONT);
            if ($bytes === null) throw new HttpError(502, 'Не удалось скачать шрифт из Google Fonts.');
            $mime = Assets::sniff(substr($bytes, 0, 16));
            if ($mime !== 'font/ttf' && $mime !== 'font/otf') throw new HttpError(502, 'Google Fonts прислал не шрифт.');
            self::store($file, $bytes);
            if (!is_file($file)) return self::send($bytes, $family, $weight, $italic);
        }
        return self::send((string)file_get_contents($file), $family, $weight, $italic);
    }

    private static function send(string $bytes, string $family, int $weight, bool $italic): ?array
    {
        if (function_exists('ini_set')) @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) @ob_end_clean();
        header('Content-Type: application/octet-stream');
        header('X-XS-Mime: ' . (str_starts_with($bytes, 'OTTO') ? 'font/otf' : 'font/ttf'));
        header('X-XS-Font: ' . rawurlencode($family) . ';' . $weight . ';' . ($italic ? 'italic' : 'normal'));
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: public, max-age=2592000');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        echo $bytes;
        return null;
    }

    private static function store(string $file, string $bytes): void
    {
        $dir = dirname($file);
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return;
        $size = 0;
        foreach (glob($dir . '/*.ttf') ?: [] as $f) $size += (int)@filesize($f);
        if ($size + strlen($bytes) > self::CACHE_LIMIT) return; // кэш полон — отдаём без сохранения
        $tmp = $file . '.' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $bytes) === strlen($bytes)) @rename($tmp, $file); else @unlink($tmp);
    }

    /* Запрос без User-Agent браузера: так Google отдаёт целые TTF, а не WOFF2 по алфавитам. */
    private static function fetch(string $url, int $max): ?string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            $buf = '';
            curl_setopt_array($ch, [
                CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40,
                CURLOPT_USERAGENT => 'XSatsu-Studio', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$buf, $max) { $buf .= $chunk; return strlen($buf) > $max ? 0 : strlen($chunk); },
            ]);
            $ok = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            return $ok && $code === 200 && strlen($buf) <= $max ? $buf : null;
        }
        $ctx = stream_context_create(['http' => ['timeout' => 40, 'follow_location' => 0, 'user_agent' => 'XSatsu-Studio', 'ignore_errors' => true]]);
        $data = @file_get_contents($url, false, $ctx, 0, $max + 1);
        $status = $http_response_header[0] ?? '';
        return is_string($data) && strlen($data) <= $max && preg_match('#^HTTP/\S+ 200#', $status) ? $data : null;
    }
}
