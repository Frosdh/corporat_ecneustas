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
            'mine_benefits'       => "TEXT         NOT NULL DEFAULT ''",
            'mine_risks'          => "TEXT         NOT NULL DEFAULT ''",
            'women_roles'         => "TEXT         NOT NULL DEFAULT ''",
            'occupation'          => "VARCHAR(120) NOT NULL DEFAULT ''",
        ];

        foreach ($newColumns as $col => $definition) {
            if (!in_array($col, $columns)) {
                $pdo->exec("ALTER TABLE surveys ADD COLUMN `$col` $definition");
            }
        }

        // Aseguramos que todas las columnas de respuesta acepten NULL o string vacÃ­o
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

    // Campos que siempre deben ser string (nunca null) â€” encuestas con campos vacÃ­os son vÃ¡lidas
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
            // null o false â†’ string vacÃ­o; cualquier otro valor â†’ trim
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
    // Todas las preguntas son opcionales â€” no se valida ningÃºn campo
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
    // El INSERT se construye dinÃ¡micamente segÃºn las columnas que realmente existen
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
    $sector = trim($sector);
    
    // Remover acentos para normalizar la comparacion
    $search = ['Ã¡','Ã©','Ã­','Ã³','Ãº','Ã','Ã‰','Ã','Ã“','Ãš'];
    $replace = ['a','e','i','o','u','a','e','i','o','u'];
    $lowerNorm = strtolower(str_replace($search, $replace, $sector));
    
    if (strpos($lowerNorm, 'bartoloma') !== false || strpos($lowerNorm, 'bartolome') !== false) {
        return 'San BartolomÃ©';
    }
    if (strpos($lowerNorm, 'sigsig') !== false) {
        return 'SÃ­gsig';
    }
    if (strpos($lowerNorm, 'deleg') !== false) {
        return 'La Deleg';
    }
    if ($lowerNorm === 'centro' || $lowerNorm === 'centro parroquial') {
        return 'Centro Parroquial';
    }
    if (strpos($lowerNorm, 'sallac') !== false) {
        return 'Sallac';
    }
    if (strpos($lowerNorm, 'pishio') !== false) {
        return 'Pishio';
    }
    
    return mb_convert_case($sector, MB_CASE_TITLE, 'UTF-8');
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
            ROUND(AVG(CASE WHEN has_sewer = 'No tiene' OR water_source LIKE '%sin%' OR water_source LIKE '%acequia%' OR water_source LIKE '%vertiente%' THEN 100 ELSE 0 END), 1) AS structural_poverty,
            ROUND(AVG(CASE WHEN mine_reopening_perception IN ('Beneficiaria mucho', 'Beneficiaria algo') OR investment_acceptance IN ('Aceptacion condicionada', 'Aceptacion amplia') THEN 100 ELSE 0 END), 1) AS acceptance_rate
        FROM surveys
        $where
    ";
    $stmt = db()->prepare($summarySql);
    $stmt->execute($params);
    $summary = $stmt->fetch() ?: [];

    // Conteo total igual que Analisis IA: COUNT(*) sobre toda la tabla surveys
    $countSql = "SELECT COUNT(*) FROM surveys";
    $summary['total_surveys'] = (int) db()->query($countSql)->fetchColumn();

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
                     'neutro'   => [],
                     'negativo' => ['Desconfianza institucional','Division comunitaria','Conflicto abierto entre actores']]],
        ['campo' => 'authority_trust',           'titulo' => 'Confianza Autoridades',
         'mapa'  => ['positivo' => ['Alta'],
                     'neutro'   => ['Media'],
                     'negativo' => ['Baja']]],
        ['campo' => 'investment_acceptance',     'titulo' => 'Inversion Externa',
         'mapa'  => ['positivo' => ['Aceptacion amplia','AceptaciÃ³n amplia'],
                     'neutro'   => ['Aceptacion condicionada','AceptaciÃ³n condicionada'],
                     'negativo' => ['Rechazo preventivo']]],
        ['campo' => 'mine_reopening_perception', 'titulo' => 'Reapertura Minera',
         'mapa'  => ['positivo' => ['Beneficiaria mucho','Beneficiaria algo'],
                     'neutro'   => ['Beneficio dudoso'],
                     'negativo' => ['No beneficiaria']]],
        ['campo' => 'household_income',          'titulo' => 'Economia Familiar',
         'mapa'  => ['positivo' => ['Cubre con algo de holgura'],
                     'neutro'   => ['Cubre apenas'],
                     'negativo' => ['No cubre la canasta']]],
        ['campo' => 'water_source',              'titulo' => 'Acceso al Agua',
         'mapa'  => ['positivo' => ['Red publica con tratamiento','Red pÃºblica con tratamiento'],
                     'neutro'   => ['Vertiente comunal sin purificacion','Vertiente comunal sin purificaciÃ³n','Tanquero u otra compra'],
                     'negativo' => ['Rio o acequia','RÃ­o o acequia']]],
        ['campo' => 'has_sewer',                 'titulo' => 'Alcantarillado',
         'mapa'  => ['positivo' => ['Si tiene','SÃ­ tiene'],
                     'neutro'   => [],
                     'negativo' => ['No tiene']]],
        ['campo' => 'has_internet',              'titulo' => 'Acceso a Internet',
         'mapa'  => ['positivo' => ['Si estable','SÃ­ estable'],
                     'neutro'   => ['Intermitente'],
                     'negativo' => ['No tiene']]],
        ['campo' => 'road_status',               'titulo' => 'Estado Vial',
         'mapa'  => ['positivo' => ['Bueno'],
                     'neutro'   => ['Regular'],
                     'negativo' => ['Malo']]],
    ];
    $dimsSentimiento = [];
    foreach ($dimsMaps as $cfg) {
        $dist = freq_dist($socialRows, $cfg['campo'], $cfg['mapa']);
        $sent = sentiment_index($dist);
        $dimsSentimiento[] = [
            'titulo'       => $cfg['titulo'],
            'indice'       => $sent['indice'],
            'positivo_pct' => $sent['positivo_pct'],
            'neutro_pct'   => $sent['neutro_pct'],
            'negativo_pct' => $sent['negativo_pct'],
            'n'            => $sent['total'],
        ];
    }

    $aggregatedSectors = [];
    foreach ($sectorRows as $row) {
        $norm = normalize_sector_label((string) $row['sector']);
        $aggregatedSectors[$norm] = ($aggregatedSectors[$norm] ?? 0) + (int) $row['total'];
    }
    arsort($aggregatedSectors);
    $surveysBySector = [];
    foreach ($aggregatedSectors as $label => $total) {
        $surveysBySector[] = ['label' => $label, 'total' => $total];
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
            'surveys_by_sector' => $surveysBySector,
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
            'favorable_count' => $stanceCounts['favorable'],
            'conditioned_count' => $stanceCounts['condicionada'],
            'contrary_count' => $stanceCounts['contraria'],
            'stance_total' => array_sum($stanceCounts),
            'favorable_pct' => array_sum($stanceCounts) > 0 ? round(($stanceCounts['favorable'] / array_sum($stanceCounts)) * 100, 1) : 0.0,
            'conditioned_pct' => array_sum($stanceCounts) > 0 ? round(($stanceCounts['condicionada'] / array_sum($stanceCounts)) * 100, 1) : 0.0,
            'contrary_pct' => array_sum($stanceCounts) > 0 ? round(($stanceCounts['contraria'] / array_sum($stanceCounts)) * 100, 1) : 0.0,
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

function get_survey_detail(int $id): array
{
    require_auth();
    if ($id <= 0) throw new InvalidArgumentException('ID de encuesta invalido.');

    $stmt = db()->prepare("
        SELECT
            s.id, s.client_uuid, s.sector, s.community, s.survey_date, s.survey_status,
            s.surveyor_id, COALESCE(s.surveyor_name, sv.full_name) AS surveyor_name,
            s.respondent_name, s.respondent_last_name, s.respondent_id_document,
            s.respondent_email, s.respondent_phone,
            s.respondent_gender, s.age_range, s.education_level, s.occupation,
            s.primary_problem, s.youth_path, s.women_roles,
            s.water_source, s.has_sewer, s.has_septic, s.has_internet,
            s.road_status, s.road_who_fixes, s.household_income,
            s.political_climate, s.authority_trust, s.social_priority,
            s.investment_acceptance, s.mine_reopening_perception,
            s.mine_benefits, s.mine_risks,
            s.knows_mining_types, s.knows_mining_benefits, s.knows_modern_mining,
            s.knows_local_mines, s.knows_env_guarantees,
            s.comments, s.latitude, s.longitude
        FROM surveys s
        LEFT JOIN surveyors sv ON sv.id = s.surveyor_id
        WHERE s.id = :id
    ");
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) throw new InvalidArgumentException('Encuesta no encontrada.');

    // Normalizar campos JSON
    foreach (['women_roles', 'mine_benefits', 'mine_risks'] as $f) {
        $row[$f] = $row[$f] ? json_decode((string)$row[$f], true) : [];
    }
    return $row;
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
//  MÃ“DULO DE ANÃLISIS EXPERTO DE ENCUESTAS
//  EstadÃ­stica descriptiva + sentimiento comunitario en tiempo real
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
        'authority_trust'            => "La confianza ciudadana en autoridades es {$tono}. \"{$lbl}\" concentra el {$pct}% de percepciones. Un {$negP}% de desconfianza indica terreno fertil para demandas de mayor transparencia y rendicion de cuentas â€” factor critico en procesos de licencia social.",
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
    $mapC = ['positivo' => ['Si', 'SÃ­', 'Algo', 'Bastante', 'Mucho'], 'negativo' => ['No', 'Nada', 'Poco']];
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
        SELECT *
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

    // Mapas de sentimiento â€” valores exactos del app movil
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
        'positivo' => ['Aceptacion amplia','AceptaciÃ³n amplia'],
        'neutro'   => ['Aceptacion condicionada','AceptaciÃ³n condicionada'],
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
        'positivo' => ['Red publica con tratamiento','Red pÃºblica con tratamiento'],
        'neutro'   => ['Vertiente comunal sin purificacion','Vertiente comunal sin purificaciÃ³n','Tanquero u otra compra'],
        'negativo' => ['Rio o acequia','RÃ­o o acequia'],
    ];
    $mapAlcant = [
        'positivo' => ['Si tiene','SÃ­ tiene'],
        'neutro'   => [],
        'negativo' => ['No tiene'],
    ];
    $mapInternet = [
        'positivo' => ['Si estable','SÃ­ estable'],
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
                   ('Aceptacion amplia','AceptaciÃ³n amplia','Aceptacion condicionada','AceptaciÃ³n condicionada')
                   THEN 100 ELSE 0 END), 1) AS apertura_pct
        FROM surveys $where
        GROUP BY DATE(survey_date)
        ORDER BY dia DESC LIMIT 14
    ";
    $tendStmt = db()->prepare($tendSql);
    $tendStmt->execute($params);
    $tendencia = array_reverse($tendStmt->fetchAll());

    // CorrelaciÃ³n: ingreso bajo vs. apertura a inversiÃ³n
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

    // DistribuciÃ³n por sector
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

    // DimensiÃ³n mÃ¡s positiva y mÃ¡s negativa
    $dimsSorted = $dimensiones;
    usort($dimsSorted, fn($a, $b) => $b['sentimiento']['indice'] <=> $a['sentimiento']['indice']);
    $dimPos = $dimsSorted[0]  ?? null;
    $dimNeg = end($dimsSorted) ?: null;

    // Problema principal
    $probCounts = [];
    foreach ($rows as $r) {
        $val = trim((string)($r['primary_problem'] ?? ''));
        if ($val === '') continue;
        $parts = explode('|', $val);
        foreach ($parts as $p) {
            $p = trim($p);
            if ($p !== '') {
                $probCounts[$p] = ($probCounts[$p] ?? 0) + 1;
            }
        }
    }
    arsort($probCounts);
    $probTop = !empty($probCounts) ? array_key_first($probCounts) : '';

    // Limpiar caracteres corruptos (diamond) u otros caracteres invÃ¡lidos sin modificar la BD
    $probTop = @mb_convert_encoding($probTop, 'UTF-8', 'UTF-8'); // limpia bytes invÃ¡lidos
    $probTop = str_replace(["\xEF\xBF\xBD", "", ""], "", $probTop);
    $probTop = trim($probTop);
    if (empty($probTop)) {
        $probTop = 'Sin datos claros';
    }

    $narrativa = sprintf(
        'Con base en %d encuestas levantadas en San BartolomÃ©, el Ã­ndice de sentimiento comunitario compuesto es %s puntos (escala -100 a +100), clasificado como %s. El %s%% de las percepciones evaluadas son positivas y el %s%% son negativas. La problemÃ¡tica que mÃ¡s preocupa a la ciudadanÃ­a es "%s". La dimensiÃ³n con mejor Ã­ndice es "%s" (%s pts) y la mÃ¡s crÃ­tica es "%s" (%s pts). Estos datos reflejan el pulso real del territorio al momento del anÃ¡lisis.',
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
            'label_a'        => 'Hogares con ingreso bajo â€” apertura a inversion',
            'valor_b'        => $corrAlto,
            'label_b'        => 'Hogares con ingreso alto â€” apertura a inversion',
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
        SELECT *
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
                 'norm'    => ['Rio o acequia'=>'Rio o acequia','RÃ­o o acequia'=>'Rio o acequia',
                               'Red publica con tratamiento'=>'Red publica con tratamiento','Red pÃºblica con tratamiento'=>'Red publica con tratamiento',
                               'Vertiente comunal sin purificacion'=>'Vertiente comunal sin purificacion','Vertiente comunal sin purificaciÃ³n'=>'Vertiente comunal sin purificacion',
                               'Tanquero u otra compra'=>'Tanquero u otra compra'],
                 'opciones' => ['Red publica con tratamiento','Vertiente comunal sin purificacion','Rio o acequia','Tanquero u otra compra']],
                ['campo' => 'has_sewer',        'pregunta' => 'Alcantarillado',                               'tipo' => 'donut',
                 'norm'    => ['Si tiene'=>'Si tiene','SÃ­ tiene'=>'Si tiene','si tiene'=>'Si tiene','No tiene'=>'No tiene','no tiene'=>'No tiene'],
                 'opciones' => ['Si tiene','No tiene']],
                ['campo' => 'has_septic',       'pregunta' => 'Fosa septica',                                 'tipo' => 'donut',
                 'norm'    => ['Si tiene'=>'Si tiene','SÃ­ tiene'=>'Si tiene','si tiene'=>'Si tiene','No tiene'=>'No tiene','no tiene'=>'No tiene'],
                 'opciones' => ['Si tiene','No tiene']],
                ['campo' => 'has_internet',     'pregunta' => 'Conectividad a internet',                      'tipo' => 'bar',
                 'norm'    => ['Si estable'=>'Si estable','SÃ­ estable'=>'Si estable','Intermitente'=>'Intermitente','No tiene'=>'No tiene','no tiene'=>'No tiene'],
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

// ============================================================
//  PLAN ESTRATÃ‰GICO MINERO â€” Generado por IA (Gemini)
// ============================================================
function get_plan_minero_ia(string $sector = 'general'): array
{
    $cfg = require __DIR__ . '/config.php';
    $apiKey = $cfg['gemini']['api_key'] ?? '';
    $model  = $cfg['gemini']['model']  ?? 'gemini-1.5-flash';

    if (empty($apiKey)) {
        return ['ok' => false, 'error' => 'API key de Gemini no configurada. AgrÃ©gala en backend/config.php'];
    }

    // --- Recopilar datos reales de encuestas para el prompt ---
    $analisis = get_analisis_experto($sector);
    if (($analisis['total'] ?? 0) === 0) {
        return ['ok' => false, 'error' => 'Sin datos de encuestas para generar el plan.'];
    }

    $r   = $analisis['resumen_ejecutivo']  ?? [];
    $sg  = $analisis['sentimiento_global'] ?? [];
    $dimMinera = null;
    foreach (($analisis['dimensiones'] ?? []) as $d) {
        if (stripos($d['nombre'] ?? $d['titulo'] ?? '', 'miner') !== false) {
            $dimMinera = $d;
            break;
        }
    }

    $benList  = implode(', ', array_column(array_slice($analisis['beneficios_mineros'] ?? [], 0, 5), 'label'));
    $rskList  = implode(', ', array_column(array_slice($analisis['riesgos_mineros']    ?? [], 0, 5), 'label'));
    $conocList = implode(', ', array_map(fn($k) => "{$k['label']} ({$k['pct']}%)", array_slice($analisis['conocimiento_minero'] ?? [], 0, 4)));

    $idxMin   = $dimMinera ? ($dimMinera['sentimiento']['indice']      ?? $r['indice_global'] ?? 0) : ($r['indice_global'] ?? 0);
    $apoyoPct = $dimMinera ? ($dimMinera['sentimiento']['positivo_pct'] ?? $sg['positivo_pct'] ?? 0) : ($sg['positivo_pct'] ?? 0);
    $rechPct  = $dimMinera ? ($dimMinera['sentimiento']['negativo_pct'] ?? $sg['negativo_pct'] ?? 0) : ($sg['negativo_pct'] ?? 0);
    $totalEnc = $r['total_encuestas'] ?? $analisis['total'] ?? 0;
    $nivelSent = $r['nivel_sentimiento'] ?? 'No determinado';
    $probPrinc = $r['problema_principal'] ?? 'No identificado';

    // Correlaciones relevantes
    $corrTexto = '';
    foreach (array_slice($analisis['correlaciones'] ?? [], 0, 3) as $c) {
        $corrTexto .= "- {$c['titulo']}: {$c['descripcion']}\n";
    }

    $prompt = <<<PROMPT
Eres un experto en planificaciÃ³n estratÃ©gica minera, desarrollo territorial sostenible y gestiÃ³n comunitaria en Ecuador.

Se te proporcionan los datos reales de {$totalEnc} encuestas comunitarias realizadas en la parroquia San BartolomÃ©, sector "{$sector}", sobre la percepciÃ³n ciudadana de la actividad minera:

DATOS DE ENCUESTAS:
- Ãndice neto de sentimiento: {$idxMin} puntos (escala -100 a +100)
- Nivel de sentimiento: {$nivelSent}
- Apoyo a la actividad minera: {$apoyoPct}%
- Rechazo a la actividad minera: {$rechPct}%
- Problema principal identificado: {$probPrinc}
- Beneficios reconocidos por la comunidad: {$benList}
- Riesgos identificados por la comunidad: {$rskList}
- Nivel de conocimiento sobre minerÃ­a: {$conocList}
- Correlaciones clave:
{$corrTexto}

INSTRUCCIÃ“N:
Con base en estos datos reales, genera un Plan EstratÃ©gico Integral para la Reapertura de la Actividad Minera en el sector. El plan debe incluir exactamente estas secciones en formato JSON:

{
  "diagnostico": "PÃ¡rrafo de diagnÃ³stico situacional basado en los datos (3-4 oraciones, datos concretos)",
  "factores_facilitadores": ["item1", "item2", "item3", "item4", "item5"],
  "factores_limitantes": ["item1", "item2", "item3", "item4", "item5"],
  "acciones_prioritarias": [
    {"accion": "...", "responsable": "...", "plazo": "...", "prioridad": "ALTA|MEDIA|BAJA"},
    ... (7 acciones)
  ],
  "requerimientos": {
    "tecnicos": ["item1","item2","item3","item4"],
    "legales": ["item1","item2","item3","item4"],
    "ambientales": ["item1","item2","item3","item4"],
    "sociales": ["item1","item2","item3","item4"]
  },
  "riesgos": [
    {"riesgo": "...", "probabilidad": "Alta|Media|Baja", "impacto": "Alto|Medio|Bajo", "control": "..."},
    ... (6 riesgos)
  ],
  "cronograma": [
    {"fase": "Fase 1", "periodo": "Meses 1-2", "descripcion": "..."},
    {"fase": "Fase 2", "periodo": "Meses 2-4", "descripcion": "..."},
    {"fase": "Fase 3", "periodo": "Meses 3-6", "descripcion": "..."},
    {"fase": "Fase 4", "periodo": "Meses 6-9", "descripcion": "..."},
    {"fase": "Fase 5", "periodo": "Mes 9+", "descripcion": "..."}
  ],
  "indicadores": [
    {"nombre": "...", "meta": "...", "medicion": "..."},
    ... (6 indicadores)
  ],
  "beneficios_esperados": [
    {"icono": "ðŸ’°", "titulo": "...", "descripcion": "..."},
    ... (5 beneficios)
  ],
  "conclusion": "PÃ¡rrafo conclusivo estratÃ©gico basado en los datos reales (4-5 oraciones, concreto y orientado a acciÃ³n)"
}

Usa los datos reales de las encuestas. Responde ÃšNICAMENTE con el JSON vÃ¡lido, sin texto adicional.
PROMPT;

    // --- Llamada a Gemini API ---
    $url     = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
    $payload = json_encode([
        'contents' => [['parts' => [['text' => $prompt]]]],
        'generationConfig' => [
            'temperature'     => 0.4,
            'maxOutputTokens' => 4096,
            'responseMimeType'=> 'application/json',
        ],
    ]);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $resp   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($err || $status !== 200) {
        return ['ok' => false, 'error' => "Error Gemini API (HTTP {$status}): {$err}"];
    }

    $body = json_decode($resp, true);
    $text = $body['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (empty($text)) {
        return ['ok' => false, 'error' => 'Gemini no devolviÃ³ contenido.'];
    }

    // Limpiar posibles backticks si Gemini los incluyÃ³
    $text = trim(preg_replace('/^```json\s*/i', '', preg_replace('/\s*```$/', '', trim($text))));
    $plan = json_decode($text, true);

    if (!is_array($plan)) {
        return ['ok' => false, 'error' => 'No se pudo parsear el JSON del plan generado por IA.'];
    }

    return ['ok' => true, 'plan' => $plan, 'sector' => $sector, 'total_encuestas' => $totalEnc];
}

// ============================================================
//  IA MINERA â€” Clasificador Naive Bayes (PHP puro)
//  Aprende de los datos de encuestas y predice aceptaciÃ³n
// ============================================================
function ia_minera_entrenar_y_analizar(string $sector = 'general'): array
{
    $params = [];
    $where  = '';
    if ($sector !== 'general') {
        $where             = 'WHERE sector = :sector';
        $params[':sector'] = $sector;
    }

    $stmt = db()->prepare("SELECT * FROM surveys $where ORDER BY survey_date DESC");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $n    = count($rows);

    if ($n === 0) {
        return ['ok' => false, 'error' => 'Sin datos para entrenar el modelo.'];
    }

    // --- Intentar entrenar y analizar usando la Red Neuronal local en Python ---
    $scriptPath = __DIR__ . '/ia_minera.py';
    $descriptorspec = [
        0 => ["pipe", "r"], // stdin
        1 => ["pipe", "w"], // stdout
        2 => ["pipe", "w"]  // stderr
    ];
    $jsonData = json_encode($rows, JSON_UNESCAPED_UNICODE);
    $pythonCmdLocal = get_python_cmd();
    $process = proc_open("$pythonCmdLocal \"$scriptPath\"", $descriptorspec, $pipes);
    if (is_resource($process)) {
        fwrite($pipes[0], $jsonData);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);
        $return_value = proc_close($process);
        if ($return_value === 0 && !empty($stdout)) {
            $pyResult = json_decode($stdout, true);
            if (is_array($pyResult) && ($pyResult['ok'] ?? false)) {
                return $pyResult;
            }
        }
    }

    // --- Definir clases objetivo ---
    // mine_reopening_perception â†’ AceptaciÃ³n / Neutral / Rechazo
    $claseMap = [
        'Beneficiaria mucho' => 'Aceptacion',
        'Beneficiaria algo'  => 'Aceptacion',
        'Beneficio dudoso'   => 'Neutral',
        'No beneficiaria'    => 'Rechazo',
    ];
    $clases = ['Aceptacion', 'Neutral', 'Rechazo'];

    // --- Features (predictores) ---
    $features = [
        'political_climate'    => 'Clima PolÃ­tico',
        'authority_trust'      => 'Confianza en Autoridades',
        'investment_acceptance'=> 'Apertura a InversiÃ³n',
        'household_income'     => 'SituaciÃ³n EconÃ³mica',
        'water_source'         => 'Fuente de Agua',
        'has_internet'         => 'Acceso a Internet',
        'road_status'          => 'Estado Vial',
        'has_sewer'            => 'Alcantarillado',
    ];

    // --- Entrenamiento Naive Bayes ---
    $conteoClase   = array_fill_keys($clases, 0);
    $conteoFeat    = [];  // [clase][feature][valor] => count
    $valoresFeat   = [];  // [feature] => set of values

    foreach ($rows as $row) {
        $claseRaw = trim($row['mine_reopening_perception'] ?? '');
        $clase    = $claseMap[$claseRaw] ?? null;
        if (!$clase) continue;

        $conteoClase[$clase]++;

        foreach (array_keys($features) as $feat) {
            $val = trim($row[$feat] ?? '');
            if ($val === '') $val = 'Sin dato';
            $conteoFeat[$clase][$feat][$val] = ($conteoFeat[$clase][$feat][$val] ?? 0) + 1;
            $valoresFeat[$feat][$val]         = true;
        }
    }

    $totalEntrenados = array_sum($conteoClase);
    if ($totalEntrenados === 0) {
        return ['ok' => false, 'error' => 'No hay encuestas con percepciÃ³n minera registrada.'];
    }

    // --- Probabilidades a priori P(clase) ---
    $probClase = [];
    foreach ($clases as $c) {
        $probClase[$c] = ($conteoClase[$c] + 1) / ($totalEntrenados + count($clases)); // Laplace
    }

    // --- Importancia de cada feature (Information Gain simplificado) ---
    $importancia = [];
    foreach (array_keys($features) as $feat) {
        $entropia_total = 0;
        $freq_feat = [];
        foreach ($rows as $row) {
            $val = trim($row[$feat] ?? '') ?: 'Sin dato';
            $freq_feat[$val] = ($freq_feat[$val] ?? 0) + 1;
        }
        $totalFeat = array_sum($freq_feat);
        foreach ($freq_feat as $val => $cnt) {
            $peso = $cnt / $totalFeat;
            // Entropia condicional por valor
            $e = 0;
            foreach ($clases as $c) {
                $p = (($conteoFeat[$c][$feat][$val] ?? 0) + 1) / ($conteoClase[$c] + count($valoresFeat[$feat]));
                if ($p > 0) $e -= $p * log($p, 2);
            }
            $entropia_total += $peso * $e;
        }
        $importancia[$feat] = round(max(0, log(count($clases), 2) - $entropia_total), 4);
    }
    arsort($importancia);

    // --- Predicciones por perfil: promediar sobre todos los rows ---
    $sumProbs = array_fill_keys($clases, 0.0);
    $contPred = 0;
    $prediccionesPorSector = [];

    foreach ($rows as $row) {
        $logProbs = [];
        foreach ($clases as $c) {
            $lp = log($probClase[$c]);
            foreach (array_keys($features) as $feat) {
                $val       = trim($row[$feat] ?? '') ?: 'Sin dato';
                $numValores = count($valoresFeat[$feat] ?? []) + 1;
                $p         = (($conteoFeat[$c][$feat][$val] ?? 0) + 1) / ($conteoClase[$c] + $numValores);
                $lp       += log($p);
            }
            $logProbs[$c] = $lp;
        }
        // Softmax para convertir log-probs a probabilidades
        $maxLP = max($logProbs);
        $exp   = [];
        $sumE  = 0;
        foreach ($logProbs as $c => $lp) {
            $exp[$c] = exp($lp - $maxLP);
            $sumE   += $exp[$c];
        }
        foreach ($clases as $c) {
            $sumProbs[$c] += $exp[$c] / $sumE;
        }
        $contPred++;

        // PredicciÃ³n por sector
        $sec = $row['sector'] ?? 'General';
        if (!isset($prediccionesPorSector[$sec])) {
            $prediccionesPorSector[$sec] = array_fill_keys($clases, 0.0);
            $prediccionesPorSector[$sec]['_n'] = 0;
        }
        foreach ($clases as $c) {
            $prediccionesPorSector[$sec][$c] += $exp[$c] / $sumE;
        }
        $prediccionesPorSector[$sec]['_n']++;
    }

    // Probabilidades globales promedio
    $probGlobal = [];
    foreach ($clases as $c) {
        $probGlobal[$c] = $contPred > 0 ? round(($sumProbs[$c] / $contPred) * 100, 1) : 0;
    }

    // Probabilidades por sector
    $sectorResults = [];
    foreach ($prediccionesPorSector as $sec => $vals) {
        $ns = $vals['_n'];
        $item = ['sector' => $sec, 'n' => $ns];
        foreach ($clases as $c) {
            $item[$c] = $ns > 0 ? round(($vals[$c] / $ns) * 100, 1) : 0;
        }
        $sectorResults[] = $item;
    }
    usort($sectorResults, fn($a,$b) => $b['Aceptacion'] <=> $a['Aceptacion']);

    // --- Perfiles de alto/bajo rechazo ---
    $perfil_rechazo = [];
    foreach (array_keys($importancia) as $feat) {
        $valores_rechazo = $conteoFeat['Rechazo'][$feat] ?? [];
        if (empty($valores_rechazo)) continue;
        arsort($valores_rechazo);
        $top = array_key_first($valores_rechazo);
        $pct = $conteoClase['Rechazo'] > 0 ? round(($valores_rechazo[$top] / $conteoClase['Rechazo']) * 100, 1) : 0;
        if ($pct >= 20) {
            $perfil_rechazo[] = [
                'factor'   => $features[$feat],
                'valor'    => $top,
                'pct'      => $pct,
            ];
        }
    }

    $perfil_aceptacion = [];
    foreach (array_keys($importancia) as $feat) {
        $valores_acept = $conteoFeat['Aceptacion'][$feat] ?? [];
        if (empty($valores_acept)) continue;
        arsort($valores_acept);
        $top = array_key_first($valores_acept);
        $pct = $conteoClase['Aceptacion'] > 0 ? round(($valores_acept[$top] / $conteoClase['Aceptacion']) * 100, 1) : 0;
        if ($pct >= 20) {
            $perfil_aceptacion[] = [
                'factor' => $features[$feat],
                'valor'  => $top,
                'pct'    => $pct,
            ];
        }
    }

    // --- Recomendaciones automÃ¡ticas basadas en el modelo ---
    $recomendaciones = [];
    $featureLabels = array_values($features);
    $impKeys = array_keys($importancia);

    if (!empty($impKeys)) {
        $top1 = $impKeys[0];
        $top2 = $impKeys[1] ?? null;
        $recomendaciones[] = "El factor mÃ¡s influyente en la predicciÃ³n es Â«{$features[$top1]}Â» â€” priorizar intervenciones en esta dimensiÃ³n.";
        if ($top2) {
            $recomendaciones[] = "Â«{$features[$top2]}Â» es el segundo factor mÃ¡s determinante â€” incluirlo en la estrategia de socializaciÃ³n.";
        }
    }
    if ($probGlobal['Rechazo'] > 40) {
        $recomendaciones[] = "Alta probabilidad de rechazo ({$probGlobal['Rechazo']}%) â€” se recomienda proceso de consulta previa intensivo antes de cualquier operaciÃ³n.";
    } elseif ($probGlobal['Aceptacion'] > 50) {
        $recomendaciones[] = "MayorÃ­a predictiva favorable ({$probGlobal['Aceptacion']}%) â€” condiciones favorables para iniciar diÃ¡logo formal de reapertura.";
    } else {
        $recomendaciones[] = "Escenario ambivalente â€” la comunidad requiere informaciÃ³n objetiva y espacios de participaciÃ³n para consolidar una postura.";
    }
    if (!empty($perfil_rechazo)) {
        $fr = $perfil_rechazo[0];
        $recomendaciones[] = "El perfil con mayor probabilidad de rechazo se caracteriza por Â«{$fr['factor']}: {$fr['valor']}Â» ({$fr['pct']}% del grupo de rechazo).";
    }
    $recomendaciones[] = "Implementar monitoreo continuo con encuestas periÃ³dicas para reentrenar el modelo conforme evolucione el sentimiento comunitario.";

    // --- Enriquecer recomendaciones con base de conocimiento cientÃ­fico ---
    $kbPath = __DIR__ . '/knowledge_base_mineria.json';
    $kb     = [];
    if (file_exists($kbPath)) {
        $kb = json_decode(file_get_contents($kbPath), true) ?: [];
    }

    // Si la base tiene menos de 5 entradas o tiene mÃ¡s de 7 dÃ­as, actualizar
    $shouldUpdate = empty($kb['papers']) || (time() - ($kb['updated_at'] ?? 0)) > 604800;
    if ($shouldUpdate) {
        $papers = fetch_semantic_scholar_papers([
            'artisanal mining community acceptance Ecuador',
            'mineria sostenible comunidades rurales Andes Ecuador',
            'mining social license to operate Latin America',
            'environmental impact mining water Andes communities',
            'participatory monitoring mining indigenous communities',
            'turismo minero patrimonio geologico Andes',
            'agricultura mineria coexistencia sostenible',
        ], 2);

        if (!empty($papers)) {
            // Extraer conceptos clave de los abstracts
            $conceptosClave = [];
            $riesgosLiteratura = [];
            $beneficiosLiteratura = [];

            $keywordsRiesgo   = ['contaminacion','agua','conflicto','rechazo','impacto ambiental','protest','water','conflict','pollution','opposition'];
            $keywordsBeneficio = ['empleo','employment','desarrollo','development','ingresos','income','community benefit','royalties'];
            $keywordsAcademia  = ['universidad','university','investigacion','research','capacitacion','training','academic'];

            foreach ($papers as $p) {
                $text = strtolower($p['titulo'] . ' ' . $p['resumen']);
                foreach ($keywordsRiesgo as $kw) {
                    if (str_contains($text, $kw)) { $riesgosLiteratura[$kw] = ($riesgosLiteratura[$kw] ?? 0) + 1; }
                }
                foreach ($keywordsBeneficio as $kw) {
                    if (str_contains($text, $kw)) { $beneficiosLiteratura[$kw] = ($beneficiosLiteratura[$kw] ?? 0) + 1; }
                }
            }

            arsort($riesgosLiteratura);
            arsort($beneficiosLiteratura);

            $kb = [
                'updated_at'          => time(),
                'papers'              => $papers,
                'top_riesgos'         => array_keys(array_slice($riesgosLiteratura, 0, 3, true)),
                'top_beneficios'      => array_keys(array_slice($beneficiosLiteratura, 0, 3, true)),
                'total_papers'        => count($papers),
            ];
            file_put_contents($kbPath, json_encode($kb, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        }
    }

    // Enriquecer recomendaciones con hallazgos de la literatura
    if (!empty($kb['papers'])) {
        $nPapers = $kb['total_papers'] ?? count($kb['papers']);
        $recomendaciones[] = "Evidencia cientifica ({$nPapers} articulos analizados): la literatura internacional respalda que la aceptacion minera aumenta cuando existe transparencia en la distribucion de beneficios y monitoreo ambiental participativo.";

        if (!empty($kb['top_riesgos'])) {
            $rTop = implode(', ', $kb['top_riesgos']);
            $recomendaciones[] = "La literatura cientifica identifica como factores de riesgo recurrentes: {$rTop}. El modelo los pondera como prioritarios en las intervenciones comunitarias.";
        }
        if (!empty($kb['top_beneficios'])) {
            $bTop = implode(', ', $kb['top_beneficios']);
            $recomendaciones[] = "Los estudios academicos destacan como beneficios percibidos: {$bTop}. Comunicar estos hallazgos a la comunidad puede mejorar la aceptacion segun el modelo predictivo.";
        }
    }

    // --- MÃ©tricas del modelo ---
    $precision_modelo = round(($totalEntrenados / $n) * 100, 1); // % de encuestas con clase vÃ¡lida
    $clasePredichaGlobal = array_search(max($probGlobal), $probGlobal);

    return [
        'ok'                    => true,
        'modelo'                => 'Naive Bayes Multinomial con suavizado de Laplace',
        'total_encuestas'       => $n,
        'encuestas_entrenadas'  => $totalEntrenados,
        'cobertura_datos'       => $precision_modelo,
        'sector'                => $sector,
        'prediccion_global'     => $clasePredichaGlobal,
        'probabilidades_globales'=> $probGlobal,
        'distribucion_clases'   => $conteoClase,
        'importancia_factores'  => array_map(
            fn($feat, $score) => [
                'factor' => $features[$feat] ?? $feat,
                'campo'  => $feat,
                'score'  => $score,
                'score_pct' => $importancia ? round(($score / max(array_values($importancia))) * 100, 1) : 0,
            ],
            array_keys($importancia),
            array_values($importancia)
        ),
        'perfil_aceptacion'     => array_slice($perfil_aceptacion, 0, 4),
        'perfil_rechazo'        => array_slice($perfil_rechazo, 0, 4),
        'prediccion_por_sector' => array_slice($sectorResults, 0, 10),
        'recomendaciones_ia'    => $recomendaciones,
        'base_conocimiento'     => [
            'total_papers'   => $kb['total_papers'] ?? 0,
            'top_riesgos'    => $kb['top_riesgos']  ?? [],
            'top_beneficios' => $kb['top_beneficios'] ?? [],
            'papers'         => array_slice($kb['papers'] ?? [], 0, 5),
            'updated_at'     => isset($kb['updated_at'])
                ? date('d/m/Y', $kb['updated_at'])
                : null,
        ],
        // Campos compatibles con el modelo Python extendido (valores vacÃ­os como fallback)
        'demografia'            => ['genero' => [], 'edad' => [], 'educacion' => [], 'ocupacion' => [], 'comunidad' => [], 'genero_vs_percepcion' => [], 'edad_vs_percepcion' => []],
        'conocimiento_minero'   => ['por_campo' => [], 'indice_conocimiento' => 0, 'cruce_vs_aceptacion' => []],
        'vectorizacion_temas'   => [],
        'vectorizacion_por_clase' => [],
        'metodologia'           => [
            'nombre' => 'Naive Bayes Multinomial â€” Motor Experto PHP (Fallback)',
            'fase_recoleccion'    => ['descripcion' => 'Encuestas estructuradas en campo.', 'total_registros' => $n, 'variables_clave' => array_values($features), 'instrumento' => 'Formulario digital multidimensional'],
            'fase_vectorizacion'  => ['descripcion' => 'No disponible en modo fallback.', 'tecnica' => 'N/A', 'temas_identificados' => []],
            'fase_clasificacion'  => ['descripcion' => 'Naive Bayes con suavizado de Laplace.', 'modelos' => [['nombre' => 'Naive Bayes Multinomial', 'arquitectura' => 'Suavizado Laplace Î±=1', 'precision' => null, 'uso' => 'ClasificaciÃ³n de percepciÃ³n minera']], 'variable_objetivo' => 'mine_reopening_perception â†’ Aceptacion/Neutral/Rechazo', 'n_entrenamiento' => $totalEntrenados],
            'fase_analisis'       => ['descripcion' => 'AnÃ¡lisis estadÃ­stico descriptivo.', 'componentes' => ['DistribuciÃ³n de clases', 'Importancia de variables (Information Gain)', 'PredicciÃ³n por sector']],
            'fase_plan_estrategico' => ['descripcion' => 'Plan generado con motor experto local.', 'proceso' => ['ClasificaciÃ³n Naive Bayes', 'AnÃ¡lisis de importancia de variables', 'GeneraciÃ³n de recomendaciones basadas en reglas']],
            'limitaciones'        => ['Modelo fallback sin Red Neuronal ni Random Forest.', 'Sin vectorizaciÃ³n TF-IDF de textos libres.', 'Sin anÃ¡lisis demogrÃ¡fico completo.', 'Instalar scikit-learn en el servidor para activar el modelo completo.'],
        ],
        'aprendizaje_gemini'    => ['activo' => false, 'planes_previos' => 0, 'factores_gemini' => [], 'actores_gemini' => [], 'nota_alineacion' => null],
        'articulos_cientificos' => [],
        'base_cientifica_minera'=> ['evidencia_ambiental' => [], 'evidencia_social' => [], 'evidencia_regulatoria' => [], 'mejores_practicas_cientificas' => [], 'hallazgos_clave' => '', 'total_articulos_recuperados' => 0],
    ];
}

// ============================================================
//  HELPER: Buscar artÃ­culos cientÃ­ficos reales via Semantic Scholar API
// ============================================================
function fetch_semantic_scholar_papers(array $queries, int $maxPerQuery = 3): array
{
    $papers = [];
    $seen   = [];

    foreach ($queries as $q) {
        $url = 'https://api.semanticscholar.org/graph/v1/paper/search?query='
             . urlencode($q)
             . '&fields=title,authors,year,venue,externalIds,abstract&limit=' . $maxPerQuery;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_USERAGENT      => 'SanBartolomeApp/1.0',
        ]);
        $resp = curl_exec($ch);
        curl_close($ch);

        if (!$resp) continue;
        $data = json_decode($resp, true);
        foreach ($data['data'] ?? [] as $p) {
            $title = $p['title'] ?? '';
            if (!$title || isset($seen[$title])) continue;
            $seen[$title] = true;

            $authors = implode(', ', array_column(array_slice($p['authors'] ?? [], 0, 3), 'name'));
            $year    = $p['year'] ?? '?';
            $venue   = $p['venue'] ?? '';
            $doi     = $p['externalIds']['DOI'] ?? '';
            $abstract= isset($p['abstract']) ? substr($p['abstract'], 0, 280) . '...' : '';

            $papers[] = [
                'titulo'   => $title,
                'autores'  => $authors,
                'anio'     => $year,
                'revista'  => $venue,
                'doi'      => $doi,
                'resumen'  => $abstract,
            ];
        }
    }
    return $papers;
}


