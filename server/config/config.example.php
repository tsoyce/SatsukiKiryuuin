<?php
/* XSatsu Студия · настройки сервера. Скопируйте в config.php (вне web-root, не в git).
 * Переменные окружения XS_* перекрывают значения из файла. */
return [
    'env' => 'production',                       // production | dev
    'public_origin' => 'https://o.utmns.ru',     // для проверки Origin у запросов, меняющих данные
    'db' => [
        'dsn' => 'mysql:host=127.0.0.1;port=3306;dbname=xsatsu;charset=utf8mb4',
        'user' => 'xsatsu',
        'password' => 'СМЕНИТЕ',
    ],
    'storage_dir' => '/home/tsoy/xsatsu/storage', // файлы фонов, картинок и шрифтов (по sha256); вне web-root
    'setup_token' => '',                         // код для создания первого администратора на сайте; после — можно убрать
    'session_days' => 14,
    'cookie_secure' => true,                     // false только для http://localhost
    'max_asset_mb' => 50,
    'max_doc_mb' => 16,
    'revisions_keep' => 100,                     // сколько версий хранить на проект
    'revision_every_minutes' => 10,              // автосохранение создаёт версию не чаще, чем раз в N минут
];
