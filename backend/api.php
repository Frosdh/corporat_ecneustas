<?php

declare(strict_types=1);

require __DIR__ . '/lib.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    switch ($action) {
        case 'login':
            ensure_method('POST', $method);
            $payload = login_user(json_input());
            respond(['ok' => true, 'user' => $payload]);

        case 'logout':
            session_destroy();
            respond(['ok' => true]);

        case 'bootstrap':
            require_auth();
            respond([
                'ok' => true,
                'user' => current_user(),
                'assigned_surveyor' => current_assigned_surveyor(),
                'dashboard' => user_can_access_dashboard() ? get_dashboard($_GET['sector'] ?? 'general') : null,
            ]);

        case 'dashboard':
            require_auth();
            if (!user_can_access_dashboard()) {
                respond(['ok' => false, 'message' => 'No tienes acceso al dashboard.'], 403);
            }
            respond([
                'ok' => true,
                'dashboard' => get_dashboard($_GET['sector'] ?? 'general'),
            ]);

        case 'register-application':
            ensure_method('POST', $method);
            $result = register_application($_POST, $_FILES);
            respond([
                'ok' => true,
                'message' => 'Tu solicitud fue registrada correctamente y queda pendiente de revision.',
                'application' => $result,
            ]);

        case 'save-survey':
            ensure_method('POST', $method);
            $saved = save_survey(json_input());
            respond([
                'ok' => true,
                'message' => 'Encuesta guardada correctamente.',
                'saved' => $saved,
                'dashboard' => user_can_access_dashboard() ? get_dashboard('general') : null,
            ]);

        case 'my-surveys':
            require_auth();
            respond(['ok' => true, 'surveys' => get_my_surveys()]);

        case 'sync':
            ensure_method('POST', $method);
            require_auth();
            $input = json_input();
            $surveys = $input['surveys'] ?? [];
            if (!is_array($surveys)) {
                respond(['ok' => false, 'message' => 'El lote de encuestas no es valido.'], 422);
            }

            $savedCount = 0;
            foreach ($surveys as $survey) {
                save_survey((array) $survey);
                $savedCount++;
            }

            respond([
                'ok' => true,
                'message' => 'Sincronizacion completada.',
                'saved_count' => $savedCount,
                'dashboard' => user_can_access_dashboard() ? get_dashboard('general') : null,
            ]);

        case 'applications':
            require_admin();
            respond(['ok' => true, 'applications' => get_applications()]);

        case 'review-application':
            ensure_method('POST', $method);
            require_admin();
            $reviewed = review_application(json_input());
            respond([
                'ok' => true,
                'message' => 'Solicitud actualizada correctamente.',
                'application' => $reviewed,
            ]);

        case 'surveyors':
            require_admin();
            respond(['ok' => true, 'surveyors' => get_surveyors_with_accounts()]);

        case 'update-surveyor-profile':
            ensure_method('POST', $method);
            require_admin();
            $updated = update_surveyor_profile(json_input());
            respond([
                'ok' => true,
                'message' => 'Datos del encuestador actualizados.',
                'surveyor' => $updated,
            ]);

        case 'update-surveyor-status':
            ensure_method('POST', $method);
            require_admin();
            $updated = update_surveyor_status(json_input());
            respond([
                'ok' => true,
                'message' => 'Estado del encuestador actualizado.',
                'surveyor' => $updated,
            ]);

        case 'reset-password':
            ensure_method('POST', $method);
            require_admin();
            reset_account_password(json_input());
            respond([
                'ok' => true,
                'message' => 'Clave actualizada correctamente.',
            ]);

        case 'analisis':
            require_auth();
            if (!user_can_access_dashboard()) {
                respond(['ok' => false, 'message' => 'No tienes acceso al análisis.'], 403);
            }
            respond([
                'ok'      => true,
                'analisis'=> get_analisis_experto($_GET['sector'] ?? 'general'),
            ]);

        case 'surveys':
            require_admin();
            respond(['ok' => true, 'surveys' => get_surveys($_GET)]);

        case 'update-survey-status':
            ensure_method('POST', $method);
            require_admin();
            $updated = update_survey_status(json_input());
            respond([
                'ok' => true,
                'message' => 'Estado de encuesta actualizado.',
                'survey' => $updated,
            ]);

        case 'audit-logs':
            require_admin();
            respond(['ok' => true, 'logs' => get_audit_logs($_GET)]);

        case 'export':
            require_admin();
            stream_export((string) ($_GET['type'] ?? ''), $_GET);
            break;

        case 'document':
            require_auth();
            stream_application_document((int) ($_GET['id'] ?? 0));
            break;

        default:
            respond(['ok' => false, 'message' => 'Accion no reconocida.'], 404);
    }
} catch (InvalidArgumentException $exception) {
    respond(['ok' => false, 'message' => $exception->getMessage()], 422);
} catch (Throwable $exception) {
    respond([
        'ok' => false,
        'message' => 'Ocurrio un error en el servidor.',
        'error' => $exception->getMessage(),
    ], 500);
}