// ============================================================
//  APRENDIZAJE ACUMULADO â€” Guardar conocimiento de Gemini
// ============================================================
function save_gemini_knowledge(array $plan, string $sector, int $total_encuestas): void
{
    $kbFile = __DIR__ . '/storage/knowledge_gemini.json';
    $kbDir  = dirname($kbFile);
    if (!is_dir($kbDir)) @mkdir($kbDir, 0755, true);

    // Cargar base existente o inicializar
    $kb = [];
    if (file_exists($kbFile)) {
        $kb = json_decode(file_get_contents($kbFile), true) ?: [];
    }

    // --- Extraer factores clave de los ejes estratÃ©gicos ---
    $factoresGemini = [];
    foreach ($plan['ejes_estrategicos'] ?? [] as $eje) {
        $nombre = trim($eje['eje'] ?? '');
        if ($nombre) $factoresGemini[] = $nombre;
    }

    // --- Extraer conceptos regulatorios ---
    $normasGemini = [];
    foreach ($plan['marco_regulatorio'] ?? [] as $nr) {
        $n = trim($nr['norma'] ?? '');
        if ($n) $normasGemini[] = $n;
    }

    // --- Extraer recomendaciones finales ---
    $recsGemini = array_filter(array_map('trim', $plan['recomendaciones_finales'] ?? []));

    // --- Extraer mejores prÃ¡cticas por nivel ---
    $practicasGemini = [];
    foreach ($plan['mejores_practicas'] ?? [] as $mp) {
        $nivel    = $mp['nivel']    ?? 'Internacional';
        $practica = $mp['practica'] ?? '';
        if ($practica) $practicasGemini[] = ['nivel' => $nivel, 'practica' => $practica, 'referencia' => $mp['referencia'] ?? ''];
    }

    // --- Extraer actores clave (quiÃ©nes Gemini recomienda involucrar) ---
    $actoresGemini = [];
    foreach ($plan['ejes_estrategicos'] ?? [] as $eje) {
        foreach ($eje['actores'] ?? [] as $actor) {
            $a = trim($actor);
            if ($a && !in_array($a, $actoresGemini)) $actoresGemini[] = $a;
        }
    }

    // --- Construir entrada de esta sesiÃ³n ---
    $entrada = [
        'fecha'            => date('Y-m-d H:i:s'),
        'sector'           => $sector,
        'total_encuestas'  => $total_encuestas,
        'titulo'           => $plan['titulo'] ?? '',
        'diagnostico'      => mb_substr($plan['diagnostico_contextual'] ?? '', 0, 400),
        'conclusion'       => mb_substr($plan['conclusion'] ?? '', 0, 400),
        'factores_clave'   => $factoresGemini,
        'normas_aplicadas' => $normasGemini,
        'recomendaciones'  => array_values(array_slice($recsGemini, 0, 6)),
        'mejores_practicas'=> $practicasGemini,
        'actores_clave'    => $actoresGemini,
    ];

    // Acumular: mÃ¡ximo 20 entradas histÃ³ricas (las mÃ¡s recientes)
    $kb['historial']   = array_slice(array_merge($kb['historial'] ?? [], [$entrada]), -20);
    $kb['updated_at']  = time();
    $kb['total_planes']= count($kb['historial']);

    // --- Consolidar conocimiento agregado (frecuencias acumuladas) ---
    $allFactores     = [];
    $allRecs         = [];
    $allActores      = [];
    $allPracticas    = [];
    foreach ($kb['historial'] as $h) {
        foreach ($h['factores_clave']    ?? [] as $f) $allFactores[]  = $f;
        foreach ($h['recomendaciones']   ?? [] as $r) $allRecs[]      = $r;
        foreach ($h['actores_clave']     ?? [] as $a) $allActores[]   = $a;
        foreach ($h['mejores_practicas'] ?? [] as $p) $allPracticas[] = $p['practica'] ?? '';
    }

    // Top factores por frecuencia (los que Gemini menciona mÃ¡s seguido)
    $freqFactores = array_count_values($allFactores);
    arsort($freqFactores);
    $kb['factores_frecuentes'] = array_slice(array_keys($freqFactores), 0, 10);

    // Top actores
    $freqActores = array_count_values($allActores);
    arsort($freqActores);
    $kb['actores_frecuentes'] = array_slice(array_keys($freqActores), 0, 10);

    // Recomendaciones Ãºnicas mÃ¡s recientes
    $kb['recomendaciones_consolidadas'] = array_values(array_unique(array_slice(array_reverse($allRecs), 0, 12)));

    // Mejores prÃ¡cticas Ãºnicas
    $kb['mejores_practicas_consolidadas'] = array_values(array_unique(array_filter($allPracticas)));

    @file_put_contents($kbFile, json_encode($kb, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

// ============================================================
//  PLAN ESTRATEGICO ENRIQUECIDO â€” Gemini API + Semantic Scholar
// ============================================================
function get_plan_gemini(string $sector = 'general'): array
{
    $cfg    = require __DIR__ . '/config.php';
    $apiKey = $cfg['gemini']['api_key'] ?? '';
    $model  = $cfg['gemini']['model']   ?? 'gemini-2.0-flash';

    if (empty($apiKey) || $apiKey === 'PEGA_AQUI_TU_NUEVA_API_KEY') {
        return ['ok' => false, 'error' => 'Configura tu API key de Gemini en backend/config.php'];
    }

    // ---- 1. Siempre correr la IA local primero (rÃ¡pida, sin cuota) ----
    $analisis = get_analisis_experto($sector);
    $ia       = ia_minera_entrenar_y_analizar($sector);
    $total    = $analisis['total'] ?? 0;

    if ($total === 0) {
        return ['ok' => false, 'error' => 'Sin datos de encuestas para generar el plan.'];
    }

    // ---- 2. Revisar cachÃ© (6 horas) ----
    $cacheDir  = __DIR__ . '/storage';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    $cacheKey  = 'plan_gemini_' . preg_replace('/[^a-z0-9_]/i', '_', $sector);
    $cacheFile = $cacheDir . '/' . $cacheKey . '.json';
    $cacheTTL  = 6 * 3600; // 6 horas

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if (is_array($cached) && !empty($cached['plan'])) {
            $cached['from_cache'] = true;
            $cached['total_encuestas'] = $total;
            return $cached;
        }
    }

    // ---- 3. Construir contexto para Gemini ----
    $r  = $analisis['resumen_ejecutivo']  ?? [];

    $idxGlobal = $r['indice_global']      ?? 0;
    $posGlobal = $r['positivo_global']    ?? 0;
    $negGlobal = $r['negativo_global']    ?? 0;
    $problema  = $r['problema_principal'] ?? 'No identificado';
    $nivel     = $r['nivel_sentimiento']  ?? 'Ambivalente';

    $beneficios = implode(', ', array_column(array_slice($analisis['beneficios_mineros'] ?? [], 0, 5), 'label'));
    $riesgos    = implode(', ', array_column(array_slice($analisis['riesgos_mineros']    ?? [], 0, 5), 'label'));

    $predIA    = $ia['prediccion_global'] ?? 'Sin datos';
    $probAcept = $ia['probabilidades_globales']['Aceptacion'] ?? 0;
    $probRech  = $ia['probabilidades_globales']['Rechazo']    ?? 0;
    $topFact   = implode(', ', array_column(array_slice($ia['importancia_factores'] ?? [], 0, 3), 'factor'));

    $sectoresStr = implode('; ', array_map(
        fn($s) => "{$s['sector']} (acepta {$s['Aceptacion']}%, rechaza {$s['Rechazo']}%)",
        array_slice($ia['prediccion_por_sector'] ?? [], 0, 4)
    ));

    // VectorizaciÃ³n: temas mÃ¡s frecuentes de los comentarios (del plan cientÃ­fico)
    $temasComunidad = '';
    if (!empty($ia['plan_cientifico']['diagnostico_contextual'])) {
        $temasComunidad = "- DiagnÃ³stico IA local: " . mb_substr($ia['plan_cientifico']['diagnostico_contextual'], 0, 300) . "...\n";
    }
    if (!empty($ia['vectorizacion_temas'])) {
        $temas = array_slice($ia['vectorizacion_temas'], 0, 6);
        $temasComunidad .= "- Temas dominantes en comentarios comunitarios: " . implode(', ', array_column($temas, 'tema')) . "\n";
    }

    // Buscar artÃ­culos cientÃ­ficos con Semantic Scholar
    $papers = fetch_semantic_scholar_papers([
        'artisanal small-scale mining community acceptance Ecuador',
        'mineria sostenible comunidades rurales Ecuador Andes',
        'mining social license to operate Latin America',
        'environmental impact mining water resources Andes',
        'community engagement mining sustainable development',
        'turismo minero patrimonio geologico America Latina',
    ], 3);

    $papersResumen = '';
    foreach (array_slice($papers, 0, 6) as $p) {
        $papersResumen .= "- {$p['autores']} ({$p['anio']}). {$p['titulo']}. {$p['revista']}.\n";
    }

    $prompt = "Eres un experto en planificacion territorial sostenible, regulacion minera ecuatoriana y gestion de conflictos socioambientales. "
        . "Conoces la Ley de Mineria del Ecuador (2009), reglamentos ARCOM, MAATE, Constitucion 2008 (Arts. 57, 407, 408), Convenio 169 OIT, estandares ICMM e IFC Performance Standards.\n\n"
        . "DATOS REALES â€” Parroquia San Bartolome, sector \"{$sector}\":\n"
        . "- Total encuestas: {$total}\n"
        . "- Indice sentimiento: {$idxGlobal} pts | Nivel: {$nivel}\n"
        . "- Apoyo: {$posGlobal}% | Rechazo: {$negGlobal}%\n"
        . "- Problema principal: {$problema}\n"
        . "- Beneficios reconocidos: {$beneficios}\n"
        . "- Riesgos percibidos: {$riesgos}\n"
        . "- Prediccion Red Neuronal: {$predIA} (acepta {$probAcept}% / rechaza {$probRech}%)\n"
        . "- Factores clave segun Random Forest: {$topFact}\n"
        . "- Por sector: {$sectoresStr}\n"
        . $temasComunidad . "\n"
        . "ARTICULOS CIENTIFICOS REALES DISPONIBLES (referencia para tu analisis):\n"
        . $papersResumen . "\n"
        . "INSTRUCCION: Genera un Plan Estrategico Integral basado en los datos reales y respaldado por evidencia cientifica. "
        . "Incluye: regulacion vigente, mejores practicas locales/regionales/nacionales/internacionales, "
        . "vinculacion con universidades y colectivos, empleo, formacion tecnica, turismo comunitario, agricultura sostenible. "
        . "Para referencias_cientificas: cita articulos REALES y relevantes sobre mineria. "
        . "Incluye DOI real cuando lo conozcas con seguridad.\n\n"
        . "Responde UNICAMENTE con este JSON valido (sin markdown, sin texto extra):\n"
        . '{"titulo":"...","diagnostico_contextual":"...","marco_regulatorio":[{"norma":"...","aplicacion":"..."}],'
        . '"mejores_practicas":[{"nivel":"Local|Regional|Nacional|Internacional","practica":"...","referencia":"...","aplicabilidad":"..."}],'
        . '"ejes_estrategicos":[{"eje":"...","descripcion":"...","actores":["..."],"acciones":["...","...","..."],"indicador":"..."}],'
        . '"vinculacion_academia":{"instituciones_sugeridas":["..."],"lineas_investigacion":["..."],"programas_propuestos":["..."]},'
        . '"plan_empleo_formacion":{"perfiles_requeridos":["..."],"instituciones_capacitacion":["..."],"metas":["..."]},'
        . '"turismo_agricultura":{"oportunidades_turismo":["..."],"oportunidades_agricultura":["..."],"sinergias":"..."},'
        . '"cronograma_estrategico":[{"fase":"Fase 1","periodo":"Meses 1-3","hitos":["...","..."]},{"fase":"Fase 2","periodo":"Meses 3-6","hitos":["...","..."]},{"fase":"Fase 3","periodo":"Meses 6-12","hitos":["...","..."]},{"fase":"Fase 4","periodo":"Anio 2+","hitos":["...","..."]}],'
        . '"referencias_cientificas":[{"autor":"Apellido A, Apellido B","anio":2022,"titulo":"Titulo real del articulo","revista":"Revista indexada","doi_url":"https://doi.org/...","relevancia":"Como aplica al caso"}],'
        . '"recomendaciones_finales":["...","...","...","...","..."],'
        . '"conclusion":"..."}';

    $payload = json_encode([
        'contents'         => [['parts' => [['text' => $prompt]]]],
        'generationConfig' => [
            'temperature'      => 0.4,
            'maxOutputTokens'  => 8192,
            'responseMimeType' => 'application/json',
        ],
    ], JSON_UNESCAPED_UNICODE);

    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";

    // ---- 4. Llamar a Gemini con 1 reintento (manejo de 429 / error temporal) ----
    $plan   = null;
    $lastStatus = 0;
    $lastErr    = '';

    for ($intento = 1; $intento <= 2; $intento++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT        => 55,
        ]);
        $resp       = curl_exec($ch);
        $lastStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $lastErr    = curl_error($ch);
        curl_close($ch);

        if ($lastErr || $lastStatus !== 200) {
            if ($lastStatus === 429 && $intento === 1) {
                // Cuota agotada: esperar 3 segundos y reintentar una vez
                sleep(3);
                continue;
            }
            // Fallo definitivo: usar plan de IA local como fallback
            break;
        }

        $body = json_decode($resp, true);
        $text = $body['candidates'][0]['content']['parts'][0]['text'] ?? '';
        if (empty($text)) {
            break;
        }

        $text = trim(preg_replace('/^```json\s*/i', '', preg_replace('/\s*```$/', '', trim($text))));
        $plan = json_decode($text, true);

        if (is_array($plan)) {
            break; // Ã‰xito
        }
    }

    // ---- 5. Si Gemini fallÃ³ â†’ fallback construido desde $analisis + $ia (siempre disponibles) ----
    if (!is_array($plan)) {
        // Datos siempre presentes (tanto del modelo Python como del Naive Bayes PHP)
        $predIA    = $ia['prediccion_global']                    ?? 'Ambivalente';
        $probAcept = $ia['probabilidades_globales']['Aceptacion'] ?? 0;
        $probRech  = $ia['probabilidades_globales']['Rechazo']    ?? 0;
        $probNeu   = $ia['probabilidades_globales']['Neutral']    ?? 0;
        $topFacts  = array_column(array_slice($ia['importancia_factores'] ?? [], 0, 3), 'factor');
        $recs      = $ia['recomendaciones_ia'] ?? ($ia['recomendaciones'] ?? []);
        $artCient  = $ia['articulos_cientificos'] ?? [];

        // Si el plan cientÃ­fico de Python estÃ¡ disponible, usarlo
        $planLocal = $ia['plan_cientifico'] ?? null;

        $diagnostico = "AnÃ¡lisis basado en {$total} encuestas reales de la Parroquia San BartolomÃ©. "
            . "La IA predice '{$predIA}' con {$probAcept}% de aceptaciÃ³n y {$probRech}% de rechazo. "
            . "Problema principal: {$problema}. Nivel de sentimiento: {$nivel}. "
            . "Factores determinantes: " . implode(', ', $topFacts ?: ['Clima PolÃ­tico', 'Confianza en Autoridades']) . ".";

        $cronograma = is_array($planLocal) && !empty($planLocal['cronograma_estrategico'])
            ? $planLocal['cronograma_estrategico']
            : [
                ['fase' => 'Fase 1', 'periodo' => 'Meses 1-3',  'hitos' => ['Conformar Mesa de DiÃ¡logo Comunitario', 'Instalar monitoreo hÃ­drico participativo', 'Firmar convenio con Universidad de Cuenca']],
                ['fase' => 'Fase 2', 'periodo' => 'Meses 3-6',  'hitos' => ['Iniciar cursos tÃ©cnicos SECAP', 'Implementar invernaderos tecnificados', 'Plataforma digital para artesanos locales']],
                ['fase' => 'Fase 3', 'periodo' => 'Meses 6-12', 'hitos' => ['Compras directas mina-agricultores', 'Centro Artesanal y EcoturÃ­stico', 'Primeras becas universitarias con regalÃ­as']],
                ['fase' => 'Fase 4', 'periodo' => 'AÃ±o 2+',     'hitos' => ['AuditorÃ­as ambientales independientes', 'ExpansiÃ³n del fondo comunitario', 'EvaluaciÃ³n de impacto socioeconÃ³mico']],
            ];

        $referenciasCient = !empty($artCient)
            ? array_map(fn($a) => [
                'autor'      => $a['autores'] ?? '',
                'anio'       => $a['anio'] ?? '',
                'titulo'     => $a['titulo'] ?? '',
                'revista'    => $a['revista'] ?? '',
                'doi_url'    => $a['doi_o_url'] ?? ($a['url'] ?? ''),
                'relevancia' => mb_substr($a['resumen'] ?? '', 0, 200),
            ], array_slice($artCient, 0, 5))
            : [
                ['autor' => 'Bebbington A. et al.', 'anio' => 2008, 'titulo' => 'Mining and Social Movements: Struggles Over Livelihood and Rural Territorial Development in the Andes', 'revista' => 'World Development', 'doi_url' => 'https://doi.org/10.1016/j.worlddev.2007.09.010', 'relevancia' => 'Marco de referencia para conflictos mineros en los Andes.'],
                ['autor' => 'Svampa M., Antonelli M.', 'anio' => 2009, 'titulo' => 'MinerÃ­a transnacional, narrativas del desarrollo y resistencias sociales', 'revista' => 'Editorial Biblos', 'doi_url' => '', 'relevancia' => 'AnÃ¡lisis de percepciones comunitarias frente a la minerÃ­a en AmÃ©rica Latina.'],
            ];

        $ejesEstrategicos = is_array($planLocal) && !empty($planLocal['acciones_prioritarias'])
            ? array_map(fn($a) => [
                'eje'         => $a['limitacion'] ?? 'Eje estratÃ©gico',
                'descripcion' => $a['accion'] ?? '',
                'actores'     => array_filter(explode(', ', $a['quien'] ?? '')),
                'acciones'    => [$a['accion'] ?? ''],
                'indicador'   => $a['contribucion'] ?? '',
            ], $planLocal['acciones_prioritarias'])
            : [
                ['eje' => 'Gobernanza y DiÃ¡logo Social', 'descripcion' => 'Establecer espacios permanentes de participaciÃ³n comunitaria.', 'actores' => ['GAD Parroquial', 'Empresa Operadora', 'Colectivos locales'], 'acciones' => ['Crear Mesa de DiÃ¡logo Permanente', 'Realizar Consulta Previa conforme Art. 57 ConstituciÃ³n y Conv. 169 OIT', 'Publicar informes de avance cada trimestre'], 'indicador' => 'NÂ° de reuniones realizadas y acuerdos firmados'],
                ['eje' => 'GarantÃ­as Ambientales e HÃ­dricas', 'descripcion' => 'Monitoreo independiente de agua y ecosistemas.', 'actores' => ['Universidad de Cuenca', 'Juntas de Agua', 'MAATE'], 'acciones' => ['Instalar estaciones de monitoreo hÃ­drico en tiempo real', 'Publicar datos abiertos de calidad del agua', 'AuditorÃ­as ambientales semestrales con veedurÃ­a acadÃ©mica'], 'indicador' => 'Ãndice Calidad del Agua (ICA) â‰¥ 80 pts'],
                ['eje' => 'Empleo Local y FormaciÃ³n TÃ©cnica', 'descripcion' => 'Garantizar al menos el 80% de mano de obra local calificada.', 'actores' => ['SECAP', 'Empresa Operadora', 'GAD Parroquial'], 'acciones' => ['Programa de certificaciÃ³n tÃ©cnica minera (6 meses)', 'Preferencia contractual para residentes de San BartolomÃ©', 'Fondo de becas universitarias con regalÃ­as mineras'], 'indicador' => 'â‰¥80% nÃ³mina local certificada'],
                ['eje' => 'DiversificaciÃ³n EconÃ³mica', 'descripcion' => 'Reducir dependencia extractiva con turismo y agroecologÃ­a.', 'actores' => ['Ministerio de Turismo', 'Asociaciones agrÃ­colas', 'Gremios artesanales'], 'acciones' => ['Ruta GeoturÃ­stica y EcoturÃ­stica San BartolomÃ©', 'Convenios de compra directa mina-agricultores locales', 'Centro Artesanal con exposiciÃ³n permanente de joyerÃ­a local'], 'indicador' => '+25% ingresos cooperativas agrÃ­colas/artesanales anuales'],
            ];

        $recsFinales = !empty($recs) ? $recs : [
            'Priorizar la Consulta Previa, Libre e Informada antes de cualquier operaciÃ³n minera.',
            'Establecer monitoreo hÃ­drico participativo con Universidad de Cuenca como Ã¡rbitro tÃ©cnico.',
            'Comprometer el 80% de contrataciÃ³n de mano de obra local calificada mediante SECAP.',
            'Destinar el 50% de regalÃ­as a fondos de desarrollo: turismo, agricultura tecnificada y becas.',
            'Realizar encuestas de seguimiento cada 3 meses para ajustar el plan estratÃ©gico.',
        ];

        $planFallback = [
            'titulo'                 => "Plan EstratÃ©gico Integral â€” Reapertura Minera Sostenible, San BartolomÃ© (sector: {$sector})",
            'diagnostico_contextual' => $diagnostico,
            'marco_regulatorio'      => [
                ['norma' => 'Ley de MinerÃ­a Ecuador (2009)', 'aplicacion' => 'Regula todas las fases de la actividad minera. Exige EIA, licencia ambiental y consulta previa.'],
                ['norma' => 'ConstituciÃ³n 2008, Arts. 57, 407, 408', 'aplicacion' => 'Garantiza derechos de la naturaleza y consulta previa libre e informada a comunidades.'],
                ['norma' => 'Convenio 169 OIT', 'aplicacion' => 'Obliga al Estado a consultar a pueblos indÃ­genas y comunidades antes de concesiones mineras.'],
                ['norma' => 'Reglamento ARCOM / MAATE', 'aplicacion' => 'FiscalizaciÃ³n tÃ©cnica y ambiental de operaciones mineras en Ecuador.'],
                ['norma' => 'EstÃ¡ndares IFC Performance Standards', 'aplicacion' => 'Buenas prÃ¡cticas internacionales de gestiÃ³n social y ambiental en minerÃ­a.'],
            ],
            'mejores_practicas'      => [
                ['nivel' => 'Internacional', 'practica' => 'Principios ICMM para minerÃ­a responsable', 'referencia' => 'International Council on Mining & Metals (ICMM)', 'aplicabilidad' => 'Marco global de sostenibilidad aplicable a todo proyecto minero en San BartolomÃ©.'],
                ['nivel' => 'Regional', 'practica' => 'Monitoreo hÃ­drico participativo comunitario (MHPC)', 'referencia' => 'Experiencias en PerÃº y Colombia con comunidades ribereÃ±as', 'aplicabilidad' => 'ReducciÃ³n documentada de conflictos hÃ­dricos en proyectos mineros andinos.'],
                ['nivel' => 'Nacional', 'practica' => 'Fondos de desarrollo local con regalÃ­as mineras (Ecuador)', 'referencia' => 'ARCOM â€” DistribuciÃ³n de regalÃ­as a GADs', 'aplicabilidad' => 'Mecanismo legal vigente para financiar turismo, educaciÃ³n y agricultura con regalÃ­as.'],
                ['nivel' => 'Local', 'practica' => 'Ruta artesanal y ecoturÃ­stica integrada a la minerÃ­a', 'referencia' => 'Experiencia de Portovelo-Zaruma, El Oro, Ecuador', 'aplicabilidad' => 'Demostrado en Ecuador: turismo minero como complemento econÃ³mico sostenible.'],
            ],
            'ejes_estrategicos'      => $ejesEstrategicos,
            'vinculacion_academia'   => [
                'instituciones_sugeridas' => ['Universidad de Cuenca (Facultad de Ciencias QuÃ­micas y Minas)', 'Universidad TÃ©cnica de Machala', 'ESPOL', 'FLACSO Ecuador'],
                'lineas_investigacion'    => ['Impacto hÃ­drico y calidad del agua en zonas mineras', 'Licencia social para operar en comunidades andinas', 'AgroecologÃ­a y minerÃ­a: coexistencia sostenible'],
                'programas_propuestos'    => ['Convenio de monitoreo ambiental participativo', 'PasantÃ­as tÃ©cnicas para jÃ³venes de San BartolomÃ©', 'InvestigaciÃ³n aplicada sobre flora y fauna local en zona de influencia'],
            ],
            'plan_empleo_formacion'  => [
                'perfiles_requeridos'        => ['TÃ©cnico en operaciones mineras (SECAP)', 'Ingeniero ambiental junior', 'TÃ©cnico en monitoreo hÃ­drico', 'GuÃ­a ecoturÃ­stico certificado', 'Operador de maquinaria pesada'],
                'instituciones_capacitacion' => ['SECAP', 'Universidad de Cuenca', 'Ministerio de Trabajo â€” formaciÃ³n dual'],
                'metas'                      => ['â‰¥80% de la nÃ³mina operativa con residencia en San BartolomÃ©', 'CertificaciÃ³n tÃ©cnica en 6 meses previo al inicio de operaciones', '50% de regalÃ­as a fondo de becas universitarias locales'],
            ],
            'turismo_agricultura'    => [
                'oportunidades_turismo'     => ['Ruta GeoturÃ­stica: minerales, cristales y formaciones rocosas de San BartolomÃ©', 'Museo Minero Vivo con historia de la minerÃ­a local', 'Festival Artesanal-Minero anual con joyerÃ­a en plata y oro', 'Sendero ecoturÃ­stico con interpretaciÃ³n ambiental'],
                'oportunidades_agricultura' => ['CertificaciÃ³n orgÃ¡nica de productos agrÃ­colas locales (cafÃ©, maÃ­z, frutales andinos)', 'Invernaderos tecnificados financiados con regalÃ­as mineras', 'Alianza directa mina-cooperativas agrÃ­colas para abastecimiento de insumos', 'ProducciÃ³n apÃ­cola en zonas de amortiguamiento'],
                'sinergias'                 => 'La diversificaciÃ³n hacia turismo y agroecologÃ­a reduce la dependencia extractiva, mejora la licencia social y genera ingresos alternativos que persisten mÃ¡s allÃ¡ del ciclo de vida de la mina.',
            ],
            'cronograma_estrategico'  => $cronograma,
            'referencias_cientificas' => $referenciasCient,
            'recomendaciones_finales' => $recsFinales,
            'conclusion'              => "Con {$total} encuestas analizadas, la IA determina una predicciÃ³n de '{$predIA}' "
                . "({$probAcept}% aceptaciÃ³n, {$probRech}% rechazo). La viabilidad de la reapertura minera en San BartolomÃ© "
                . "depende de equilibrar el sector extractivo con la agricultura, el turismo artesanal y las garantÃ­as ambientales verificables. "
                . "La participaciÃ³n activa de la comunidad desde el inicio es el factor mÃ¡s determinante para la licencia social.",
        ];

        $motivo = $lastStatus === 429
            ? 'Cuota de Gemini agotada (429). Se muestra el Plan EstratÃ©gico generado por la IA local con datos reales de las encuestas. Se actualizarÃ¡ automÃ¡ticamente cuando se restablezca la cuota.'
            : "Gemini no disponible (HTTP {$lastStatus}). Se muestra el plan generado por la IA local.";

        return [
            'ok'              => true,
            'plan'            => $planFallback,
            'sector'          => $sector,
            'total_encuestas' => $total,
            'fuente'          => 'ia_local',
            'aviso'           => $motivo,
        ];
    }

    // ---- 6. Enriquecer referencias con Semantic Scholar si Gemini no las incluyÃ³ ----
    if (empty($plan['referencias_cientificas']) && !empty($papers)) {
        $plan['referencias_cientificas'] = array_map(fn($p) => [
            'autor'      => $p['autores'],
            'anio'       => $p['anio'],
            'titulo'     => $p['titulo'],
            'revista'    => $p['revista'],
            'doi_url'    => $p['doi'] ? 'https://doi.org/' . $p['doi'] : '',
            'relevancia' => $p['resumen'],
        ], array_slice($papers, 0, 5));
    }

    // ---- 7. Guardar conocimiento acumulado de Gemini (aprendizaje persistente) ----
    save_gemini_knowledge($plan, $sector, $total);

    // ---- 8. Guardar en cachÃ© ----
    $result = ['ok' => true, 'plan' => $plan, 'sector' => $sector, 'total_encuestas' => $total, 'fuente' => 'gemini'];
    @file_put_contents($cacheFile, json_encode($result, JSON_UNESCAPED_UNICODE));

    return $result;
}

