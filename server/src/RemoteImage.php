<?php
/* XSatsu Студия · картинка по ссылке через сервер.
 * Браузер не может положить чужую картинку (без CORS) в canvas и PDF: холст «загрязняется», выгрузка падает.
 * Сервер скачивает картинку сам и отдаёт байты Студии, а Студия хранит их в проекте как обычный файл.
 *
 * Защита от SSRF (чтобы через Студию нельзя было достучаться до внутренних адресов сервера):
 *  — только http/https, порты 80 и 443, без логина в адресе;
 *  — все IP, в которые разрешается имя, должны быть публичными (не localhost, не 10/8, 172.16/12, 192.168/16,
 *    100.64/10, link-local, multicast, IPv6 ULA и т. п.); соединение идёт ровно на проверенный IP (CURLOPT_RESOLVE),
 *    поэтому подмена DNS между проверкой и запросом не сработает;
 *  — переадресации (до 4) не идут автоматически: каждая проверяется заново;
 *  — не больше 15 МБ и 25 секунд; ответ должен быть картинкой по сигнатуре (PNG, JPEG, GIF, WebP, SVG);
 *  — только для вошедших пользователей. */
declare(strict_types=1);

namespace XSatsu;

final class RemoteImage
{
    private const MAX = 15 * 1024 * 1024;
    private const REDIRECTS = 4;

    /* GET v1/images/fetch?url=… → байты картинки (X-XS-Mime, X-XS-Name). */
    public static function fetch(): ?array
    {
        Auth::user();
        $url = trim((string)($_GET['url'] ?? ''));
        if ($url === '' || strlen($url) > 2048) throw new HttpError(422, 'Нужна ссылка на картинку.');
        if (!function_exists('curl_init')) throw new HttpError(501, 'На сервере нет curl: скачайте картинку и загрузите файлом.');
        for ($hop = 0; $hop <= self::REDIRECTS; $hop++) {
            [$host, $port, $ip] = self::check($url);
            $r = self::get($url, $host, $port, $ip);
            if ($r['code'] >= 300 && $r['code'] < 400 && $r['location'] !== '') { $url = self::resolve($url, $r['location']); continue; }
            if ($r['code'] !== 200) throw new HttpError(502, 'Сайт ответил ' . ($r['code'] ?: 'ошибкой') . ': картинку по ссылке не скачать.');
            if ($r['tooBig']) throw new HttpError(413, 'Картинка больше 15 МБ.');
            $mime = Assets::sniff(substr($r['body'], 0, 512));
            if (!$mime || !str_starts_with($mime, 'image/')) {
                $html = preg_match('/^\s*(<!doctype html|<html|<head|<body)/i', substr($r['body'], 0, 512));
                throw new HttpError(422, $html ? 'По ссылке — страница, а не картинка. Откройте картинку и скопируйте «адрес изображения».' : 'По ссылке не картинка (нужны JPEG, PNG, WebP, GIF или SVG).');
            }
            return self::send($r['body'], $mime, $url);
        }
        throw new HttpError(502, 'Слишком много переадресаций.');
    }

    /* Проверка адреса → [host, port, ip]. */
    public static function check(string $url): array
    {
        $p = parse_url($url);
        $scheme = strtolower((string)($p['scheme'] ?? ''));
        if (!in_array($scheme, ['http', 'https'], true) || empty($p['host'])) throw new HttpError(422, 'Ссылка должна начинаться с http:// или https://.');
        if (isset($p['user']) || isset($p['pass'])) throw new HttpError(422, 'Ссылки с логином и паролем не поддерживаются.');
        $port = (int)($p['port'] ?? ($scheme === 'https' ? 443 : 80));
        if ($port !== 80 && $port !== 443) throw new HttpError(422, 'Разрешены только обычные порты 80 и 443.');
        $host = strtolower(trim((string)$p['host'], '[]'));
        if (filter_var($host, FILTER_VALIDATE_IP)) $ips = [$host];
        else {
            // числовые записи адреса (2130706433, 0x7f.1, 0177.0.0.1) — это IP в обход проверки, не имя сайта
            if (preg_match('/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/', $host)) throw new HttpError(422, 'Недопустимый адрес сайта.');
            if (!preg_match('/^[a-z0-9.-]+$/', $host) || !str_contains($host, '.') || preg_match('/\.(local|localhost|internal|lan|home|corp)$/', $host) || $host === 'localhost') throw new HttpError(422, 'Недопустимый адрес сайта.');
            $ips = self::lookup($host);
            if (!$ips) throw new HttpError(422, 'Сайт «' . $host . '» не найден.');
        }
        foreach ($ips as $ip) if (!self::isPublic($ip)) throw new HttpError(422, 'Ссылка ведёт во внутреннюю сеть — такие адреса запрещены.');
        return [$host, $port, $ips[0]];
    }

