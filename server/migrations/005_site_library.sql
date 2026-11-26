-- XSatsu Студия 4.3 · библиотека сайта: шаблоны (снимок проекта, который админ опубликовал для всех) и шрифты сайта.
-- Файлы шаблонов и шрифтов хранятся как обычные assets; связи ниже защищают их от очистки и открывают для скачивания всем.
CREATE TABLE IF NOT EXISTS site_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  kind VARCHAR(20) NOT NULL DEFAULT 'custom',
  doc LONGTEXT NOT NULL,
  thumb MEDIUMTEXT NULL,
  page_w DECIMAL(8,2) NOT NULL DEFAULT 0,
  page_h DECIMAL(8,2) NOT NULL DEFAULT 0,
  source_project VARCHAR(64) NULL,
  published TINYINT(1) NOT NULL DEFAULT 1,
  sort INT NOT NULL DEFAULT 0,
  uses INT UNSIGNED NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY ix_templates_pub (published, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_template_assets (
  template_id INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  PRIMARY KEY (template_id, sha256),
  KEY ix_sta_sha (sha256),
  CONSTRAINT fk_sta_template FOREIGN KEY (template_id) REFERENCES site_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_fonts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  family VARCHAR(100) NOT NULL,
  variant ENUM('regular','bold','italic','bolditalic') NOT NULL DEFAULT 'regular',
  category VARCHAR(20) NOT NULL DEFAULT '',
  name VARCHAR(190) NOT NULL DEFAULT '',
  sha256 CHAR(64) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_site_font (family, variant),
  KEY ix_site_font_sha (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