// ============================================================
//  INTEGRACION NVIDIA NEMOTRON LLM
// ============================================================
/**
 * Detecta el comando Python disponible en el servidor.
 */

/**
 * Fase 1: estadísticas locales instantáneas vía Python (sin llamada a NVIDIA).
 * Llama al mismo ia_nvidia.py pero con flag --stats-only para que salga
 * después de emitir el evento "stats" y antes de llamar al LLM.
 */
function get_llm_stats_only(string $sector = 'general'): array
{
    set_time_limit(60);

    $stmt = db()->prepare("SELECT * FROM surveys WHERE ? = 'general' OR sector = ?");
    $stmt->execute([$sector, $sector]);
    $surveys = $stmt->fetchAll();

    if (empty($surveys)) {
        return ['ok' => false, 'error' => 'No hay encuestas para analizar.'];
    }

    $inputData  = json_encode($surveys, JSON_UNESCAPED_UNICODE);
    $scriptPath = __DIR__ . '/ia_nvidia.py';
    $pythonCmd  = get_python_cmd();

    $descriptorspec = [0 => ["pipe","r"], 1 => ["pipe","w"], 2 => ["pipe","w"]];
    $process = proc_open("$pythonCmd \"$scriptPath\" --stats-only", $descriptorspec, $pipes);

    if (!is_resource($process)) {
        return ['ok' => false, 'error' => 'No se pudo ejecutar Python.'];
    }

    fwrite($pipes[0], $inputData);
    fclose($pipes[0]);

    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);

    foreach (explode("\n", trim($stdout)) as $line) {
        $line = trim($line);
        if (!$line) continue;
        $obj = json_decode($line, true);
        if (!is_array($obj)) continue;
        if (($obj['type'] ?? '') === 'stats') {
            $stats = $obj['stats'] ?? [];
            $stats['ok']             = true;
            $stats['total_encuestas']= count($surveys);
            $stats['motor']          = 'Estadistico Local';
            return $stats;
        }
        if (($obj['type'] ?? '') === 'error') {
            return ['ok' => false, 'error' => $obj['error'] ?? 'Error desconocido.'];
        }
    }
    return ['ok' => false, 'error' => 'Sin respuesta del script.'];
}

