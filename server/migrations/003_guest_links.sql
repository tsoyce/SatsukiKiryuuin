-- XSatsu Студия 4.1 · гостевые ссылки: просмотр или правка без входа, подпись «для кого», учёт открытий и правок,
-- подпись автора правки в версиях (гость без аккаунта), ограничение частоты запросов по IP.
ALTER TABLE project_shares
  ADD COLUMN IF NOT EXISTS label VARCHAR(100) NULL AFTER permission,
  ADD COLUMN IF NOT EXISTS last_used_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS opens INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edits INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE project_revisions ADD COLUMN IF NOT EXISTS author_label VARCHAR(120) NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by_label VARCHAR(120) NULL;

CREATE TABLE IF NOT EXISTS rate_hits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bucket VARCHAR(40) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  at DATETIME NOT NULL,
  KEY ix_rate (bucket, ip, at),
  KEY ix_rate_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
