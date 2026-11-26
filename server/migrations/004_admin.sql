-- XSatsu Студия 4.2 · админка: заметка и квота пользователя, временный пароль (сменить при входе), причина блокировки,
-- многоразовые приглашения, индексы журнала для фильтров, учёт фоновых задач (резервная копия, обслуживание).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS note VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quota_mb INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(190) NULL,
  ADD COLUMN IF NOT EXISTS blocked_at DATETIME NULL;

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS max_uses SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uses SMALLINT UNSIGNED NOT NULL DEFAULT 0;

UPDATE invites SET uses = 1 WHERE used_at IS NOT NULL AND uses = 0;

ALTER TABLE audit_log
  ADD KEY IF NOT EXISTS ix_audit_actor (actor_id, id),
  ADD KEY IF NOT EXISTS ix_audit_action (action, id);

CREATE TABLE IF NOT EXISTS server_jobs (
  name VARCHAR(40) NOT NULL PRIMARY KEY,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  ok TINYINT(1) NULL,
  message VARCHAR(1000) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