function get_python_cmd(): string {
    foreach (['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3'] as $cmd) {
        $out = shell_exec("$cmd --version 2>&1");
        if ($out && stripos($out, 'python') !== false) {
            return $cmd;
        }
    }
    return 'python3'; // fallback
}

function get_llm_nvidia(string $sector = 'general'): array
{
    // Aumentar el lÃ­mite de tiempo a 5 minutos para el LLM con reasoning
    set_time_limit(300);

    $stmt = db()->prepare("SELECT * FROM surveys WHERE ? = 'general' OR sector = ?");
    $stmt->execute([$sector, $sector]);
    $surveys = $stmt->fetchAll();

    if (empty($surveys)) {
        return ['ok' => false, 'error' => 'No hay encuestas para analizar en este sector.'];
    }

    $inputData  = json_encode($surveys, JSON_UNESCAPED_UNICODE);
    $scriptPath = __DIR__ . '/ia_nvidia.py';
    $pythonCmd  = get_python_cmd();

    $descriptorspec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"],
    ];

    $process = proc_open("$pythonCmd \"$scriptPath\"", $descriptorspec, $pipes);

    if (!is_resource($process)) {
        return ['ok' => false, 'error' => 'No se pudo ejecutar el script de Python. Verifique que Python estÃ© instalado.'];
    }

    fwrite($pipes[0], $inputData);
    fclose($pipes[0]);

    // Leer lÃ­neas NDJSON â€” el Ãºltimo "result" es la respuesta final
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    proc_close($process);

    // Procesar lÃ­neas NDJSON: buscar la lÃ­nea type=result
    $finalResult = null;
    $statsResult = null;
    $lines = explode("\n", trim($stdout));
    foreach ($lines as $line) {
        $line = trim($line);
        if (!$line) continue;
        $obj = json_decode($line, true);
        if (!is_array($obj)) continue;
        if (($obj['type'] ?? '') === 'result') {
            $finalResult = $obj;
        } elseif (($obj['type'] ?? '') === 'stats') {
            $statsResult = $obj['stats'] ?? null;
        } elseif (($obj['type'] ?? '') === 'error') {
            return ['ok' => false, 'error' => $obj['error'] ?? 'Error desconocido de Python.'];
        }
    }

    if ($finalResult) {
        $finalResult['total_encuestas'] = count($surveys);
        return $finalResult;
    }

    // Si no hay result pero hay stats, devolver stats estadÃ­sticos
    if ($statsResult) {
        $statsResult['ok']             = true;
        $statsResult['motor']          = 'EstadÃ­stico (LLM no disponible)';
        $statsResult['total_encuestas']= count($surveys);
        return $statsResult;
    }

    return ['ok' => false, 'error' => "Sin respuesta del script. Raw: " . substr($stdout, 0, 300) . " Err: " . substr($stderr, 0, 200)];
}

