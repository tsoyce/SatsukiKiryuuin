-- XSatsu Студия · начальная схема (MariaDB 10.6+ / MySQL 8). Время — UTC.
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(100) NOT NULL,
  name VARCHAR(190) NOT NULL DEFAULT '',
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  UNIQUE KEY uq_users_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) NOT NULL PRIMARY KEY,           -- sha256 от токена в cookie
  user_id INT UNSIGNED NOT NULL,
  csrf CHAR(43) NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_exp (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  login VARCHAR(100) NOT NULL,
  at DATETIME NOT NULL,
  ok TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_attempts_ip (ip, at),
  KEY ix_attempts_login (login, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invites (
  code_hash CHAR(64) NOT NULL PRIMARY KEY,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  note VARCHAR(190) NOT NULL DEFAULT '',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  used_by INT UNSIGNED NULL,
  used_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  owner_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  kind VARCHAR(20) NOT NULL DEFAULT 'custom',
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  doc LONGTEXT NOT NULL,
  thumb MEDIUMTEXT NULL,
  rows_count INT UNSIGNED NOT NULL DEFAULT 0,
  sides_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
  page_w DECIMAL(8,2) NOT NULL DEFAULT 0,
  page_h DECIMAL(8,2) NOT NULL DEFAULT 0,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  updated_by INT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  KEY ix_projects_owner (owner_id, deleted_at, updated_at),
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_revisions (
  project_id VARCHAR(64) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  doc_gz LONGBLOB NOT NULL,
  author_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, revision),
  CONSTRAINT fk_revisions_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_shares (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  user_id INT UNSIGNED NULL,
  token_hash CHAR(64) NULL,
  permission ENUM('view','edit') NOT NULL DEFAULT 'view',
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  UNIQUE KEY uq_share_user (project_id, user_id),
  UNIQUE KEY uq_share_token (token_hash),
  KEY ix_share_user (user_id),
  CONSTRAINT fk_shares_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  sha256 CHAR(64) NOT NULL PRIMARY KEY,
  mime VARCHAR(100) NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_assets (
  project_id VARCHAR(64) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  PRIMARY KEY (project_id, sha256),
  KEY ix_pa_sha (sha256),
  CONSTRAINT fk_pa_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  scope ENUM('system','user') NOT NULL,
  scope_id INT UNSIGNED NOT NULL DEFAULT 0,
  k VARCHAR(64) NOT NULL,
  v MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (scope, scope_id, k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  at DATETIME NOT NULL,
  actor_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  target_type VARCHAR(20) NOT NULL DEFAULT '',
  target_id VARCHAR(64) NOT NULL DEFAULT '',
  detail TEXT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  KEY ix_audit_at (at),
  KEY ix_audit_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
