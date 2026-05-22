ALTER TABLE app_users ADD COLUMN application_id INT UNSIGNED NULL AFTER surveyor_id;
ALTER TABLE app_users ADD COLUMN account_status VARCHAR(30) NOT NULL DEFAULT 'approved' AFTER application_id;

ALTER TABLE surveyors ADD COLUMN phone VARCHAR(30) NULL AFTER status;
ALTER TABLE surveyors ADD COLUMN email VARCHAR(150) NULL AFTER phone;
ALTER TABLE surveyors ADD COLUMN address VARCHAR(255) NULL AFTER email;
ALTER TABLE surveyors ADD COLUMN parish VARCHAR(120) NULL AFTER address;
ALTER TABLE surveyors ADD COLUMN canton VARCHAR(120) NULL AFTER parish;
ALTER TABLE surveyors ADD COLUMN prior_experience TEXT NULL AFTER canton;
ALTER TABLE surveyors ADD COLUMN application_id INT UNSIGNED NULL AFTER prior_experience;

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

CREATE TABLE IF NOT EXISTS application_documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id INT UNSIGNED NOT NULL,
    doc_type VARCHAR(80) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    stored_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

ALTER TABLE surveys ADD COLUMN survey_status VARCHAR(30) NOT NULL DEFAULT 'sincronizada' AFTER survey_date;

UPDATE app_users SET account_status = 'approved' WHERE role = 'admin';
UPDATE app_users SET account_status = 'approved' WHERE role = 'surveyor' AND (account_status IS NULL OR account_status = '');
