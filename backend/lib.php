<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

session_name($config['app']['session_name']);
session_start();

function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function ensure_schema_updates(PDO $pdo): void
{
    static $updated = false;
    if ($updated) return;
    $updated = true;

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM surveys");
        $columns = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'Field');

        $newColumns = [
            'has_septic'          => 'VARCHAR(60)  NULL DEFAULT NULL',
            'road_who_fixes'      => 'VARCHAR(150) NULL DEFAULT NULL',
            'knows_mining_types'  => 'VARCHAR(60)  NULL DEFAULT NULL',
            'knows_mining_benefits'=> 'VARCHAR(60) NULL DEFAULT NULL',
            'knows_modern_mining' => 'VARCHAR(80)  NULL DEFAULT NULL',
            'knows_local_mines'   => 'VARCHAR(60)  NULL DEFAULT NULL',
            'knows_env_guarantees'=> 'VARCHAR(60)  NULL DEFAULT NULL',
        ];

        foreach ($newColumns as $col => $definition) {
            if (!in_array($col, $columns)) {
                $pdo->exec("ALTER TABLE surveys ADD COLUMN `$col` $definition");
            }
        }

        // Aseguramos que todas las columnas de respuesta acepten NULL o string vacío
        // Esto permite guardar encuestas con preguntas sin contestar
        $nullableColumns = [
            'sector'                 => "VARCHAR(120) NOT NULL DEFAULT ''",
            'community'              => "VARCHAR(150) NOT NULL DEFAULT ''",
            'surveyor_name'          => "VARCHAR(120) NOT NULL DEFAULT ''",
            'respondent_name'        => "VARCHAR(120) NOT NULL DEFAULT ''",
            'respondent_last_name'   => "VARCHAR(120) NOT NULL DEFAULT ''",
            'respondent_id_document' => "VARCHAR(20)  NOT NULL DEFAULT ''",
            'respondent_email'       => "VARCHAR(150) NOT NULL DEFAULT ''",
            'respondent_phone'       => "VARCHAR(20)  NOT NULL DEFAULT ''",
            'respondent_gender'      => "VARCHAR(30)  NOT NULL DEFAULT ''",
            'age_range'              => "VARCHAR(30)  NOT NULL DEFAULT ''",
            'education_level'        => "VARCHAR(60)  NOT NULL DEFAULT ''",
            'occupation'             => "VARCHAR(120) NOT NULL DEFAULT ''",
            'primary_problem'        => "TEXT         NOT NULL DEFAULT ''",
            'youth_path'             => "VARCHAR(120) NOT NULL DEFAULT ''",
            'water_source'           => "VARCHAR(80)  NOT NULL DEFAULT ''",
            'has_sewer'              => "VARCHAR(30)  NOT NULL DEFAULT ''",
            'has_septic'             => "VARCHAR(60)  NOT NULL DEFAULT ''",
            'has_internet'           => "VARCHAR(60)  NOT NULL DEFAULT ''",
            'road_status'            => "VARCHAR(80)  NOT NULL DEFAULT ''",
            'road_who_fixes'         => "VARCHAR(150) NOT NULL DEFAULT ''",
            'household_income'       => "VARCHAR(80)  NOT NULL DEFAULT ''",
            'political_climate'      => "VARCHAR(80)  NOT NULL DEFAULT ''",
            'authority_trust'        => "VARCHAR(80)  NOT NULL DEFAULT ''",
            'social_priority'        => "TEXT         NOT NULL DEFAULT ''",
            'investment_acceptance'  => "VARCHAR(30)  NOT NULL DEFAULT ''",
            'mine_reopening_perception' => "VARCHAR(80) NOT NULL DEFAULT ''",
            'comments'               => "TEXT         NOT NULL DEFAULT ''",
            'knows_mining_types'     => "VARCHAR(60)  NOT NULL DEFAULT ''",
            'knows_mining_benefits'  => "VARCHAR(60)  NOT NULL DEFAULT ''",
            'knows_modern_mining'    => "VARCHAR(80)  NOT NULL DEFAULT ''",
            'knows_local_mines'      => "VARCHAR(60)  NOT NULL DEFAULT ''",
            'knows_env_guarantees'   => "VARCHAR(60)  NOT NULL DEFAULT ''",
        ];

        foreach ($nullableColumns as $col => $definition) {
            if (in_array($col, $columns)) {
                try {
                    $pdo->exec("ALTER TABLE surveys MODIFY COLUMN `$col` $definition");
                } catch (Exception $e) {
                    // Continuar si una columna falla (permisos, tipo incompatible, etc.)
                }
            }
        }

    } catch (Exception $e) {
        // Ignoramos si falla por falta de permisos o tabla inexistente
    }
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = app_config()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        $db['port'],
        $db['database'],
        $db['charset']
    );

    $pdo = new PDO($dsn, $db['username'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    ensure_schema_updates($pdo);

    return $pdo;
}

function ensure_method(string $expected, string $actual): void
{
    if (strtoupper($expected) !== strtoupper($actual)) {
        respond(['ok' => false, 'message' => 'Metodo no permitido.'], 405);
    }
}

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function require_auth(): void
{
    if (!current_user()) {
        respond(['ok' => false, 'message' => 'Sesion no autenticada.'], 401);
    }
}

function require_admin(): void
{
    require_auth();
    if ((current_user()['role'] ?? '') !== 'admin') {
        respond(['ok' => false, 'message' => 'Solo el administrador puede ejecutar esta accion.'], 403);
    }
}

function user_can_access_dashboard(): bool
{
    $user = current_user();
    if (!$user) {
        return false;
    }

    if (($user['role'] ?? '') === 'admin') {
        return true;
    }

    return ($user['role'] ?? '') === 'surveyor' && ($user['account_status'] ?? '') === 'approved';
}

function current_assigned_surveyor(): ?array
{
    $user = current_user();
    if (!$user || empty($user['surveyor_id'])) {
        return null;
    }

    return get_surveyor_by_id((int) $user['surveyor_id']);
}

function login_user(array $input): array
{
    $username = trim((string) ($input['username'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    if ($username === '' || $password === '') {
        throw new InvalidArgumentException('Usuario y clave son obligatorios.');
    }

    $stmt = db()->prepare('
        SELECT id, username, display_name, password_hash, role, surveyor_id, account_status, application_id, is_active
        FROM app_users
        WHERE username = :username
        LIMIT 1
    ');
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        throw new InvalidArgumentException('Credenciales incorrectas.');
    }

    if ((int) $user['is_active'] !== 1) {
        throw new InvalidArgumentException('Tu cuenta se encuentra desactivada. Contacta al administrador.');
    }

    $_SESSION['user'] = [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'display_name' => $user['display_name'],
        'role' => $user['role'],
        'surveyor_id' => $user['surveyor_id'] ? (int) $user['surveyor_id'] : null,
        'account_status' => $user['account_status'],
        'application_id' => $user['application_id'] ? (int) $user['application_id'] : null,
    ];

    log_action((int) $user['id'], 'login', 'app_users', (int) $user['id'], [
        'status' => $user['account_status'],
    ]);

    return current_user();
}

function log_action(?int $userId, string $action, string $entityType, ?int $entityId, array $details = []): void
{
    $stmt = db()->prepare('
        INSERT INTO audit_logs (user_id, action_type, entity_type, entity_id, details_json)
        VALUES (:user_id, :action_type, :entity_type, :entity_id, :details_json)
    ');
    $stmt->execute([
        ':user_id' => $userId,
        ':action_type' => $action,
        ':entity_type' => $entityType,
        ':entity_id' => $entityId,
        ':details_json' => json_encode($details, JSON_UNESCAPED_UNICODE),
    ]);
}

function sanitize_text(mixed $value): string
{
    return trim((string) $value);
}

function ensure_storage_dir(): string
{
    $dir = app_config()['app']['storage_dir'];
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException('No se pudo crear el directorio de almacenamiento.');
    }
    return $dir;
}

function register_application(array $input, array $files): array
{
    $required = [
        'full_name'       => 'Debes ingresar los nombres completos.',
        'document_number' => 'Debes ingresar la cedula.',
        'phone'           => 'Debes ingresar el celular.',
        'email'           => 'Debes ingresar el correo.',
        'address'         => 'Debes ingresar la direccion.',
        'username'        => 'Debes elegir un usuario.',
        'password'        => 'Debes ingresar una clave.',
    ];

    foreach ($required as $field => $message) {
        if (sanitize_text($input[$field] ?? '') === '') {
            throw new InvalidArgumentException($message);
        }
    }

    if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException('El correo electronico no es valido.');
    }

    if (strlen((string) $input['password']) < 8) {
        throw new InvalidArgumentException('La clave debe tener al menos 8 caracteres.');
    }

    // Los documentos son opcionales: el administrador puede solicitarlos al revisar la postulacion

    $username = sanitize_text($input['username']);
    $documentNumber = sanitize_text($input['document_number']);
    $email = sanitize_text($input['email']);

    if (record_exists('app_users', 'username', $username)) {
        throw new InvalidArgumentException('Ese nombre de usuario ya esta registrado.');
    }

    if (record_exists('surveyor_applications', 'document_number', $documentNumber)) {
        throw new InvalidArgumentException('Ya existe una postulacion con esa cedula.');
    }

    if (record_exists('surveyor_applications', 'email', $email)) {
        throw new InvalidArgumentException('Ya existe una postulacion con ese correo.');
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('
            INSERT INTO surveyor_applications (
                full_name, document_number, phone, email, address, parish, canton,
                requested_zone, prior_experience, review_status
            ) VALUES (
                :full_name, :document_number, :phone, :email, :address, :parish, :canton,
                :requested_zone, :prior_experience, :review_status
            )
        ');
        $stmt->execute([
            ':full_name' => sanitize_text($input['full_name']),
            ':document_number' => $documentNumber,
            ':phone' => sanitize_text($input['phone']),
            ':email' => $email,
            ':address' => sanitize_text($input['address']),
            ':parish'            => sanitize_text($input['parish'] ?? 'San Bartolome'),
            ':canton'            => sanitize_text($input['canton'] ?? 'Sigsig'),
            ':requested_zone'    => sanitize_text($input['requested_zone'] ?? 'Por asignar'),
            ':prior_experience'  => sanitize_text($input['experience'] ?? 'Sin especificar'),
            ':review_status'     => 'pending',
        ]);
        $applicationId = (int) $pdo->lastInsertId();

        $userStmt = $pdo->prepare('
            INSERT INTO app_users (
                username, display_name, password_hash, role, surveyor_id,
                account_status, application_id, is_active
            ) VALUES (
                :username, :display_name, :password_hash, :role, NULL,
                :account_status, :application_id, 1
            )
        ');
        $userStmt->execute([
            ':username'      => $username,
            ':display_name'  => sanitize_text($input['full_name']),
            ':password_hash' => password_hash((string) $input['password'], PASSWORD_DEFAULT),
            ':role'          => 'surveyor',
            ':account_status'=> 'pending',
            ':application_id'=> $applicationId,
        ]);
        $userId = (int) $pdo->lastInsertId();

        // Guardar documentos solo si fueron adjuntados
        if (!empty($files['profile_photo']['name'])) {
            store_application_document($applicationId, 'Foto personal', $files['profile_photo']);
        }
        if (!empty($files['id_document']['name'])) {
            store_application_document($applicationId, 'Cedula', $files['id_document']);
        }
        if (!empty($files['support_document']['name'])) {
            store_application_document($applicationId, 'Respaldo adicional', $files['support_document']);
        }

        log_action($userId, 'register_application', 'surveyor_applications', $applicationId, [
            'username' => $username,
        ]);

        $pdo->commit();
    } catch (Throwable $exception) {
        $pdo->rollBack();
        throw $exception;
    }

    return get_application_by_id($applicationId);
}

function record_exists(string $table, string $column, string $value): bool
{
    $sql = sprintf('SELECT 1 FROM %s WHERE %s = :value LIMIT 1', $table, $column);
    $stmt = db()->prepare($sql);
    $stmt->execute([':value' => $value]);
    return (bool) $stmt->fetchColumn();
}

function store_application_document(int $applicationId, string $docType, array $file): void
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException("El archivo '{$docType}' no se pudo subir correctamente.");
    }

    $maxSize = app_config()['app']['max_upload_size'];
    if (($file['size'] ?? 0) > $maxSize) {
        throw new InvalidArgumentException("El archivo '{$docType}' supera el tamano permitido de 5 MB.");
    }

    $mimeType = null;
    if (class_exists('finfo')) {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']) ?: null;
    }
    if (!$mimeType && function_exists('mime_content_type')) {
        $mimeType = mime_content_type($file['tmp_name']) ?: null;
    }
    if (!$mimeType) {
        $extensionGuess = strtolower(pathinfo((string) $file['name'], PATHINFO_EXTENSION));
        $mimeMap = [
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'pdf' => 'application/pdf',
        ];
        $mimeType = $mimeMap[$extensionGuess] ?? 'application/octet-stream';
    }
    $allowed = app_config()['app']['allowed_upload_mime_types'];
    if (!in_array($mimeType, $allowed, true)) {
        throw new InvalidArgumentException("El archivo '{$docType}' debe ser JPG, PNG o PDF.");
    }

    switch ($mimeType) {
        case 'image/jpeg':
            $extension = 'jpg';
            break;
        case 'image/png':
            $extension = 'png';
            break;
        case 'application/pdf':
            $extension = 'pdf';
            break;
        default:
            $extension = 'bin';
            break;
    }

    $storageDir = ensure_storage_dir() . '/applications/' . $applicationId;
    if (!is_dir($storageDir) && !mkdir($storageDir, 0775, true) && !is_dir($storageDir)) {
        throw new RuntimeException('No se pudo preparar el directorio de documentos.');
    }

    $storedName = strtolower(str_replace(' ', '_', $docType)) . '_' . bin2hex(random_bytes(6)) . '.' . $extension;
    $targetPath = $storageDir . '/' . $storedName;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        $tmpName = (string) ($file['tmp_name'] ?? '');
        $uploadDirWritable = is_writable($storageDir) ? 'si' : 'no';
        throw new RuntimeException("No se pudo guardar el archivo '{$docType}'. Tmp: {$tmpName}. Carpeta escribible: {$uploadDirWritable}. Destino: {$targetPath}");
    }

    $stmt = db()->prepare('
        INSERT INTO application_documents (
            application_id, doc_type, original_name, stored_name, stored_path, mime_type, file_size
        ) VALUES (
            :application_id, :doc_type, :original_name, :stored_name, :stored_path, :mime_type, :file_size
        )
    ');
    $stmt->execute([
        ':application_id' => $applicationId,
        ':doc_type' => $docType,
        ':original_name' => $file['name'],
        ':stored_name' => $storedName,
        ':stored_path' => str_replace('\\', '/', $targetPath),
        ':mime_type' => $mimeType,
        ':file_size' => (int) $file['size'],
    ]);
}

function get_application_by_id(int $applicationId): ?array
{
    $stmt = db()->prepare('
        SELECT sa.*, au.username, au.account_status
        FROM surveyor_applications sa
        LEFT JOIN app_users au ON au.application_id = sa.id
        WHERE sa.id = :id
        LIMIT 1
    ');
    $stmt->execute([':id' => $applicationId]);
    $application = $stmt->fetch();
    if (!$application) {
        return null;
    }
    $application['documents'] = get_application_documents($applicationId);
    return $application;
}

function get_application_documents(int $applicationId): array
{
    $stmt = db()->prepare('
        SELECT id, doc_type, original_name, mime_type, file_size
        FROM application_documents
        WHERE application_id = :application_id
        ORDER BY id
    ');
    $stmt->execute([':application_id' => $applicationId]);
    return $stmt->fetchAll();
}

function get_applications(): array
{
    $rows = db()->query('
        SELECT sa.*, au.username, au.account_status, reviewer.display_name AS reviewer_name
        FROM surveyor_applications sa
        LEFT JOIN app_users au ON au.application_id = sa.id
        LEFT JOIN app_users reviewer ON reviewer.id = sa.reviewed_by_user_id
        ORDER BY sa.created_at DESC
    ')->fetchAll();

    foreach ($rows as &$row) {
        $row['documents'] = get_application_documents((int) $row['id']);
    }

    return $rows;
}

function review_application(array $input): array
{
    $applicationId = (int) ($input['application_id'] ?? 0);
    $decision = sanitize_text($input['decision'] ?? '');
    $notes = sanitize_text($input['notes'] ?? '');
    $assignedZone = sanitize_text($input['assigned_zone'] ?? '');

    if ($applicationId <= 0) {
        throw new InvalidArgumentException('Solicitud invalida.');
    }

    if (!in_array($decision, ['in_review', 'approved', 'rejected'], true)) {
        throw new InvalidArgumentException('Decision no valida.');
    }

    $application = get_application_by_id($applicationId);
    if (!$application) {
        throw new InvalidArgumentException('No se encontro la solicitud.');
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $reviewerId = (int) current_user()['id'];
        $surveyorId = $application['approved_surveyor_id'] ? (int) $application['approved_surveyor_id'] : null;

        if ($decision === 'approved') {
            $zone = $assignedZone !== '' ? $assignedZone : (string) $application['requested_zone'];

            if (!$surveyorId) {
                $existingSurveyor = get_surveyor_by_document((string) $application['document_number']);
                if ($existingSurveyor) {
                    $surveyorId = (int) $existingSurveyor['id'];
                }
            }

            if ($surveyorId) {
                $updateSurveyor = $pdo->prepare('
                    UPDATE surveyors
                    SET full_name = :full_name, document_number = :document_number, assigned_zone = :assigned_zone,
                        status = :status, phone = :phone, email = :email, address = :address,
                        parish = :parish, canton = :canton, prior_experience = :prior_experience,
                        application_id = :application_id
                    WHERE id = :id
                ');
                $updateSurveyor->execute([
                    ':full_name' => $application['full_name'],
                    ':document_number' => $application['document_number'],
                    ':assigned_zone' => $zone,
                    ':status' => 'Activo',
                    ':phone' => $application['phone'],
                    ':email' => $application['email'],
                    ':address' => $application['address'],
                    ':parish' => $application['parish'],
                    ':canton' => $application['canton'],
                    ':prior_experience' => $application['prior_experience'],
                    ':application_id' => $applicationId,
                    ':id' => $surveyorId,
                ]);
            } else {
                $insertSurveyor = $pdo->prepare('
                    INSERT INTO surveyors (
                        full_name, document_number, assigned_zone, status, phone, email, address,
                        parish, canton, prior_experience, application_id
                    ) VALUES (
                        :full_name, :document_number, :assigned_zone, :status, :phone, :email, :address,
                        :parish, :canton, :prior_experience, :application_id
                    )
                ');
                $insertSurveyor->execute([
                    ':full_name' => $application['full_name'],
                    ':document_number' => $application['document_number'],
                    ':assigned_zone' => $zone,
                    ':status' => 'Activo',
                    ':phone' => $application['phone'],
                    ':email' => $application['email'],
                    ':address' => $application['address'],
                    ':parish' => $application['parish'],
                    ':canton' => $application['canton'],
                    ':prior_experience' => $application['prior_experience'],
                    ':application_id' => $applicationId,
                ]);
                $surveyorId = (int) $pdo->lastInsertId();
            }

            $userUpdate = $pdo->prepare('
                UPDATE app_users
                SET display_name = :display_name, surveyor_id = :surveyor_id,
                    account_status = :account_status, role = :role, is_active = 1
                WHERE application_id = :application_id
            ');
            $userUpdate->execute([
                ':display_name' => $application['full_name'],
                ':surveyor_id' => $surveyorId,
                ':account_status' => 'approved',
                ':role' => 'surveyor',
                ':application_id' => $applicationId,
            ]);
        } else {
            $accountStatus = $decision === 'rejected' ? 'rejected' : 'in_review';
            $userUpdate = $pdo->prepare('
                UPDATE app_users
                SET account_status = :account_status, surveyor_id = NULL
                WHERE application_id = :application_id
            ');
            $userUpdate->execute([
                ':account_status' => $accountStatus,
                ':application_id' => $applicationId,
            ]);
        }

        $applicationUpdate = $pdo->prepare('
            UPDATE surveyor_applications
            SET review_status = :review_status,
                review_notes = :review_notes,
                reviewed_by_user_id = :reviewed_by_user_id,
                reviewed_at = NOW(),
                approved_surveyor_id = :approved_surveyor_id,
                requested_zone = :requested_zone
            WHERE id = :id
        ');
        $applicationUpdate->execute([
            ':review_status' => $decision,
            ':review_notes' => $notes !== '' ? $notes : null,
            ':reviewed_by_user_id' => $reviewerId,
            ':approved_surveyor_id' => $decision === 'approved' ? $surveyorId : null,
            ':requested_zone' => $decision === 'approved' && $zone !== '' ? $zone : $application['requested_zone'],
            ':id' => $applicationId,
        ]);

        log_action($reviewerId, 'review_application', 'surveyor_applications', $applicationId, [
            'decision' => $decision,
            'assigned_zone' => $assignedZone,
        ]);

        $pdo->commit();
    } catch (Throwable $exception) {
        $pdo->rollBack();
        throw $exception;
    }

    return get_application_by_id($applicationId) ?? [];
}

function get_surveyors(): array
{
    return db()->query('SELECT id, full_name, document_number, assigned_zone, status FROM surveyors ORDER BY full_name')->fetchAll();
}

function get_surveyor_by_id(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, full_name, document_number, assigned_zone, status, phone, email, address, parish, canton, prior_experience FROM surveyors WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function get_surveyor_by_document(string $documentNumber): ?array
{
    $stmt = db()->prepare('SELECT id, full_name, document_number, assigned_zone, status, phone, email, address, parish, canton, prior_experience, application_id FROM surveyors WHERE document_number = :document_number LIMIT 1');
    $stmt->execute([':document_number' => $documentNumber]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function get_surveyors_with_accounts(): array
{
    return db()->query('
        SELECT s.*, au.id AS user_id, au.username, au.account_status, au.is_active
        FROM surveyors s
        LEFT JOIN app_users au ON au.surveyor_id = s.id
        ORDER BY s.full_name
    ')->fetchAll();
}

function update_surveyor_profile(array $input): array
{
    $userId = (int) ($input['user_id'] ?? 0);
    $assignedZone = sanitize_text($input['assigned_zone'] ?? '');

    if ($userId <= 0) {
        throw new InvalidArgumentException('Usuario invalido.');
    }
    if ($assignedZone === '') {
        throw new InvalidArgumentException('Debes indicar la zona asignada.');
    }

    $stmt = db()->prepare('
        UPDATE surveyors s
        INNER JOIN app_users au ON au.surveyor_id = s.id
        SET s.assigned_zone = :assigned_zone
        WHERE au.id = :user_id
    ');
    $stmt->execute([
        ':assigned_zone' => $assignedZone,
        ':user_id' => $userId,
    ]);

    log_action((int) current_user()['id'], 'update_surveyor_profile', 'app_users', $userId, [
        'assigned_zone' => $assignedZone,
    ]);

    $detail = db()->prepare('
        SELECT s.*, au.id AS user_id, au.username, au.account_status, au.is_active
        FROM surveyors s
        LEFT JOIN app_users au ON au.surveyor_id = s.id
        WHERE au.id = :id
        LIMIT 1
    ');
    $detail->execute([':id' => $userId]);
    $row = $detail->fetch();
    if (!$row) {
        throw new InvalidArgumentException('No se encontro el encuestador.');
    }
    return $row;
}

function update_surveyor_status(array $input): array
{
    $userId = (int) ($input['user_id'] ?? 0);
    $status = sanitize_text($input['status'] ?? '');

    if ($userId <= 0) {
        throw new InvalidArgumentException('Usuario invalido.');
    }

    if (!in_array($status, ['approved', 'suspended'], true)) {
        throw new InvalidArgumentException('Estado no valido.');
    }

    $stmt = db()->prepare('UPDATE app_users SET account_status = :account_status, is_active = 1 WHERE id = :id');
    $stmt->execute([
        ':account_status' => $status,
        ':id' => $userId,
    ]);

    log_action((int) current_user()['id'], 'update_surveyor_status', 'app_users', $userId, ['status' => $status]);

    $detail = db()->prepare('
        SELECT s.*, au.id AS user_id, au.username, au.account_status, au.is_active
        FROM surveyors s
        LEFT JOIN app_users au ON au.surveyor_id = s.id
        WHERE au.id = :id
        LIMIT 1
    ');
    $detail->execute([':id' => $userId]);
    $row = $detail->fetch();
    if (!$row) {
        throw new InvalidArgumentException('No se encontro el encuestador.');
    }
    return $row;
}

function reset_account_password(array $input): void
{
    $userId = (int) ($input['user_id'] ?? 0);
    $newPassword = (string) ($input['new_password'] ?? '');

    if ($userId <= 0) {
        throw new InvalidArgumentException('Usuario invalido.');
    }

    if (strlen($newPassword) < 8) {
        throw new InvalidArgumentException('La nueva clave debe tener al menos 8 caracteres.');
    }

    $stmt = db()->prepare('UPDATE app_users SET password_hash = :password_hash WHERE id = :id');
    $stmt->execute([
        ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
        ':id' => $userId,
    ]);

    log_action((int) current_user()['id'], 'reset_password', 'app_users', $userId);
}

function normalize_survey(array $survey): array
{
    $fields = [
        'client_uuid', 'sector', 'community', 'survey_date', 'survey_status', 'surveyor_id', 'surveyor_name',
        'respondent_name', 'respondent_last_name', 'respondent_id_document', 'respondent_email', 'respondent_phone',
        'respondent_gender', 'age_range', 'education_level', 'occupation',
        'primary_problem', 'youth_path', 'women_roles', 'water_source', 'has_sewer',
        'has_internet', 'road_status', 'road_who_fixes', 'household_income', 'political_climate',
        'authority_trust', 'social_priority', 'investment_acceptance',
        'mine_reopening_perception', 'mine_benefits', 'mine_risks', 'comments',
        'latitude', 'longitude',
        'has_septic',
        'knows_mining_types', 'knows_mining_benefits', 'knows_modern_mining', 'knows_local_mines', 'knows_env_guarantees',
    ];

    // Campos que siempre deben ser string (nunca null) — encuestas con campos vacíos son válidas
    $stringFields = [
        'sector', 'community', 'survey_status', 'surveyor_name',
        'respondent_name', 'respondent_last_name', 'respondent_id_document',
        'respondent_email', 'respondent_phone', 'respondent_gender', 'age_range',
        'education_level', 'occupation', 'primary_problem', 'youth_path',
        'water_source', 'has_sewer', 'has_septic', 'has_internet',
        'road_status', 'road_who_fixes', 'household_income', 'political_climate',
        'authority_trust', 'social_priority', 'investment_acceptance',
        'mine_reopening_perception', 'comments',
        'knows_mining_types', 'knows_mining_benefits', 'knows_modern_mining',
        'knows_local_mines', 'knows_env_guarantees',
    ];

    $normalized = [];
    foreach ($fields as $field) {
        $value = $survey[$field] ?? null;
        if (in_array($field, $stringFields)) {
            // null o false → string vacío; cualquier otro valor → trim
            $normalized[$field] = ($value === null || $value === false) ? '' : trim((string) $value);
        } else {
            $normalized[$field] = is_string($value) ? trim($value) : $value;
        }
    }

    $normalized['client_uuid']   = $normalized['client_uuid']   ?: bin2hex(random_bytes(16));
    $normalized['survey_date']   = $normalized['survey_date']   ?: date('Y-m-d H:i:s');
    $normalized['survey_status'] = $normalized['survey_status'] ?: 'sincronizada';
    $normalized['women_roles']   = parse_multi_value($survey['women_roles']   ?? []);
    $normalized['mine_benefits'] = parse_multi_value($survey['mine_benefits'] ?? []);
    $normalized['mine_risks']    = parse_multi_value($survey['mine_risks']    ?? []);

    return $normalized;
}

function parse_multi_value(mixed $value): array
{
    if (is_array($value)) {
        return array_values(array_filter(array_map('trim', $value)));
    }
    if (is_string($value) && trim($value) !== '') {
        return array_values(array_filter(array_map('trim', explode('|', $value))));
    }
    return [];
}

function get_survey_by_client_uuid(string $clientUuid): ?array
{
    $stmt = db()->prepare('
        SELECT id, client_uuid, surveyor_id, survey_status
        FROM surveys
        WHERE client_uuid = :client_uuid
        LIMIT 1
    ');
    $stmt->execute([':client_uuid' => $clientUuid]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function save_survey(array $survey): array
{
    require_auth();
    $user = current_user();

    if (($user['role'] ?? '') === 'surveyor' && ($user['account_status'] ?? '') !== 'approved') {
        throw new InvalidArgumentException('Tu cuenta aun no esta aprobada para levantar encuestas.');
    }

    $survey = normalize_survey($survey);
    // Todas las preguntas son opcionales — no se valida ningún campo
    if (($user['role'] ?? '') === 'surveyor') {
        if (empty($user['surveyor_id'])) {
            throw new InvalidArgumentException('Tu usuario no tiene un encuestador asignado.');
        }
        $survey['surveyor_id'] = (string) $user['surveyor_id'];
        $survey['surveyor_name'] = $user['display_name'];
    }

    $existingSurvey = null;
    if (!empty($survey['client_uuid'])) {
        $existingSurvey = get_survey_by_client_uuid((string) $survey['client_uuid']);
    }

    if (($user['role'] ?? '') === 'surveyor' && $existingSurvey) {
        if ((int) $existingSurvey['surveyor_id'] !== (int) $user['surveyor_id']) {
            throw new InvalidArgumentException('Solo puedes editar tus propias encuestas.');
        }

        if (($existingSurvey['survey_status'] ?? '') === 'revisada') {
            throw new InvalidArgumentException('Esta encuesta ya fue revisada y no puede editarse desde campo.');
        }
    }

    // Mapa completo de todos los valores posibles.
    // El INSERT se construye dinámicamente según las columnas que realmente existen
    // en la tabla, por lo que funciona aunque ALTER TABLE haya fallado en el hosting.
    $allData = [
        'client_uuid'            => $survey['client_uuid'] ?: bin2hex(random_bytes(8)),
        'sector'                 => $survey['sector'] ?: '',
        'community'              => $survey['community'] ?: '',
        'survey_date'            => $survey['survey_date'] ?: date('Y-m-d H:i:s'),
        'survey_status'          => $survey['survey_status'] ?: 'sincronizada',
        'surveyor_id'            => (int) ($survey['surveyor_id'] ?? 0),
        'surveyor_name'          => $survey['surveyor_name'] ?: '',
        'respondent_name'        => $survey['respondent_name'] ?: '',
        'respondent_last_name'   => $survey['respondent_last_name'] ?: '',
        'respondent_id_document' => $survey['respondent_id_document'] ?: '',
        'respondent_email'       => $survey['respondent_email'] ?: '',
        'respondent_phone'       => $survey['respondent_phone'] ?: '',
        'respondent_gender'      => $survey['respondent_gender'] ?: '',
        'age_range'              => $survey['age_range'] ?: '',
        'education_level'        => $survey['education_level'] ?: '',
        'occupation'             => $survey['occupation'] ?: '',
        'primary_problem'        => $survey['primary_problem'] ?: '',
        'youth_path'             => $survey['youth_path'] ?: '',
        'women_roles'            => json_encode($survey['women_roles'] ?? [], JSON_UNESCAPED_UNICODE),
        'water_source'           => $survey['water_source'] ?: '',
        'has_sewer'              => $survey['has_sewer'] ?: '',
        'has_septic'             => $survey['has_septic'] ?: '',
        'has_internet'           => $survey['has_internet'] ?: '',
        'road_status'            => $survey['road_status'] ?: '',
        'road_who_fixes'         => $survey['road_who_fixes'] ?: '',
        'household_income'       => $survey['household_income'] ?: '',
        'political_climate'      => $survey['political_climate'] ?: '',
        'authority_trust'        => $survey['authority_trust'] ?: '',
        'social_priority'        => $survey['social_priority'] ?: '',
        'investment_acceptance'  => $survey['investment_acceptance'] ?: '',
        'mine_reopening_perception' => $survey['mine_reopening_perception'] ?: '',
        'mine_benefits'          => json_encode($survey['mine_benefits'] ?? [], JSON_UNESCAPED_UNICODE),
        'mine_risks'             => json_encode($survey['mine_risks'] ?? [], JSON_UNESCAPED_UNICODE),
        'comments'               => $survey['comments'] ?: '',
        'latitude'               => is_numeric($survey['latitude']  ?? '') ? (float) $survey['latitude']  : null,
        'longitude'              => is_numeric($survey['longitude'] ?? '') ? (float) $survey['longitude'] : null,
        'created_by_user_id'     => (int) ($user['id'] ?? 0),
        'knows_mining_types'     => $survey['knows_mining_types'] ?: '',
        'knows_mining_benefits'  => $survey['knows_mining_benefits'] ?: '',
        'knows_modern_mining'    => $survey['knows_modern_mining'] ?: '',
        'knows_local_mines'      => $survey['knows_local_mines'] ?: '',
        'knows_env_guarantees'   => $survey['knows_env_guarantees'] ?: '',
    ];

    // Obtenemos las columnas que realmente existen en la tabla.
    // Usamos FETCH_ASSOC + array_column para mayor compatibilidad con PDO en hosting compartido.
    $colRows = db()->query('SHOW COLUMNS FROM surveys')->fetchAll(PDO::FETCH_ASSOC);
    $existingCols = array_column($colRows, 'Field');

    // Filtramos el mapa de datos para incluir solo columnas existentes
    $insertCols = array_filter(array_keys($allData), fn($k) => in_array($k, $existingCols));

    $colSql    = implode(', ', array_map(fn($c) => "`$c`", $insertCols));
    $paramSql  = implode(', ', array_map(fn($c) => ":$c", $insertCols));
    $updateSql = implode(', ', array_map(
        fn($c) => "`$c` = VALUES(`$c`)",
        array_filter($insertCols, fn($c) => $c !== 'client_uuid')
    ));

    $stmt = db()->prepare("
        INSERT INTO surveys ($colSql)
        VALUES ($paramSql)
        ON DUPLICATE KEY UPDATE $updateSql
    ");

    $params = [];
    foreach ($insertCols as $col) {
        $params[":$col"] = $allData[$col];
    }
    $stmt->execute($params);

    log_action((int) $user['id'], 'save_survey', 'surveys', null, [
        'client_uuid' => $survey['client_uuid'],
        'sector' => $survey['sector'],
    ]);

    return $survey;
}

function get_my_surveys(): array
{
    require_auth();
    $user = current_user();

    if (($user['role'] ?? '') !== 'surveyor' || empty($user['surveyor_id'])) {
        return [];
    }

    $stmt = db()->prepare("
        SELECT
            id,
            client_uuid,
            sector,
            community,
            survey_date,
            survey_status,
            respondent_gender,
            age_range,
            education_level,
            occupation,
            primary_problem,
            youth_path,
            women_roles,
            water_source,
            has_sewer,
            has_internet,
            road_status,
            household_income,
            political_climate,
            authority_trust,
            social_priority,
            investment_acceptance,
            mine_reopening_perception,
            mine_benefits,
            mine_risks,
            comments,
            latitude,
            longitude,
            road_who_fixes,
            knows_mining_types,
            knows_mining_benefits,
            knows_modern_mining,
            knows_local_mines,
            knows_env_guarantees
        FROM surveys
        WHERE surveyor_id = :surveyor_id
        ORDER BY survey_date DESC, id DESC
        LIMIT 200
    ");
    $stmt->execute([':surveyor_id' => (int) $user['surveyor_id']]);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['women_roles'] = $row['women_roles'] ? json_decode((string) $row['women_roles'], true) : [];
        $row['mine_benefits'] = $row['mine_benefits'] ? json_decode((string) $row['mine_benefits'], true) : [];
        $row['mine_risks'] = $row['mine_risks'] ? json_decode((string) $row['mine_risks'], true) : [];
    }

    return $rows;
}

function compute_json_option_counts(array $rows, string $field): array
{
    $counts = [];
    foreach ($rows as $row) {
        $values = $row[$field] ? json_decode((string) $row[$field], true) : [];
        if (!is_array($values)) {
            continue;
        }
        foreach ($values as $value) {
            $label = trim((string) $value);
            if ($label === '') {
                continue;
            }
            $counts[$label] = ($counts[$label] ?? 0) + 1;
        }
    }
    arsort($counts);
    return $counts;
}

function normalize_sector_label(string $sector): string
{
    $sector = str_ireplace('Bartoloma', 'Bartolomé', $sector);
    return ucfirst($sector);
}

function build_label_total_rows(array $counts, int $limit = 0): array
{
    $rows = [];
    foreach ($counts as $label => $count) {
        $rows[] = [
            'label' => (string) $label,
            'total' => (int) $count,
        ];
    }

    if ($limit > 0) {
        return array_slice($rows, 0, $limit);
    }

    return $rows;
}

function get_dashboard(string $sector = 'general'): array
{
    $params = [];
    $where = '';
    if ($sector !== 'general') {
        $where = 'WHERE sector = :sector';
        $params[':sector'] = $sector;
    }

    $summarySql = "
        SELECT
            COUNT(*) AS total_surveys,
            ROUND(AVG(CASE WHEN has_sewer = 'No tiene' OR water_source LIKE '%sin%' OR water_source LIKE '%acequia%' OR water_source LIKE '%vertiente%' THEN 100 ELSE 0 END), 1) AS structural_poverty,
            ROUND(AVG(CASE WHEN mine_reopening_perception IN ('Beneficiaria mucho', 'Beneficiaria algo') OR investment_acceptance IN ('Aceptacion condicionada', 'Aceptacion amplia') THEN 100 ELSE 0 END), 1) AS acceptance_rate
        FROM surveys
        $where
    ";
    $stmt = db()->prepare($summarySql);
    $stmt->execute($params);
    $summary = $stmt->fetch() ?: [];

    $climateSql = "
        SELECT political_climate
        FROM surveys
        $where
        GROUP BY political_climate
        ORDER BY COUNT(*) DESC, political_climate ASC
        LIMIT 1
    ";
    $climateStmt = db()->prepare($climateSql);
    $climateStmt->execute($params);
    $climate = $climateStmt->fetchColumn() ?: 'Sin datos suficientes';

    $serviceSql = "
        SELECT
            ROUND(AVG(CASE WHEN water_source LIKE '%sin%' OR water_source LIKE '%acequia%' OR water_source LIKE '%vertiente%' THEN 100 ELSE 0 END), 1) AS water_risk,
            ROUND(AVG(CASE WHEN has_sewer = 'No tiene' THEN 100 ELSE 0 END), 1) AS sewer_gap,
            ROUND(AVG(CASE WHEN household_income IN ('No cubre la canasta', 'Cubre apenas') THEN 100 ELSE 0 END), 1) AS income_pressure
        FROM surveys
        $where
    ";
    $serviceStmt = db()->prepare($serviceSql);
    $serviceStmt->execute($params);
    $services = $serviceStmt->fetch() ?: [];

    $mapSql = "
        SELECT
            s.id,
            s.sector,
            s.community,
            s.latitude,
            s.longitude,
            s.survey_date,
            s.survey_status,
            COALESCE(s.surveyor_name, sv.full_name) AS surveyor_name
        FROM surveys s
        LEFT JOIN surveyors sv ON sv.id = s.surveyor_id
        " . ($sector !== 'general' ? 'WHERE sector = :sector AND latitude IS NOT NULL AND longitude IS NOT NULL' : 'WHERE latitude IS NOT NULL AND longitude IS NOT NULL') . "
        ORDER BY survey_date DESC
        LIMIT 30
    ";
    $mapStmt = db()->prepare($mapSql);
    $mapStmt->execute($params);
    $mapPoints = $mapStmt->fetchAll();

    $target = (int) app_config()['app']['target_surveys'];
    $total = (int) ($summary['total_surveys'] ?? 0);
    $pct = $target > 0 ? min(100, round(($total / $target) * 100)) : 0;

    $applicationCounts = db()->query("
        SELECT review_status, COUNT(*) AS total
        FROM surveyor_applications
        GROUP BY review_status
    ")->fetchAll();
    $applications = ['pending' => 0, 'in_review' => 0, 'approved' => 0, 'rejected' => 0];
    foreach ($applicationCounts as $countRow) {
        $applications[$countRow['review_status']] = (int) $countRow['total'];
    }

    $dailySql = "
        SELECT DATE(survey_date) AS survey_day, COUNT(*) AS total
        FROM surveys
        $where
        GROUP BY DATE(survey_date)
        ORDER BY survey_day DESC
        LIMIT 7
    ";
    $dailyStmt = db()->prepare($dailySql);
    $dailyStmt->execute($params);
    $dailyRows = array_reverse($dailyStmt->fetchAll());

    $sectorSql = "
        SELECT sector, COUNT(*) AS total
        FROM surveys
        $where
        GROUP BY sector
        ORDER BY total DESC, sector ASC
    ";
    $sectorStmt = db()->prepare($sectorSql);
    $sectorStmt->execute($params);
    $sectorRows = $sectorStmt->fetchAll();

    $surveyorSql = "
        SELECT COALESCE(s.surveyor_name, sv.full_name, 'Sin nombre') AS surveyor_name, COUNT(*) AS total
        FROM surveys s
        LEFT JOIN surveyors sv ON sv.id = s.surveyor_id
        " . ($where !== '' ? $where : '') . "
        GROUP BY COALESCE(s.surveyor_name, sv.full_name, 'Sin nombre')
        ORDER BY total DESC, surveyor_name ASC
    ";
    $surveyorStmt = db()->prepare($surveyorSql);
    $surveyorStmt->execute($params);
    $surveyorRows = $surveyorStmt->fetchAll();

    $statusSql = "
        SELECT survey_status, COUNT(*) AS total
        FROM surveys
        $where
        GROUP BY survey_status
    ";
    $statusStmt = db()->prepare($statusSql);
    $statusStmt->execute($params);
    $surveyStatusRows = $statusStmt->fetchAll();
    $surveyStatuses = ['sincronizada' => 0, 'revisada' => 0, 'observada' => 0];
    foreach ($surveyStatusRows as $row) {
        $surveyStatuses[$row['survey_status']] = (int) $row['total'];
    }

    $surveyorMgmtRows = db()->query("
        SELECT account_status, COUNT(*) AS total
        FROM app_users
        WHERE role = 'surveyor'
        GROUP BY account_status
    ")->fetchAll();
    $surveyorMgmt = ['approved' => 0, 'suspended' => 0, 'pending' => 0, 'in_review' => 0, 'rejected' => 0];
    foreach ($surveyorMgmtRows as $row) {
        $surveyorMgmt[$row['account_status']] = (int) $row['total'];
    }

    $approvalStats = db()->query("
        SELECT
            ROUND(AVG(CASE WHEN review_status = 'approved' AND reviewed_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, reviewed_at) END), 1) AS avg_approval_hours,
            ROUND((SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 1) AS approval_rate
        FROM surveyor_applications
    ")->fetch() ?: [];

    $socialSql = "
        SELECT
            primary_problem,
            water_source,
            has_sewer,
            household_income,
            authority_trust,
            political_climate,
            investment_acceptance,
            mine_reopening_perception,
            mine_benefits,
            mine_risks,
            sector
        FROM surveys
        $where
    ";
    $socialStmt = db()->prepare($socialSql);
    $socialStmt->execute($params);
    $socialRows = $socialStmt->fetchAll();

    $primaryProblems = [];
    $authorityTrust = [];
    $investmentAcceptance = [];
    $reopeningPerception = [];
    foreach ($socialRows as $row) {
        $primaryProblems[$row['primary_problem']] = ($primaryProblems[$row['primary_problem']] ?? 0) + 1;
        if (!empty($row['authority_trust'])) {
            $authorityTrust[$row['authority_trust']] = ($authorityTrust[$row['authority_trust']] ?? 0) + 1;
        }
        $investmentAcceptance[$row['investment_acceptance']] = ($investmentAcceptance[$row['investment_acceptance']] ?? 0) + 1;
        $reopeningPerception[$row['mine_reopening_perception']] = ($reopeningPerception[$row['mine_reopening_perception']] ?? 0) + 1;
    }
    arsort($primaryProblems);
    arsort($authorityTrust);
    arsort($investmentAcceptance);
    arsort($reopeningPerception);

    $benefitCounts = compute_json_option_counts($socialRows, 'mine_benefits');
    $riskCounts = compute_json_option_counts($socialRows, 'mine_risks');

    $strategicSql = "
        SELECT
            sector,
            household_income,
            water_source,
            has_sewer,
            political_climate,
            authority_trust,
            investment_acceptance
        FROM surveys
        $where
    ";
    $strategicStmt = db()->prepare($strategicSql);
    $strategicStmt->execute($params);
    $strategicRows = $strategicStmt->fetchAll();

    $stanceCounts = ['favorable' => 0, 'condicionada' => 0, 'contraria' => 0];
    $sectorFavor = [];
    $sectorOppose = [];
    $unemploymentOpen = ['pressure_total' => 0, 'pressure_open' => 0];
    $servicesOpen = ['services_risk_total' => 0, 'services_risk_open' => 0];
    $conflictSector = [];
    $lowTrustSector = [];

    foreach ($strategicRows as $row) {
        $sectorKey = normalize_sector_label((string) $row['sector']);
        $acceptance = (string) $row['investment_acceptance'];

        if ($acceptance === 'Aceptacion amplia') {
            $stanceCounts['favorable']++;
            $sectorFavor[$sectorKey] = ($sectorFavor[$sectorKey] ?? 0) + 1;
        } elseif ($acceptance === 'Aceptacion condicionada') {
            $stanceCounts['condicionada']++;
        } else {
            $stanceCounts['contraria']++;
            $sectorOppose[$sectorKey] = ($sectorOppose[$sectorKey] ?? 0) + 1;
        }

        if (in_array((string) $row['household_income'], ['No cubre la canasta', 'Cubre apenas'], true)) {
            $unemploymentOpen['pressure_total']++;
            if ($acceptance !== 'Rechazo preventivo') {
                $unemploymentOpen['pressure_open']++;
            }
        }

        $hasServiceRisk = ((string) $row['has_sewer'] === 'No tiene')
            || str_contains((string) $row['water_source'], 'sin')
            || str_contains((string) $row['water_source'], 'acequia')
            || str_contains((string) $row['water_source'], 'vertiente');
        if ($hasServiceRisk) {
            $servicesOpen['services_risk_total']++;
            if ($acceptance !== 'Rechazo preventivo') {
                $servicesOpen['services_risk_open']++;
            }
        }

        if (in_array((string) $row['political_climate'], ['Division comunitaria', 'Conflicto abierto entre actores'], true)) {
            $conflictSector[$sectorKey] = ($conflictSector[$sectorKey] ?? 0) + 1;
        }

        if ((string) $row['authority_trust'] === 'Baja') {
            $lowTrustSector[$sectorKey] = ($lowTrustSector[$sectorKey] ?? 0) + 1;
        }
    }

    arsort($sectorFavor);
    arsort($sectorOppose);
    arsort($conflictSector);
    arsort($lowTrustSector);

    $activeApprovedSurveyors = max(1, (int) ($surveyorMgmt['approved'] ?? 0));
    $offlinePending = 0;

    // Calcular indices de sentimiento por dimension para tacometros del dashboard
    $dimsMaps = [
        ['campo' => 'political_climate',         'titulo' => 'Clima Politico',
         'mapa'  => ['positivo' => ['Estabilidad relativa'],
                     'negativo' => ['Desconfianza institucional','Division comunitaria','Conflicto abierto entre actores']]],
        ['campo' => 'authority_trust',           'titulo' => 'Confianza Autoridades',
         'mapa'  => ['positivo' => ['Alta'],
                     'negativo' => ['Baja']]],
        ['campo' => 'investment_acceptance',     'titulo' => 'Inversion Externa',
         'mapa'  => ['positivo' => ['Aceptacion amplia','Aceptación amplia'],
                     'negativo' => ['Rechazo preventivo']]],
        ['campo' => 'mine_reopening_perception', 'titulo' => 'Reapertura Minera',
         'mapa'  => ['positivo' => ['Beneficiaria mucho','Beneficiaria algo'],
                     'negativo' => ['No beneficiaria']]],
        ['campo' => 'household_income',          'titulo' => 'Economia Familiar',
         'mapa'  => ['positivo' => ['Cubre con algo de holgura'],
                     'negativo' => ['No cubre la canasta']]],
        ['campo' => 'water_source',              'titulo' => 'Acceso al Agua',
         'mapa'  => ['positivo' => ['Red publica con tratamiento','Red pública con tratamiento'],
                     'negativo' => ['Rio o acequia','Río o acequia']]],
        ['campo' => 'has_sewer',                 'titulo' => 'Alcantarillado',
         'mapa'  => ['positivo' => ['Si tiene','Sí tiene'],
                     'negativo' => ['No tiene']]],
        ['campo' => 'has_internet',              'titulo' => 'Acceso a Internet',
         'mapa'  => ['positivo' => ['Si estable','Sí estable'],
                     'negativo' => ['No tiene']]],
        ['campo' => 'road_status',               'titulo' => 'Estado Vial',
         'mapa'  => ['positivo' => ['Bueno'],
                     'negativo' => ['Malo']]],
    ];
    $dimsSentimiento = [];
    foreach ($dimsMaps as $cfg) {
        $dist = freq_dist($socialRows, $cfg['campo'], $cfg['mapa']);
        $sent = sentiment_index($dist);
        $dimsSentimiento[] = [
            'titulo' => $cfg['titulo'],
            'indice' => $sent['indice'],
            'n'      => $sent['total'],
        ];
    }

    return [
        'summary' => [
            'total_surveys' => $total,
            'target_surveys' => $target,
            'coverage_pct' => $pct,
            'structural_poverty' => (float) ($summary['structural_poverty'] ?? 0),
            'acceptance_rate' => (float) ($summary['acceptance_rate'] ?? 0),
            'political_climate' => $climate,
        ],
        'services' => [
            'water_risk' => (float) ($services['water_risk'] ?? 0),
            'sewer_gap' => (float) ($services['sewer_gap'] ?? 0),
            'income_pressure' => (float) ($services['income_pressure'] ?? 0),
        ],
        'applications' => $applications,
        'map_points' => $mapPoints,
        'operations' => [
            'total_surveys' => $total,
            'coverage_pct' => $pct,
            'surveys_per_day' => $dailyRows,
            'surveys_by_sector' => array_map(function (array $row): array {
                return [
                    'label' => normalize_sector_label((string) $row['sector']),
                    'total' => (int) $row['total'],
                ];
            }, $sectorRows),
            'surveys_by_surveyor' => array_map(function (array $row): array {
                return [
                    'label' => (string) $row['surveyor_name'],
                    'total' => (int) $row['total'],
                ];
            }, $surveyorRows),
            'synchronized_count' => array_sum($surveyStatuses),
            'offline_pending_count' => $offlinePending,
            'offline_pending_note' => 'La cola offline vive en cada dispositivo; este valor no se centraliza todavia.',
            'avg_productivity_per_surveyor' => round($total / $activeApprovedSurveyors, 1),
        ],
        'management' => [
            'applications_pending' => (int) ($applications['pending'] ?? 0),
            'applications_in_review' => (int) ($applications['in_review'] ?? 0),
            'applications_approved' => (int) ($applications['approved'] ?? 0),
            'applications_rejected' => (int) ($applications['rejected'] ?? 0),
            'surveyors_active' => (int) ($surveyorMgmt['approved'] ?? 0),
            'surveyors_suspended' => (int) ($surveyorMgmt['suspended'] ?? 0),
            'avg_approval_hours' => (float) ($approvalStats['avg_approval_hours'] ?? 0),
            'approval_rate' => (float) ($approvalStats['approval_rate'] ?? 0),
        ],
        'social' => [
            'top_primary_problem' => array_key_first($primaryProblems) ?: 'Sin datos',
            'authority_trust_top' => array_key_first($authorityTrust) ?: 'Sin datos',
            'investment_acceptance_top' => array_key_first($investmentAcceptance) ?: 'Sin datos',
            'reopening_perception_top' => array_key_first($reopeningPerception) ?: 'Sin datos',
            'top_benefits' => build_label_total_rows($benefitCounts, 5),
            'top_risks' => build_label_total_rows($riskCounts, 5),
            'primary_problem_breakdown' => build_label_total_rows($primaryProblems, 5),
            'authority_trust_breakdown' => build_label_total_rows($authorityTrust),
            'investment_acceptance_breakdown' => build_label_total_rows($investmentAcceptance),
            'reopening_perception_breakdown' => build_label_total_rows($reopeningPerception),
        ],
        'strategic' => [
            'favorable_pct' => $total > 0 ? round(($stanceCounts['favorable'] / $total) * 100, 1) : 0.0,
            'conditioned_pct' => $total > 0 ? round(($stanceCounts['condicionada'] / $total) * 100, 1) : 0.0,
            'contrary_pct' => $total > 0 ? round(($stanceCounts['contraria'] / $total) * 100, 1) : 0.0,
            'top_oppose_sector' => array_key_first($sectorOppose) ?: 'Sin datos',
            'top_open_sector' => array_key_first($sectorFavor) ?: 'Sin datos',
            'income_openness_pct' => $unemploymentOpen['pressure_total'] > 0 ? round(($unemploymentOpen['pressure_open'] / $unemploymentOpen['pressure_total']) * 100, 1) : 0.0,
            'services_openness_pct' => $servicesOpen['services_risk_total'] > 0 ? round(($servicesOpen['services_risk_open'] / $servicesOpen['services_risk_total']) * 100, 1) : 0.0,
            'top_conflict_sector' => array_key_first($conflictSector) ?: 'Sin datos',
            'lowest_trust_sector' => array_key_first($lowTrustSector) ?: 'Sin datos',
        ],
        'dimensiones_sentimiento' => $dimsSentimiento,
    ];
}

function get_surveys(array $filters = []): array
{
    $conditions = [];
    $params = [];

    $sector = sanitize_text($filters['sector'] ?? '');
    $dateFrom = sanitize_text($filters['date_from'] ?? '');
    $dateTo = sanitize_text($filters['date_to'] ?? '');
    $surveyorId = (int) ($filters['surveyor_id'] ?? 0);
    $status = sanitize_text($filters['status'] ?? '');

    if ($sector !== '' && $sector !== 'general') {
        $conditions[] = 's.sector = :sector';
        $params[':sector'] = $sector;
    }
    if ($dateFrom !== '') {
        $conditions[] = 'DATE(s.survey_date) >= :date_from';
        $params[':date_from'] = $dateFrom;
    }
    if ($dateTo !== '') {
        $conditions[] = 'DATE(s.survey_date) <= :date_to';
        $params[':date_to'] = $dateTo;
    }
    if ($surveyorId > 0) {
        $conditions[] = 's.surveyor_id = :surveyor_id';
        $params[':surveyor_id'] = $surveyorId;
    }
    if ($status !== '' && $status !== 'all') {
        if (in_array($status, ['sincronizada', 'revisada', 'observada'], true)) {
            $conditions[] = 's.survey_status = :survey_status';
            $params[':survey_status'] = $status;
        } elseif ($status === 'Con GPS') {
            $conditions[] = 's.latitude IS NOT NULL AND s.longitude IS NOT NULL';
        } elseif ($status === 'Sin GPS') {
            $conditions[] = '(s.latitude IS NULL OR s.longitude IS NULL)';
        }
    }

    $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

    $stmt = db()->prepare("
        SELECT
            s.id,
            s.client_uuid,
            s.sector,
            s.community,
            s.survey_date,
            s.survey_status,
            s.surveyor_id,
            COALESCE(s.surveyor_name, sv.full_name) AS surveyor_name,
            s.respondent_gender,
            s.age_range,
            s.occupation,
            s.primary_problem,
            s.political_climate,
            s.investment_acceptance,
            s.mine_reopening_perception,
            s.latitude,
            s.longitude,
            CASE
                WHEN s.latitude IS NOT NULL AND s.longitude IS NOT NULL THEN 'Con GPS'
                ELSE 'Sin GPS'
            END AS record_status
        FROM surveys s
        LEFT JOIN surveyors sv ON sv.id = s.surveyor_id
        $where
        ORDER BY s.survey_date DESC, s.id DESC
        LIMIT 500
    ");
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function update_survey_status(array $input): array
{
    $surveyId = (int) ($input['survey_id'] ?? 0);
    $surveyStatus = sanitize_text($input['survey_status'] ?? '');

    if ($surveyId <= 0) {
        throw new InvalidArgumentException('Encuesta invalida.');
    }
    if (!in_array($surveyStatus, ['sincronizada', 'revisada', 'observada'], true)) {
        throw new InvalidArgumentException('Estado de encuesta no valido.');
    }

    $stmt = db()->prepare('UPDATE surveys SET survey_status = :survey_status WHERE id = :id');
    $stmt->execute([
        ':survey_status' => $surveyStatus,
        ':id' => $surveyId,
    ]);

    log_action((int) current_user()['id'], 'update_survey_status', 'surveys', $surveyId, [
        'survey_status' => $surveyStatus,
    ]);

    $detail = db()->prepare("
        SELECT
            s.id,
            s.client_uuid,
            s.sector,
            s.community,
            s.survey_date,
            s.survey_status,
            s.surveyor_id,
            COALESCE(s.surveyor_name, sv.full_name) AS surveyor_name,
            s.respondent_gender,
            s.age_range,
            s.occupation,
            s.primary_problem,
            s.political_climate,
            s.investment_acceptance,
            s.mine_reopening_perception,
            s.latitude,
            s.longitude,
            CASE
                WHEN s.latitude IS NOT NULL AND s.longitude IS NOT NULL THEN 'Con GPS'
                ELSE 'Sin GPS'
            END AS record_status
        FROM surveys s
        LEFT JOIN surveyors sv ON sv.id = s.surveyor_id
        WHERE s.id = :id
        LIMIT 1
    ");
    $detail->execute([':id' => $surveyId]);
    $row = $detail->fetch();
    if (!$row) {
        throw new InvalidArgumentException('No se encontro la encuesta.');
    }
    return $row;
}

function get_audit_logs(array $filters = []): array
{
    $conditions = [];
    $params = [];

    $action = sanitize_text($filters['action_type'] ?? '');
    $dateFrom = sanitize_text($filters['date_from'] ?? '');
    $dateTo = sanitize_text($filters['date_to'] ?? '');

    if ($action !== '' && $action !== 'all') {
        $conditions[] = 'al.action_type = :action_type';
        $params[':action_type'] = $action;
    }
    if ($dateFrom !== '') {
        $conditions[] = 'DATE(al.created_at) >= :date_from';
        $params[':date_from'] = $dateFrom;
    }
    if ($dateTo !== '') {
        $conditions[] = 'DATE(al.created_at) <= :date_to';
        $params[':date_to'] = $dateTo;
    }

    $where = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

    $stmt = db()->prepare("
        SELECT
            al.id,
            al.action_type,
            al.entity_type,
            al.entity_id,
            al.details_json,
            al.created_at,
            COALESCE(u.display_name, 'Sistema') AS actor_name
        FROM audit_logs al
        LEFT JOIN app_users u ON u.id = al.user_id
        $where
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT 500
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    foreach ($rows as &$row) {
        $row['details'] = $row['details_json'] ? json_decode((string) $row['details_json'], true) : [];
    }

    return $rows;
}

function stream_export(string $type, array $filters = []): never
{
    if (!in_array($type, ['surveys', 'applications', 'audit'], true)) {
        http_response_code(404);
        exit;
    }

    $filename = $type . '_' . date('Ymd_His') . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $output = fopen('php://output', 'wb');
    if ($output === false) {
        http_response_code(500);
        exit;
    }

    if ($type === 'surveys') {
        $rows = get_surveys($filters);
        fputcsv($output, ['ID', 'Fecha', 'Sector', 'Comunidad', 'Encuestador', 'Genero', 'Edad', 'Ocupacion', 'Problematica', 'Clima politico', 'Aceptacion inversion', 'Percepcion reapertura', 'Estado']);
        foreach ($rows as $row) {
            fputcsv($output, [
                $row['id'],
                $row['survey_date'],
                $row['sector'],
                $row['community'],
                $row['surveyor_name'],
                $row['respondent_gender'],
                $row['age_range'],
                $row['occupation'],
                $row['primary_problem'],
                $row['political_climate'],
                $row['investment_acceptance'],
                $row['mine_reopening_perception'],
                $row['record_status'],
            ]);
        }
    } elseif ($type === 'applications') {
        $rows = get_applications();
        fputcsv($output, ['ID', 'Nombre', 'Cedula', 'Telefono', 'Correo', 'Parroquia', 'Canton', 'Zona solicitada', 'Estado', 'Usuario', 'Fecha']);
        foreach ($rows as $row) {
            fputcsv($output, [
                $row['id'],
                $row['full_name'],
                $row['document_number'],
                $row['phone'],
                $row['email'],
                $row['parish'],
                $row['canton'],
                $row['requested_zone'],
                $row['review_status'],
                $row['username'] ?? '',
                $row['created_at'],
            ]);
        }
    } else {
        $rows = get_audit_logs($filters);
        fputcsv($output, ['ID', 'Fecha', 'Actor', 'Accion', 'Entidad', 'ID entidad', 'Detalle']);
        foreach ($rows as $row) {
            fputcsv($output, [
                $row['id'],
                $row['created_at'],
                $row['actor_name'],
                $row['action_type'],
                $row['entity_type'],
                $row['entity_id'],
                json_encode($row['details'], JSON_UNESCAPED_UNICODE),
            ]);
        }
    }

    fclose($output);
    exit;
}

function stream_application_document(int $documentId): never
{
    if ($documentId <= 0) {
        http_response_code(404);
        exit;
    }

    $stmt = db()->prepare('
        SELECT d.*, a.id AS application_id, a.full_name
        FROM application_documents d
        INNER JOIN surveyor_applications a ON a.id = d.application_id
        WHERE d.id = :id
        LIMIT 1
    ');
    $stmt->execute([':id' => $documentId]);
    $document = $stmt->fetch();
    if (!$document) {
        http_response_code(404);
        exit;
    }

    $user = current_user();
    $isAdmin = ($user['role'] ?? '') === 'admin';
    $ownsDocument = !empty($user['application_id']) && (int) $user['application_id'] === (int) $document['application_id'];
    if (!$isAdmin && !$ownsDocument) {
        http_response_code(403);
        exit;
    }

    $path = $document['stored_path'];
    if (!is_file($path)) {
        http_response_code(404);
        exit;
    }

    header('Content-Type: ' . $document['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: inline; filename="' . basename($document['original_name']) . '"');
    readfile($path);
    exit;
}

// ============================================================
//  MÓDULO DE ANÁLISIS EXPERTO DE ENCUESTAS
//  Estadística descriptiva + sentimiento comunitario en tiempo real
// ============================================================

function normalize_label(string $val): string
{
    // Agrupa "Otro: texto libre" como "Otro" para campos con opcion abierta
    if (str_starts_with($val, 'Otro:') || str_starts_with($val, 'otro:')) {
        return 'Otro';
    }
    return $val;
}

function freq_dist(array $rows, string $field, array $sentimentMap = []): array
{
    $counts = [];
    $total  = 0;
    foreach ($rows as $row) {
        $val = normalize_label(trim((string) ($row[$field] ?? '')));
        if ($val === '' || $val === 'null') continue;
        $counts[$val] = ($counts[$val] ?? 0) + 1;
        $total++;
    }
    arsort($counts);
    $out = [];
    foreach ($counts as $label => $count) {
        $pct  = $total > 0 ? round(($count / $total) * 100, 1) : 0.0;
        $sent = 'neutro';
        foreach ($sentimentMap as $sentiment => $values) {
            if (in_array($label, $values, true)) { $sent = $sentiment; break; }
        }
        $out[] = ['label' => $label, 'count' => $count, 'pct' => $pct, 'sentimiento' => $sent];
    }
    return ['items' => $out, 'total_respondentes' => $total];
}

function sentiment_index(array $dist): array
{
    $pos = 0; $neg = 0; $neu = 0; $total = 0;
    foreach ($dist['items'] as $item) {
        $total += $item['count'];
        if ($item['sentimiento'] === 'positivo') $pos += $item['count'];
        elseif ($item['sentimiento'] === 'negativo') $neg += $item['count'];
        else $neu += $item['count'];
    }
    $posP = $total > 0 ? round(($pos / $total) * 100, 1) : 0.0;
    $negP = $total > 0 ? round(($neg / $total) * 100, 1) : 0.0;
    $neuP = $total > 0 ? round(($neu / $total) * 100, 1) : 0.0;
    return [
        'positivo_pct' => $posP,
        'negativo_pct' => $negP,
        'neutro_pct'   => $neuP,
        'indice'       => round($posP - $negP, 1),
        'total'        => $total,
    ];
}

function expert_narrative(string $campo, array $dist, array $sent): string
{
    $items = $dist['items'];
    if (empty($items)) return 'Sin datos suficientes para esta dimension.';
    $top  = $items[0];
    $idx  = $sent['indice'];
    $n    = $dist['total_respondentes'];
    $pct  = $top['pct'];
    $lbl  = $top['label'];
    $posP = $sent['positivo_pct'];
    $negP = $sent['negativo_pct'];
    $tono = $idx >= 30  ? 'claramente favorable'
          : ($idx >= 10  ? 'moderadamente positivo'
          : ($idx >= -10 ? 'ambivalente o dividido'
          : ($idx >= -30 ? 'predominantemente critico'
          : 'fuertemente negativo')));

    $textos = [
        'political_climate'          => "El clima politico del territorio es {$tono}. La percepcion dominante fue \"{$lbl}\" con el {$pct}% de {$n} encuestados. El {$posP}% exhibe senales de cohesion comunitaria, mientras el {$negP}% refleja tension o conflicto activo que puede dificultar procesos de negociacion.",
        'authority_trust'            => "La confianza ciudadana en autoridades es {$tono}. \"{$lbl}\" concentra el {$pct}% de percepciones. Un {$negP}% de desconfianza indica terreno fertil para demandas de mayor transparencia y rendicion de cuentas — factor critico en procesos de licencia social.",
        'investment_acceptance'      => "La apertura a inversion externa es {$tono}. El {$pct}% se identifica con \"{$lbl}\". La aceptacion amplia y condicionada en conjunto define el potencial real de negociacion disponible en el territorio para proyectos de inversion.",
        'mine_reopening_perception'  => "La percepcion ciudadana sobre la reapertura minera es {$tono}. \"{$lbl}\" lidera con {$pct}% ({$n} encuestas). El indice neto de {$idx} puntos sintetiza el balance entre la esperanza de desarrollo economico y las preocupaciones socioambientales de la poblacion.",
        'primary_problem'            => "La problematica que mas afecta a la comunidad es \"{$lbl}\" ({$pct}%). Este dato orienta las prioridades de intervencion social y las demandas ciudadanas que deben articularse en cualquier proceso de negociacion o proyecto de desarrollo.",
        'household_income'           => "La situacion economica familiar es {$tono}. El {$negP}% de hogares reporta ingresos insuficientes o que apenas cubren la canasta basica. Esta vulnerabilidad economica constituye un factor de mayor disposicion a evaluar fuentes alternativas de empleo e ingresos.",
        'water_source'               => "El acceso al agua muestra un perfil {$tono}. \"{$lbl}\" es la fuente predominante ({$pct}%). Las fuentes no formales o a cielo abierto representan riesgos sanitarios que deben considerarse en el analisis de bienestar territorial y en propuestas de mejora.",
        'has_sewer'                  => "La cobertura de alcantarillado es {$tono}: \"{$lbl}\" concentra el {$pct}%. Las brechas de saneamiento basico son indicadores directos de pobreza estructural y demanda urgente de infraestructura publica que puede alinearse con beneficios comunitarios.",
        'has_internet'               => "La conectividad digital es {$tono}: \"{$lbl}\" ({$pct}%). La brecha digital limita el acceso a servicios, informacion y mercados. Es un factor de rezago territorial que afecta la competitividad y la calidad de vida de la poblacion.",
        'road_status'                => "El estado vial es {$tono}: \"{$lbl}\" ({$pct}%). Las condiciones de las vias impactan directamente la productividad agropecuaria, el acceso a servicios de salud y educacion, y la integracion economica del territorio.",
        'age_range'                  => "La estructura etaria predominante es \"{$lbl}\" ({$pct}% de {$n} encuestados). Esta composicion demografica determina las necesidades prioritarias: oportunidades de empleo para adultos jovenes, servicios para adultos mayores y acceso a educacion para menores.",
        'respondent_gender'          => "La muestra esta compuesta mayoritariamente por \"{$lbl}\" ({$pct}%). El enfoque de genero permite identificar diferencias en percepciones, prioridades y vulnerabilidades especificas que deben atenderse en las estrategias de intervencion territorial.",
        'education_level'            => "El nivel educativo predominante es \"{$lbl}\" ({$pct}%). La formacion academica influye en la comprension de procesos tecnicos como los proyectos mineros y en la demanda de informacion clara, accesible y verificable por parte de la comunidad.",
        'youth_path'                 => "El destino principal de los jovenes es \"{$lbl}\" ({$pct}%). La migracion juvenil o la falta de oportunidades locales son senales criticas de presion demografica y economica que deben abordarse con propuestas concretas de empleo y desarrollo.",
        'social_priority'            => "La prioridad territorial mas valorada es \"{$lbl}\" ({$pct}%). Este dato es clave para alinear propuestas de valor, beneficios comunitarios y planes de desarrollo con las expectativas y necesidades reales de la poblacion encuestada.",
        'occupation'                 => "La ocupacion predominante en la muestra es \"{$lbl}\" ({$pct}%). La estructura productiva del territorio define las relaciones economicas locales y las oportunidades de empleo que podrian articularse con proyectos de inversion o desarrollo.",
    ];
    return $textos[$campo]
        ?? "En la dimension \"{$campo}\", la respuesta dominante es \"{$lbl}\" ({$pct}% de {$n} encuestados). El tono general es {$tono} con un indice de sentimiento de {$idx} puntos.";
}

function analizar_conocimiento_minero(array $rows): array
{
    $campos = [
        'knows_mining_types'    => 'Conoce tipos de mineria',
        'knows_mining_benefits' => 'Conoce beneficios mineros',
        'knows_modern_mining'   => 'Conoce mineria moderna',
        'knows_local_mines'     => 'Conoce minas locales',
        'knows_env_guarantees'  => 'Conoce garantias ambientales',
    ];
    $mapC = ['positivo' => ['Si', 'Sí', 'Algo', 'Bastante', 'Mucho'], 'negativo' => ['No', 'Nada', 'Poco']];
    $result = [];
    foreach ($campos as $campo => $label) {
        $d = freq_dist($rows, $campo, $mapC);
        $s = sentiment_index($d);
        $result[] = ['campo' => $campo, 'label' => $label, 'dist' => $d, 'sentimiento' => $s];
    }
    return $result;
}

function get_analisis_experto(string $sector = 'general'): array
{
    $params = [];
    $where  = '';
    if ($sector !== 'general') {
        $where            = 'WHERE sector = :sector';
        $params[':sector'] = $sector;
    }

    $sql = "
        SELECT respondent_gender, age_range, education_level, occupation,
               primary_problem, youth_path, water_source, has_sewer,
               has_septic, has_internet, road_status, road_who_fixes,
               household_income, political_climate, authority_trust,
               social_priority, investment_acceptance,
               mine_reopening_perception, mine_benefits, mine_risks,
               women_roles, sector, survey_date,
               knows_mining_types, knows_mining_benefits,
               knows_modern_mining, knows_local_mines, knows_env_guarantees
        FROM surveys $where
        ORDER BY survey_date DESC
    ";
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $n    = count($rows);

    if ($n === 0) {
        return [
            'total'   => 0,
            'mensaje' => 'Sin encuestas registradas. El analisis aparecera automaticamente cuando lleguen datos del campo.',
        ];
    }

    // Mapas de sentimiento — valores exactos del app movil
    $mapClima = [
        'positivo' => ['Estabilidad relativa'],
        'neutro'   => [],
        'negativo' => ['Desconfianza institucional','Division comunitaria','Conflicto abierto entre actores'],
    ];
    $mapConfianza = [
        'positivo' => ['Alta'],
        'neutro'   => ['Media'],
        'negativo' => ['Baja'],
    ];
    $mapInversion = [
        'positivo' => ['Aceptacion amplia','Aceptación amplia'],
        'neutro'   => ['Aceptacion condicionada','Aceptación condicionada'],
        'negativo' => ['Rechazo preventivo'],
    ];
    $mapReapertura = [
        'positivo' => ['Beneficiaria mucho','Beneficiaria algo'],
        'neutro'   => ['Beneficio dudoso'],
        'negativo' => ['No beneficiaria'],
    ];
    $mapIngreso = [
        'positivo' => ['Cubre con algo de holgura'],
        'neutro'   => ['Cubre apenas'],
        'negativo' => ['No cubre la canasta'],
    ];
    $mapAgua = [
        'positivo' => ['Red publica con tratamiento','Red pública con tratamiento'],
        'neutro'   => ['Vertiente comunal sin purificacion','Vertiente comunal sin purificación','Tanquero u otra compra'],
        'negativo' => ['Rio o acequia','Río o acequia'],
    ];
    $mapAlcant = [
        'positivo' => ['Si tiene','Sí tiene'],
        'neutro'   => [],
        'negativo' => ['No tiene'],
    ];
    $mapInternet = [
        'positivo' => ['Si estable','Sí estable'],
        'neutro'   => ['Intermitente'],
        'negativo' => ['No tiene'],
    ];
    $mapVia = [
        'positivo' => ['Bueno'],
        'neutro'   => ['Regular'],
        'negativo' => ['Malo'],
    ];

    // Solo dimensiones con sentido de sentimiento territorial
    $dimsConfig = [
        ['campo' => 'political_climate',         'titulo' => 'Clima Politico',                  'mapa' => $mapClima],
        ['campo' => 'authority_trust',           'titulo' => 'Confianza en Autoridades',        'mapa' => $mapConfianza],
        ['campo' => 'investment_acceptance',     'titulo' => 'Aceptacion de Inversion',         'mapa' => $mapInversion],
        ['campo' => 'mine_reopening_perception', 'titulo' => 'Percepcion Reapertura Minera',    'mapa' => $mapReapertura],
        ['campo' => 'household_income',          'titulo' => 'Situacion Economica Familiar',    'mapa' => $mapIngreso],
        ['campo' => 'water_source',              'titulo' => 'Fuente de Agua',                  'mapa' => $mapAgua],
        ['campo' => 'has_sewer',                 'titulo' => 'Cobertura de Alcantarillado',     'mapa' => $mapAlcant],
        ['campo' => 'has_internet',              'titulo' => 'Acceso a Internet',               'mapa' => $mapInternet],
        ['campo' => 'road_status',               'titulo' => 'Estado Vial',                     'mapa' => $mapVia],
    ];

    $dimensiones = [];
    foreach ($dimsConfig as $cfg) {
        $dist = freq_dist($rows, $cfg['campo'], $cfg['mapa']);
        $sent = sentiment_index($dist);
        $dimensiones[] = [
            'campo'          => $cfg['campo'],
            'titulo'         => $cfg['titulo'],
            'distribucion'   => $dist,
            'sentimiento'    => $sent,
            'interpretacion' => expert_narrative($cfg['campo'], $dist, $sent),
        ];
    }

    // Beneficios y riesgos (multivalor JSON)
    $beneficioCounts = compute_json_option_counts($rows, 'mine_benefits');
    $riesgoCounts    = compute_json_option_counts($rows, 'mine_risks');
    $totalB = array_sum($beneficioCounts);
    $totalR = array_sum($riesgoCounts);
    $beneficiosItems = [];
    foreach ($beneficioCounts as $l => $c) {
        $beneficiosItems[] = ['label' => $l, 'count' => $c, 'pct' => $totalB > 0 ? round(($c / $totalB) * 100, 1) : 0.0];
    }
    $riesgosItems = [];
    foreach ($riesgoCounts as $l => $c) {
        $riesgosItems[] = ['label' => $l, 'count' => $c, 'pct' => $totalR > 0 ? round(($c / $totalR) * 100, 1) : 0.0];
    }

    // Sentimiento global compuesto (solo dimensiones con mapa de sentimiento)
    $keyDims = ['political_climate','authority_trust','investment_acceptance','mine_reopening_perception','household_income'];
    $sumIdx = 0; $cntIdx = 0; $tPos = 0; $tNeg = 0; $tNeu = 0; $tTot = 0;
    foreach ($dimensiones as $d) {
        if (!in_array($d['campo'], $keyDims, true)) continue;
        $s = $d['sentimiento'];
        if ($s['total'] > 0) {
            $sumIdx += $s['indice'];
            $cntIdx++;
            $tPos += $s['positivo_pct'] * $s['total'];
            $tNeg += $s['negativo_pct'] * $s['total'];
            $tNeu += $s['neutro_pct']   * $s['total'];
            $tTot += $s['total'];
        }
    }
    $gIdx = $cntIdx > 0 ? round($sumIdx / $cntIdx, 1) : 0.0;
    $gPos = $tTot > 0 ? round($tPos / $tTot, 1) : 0.0;
    $gNeg = $tTot > 0 ? round($tNeg / $tTot, 1) : 0.0;
    $gNeu = $tTot > 0 ? round($tNeu / $tTot, 1) : 0.0;

    // Tendencia temporal
    $tendSql = "
        SELECT DATE(survey_date) AS dia, COUNT(*) AS total,
               ROUND(AVG(CASE WHEN investment_acceptance IN
                   ('Aceptacion amplia','Aceptación amplia','Aceptacion condicionada','Aceptación condicionada')
                   THEN 100 ELSE 0 END), 1) AS apertura_pct
        FROM surveys $where
        GROUP BY DATE(survey_date)
        ORDER BY dia DESC LIMIT 14
    ";
    $tendStmt = db()->prepare($tendSql);
    $tendStmt->execute($params);
    $tendencia = array_reverse($tendStmt->fetchAll());

    // Correlación: ingreso bajo vs. apertura a inversión
    $bajosAcep = 0; $bajosTotal = 0; $altosAcep = 0; $altosTotal = 0;
    foreach ($rows as $r) {
        $ing   = (string)($r['household_income']      ?? '');
        $inv   = (string)($r['investment_acceptance'] ?? '');
        $esPos = in_array($inv, array_merge($mapInversion['positivo']), true);
        if (in_array($ing, ['No cubre la canasta','Muy limitado','Cubre apenas'], true)) {
            $bajosTotal++;
            if ($esPos) $bajosAcep++;
        } elseif (in_array($ing, ['Holgado','Cubre bien'], true)) {
            $altosTotal++;
            if ($esPos) $altosAcep++;
        }
    }
    $corrBajo = $bajosTotal > 0 ? round(($bajosAcep / $bajosTotal) * 100, 1) : 0.0;
    $corrAlto = $altosTotal > 0 ? round(($altosAcep / $altosTotal) * 100, 1) : 0.0;

    // Distribución por sector
    $sectorDist = [];
    foreach ($rows as $r) {
        $sec = normalize_sector_label((string)($r['sector'] ?? 'Desconocido'));
        $sectorDist[$sec] = ($sectorDist[$sec] ?? 0) + 1;
    }
    arsort($sectorDist);
    $sectorItems = [];
    foreach ($sectorDist as $sec => $cnt) {
        $sectorItems[] = ['label' => $sec, 'count' => $cnt, 'pct' => round(($cnt / $n) * 100, 1)];
    }

    // Resumen ejecutivo
    $nivel = $gIdx >= 20 ? 'POSITIVO' : ($gIdx >= -20 ? 'AMBIVALENTE' : 'CRITICO');
    $color = $gIdx >= 20 ? 'verde'    : ($gIdx >= -20 ? 'naranja'    : 'rojo');

    // Dimensión más positiva y más negativa
    $dimsSorted = $dimensiones;
    usort($dimsSorted, fn($a, $b) => $b['sentimiento']['indice'] <=> $a['sentimiento']['indice']);
    $dimPos = $dimsSorted[0]  ?? null;
    $dimNeg = end($dimsSorted) ?: null;

    // Problema principal
    $probTop = '';
    foreach ($dimensiones as $d) {
        if ($d['campo'] === 'primary_problem' && !empty($d['distribucion']['items'])) {
            $probTop = $d['distribucion']['items'][0]['label'];
            break;
        }
    }
    // Limpiar caracteres corruptos (diamond) u otros caracteres inválidos sin modificar la BD
    $probTop = @mb_convert_encoding($probTop, 'UTF-8', 'UTF-8'); // limpia bytes inválidos
    $probTop = str_replace(["\xEF\xBF\xBD", "", ""], "", $probTop);
    $probTop = trim($probTop);
    if (empty($probTop)) {
        $probTop = 'Sin datos claros';
    }

    $narrativa = sprintf(
        'Con base en %d encuestas levantadas en San Bartolomé, el índice de sentimiento comunitario compuesto es %s puntos (escala -100 a +100), clasificado como %s. El %s%% de las percepciones evaluadas son positivas y el %s%% son negativas. La problemática que más preocupa a la ciudadanía es "%s". La dimensión con mejor índice es "%s" (%s pts) y la más crítica es "%s" (%s pts). Estos datos reflejan el pulso real del territorio al momento del análisis.',
        $n,
        ($gIdx > 0 ? '+' : '') . $gIdx,
        $nivel,
        $gPos,
        $gNeg,
        $probTop ?: 'Por determinar',
        $dimPos ? $dimPos['titulo'] : 'N/A',
        $dimPos ? (($dimPos['sentimiento']['indice'] > 0 ? '+' : '') . $dimPos['sentimiento']['indice']) : 'N/A',
        $dimNeg ? $dimNeg['titulo'] : 'N/A',
        $dimNeg ? (($dimNeg['sentimiento']['indice'] > 0 ? '+' : '') . $dimNeg['sentimiento']['indice']) : 'N/A'
    );

    return [
        'total'               => $n,
        'sector'              => $sector,
        'generado_en'         => date('Y-m-d H:i:s'),
        'resumen_ejecutivo'   => [
            'total_encuestas'   => $n,
            'nivel_sentimiento' => $nivel,
            'color_sentimiento' => $color,
            'indice_global'     => $gIdx,
            'positivo_global'   => $gPos,
            'negativo_global'   => $gNeg,
            'neutro_global'     => $gNeu,
            'problema_principal'=> $probTop,
            'dim_mas_positiva'  => $dimPos ? ['titulo' => $dimPos['titulo'], 'indice' => $dimPos['sentimiento']['indice']] : null,
            'dim_mas_negativa'  => $dimNeg ? ['titulo' => $dimNeg['titulo'], 'indice' => $dimNeg['sentimiento']['indice']] : null,
            'narrativa'         => $narrativa,
        ],
        'sentimiento_global'  => [
            'indice'       => $gIdx,
            'positivo_pct' => $gPos,
            'negativo_pct' => $gNeg,
            'neutro_pct'   => $gNeu,
        ],
        'dimensiones'             => $dimensiones,
        'beneficios_mineros'      => $beneficiosItems,
        'riesgos_mineros'         => $riesgosItems,
        'conocimiento_minero'     => analizar_conocimiento_minero($rows),
        'tendencia_diaria'        => $tendencia,
        'correlaciones'           => [[
            'titulo'         => 'Ingreso familiar bajo vs. apertura a inversion externa',
            'valor_a'        => $corrBajo,
            'label_a'        => 'Hogares con ingreso bajo — apertura a inversion',
            'valor_b'        => $corrAlto,
            'label_b'        => 'Hogares con ingreso alto — apertura a inversion',
            'interpretacion' => $corrBajo >= $corrAlto
                ? "Los hogares con menor ingreso muestran igual o mayor apertura a la inversion externa ({$corrBajo}% vs {$corrAlto}%). Esto sugiere que la necesidad economica es un motor clave de aceptacion: las estrategias de comunicacion deben enfatizar impacto en empleo, ingresos familiares y calidad de vida."
                : "Los hogares con mayores ingresos muestran mayor apertura ({$corrAlto}% vs {$corrBajo}%). La aceptacion parece estar ligada mas al nivel de informacion y confianza institucional que a la presion economica inmediata. Se recomienda reforzar la estrategia de informacion y transparencia hacia todos los segmentos.",
        ]],
        'distribucion_por_sector' => $sectorItems,
    ];
}

function freq_dist_multi(array $rows, string $field, string $storage): array
{
    // Counts individual options from multi-value fields.
    // $storage: 'pipe' = "A|B|C", 'json' = ["A","B","C"]
    $counts = [];
    $respondents = 0;
    foreach ($rows as $row) {
        $raw = $row[$field] ?? '';
        if ($storage === 'json') {
            $vals = $raw ? json_decode((string) $raw, true) : [];
            if (!is_array($vals)) $vals = [];
        } else {
            $vals = array_filter(array_map('trim', explode('|', (string) $raw)));
        }
        if (empty($vals)) continue;
        $respondents++;
        foreach ($vals as $v) {
            $v = normalize_label(trim((string) $v));
            if ($v === '' || $v === 'null') continue;
            $counts[$v] = ($counts[$v] ?? 0) + 1;
        }
    }
    arsort($counts);
    $total = array_sum($counts); // total mentions (can exceed respondents for multi-select)
    $out = [];
    foreach ($counts as $label => $count) {
        $out[] = ['label' => $label, 'count' => $count, 'pct' => $total > 0 ? round(($count / $respondents) * 100, 1) : 0.0];
    }
    return ['items' => $out, 'total_respondentes' => $respondents];
}

function get_preguntas_data(string $sector = 'general'): array
{
    $where  = '';
    $params = [];
    if ($sector !== 'general' && $sector !== '') {
        $where  = 'WHERE sector = :sector';
        $params = [':sector' => normalize_sector_label($sector)];
    }

    $sql = "
        SELECT primary_problem, social_priority, political_climate,
               household_income, water_source, has_sewer, has_septic, has_internet,
               road_status, road_who_fixes,
               investment_acceptance, mine_reopening_perception, mine_benefits, mine_risks,
               authority_trust, age_range, respondent_gender, education_level,
               occupation, youth_path, women_roles,
               knows_mining_types, knows_mining_benefits,
               knows_modern_mining, knows_local_mines, knows_env_guarantees
        FROM surveys $where
    ";
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $n    = count($rows);

    if ($n === 0) {
        return ['total' => 0, 'grupos' => []];
    }

    // 'multi' key: 'pipe' = pipe-separated string, 'json' = JSON array, absent = single value
    // Grupos organizados segun secciones reales de la encuesta movil
    $grupos = [
        [
            'id'        => 'perfil',
            'titulo'    => 'Datos del Encuestado',
            'preguntas' => [
                ['campo' => 'age_range',          'pregunta' => 'Rango de edad del encuestado',       'tipo' => 'bar'],
                ['campo' => 'respondent_gender',  'pregunta' => 'Genero del encuestado',              'tipo' => 'donut'],
                ['campo' => 'education_level',    'pregunta' => 'Nivel de educacion del encuestado',  'tipo' => 'bar'],
            ],
        ],
        [
            'id'        => 'social',
            'titulo'    => 'Problematicas y Dinamica Social',
            'preguntas' => [
                ['campo' => 'primary_problem', 'pregunta' => 'Problematicas principales actuales (seleccion multiple)',         'tipo' => 'bar', 'multi' => 'pipe'],
                ['campo' => 'youth_path',      'pregunta' => 'A que se dedican los jovenes al terminar sus estudios',           'tipo' => 'bar',
                 'opciones' => ['Migracion por falta de oportunidades','Agricultura o trabajo informal','Continuan estudios superiores','Empleo local eventual','Otro']],
                ['campo' => 'women_roles',     'pregunta' => 'Limitaciones economicas frecuentes para mujeres del sector',      'tipo' => 'bar', 'multi' => 'json'],
            ],
        ],
        [
            'id'        => 'hogar',
            'titulo'    => 'Condiciones de Hogar y Validacion',
            'preguntas' => [
                ['campo' => 'water_source',     'pregunta' => 'Fuente principal de agua',                     'tipo' => 'bar',
                 'norm'    => ['Rio o acequia'=>'Rio o acequia','Río o acequia'=>'Rio o acequia',
                               'Red publica con tratamiento'=>'Red publica con tratamiento','Red pública con tratamiento'=>'Red publica con tratamiento',
                               'Vertiente comunal sin purificacion'=>'Vertiente comunal sin purificacion','Vertiente comunal sin purificación'=>'Vertiente comunal sin purificacion',
                               'Tanquero u otra compra'=>'Tanquero u otra compra'],
                 'opciones' => ['Red publica con tratamiento','Vertiente comunal sin purificacion','Rio o acequia','Tanquero u otra compra']],
                ['campo' => 'has_sewer',        'pregunta' => 'Alcantarillado',                               'tipo' => 'donut',
                 'norm'    => ['Si tiene'=>'Si tiene','Sí tiene'=>'Si tiene','si tiene'=>'Si tiene','No tiene'=>'No tiene','no tiene'=>'No tiene'],
                 'opciones' => ['Si tiene','No tiene']],
                ['campo' => 'has_septic',       'pregunta' => 'Fosa septica',                                 'tipo' => 'donut',
                 'norm'    => ['Si tiene'=>'Si tiene','Sí tiene'=>'Si tiene','si tiene'=>'Si tiene','No tiene'=>'No tiene','no tiene'=>'No tiene'],
                 'opciones' => ['Si tiene','No tiene']],
                ['campo' => 'has_internet',     'pregunta' => 'Conectividad a internet',                      'tipo' => 'bar',
                 'norm'    => ['Si estable'=>'Si estable','Sí estable'=>'Si estable','Intermitente'=>'Intermitente','No tiene'=>'No tiene','no tiene'=>'No tiene'],
                 'opciones' => ['Si estable','Intermitente','No tiene']],
                ['campo' => 'road_status',      'pregunta' => 'Estado de las vias de acceso',                 'tipo' => 'bar',
                 'norm'    => ['Bueno'=>'Bueno','Buen estado'=>'Bueno','Buena'=>'Bueno','bueno'=>'Bueno','Regular'=>'Regular','regular'=>'Regular','Malo'=>'Malo','Mal estado'=>'Malo','Mala'=>'Malo','malo'=>'Malo'],
                 'opciones' => ['Bueno','Regular','Malo']],
                ['campo' => 'road_who_fixes',   'pregunta' => 'Quien debe arreglar las vias',                 'tipo' => 'bar',
                 'opciones' => ['GAD Parroquial','GAD Cantonal','GAD Provincial']],
                ['campo' => 'household_income', 'pregunta' => 'Ingresos del hogar',                           'tipo' => 'bar',
                 'norm'    => ['No cubre la canasta'=>'No cubre la canasta','Cubre apenas'=>'Cubre apenas','Cubre con algo de holgura'=>'Cubre con algo de holgura','Holgado'=>'Cubre con algo de holgura'],
                 'opciones' => ['No cubre la canasta','Cubre apenas','Cubre con algo de holgura']],
                ['campo' => 'authority_trust',  'pregunta' => 'Confianza en autoridades',                     'tipo' => 'bar',
                 'norm'    => ['Alta'=>'Alta','alta'=>'Alta','Media-alta'=>'Alta','Media'=>'Media','media'=>'Media','Moderada'=>'Media','Baja'=>'Baja','baja'=>'Baja','Muy baja'=>'Baja','Nula'=>'Baja'],
                 'opciones' => ['Alta','Media','Baja']],
            ],
        ],
        [
            'id'        => 'clima',
            'titulo'    => 'Clima Politico y Percepcion Territorial',
            'preguntas' => [
                ['campo' => 'political_climate',         'pregunta' => 'Como se esta manejando la parte politica local',                 'tipo' => 'bar',
                 'opciones' => ['Desconfianza institucional','Division comunitaria','Estabilidad relativa','Conflicto abierto entre actores']],
                ['campo' => 'social_priority',           'pregunta' => 'Si aparecen inversiones externas, en que invertir (multi)',      'tipo' => 'bar', 'multi' => 'pipe'],
                ['campo' => 'investment_acceptance',     'pregunta' => 'Aceptacion de inversion externa en el sector',                   'tipo' => 'bar',
                 'opciones' => ['Rechazo preventivo','Aceptacion condicionada','Aceptacion amplia']],
                ['campo' => 'mine_reopening_perception', 'pregunta' => 'Percepcion sobre la reapertura de la mina',                      'tipo' => 'bar',
                 'opciones' => ['Beneficiaria mucho','Beneficiaria algo','Beneficio dudoso','No beneficiaria']],
                ['campo' => 'mine_benefits',             'pregunta' => 'Principales beneficios esperados de la mineria (multi)',         'tipo' => 'bar', 'multi' => 'json',
                 'opciones' => ['Empleo juvenil','Movimiento comercial','Obras comunitarias','Pago de impuestos','Ninguno claro']],
                ['campo' => 'mine_risks',                'pregunta' => 'Principales riesgos percibidos de la mineria (multi)',           'tipo' => 'bar', 'multi' => 'json',
                 'opciones' => ['Contaminacion del agua','Danos al suelo','Conflicto social','Poca transparencia']],
            ],
        ],
        [
            'id'        => 'conocimiento',
            'titulo'    => 'Conocimiento sobre Mineria',
            'preguntas' => [
                ['campo' => 'knows_mining_types',    'pregunta' => 'Conoce de mineria subterranea, a cielo abierto o combinada', 'tipo' => 'donut', 'opciones' => ['Si','No','Primera vez que escucho']],
                ['campo' => 'knows_mining_benefits', 'pregunta' => 'Conoce los beneficios que puede traer la mineria',           'tipo' => 'donut', 'opciones' => ['Si','No','Primera vez que escucho']],
                ['campo' => 'knows_modern_mining',   'pregunta' => 'Conoce la mineria moderna y sus estandares ambientales',     'tipo' => 'donut', 'opciones' => ['Si','No','Primera vez que escucho esto']],
                ['campo' => 'knows_local_mines',     'pregunta' => 'Conoce los proyectos mineros activos en su zona',            'tipo' => 'donut', 'opciones' => ['Si','No','Hay que investigar']],
                ['campo' => 'knows_env_guarantees',  'pregunta' => 'Conoce las garantias ambientales exigidas a las empresas',   'tipo' => 'donut', 'opciones' => ['Si','No','Asi deberia ser']],
            ],
        ],
    ];

    foreach ($grupos as &$grupo) {
        foreach ($grupo['preguntas'] as &$preg) {
            if (!empty($preg['multi'])) {
                $dist = freq_dist_multi($rows, $preg['campo'], $preg['multi']);
            } else {
                $dist = freq_dist($rows, $preg['campo']);
            }
            // Aplicar mapa de normalizacion si el campo lo define
            if (!empty($preg['norm'])) {
                $merged = [];
                foreach ($dist['items'] as $item) {
                    $canon = $preg['norm'][$item['label']] ?? $item['label'];
                    $merged[$canon] = ($merged[$canon] ?? 0) + $item['count'];
                }
                $total = $dist['total_respondentes'];
                arsort($merged);
                $items = [];
                foreach ($merged as $label => $count) {
                    $items[] = ['label' => $label, 'count' => $count,
                                'pct' => $total > 0 ? round(($count / $total) * 100, 1) : 0.0];
                }
                $dist['items'] = $items;
            }
            // Garantizar que todas las opciones fijas aparezcan (aunque tengan 0 respuestas)
            if (!empty($preg['opciones'])) {
                $existing = array_column($dist['items'], 'count', 'label');
                $total = $dist['total_respondentes'];
                $items = [];
                foreach ($preg['opciones'] as $opt) {
                    $count = $existing[$opt] ?? 0;
                    $items[] = ['label' => $opt, 'count' => $count,
                                'pct' => $total > 0 ? round(($count / $total) * 100, 1) : 0.0];
                }
                // Tambien incluir valores no esperados (respuestas libres, etc.)
                foreach ($dist['items'] as $item) {
                    if (!in_array($item['label'], $preg['opciones'], true)) {
                        $items[] = $item;
                    }
                }
                $dist['items'] = $items;
            }
            $preg['distribucion'] = $dist['items'];
            $preg['respondentes'] = $dist['total_respondentes'];
            unset($preg['multi'], $preg['norm'], $preg['opciones']);
        }
        unset($preg);
    }
    unset($grupo);

    return ['total' => $n, 'grupos' => $grupos];
}

