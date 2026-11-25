-- XSatsu Студия 4 · анкеты регистрации: гость заполняет форму по ссылке, ответ становится записью проекта.
CREATE TABLE IF NOT EXISTS project_forms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  token VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT '',
  intro TEXT NULL,
  fields TEXT NOT NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  max_responses INT UNSIGNED NULL,
  closes_at DATETIME NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_forms_token (token),
  KEY ix_forms_project (project_id),
  CONSTRAINT fk_forms_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS form_responses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  form_id INT UNSIGNED NOT NULL,
  answers TEXT NOT NULL,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  imported_at DATETIME NULL,
  KEY ix_responses_form (form_id, imported_at),
  KEY ix_responses_ip (form_id, ip, created_at),
  CONSTRAINT fk_responses_form FOREIGN KEY (form_id) REFERENCES project_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
