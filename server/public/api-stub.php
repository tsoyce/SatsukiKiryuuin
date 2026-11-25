<?php
/* Заглушка для web-root: сайт/api/index.php. Подключает сервер, который лежит вне web-root.
 * Путь XS_SERVER_DIR подставляет скрипт выкладки (tools/deploy/build-release.sh). */
require '__XS_SERVER_DIR__/public/index.php';