/**
 * Endpoint SSE: transmite eventos NDJSON de ia_nvidia.py como Server-Sent Events.
 * El frontend usa EventSource para recibir el progreso en tiempo real.
 */
function stream_llm_nvidia(string $sector = 'general'): void
{
    set_time_limit(360);

    // Cabeceras SSE
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Accel-Buffering: no'); // Deshabilitar buffering en Nginx
    if (ob_get_level()) ob_end_flush();

    $stmt = db()->prepare("SELECT * FROM surveys WHERE ? = 'general' OR sector = ?");
    $stmt->execute([$sector, $sector]);
    $surveys = $stmt->fetchAll();

    if (empty($surveys)) {
        echo "data: " . json_encode(['type' => 'error', 'error' => 'No hay encuestas para analizar.']) . "\n\n";
        flush();
        return;
    }

    $inputData  = json_encode($surveys, JSON_UNESCAPED_UNICODE);
    $scriptPath = __DIR__ . '/ia_nvidia.py';
    $pythonCmd  = get_python_cmd();

    $descriptorspec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"],
    ];

    $process = proc_open("$pythonCmd \"$scriptPath\"", $descriptorspec, $pipes);

    if (!is_resource($process)) {
        echo "data: " . json_encode(['type' => 'error', 'error' => 'No se pudo ejecutar Python.']) . "\n\n";
        flush();
        return;
    }

    fwrite($pipes[0], $inputData);
    fclose($pipes[0]);

    // Leer lÃ­nea por lÃ­nea y emitir como SSE
    stream_set_blocking($pipes[1], false);
    $buffer = '';
    $timeout = time() + 300; // 5 min mÃ¡x

    while (time() < $timeout) {
        $chunk = fread($pipes[1], 4096);
        if ($chunk !== false && $chunk !== '') {
            $buffer .= $chunk;
            // Procesar lÃ­neas completas
            while (($pos = strpos($buffer, "\n")) !== false) {
                $line = trim(substr($buffer, 0, $pos));
                $buffer = substr($buffer, $pos + 1);
                if ($line === '') continue;
                // Validar que sea JSON
                $obj = json_decode($line, true);
                if (is_array($obj)) {
                    echo "data: $line\n\n";
                    flush();
                    // Si es el resultado final o error, terminar
                    if (in_array($obj['type'] ?? '', ['result', 'error'])) {
                        fclose($pipes[1]);
                        fclose($pipes[2]);
                        proc_close($process);
                        return;
                    }
                }
            }
        } elseif (feof($pipes[1])) {
            break;
        } else {
            usleep(30000);
        }
    }

    if ($buffer !== '') {
        $obj = json_decode(trim($buffer), true);
        if (is_array($obj)) {
            echo "data: " . trim($buffer) . "\n\n";
            flush();
        }
    }

    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
}
