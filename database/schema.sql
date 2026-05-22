CREATE TABLE IF NOT EXISTS app_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    surveyor_id INT UNSIGNED NULL,
    application_id INT UNSIGNED NULL,
    account_status VARCHAR(30) NOT NULL DEFAULT 'approved',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surveyor_applications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    document_number VARCHAR(20) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    address VARCHAR(255) NOT NULL,
    parish VARCHAR(120) NOT NULL,
    canton VARCHAR(120) NOT NULL,
    requested_zone VARCHAR(120) NOT NULL,
    prior_experience TEXT NOT NULL,
    review_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    review_notes TEXT NULL,
    reviewed_by_user_id INT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    approved_surveyor_id INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surveyors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    document_number VARCHAR(20) NOT NULL UNIQUE,
    assigned_zone VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Activo',
    phone VARCHAR(30) NULL,
    email VARCHAR(150) NULL,
    address VARCHAR(255) NULL,
    parish VARCHAR(120) NULL,
    canton VARCHAR(120) NULL,
    prior_experience TEXT NULL,
    application_id INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS application_documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id INT UNSIGNED NOT NULL,
    doc_type VARCHAR(80) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    stored_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_application_documents_application FOREIGN KEY (application_id) REFERENCES surveyor_applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS surveys (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    client_uuid CHAR(32) NOT NULL UNIQUE,
    sector VARCHAR(50) NOT NULL,
    community VARCHAR(120) NOT NULL,
    survey_date DATETIME NOT NULL,
    survey_status VARCHAR(30) NOT NULL DEFAULT 'sincronizada',
    surveyor_id INT UNSIGNED NOT NULL,
    surveyor_name VARCHAR(150) NULL,
    respondent_gender VARCHAR(30) NOT NULL,
    age_range VARCHAR(30) NOT NULL,
    education_level VARCHAR(60) NULL,
    occupation VARCHAR(120) NOT NULL,
    primary_problem VARCHAR(180) NOT NULL,
    youth_path VARCHAR(180) NOT NULL,
    women_roles JSON NULL,
    water_source VARCHAR(120) NOT NULL,
    has_sewer VARCHAR(60) NOT NULL,
    has_internet VARCHAR(60) NULL,
    road_status VARCHAR(80) NULL,
    household_income VARCHAR(80) NULL,
    political_climate VARCHAR(120) NOT NULL,
    authority_trust VARCHAR(80) NULL,
    social_priority VARCHAR(180) NOT NULL,
    investment_acceptance VARCHAR(120) NOT NULL,
    mine_reopening_perception VARCHAR(120) NOT NULL,
    mine_benefits JSON NULL,
    mine_risks JSON NULL,
    comments TEXT NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    created_by_user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    details_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE app_users
    ADD CONSTRAINT fk_app_users_surveyor FOREIGN KEY (surveyor_id) REFERENCES surveyors(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_app_users_application FOREIGN KEY (application_id) REFERENCES surveyor_applications(id) ON DELETE SET NULL;

ALTER TABLE surveys
    ADD CONSTRAINT fk_surveys_surveyor FOREIGN KEY (surveyor_id) REFERENCES surveyors(id),
    ADD CONSTRAINT fk_surveys_user FOREIGN KEY (created_by_user_id) REFERENCES app_users(id);

ALTER TABLE surveyor_applications
    ADD CONSTRAINT fk_surveyor_applications_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_surveyor_applications_surveyor FOREIGN KEY (approved_surveyor_id) REFERENCES surveyors(id) ON DELETE SET NULL;

ALTER TABLE surveyors
    ADD CONSTRAINT fk_surveyors_application FOREIGN KEY (application_id) REFERENCES surveyor_applications(id) ON DELETE SET NULL;

INSERT INTO app_users (username, display_name, password_hash, role, surveyor_id, application_id, account_status, is_active)
SELECT 'admin_general', 'Administrador General', '$2y$10$KmD6XjNX8OXNUsktTb.67esk/eNR74nteDky4NnNp3MGbh9bslOPC', 'admin', NULL, NULL, 'approved', 1
WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE username = 'admin_general');
