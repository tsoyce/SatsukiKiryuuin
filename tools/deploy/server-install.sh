#!/usr/bin/env bash
# XSatsu Студия · установка/обновление на сервере (запускать от root по SSH).
#   bash server-install.sh <коммит-или-ветка> [--with-cron]
# Что делает:
#   1. Скачивает код из GitHub (репозиторий публичный) нужного коммита.
#   2. Первый раз: создаёт базу MariaDB xsatsu и пользователя xsatsu@localhost со случайным паролем,
#      /home/tsoy/xsatsu/config.php (пароль базы, код установки), каталог хранилища.
#   3. Кладёт сервер в /home/tsoy/xsatsu/server и применяет миграции (php 8.4 из BrainyCP).
#   4. Собирает новый сайт в o.utmns.ru.new (Студия + api/index.php), меняет местами со старым, старый удаляет.
#   5. Проверяет https://o.utmns.ru/api/index.php?r=v1/health. Если API не отвечает, Студия всё равно работает
#      (проекты в браузере), а скрипт печатает подсказки (например, open_basedir в пуле PHP закрывает /home/tsoy/xsatsu).
#   6. С --with-cron добавляет tsoy задачи: резервная копия 03:15 и обслуживание 04:30.
# Настройки сервера (nginx, BrainyCP, PHP) скрипт не меняет.
set -euo pipefail
REF="${1:?Укажите коммит или ветку}"; WITH_CRON="${2:-}"
OWNER=tsoy; HOME_DIR=/home/tsoy; SITE=$HOME_DIR/sites/o.utmns.ru; BASE=$HOME_DIR/xsatsu
URL=https://o.utmns.ru; REPO=tsoyce/SatsukiKiryuuin
say() { printf '\n== %s\n' "$*"; }

say "PHP 8.4"
PHP=""
for c in /opt/brainycp/php84/bin/php /opt/brainycp/*/php84*/bin/php /usr/local/php84/bin/php /opt/php84/bin/php /usr/bin/php8.4 /opt/remi/php84/root/usr/bin/php; do
  for f in $c; do [ -x "$f" ] && "$f" -r 'exit(PHP_MAJOR_VERSION*10+PHP_MINOR_VERSION>=84?0:1);' 2>/dev/null && PHP=$f && break 2; done
done
if [ -z "$PHP" ]; then
  PHP=$(find / -xdev -maxdepth 6 -type f -name php -path '*84*' 2>/dev/null | while read -r f; do [ -x "$f" ] && "$f" -r 'exit(PHP_MAJOR_VERSION*10+PHP_MINOR_VERSION>=84?0:1);' 2>/dev/null && echo "$f" && break; done)
fi
[ -n "$PHP" ] || { echo "Не найден PHP 8.4 (CLI)."; exit 1; }
echo "$PHP ($("$PHP" -r 'echo PHP_VERSION;'))"
"$PHP" -m | grep -qi pdo_mysql || { echo "В PHP 8.4 нет pdo_mysql — включите расширение в BrainyCP."; exit 1; }

say "Код $REF"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP"
SRC=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)
[ -f "$SRC/app/index.html" ] && [ -f "$SRC/server/public/index.php" ] || { echo "В архиве нет app/ или server/."; exit 1; }

say "База и конфигурация"
mkdir -p "$BASE/storage"
if [ ! -f "$BASE/config.php" ]; then
  DBPASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 28)
  SETUP=$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Z0-9' | head -c 10)
  mysql -e "CREATE DATABASE IF NOT EXISTS xsatsu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER IF NOT EXISTS 'xsatsu'@'localhost' IDENTIFIED BY '$DBPASS';
            ALTER USER 'xsatsu'@'localhost' IDENTIFIED BY '$DBPASS';
            GRANT ALL PRIVILEGES ON xsatsu.* TO 'xsatsu'@'localhost'; FLUSH PRIVILEGES;"
  cat > "$BASE/config.php" <<CFG
<?php
return [
    'env' => 'production',
    'public_origin' => '$URL',
    'db' => ['dsn' => 'mysql:host=localhost;dbname=xsatsu;charset=utf8mb4', 'user' => 'xsatsu', 'password' => '$DBPASS'],
    'storage_dir' => '$BASE/storage',
    'setup_token' => '$SETUP',
    'cookie_secure' => true,
];
CFG
  echo "Создана база xsatsu и $BASE/config.php"
  echo "КОД УСТАНОВКИ (первый администратор на сайте): $SETUP"
else
  echo "config.php уже есть — база не трогается."
fi
chmod 640 "$BASE/config.php"

say "Сервер → $BASE/server"
rm -rf "$BASE/server.new"; cp -r "$SRC/server" "$BASE/server.new"
rm -rf "$BASE/server.old"; [ -d "$BASE/server" ] && mv "$BASE/server" "$BASE/server.old"
mv "$BASE/server.new" "$BASE/server"; rm -rf "$BASE/server.old"
chown -R $OWNER:$OWNER "$BASE"; chmod 750 "$BASE" "$BASE/storage"
sudo -u $OWNER XS_CONFIG="$BASE/config.php" "$PHP" "$BASE/server/bin/migrate.php"

build_site() { # api/index.php подключает сервер из $BASE/server; config.php ищется рядом с server/ — это $BASE/config.php
  rm -rf "$SITE.new"; cp -r "$SRC/app" "$SITE.new"; mkdir -p "$SITE.new/api"
  sed "s#__XS_SERVER_DIR__#$BASE/server#" "$SRC/server/public/api-stub.php" > "$SITE.new/api/index.php"
}
swap_site() {
  chown -R $OWNER:$OWNER "$SITE.new"; find "$SITE.new" -type d -exec chmod 755 {} +; find "$SITE.new" -type f -exec chmod 644 {} +
  rm -rf "$SITE.old"; mv "$SITE" "$SITE.old"; mv "$SITE.new" "$SITE"; rm -rf "$SITE.old"
}
health() { curl -fsS --max-time 20 "$URL/api/index.php?r=v1/health" || true; }

say "Сайт"
build_site
swap_site
sleep 1; H=$(health); echo "$H"
echo "$H" | grep -q '"ok":true' && echo "Готово: Студия и API работают." || { echo "ВНИМАНИЕ: API не отвечает. Студия работает без сервера (проекты в браузере)."; grep -rh "open_basedir" /etc/php* /opt/brainycp 2>/dev/null | grep -i tsoy | head -3 || true; }
curl -fsS -o /dev/null -w "Главная: %{http_code}\n" "$URL/"

if [ "$WITH_CRON" = "--with-cron" ]; then
  say "cron для $OWNER"
  ( crontab -u $OWNER -l 2>/dev/null | grep -v 'xsatsu/server/bin/' ;
    echo "15 3 * * * XS_CONFIG=$BASE/config.php $PHP $BASE/server/bin/backup.php >> $BASE/storage/cron.log 2>&1";
    echo "30 4 * * * XS_CONFIG=$BASE/config.php $PHP $BASE/server/bin/cleanup.php >> $BASE/storage/cron.log 2>&1" ) | crontab -u $OWNER -
  crontab -u $OWNER -l | grep xsatsu
fi