    public static function isPublic(string $ip): bool
    {
        if (str_starts_with(strtolower($ip), '::ffff:')) $ip = substr($ip, 7); // IPv4, записанный как IPv6
        $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
        if (defined('FILTER_FLAG_GLOBAL_RANGE')) $flags |= FILTER_FLAG_GLOBAL_RANGE; // PHP 8.2+: ещё 100.64/10, 192.0.0/24, документация…
        if (!filter_var($ip, FILTER_VALIDATE_IP, $flags)) return false;
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $n = ip2long($ip);
            foreach ([['0.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 3]] as [$net, $bits]) {
                $mask = -1 << (32 - $bits);
                if (($n & $mask) === (ip2long($net) & $mask)) return false;
            }
            return true;
        }
        $bin = inet_pton($ip);
        if ($bin === false) return false;
        $first = ord($bin[0]);
        if (($first & 0xFE) === 0xFC) return false;                       // fc00::/7 — локальные
        if ($first === 0xFE && (ord($bin[1]) & 0xC0) === 0x80) return false; // fe80::/10 — link-local
        if ($first === 0xFF) return false;                                 // multicast
        if ($bin === str_repeat("\0", 15) . "\1" || $bin === str_repeat("\0", 16)) return false;
        return true;
    }

    private static function lookup(string $host): array
    {
        $ips = [];
        foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $r) { if (!empty($r['ip'])) $ips[] = $r['ip']; if (!empty($r['ipv6'])) $ips[] = $r['ipv6']; }
        if (!$ips) $ips = @gethostbynamel($host) ?: [];
        $ips = array_values(array_unique($ips));
        usort($ips, fn($a, $b) => (int)str_contains($a, ':') <=> (int)str_contains($b, ':')); // сначала IPv4
        return $ips;
    }

    private static function get(string $url, string $host, int $port, string $ip): array
    {
        $ch = curl_init($url);
        $body = ''; $tooBig = false; $location = '';
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 25,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_RESOLVE => [$host . ':' . $port . ':' . (str_contains($ip, ':') ? '[' . $ip . ']' : $ip)],
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; XSatsu-Studio image fetch)',
            CURLOPT_HTTPHEADER => ['Accept: image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'],
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$location) {
                if (preg_match('/^location:\s*(\S+)/i', trim($line), $m)) $location = $m[1];
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, &$tooBig) {
                $body .= $chunk;
                if (strlen($body) > self::MAX) { $tooBig = true; return 0; }
                return strlen($chunk);
            },
        ]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        return ['code' => $code, 'body' => $body, 'tooBig' => $tooBig, 'location' => $location];
    }

    /* Относительная переадресация → полный адрес. */
    private static function resolve(string $base, string $loc): string
    {
        if (preg_match('#^https?://#i', $loc)) return $loc;
        $p = parse_url($base);
        $root = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
        if (str_starts_with($loc, '//')) return $p['scheme'] . ':' . $loc;
        if (str_starts_with($loc, '/')) return $root . $loc;
        $dir = preg_replace('#/[^/]*$#', '/', $p['path'] ?? '/');
        return $root . $dir . $loc;
    }

    private static function send(string $bytes, string $mime, string $url): ?array
    {
        if (function_exists('ini_set')) @ini_set('zlib.output_compression', '0');
        while (ob_get_level() > 0) @ob_end_clean();
        $name = rawurldecode(basename((string)(parse_url($url, PHP_URL_PATH) ?: 'image')));
        header('Content-Type: application/octet-stream');
        header('X-XS-Mime: ' . $mime);
        header('X-XS-Name: ' . rawurlencode(mb_substr($name !== '' ? $name : 'image', 0, 120)));
        header('Content-Length: ' . strlen($bytes));
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        echo $bytes;
        return null;
    }
}
