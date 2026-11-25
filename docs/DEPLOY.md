# Выкладка XSatsu Студии с сервером

Студия — статический сайт (`app/`) + небольшой PHP-сервер (`server/`) для аккаунтов и проектов в MariaDB.
Без сервера Студия тоже работает: проекты хранятся в браузере.

## Как устроено на o.utmns.ru

```
/home/tsoy/sites/o.utmns.ru/        web-root (nginx): содержимое app/ + api/index.php (3 строки, подключает сервер)
/home/tsoy/xsatsu/config.php        настройки: пароль базы, код установки (не в git, права 640)
/home/tsoy/xsatsu/server/           код сервера: src/, public/, migrations/, bin/
/home/tsoy/xsatsu/storage/assets/   файлы проектов по SHA-256 (фоны, картинки, шрифты)
/home/tsoy/xsatsu/storage/backups/  резервные копии (bin/backup.php, 14 дней)
База: MariaDB, база xsatsu, пользователь xsatsu@localhost (права только на эту базу)
```

Код сервера и секреты лежат вне web-root, наружу открыт только `api/index.php`.

## Установка и обновление

Одна команда от root на сервере (ключ — на ноутбуке):

```bash
ssh root@45.131.40.141 'curl -fsSL https://raw.githubusercontent.com/tsoyce/SatsukiKiryuuin/<коммит>/tools/deploy/server-install.sh | bash -s <коммит> --with-cron'
```

Скрипт `tools/deploy/server-install.sh`:

1. Находит PHP 8.4 (CLI) из BrainyCP и проверяет `pdo_mysql`.
2. Первый раз создаёт базу и пользователя MariaDB (случайный пароль), `config.php` и **код установки** — печатает его.
3. Обновляет `/home/tsoy/xsatsu/server`, применяет миграции (`bin/migrate.php`).
4. Собирает новый сайт в `o.utmns.ru.new`, меняет местами со старым и удаляет старый.
5. Проверяет `https://o.utmns.ru/api/index.php?r=v1/health`.
6. С `--with-cron` — задачи для tsoy: резервная копия в 03:15, обслуживание в 04:30.

Настройки nginx, BrainyCP и PHP скрипт не меняет.

### Создание базы вручную (если нужно)

```sql
CREATE DATABASE xsatsu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'xsatsu'@'localhost' IDENTIFIED BY '<пароль>';
GRANT ALL PRIVILEGES ON xsatsu.* TO 'xsatsu'@'localhost';
```

Потом `config.php` по образцу `server/config/config.example.php` и `php84 server/bin/migrate.php`.

## Первый вход

1. Откройте https://o.utmns.ru — Студия предложит создать администратора.
2. Введите код установки (его напечатал скрипт, он же в `config.php`, ключ `setup_token`), логин и пароль.
3. «Настройки → Пользователи»: добавьте коллег или создайте коды приглашений. «Настройки → Сайт»: регистрация, корзина, объявление.
4. На главной «В этом браузере → Перенести все в аккаунт» — старые проекты из браузера переедут на сервер.

Другой путь создать администратора: `XS_CONFIG=/home/tsoy/xsatsu/config.php php84 /home/tsoy/xsatsu/server/bin/create-admin.php <логин>`.

## Обслуживание

| Команда | Что делает |
|---|---|
| `php84 server/bin/migrate.php [--status]` | Применить миграции базы |
| `php84 server/bin/backup.php` | Дамп базы + файлы → `storage/backups/*.tar.gz`, старше 14 дней удаляются |
| `php84 server/bin/cleanup.php` | Корзина старше срока, просроченные сессии, неиспользуемые файлы |
| `php84 server/bin/create-admin.php <логин>` | Администратор из консоли |

Откат: проекты в базе не зависят от версии сайта; для отката кода — снова `server-install.sh <старый коммит>`.

## Локальная разработка

```bash
XS_DB_DSN='mysql:host=127.0.0.1;dbname=xsatsu_dev;charset=utf8mb4' XS_DB_USER=… XS_DB_PASSWORD=… \
XS_STORAGE_DIR=/tmp/xs XS_SETUP_TOKEN=dev XS_COOKIE_SECURE=0 XS_CONFIG=/none \
php -S 127.0.0.1:8091 -t app tools/dev-router.php
```

Тесты: `node tests/core.test.cjs` (ядро), `node tests/api.test.cjs` (API; нужна MariaDB, см. начало файла).
