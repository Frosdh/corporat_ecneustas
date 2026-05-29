<?php
declare(strict_types=1);
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>San Bartolome</title>
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <link rel="stylesheet" href="frontend/style.css?v=<?= time() ?>">
</head>
<body>
    <div id="auth-screen" class="screen auth-screen">
        <div class="auth-shell">
            <section class="card auth-panel">
                <div class="brand-pill">SB</div>
                <h1>San Bartolome</h1>
                <p class="subtitle">Sistema profesional de levantamiento y gestion de encuestadores para San Bartolome.</p>

                <div class="auth-switch">
                    <button id="switch-login" class="switch-pill active" type="button">Iniciar sesion</button>
                    <button id="switch-register" class="switch-pill" type="button">Postularme</button>
                </div>

                <form id="login-form" class="auth-form">
                    <label class="field-label" for="login-username">Usuario</label>
                    <input id="login-username" type="text" autocomplete="username" value="admin_general">

                    <label class="field-label" for="login-password">Clave</label>
                    <input id="login-password" type="password" autocomplete="current-password" placeholder="Ingresa tu clave">

                    <p id="login-error" class="error hidden"></p>
                    <button class="primary-button" type="submit">Entrar al sistema</button>
                </form>

                <form id="register-form" class="auth-form hidden" enctype="multipart/form-data">
                    <div class="form-grid">
                        <div>
                            <label class="field-label" for="reg-full-name">Nombres completos</label>
                            <input id="reg-full-name" name="full_name" type="text" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-document">Cedula</label>
                            <input id="reg-document" name="document_number" type="text" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-phone">Celular</label>
                            <input id="reg-phone" name="phone" type="text" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-email">Correo</label>
                            <input id="reg-email" name="email" type="email" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-parish">Parroquia</label>
                            <input id="reg-parish" name="parish" type="text" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-canton">Canton</label>
                            <input id="reg-canton" name="canton" type="text" required>
                        </div>
                    </div>

                    <label class="field-label" for="reg-address">Direccion</label>
                    <input id="reg-address" name="address" type="text" required>

                    <div class="form-grid">
                        <div>
                            <label class="field-label" for="reg-zone">Zona donde trabajaria</label>
                            <input id="reg-zone" name="requested_zone" type="text" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-username">Usuario deseado</label>
                            <input id="reg-username" name="username" type="text" required>
                        </div>
                    </div>

                    <label class="field-label" for="reg-experience">Experiencia previa</label>
                    <textarea id="reg-experience" name="experience" rows="3" required></textarea>

                    <div class="form-grid">
                        <div>
                            <label class="field-label" for="reg-password">Clave</label>
                            <input id="reg-password" name="password" type="password" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-password-confirm">Confirmar clave</label>
                            <input id="reg-password-confirm" name="password_confirm" type="password" required>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div>
                            <label class="field-label" for="reg-profile-photo">Foto personal</label>
                            <input id="reg-profile-photo" name="profile_photo" type="file" accept=".jpg,.jpeg,.png,.pdf" required>
                        </div>
                        <div>
                            <label class="field-label" for="reg-id-document">Foto de cedula</label>
                            <input id="reg-id-document" name="id_document" type="file" accept=".jpg,.jpeg,.png,.pdf" required>
                        </div>
                    </div>

                    <label class="field-label" for="reg-support-document">Respaldo adicional (opcional)</label>
                    <input id="reg-support-document" name="support_document" type="file" accept=".jpg,.jpeg,.png,.pdf">

                    <p id="register-error" class="error hidden"></p>
                    <p id="register-success" class="success hidden"></p>
                    <button class="primary-button" type="submit">Enviar postulacion</button>
                </form>
            </section>
        </div>
    </div>

    <div id="status-screen" class="screen hidden">
        <div class="status-shell">
            <section class="card status-card">
                <h2 id="status-title">Estado de solicitud</h2>
                <p id="status-message" class="subtitle"></p>
                <div id="status-meta" class="status-meta"></div>
                <div class="inline-actions">
                    <button id="status-logout" class="secondary-button" type="button">Cerrar sesion</button>
                </div>
            </section>
        </div>
    </div>

    <div id="app-screen" class="screen hidden">
        <header class="topbar">
            <div>
                <div class="logo-tag">San Bartolome</div>
                <h2>Mapeo Social Integrado - San Bartolome</h2>
                <p class="subtitle-light">Levantamiento parroquial, postulaciones y aprobacion profesional de encuestadores</p>
            </div>
            <div class="top-actions">
                <span id="network-chip" class="chip chip-online hidden">Con conexion</span>
                <span id="offline-chip" class="chip chip-warning hidden">0 pendientes</span>
                <span id="user-badge" class="chip chip-dark">Usuario</span>
                <span id="role-badge" class="chip chip-dark">Rol</span>
                <button id="logout-button" class="secondary-button">Salir</button>
            </div>
        </header>

        <main class="layout">
            <nav class="tabs">
                <button id="tab-button-dashboard" class="tab active" data-tab="dashboard">Dashboard</button>
                <button id="tab-button-surveys" class="tab" data-tab="surveys">Encuestas</button>
                <button class="tab" data-tab="survey">Formulario</button>
                <button id="tab-button-profile" class="tab hidden" data-tab="profile">Mi perfil</button>
                <button id="tab-button-my-surveys" class="tab hidden" data-tab="my-surveys">Mis encuestas</button>
                <button id="tab-button-applications" class="tab" data-tab="applications">Postulaciones</button>
                <button id="tab-button-surveyors" class="tab" data-tab="surveyors">Encuestadores</button>
                <button id="tab-button-preguntas" class="tab" data-tab="preguntas">Preguntas</button>
                <button id="tab-button-analisis" class="tab" data-tab="analisis">An&aacute;lisis IA</button>
                <button id="tab-button-reports" class="tab" data-tab="reports">Reportes</button>
                <button id="tab-button-audit" class="tab" data-tab="audit">Auditoria</button>
                <button id="tab-button-offline" class="tab hidden" data-tab="offline">Cola Offline</button>
            </nav>

            <section id="tab-dashboard" class="tab-panel">
                <div class="panel-row">
                    <div class="card">
                        <label class="field-label" for="sector-filter">Sector en monitoreo</label>
                        <select id="sector-filter">
                            <option value="general">Todo San Bartolome</option>
                        </select>
                    </div>
                    <div id="network-card" class="card network-card hidden">
                        <div>
                            <h3>Estado de conectividad</h3>
                            <p>Referencia visual para levantamiento desde dispositivos de campo.</p>
                        </div>
                        <span id="network-card-status" class="helper-text">Con conexion a internet.</span>
                    </div>
                </div>

                <div class="kpi-grid">
                    <article class="card kpi-card">
                        <span class="eyebrow">Muestras levantadas</span>
                        <h3 id="kpi-total">0 / 300</h3>
                        <div class="progress"><div id="kpi-total-bar" class="progress-bar"></div></div>
                    </article>
                    <article class="card kpi-card">
                        <span class="eyebrow">Pobreza estructural</span>
                        <h3 id="kpi-poverty">0%</h3>
                    </article>
                    <article class="card kpi-card">
                        <span class="eyebrow">Apertura a reapertura</span>
                        <h3 id="kpi-acceptance">0%</h3>
                    </article>
                    <article class="card kpi-card">
                        <span class="eyebrow">Clima politico</span>
                        <h3 id="kpi-climate">Sin datos</h3>
                    </article>
                </div>

                <!-- Tacómetros de sentimiento por dimensión -->
                <article class="card dash-gauge-card">
                    <div class="section-title">
                        <h3>Sentimiento por Dimensi&oacute;n</h3>
                    </div>
                    <div id="dash-gauge-grid" class="dash-gauge-grid"></div>
                </article>

                <div class="dashboard-grid">
                    <article class="card">
                        <div class="section-title">
                            <h3>Mapa georreferenciado</h3>
                        </div>
                        <div id="map-canvas" class="map-canvas"></div>
                    </article>
                    <article class="card">
                        <div class="section-title">
                            <h3>Riesgos territoriales</h3>
                        </div>
                        <div class="meter-list">
                            <div>
                                <div class="meter-head"><span>Riesgo agua y saneamiento</span><strong id="metric-water">0%</strong></div>
                                <div class="progress"><div id="metric-water-bar" class="progress-bar alt-red"></div></div>
                            </div>
                            <div>
                                <div class="meter-head"><span>Brecha alcantarillado</span><strong id="metric-sewer">0%</strong></div>
                                <div class="progress"><div id="metric-sewer-bar" class="progress-bar alt-amber"></div></div>
                            </div>
                            <div>
                                <div class="meter-head"><span>Presion por ingresos</span><strong id="metric-income">0%</strong></div>
                                <div class="progress"><div id="metric-income-bar" class="progress-bar alt-violet"></div></div>
                            </div>
                        </div>
                        <div class="application-kpis">
                            <div class="mini-kpi"><span>Pendientes</span><strong id="applications-pending">0</strong></div>
                            <div class="mini-kpi"><span>En revision</span><strong id="applications-review">0</strong></div>
                            <div class="mini-kpi"><span>Aprobados</span><strong id="applications-approved">0</strong></div>
                            <div class="mini-kpi"><span>Rechazados</span><strong id="applications-rejected">0</strong></div>
                        </div>
                    </article>
                </div>

                <div class="report-block-grid">
                    <article class="card">
                        <div class="section-title"><h3>Operacion de campo</h3></div>
                        <div class="application-kpis">
                            <div class="mini-kpi"><span>Sincronizadas</span><strong id="ops-synced">0</strong></div>
                            <div class="mini-kpi"><span>Pendientes offline</span><strong id="ops-offline-pending">0</strong></div>
                            <div class="mini-kpi"><span>Productividad</span><strong id="ops-productivity">0</strong></div>
                            <div class="mini-kpi"><span>Ultimo dia</span><strong id="ops-last-day">-</strong></div>
                        </div>
                    </article>

                    <article class="card">
                        <div class="section-title"><h3>Encuestadores</h3></div>
                        <div class="application-kpis">
                            <div class="mini-kpi"><span>Activos</span><strong id="mgmt-active">0</strong></div>
                            <div class="mini-kpi"><span>Suspendidos</span><strong id="mgmt-suspended">0</strong></div>
                            <div class="mini-kpi"><span>Aprob. promedio</span><strong id="mgmt-approval-hours">0 h</strong></div>
                            <div class="mini-kpi"><span>Tasa aprobacion</span><strong id="mgmt-approval-rate">0%</strong></div>
                        </div>
                    </article>

                    <article class="card">
                        <div class="section-title"><h3>Lectura social</h3></div>
                        <div class="info-list">
                            <div><span>Problematica principal</span><strong id="social-top-problem">Sin datos</strong></div>
                            <div><span>Confianza predominante</span><strong id="social-top-trust">Sin datos</strong></div>
                            <div><span>Inversion externa</span><strong id="social-top-investment">Sin datos</strong></div>
                            <div><span>Reapertura minera</span><strong id="social-top-reopening">Sin datos</strong></div>
                        </div>
                    </article>

                    <article class="card">
                        <div class="section-title" style="margin-bottom:.25rem">
                            <h3>Aceptación a Inversión Externa</h3>
                        </div>
                        <p style="font-size:.78rem;color:#A67C52;margin-bottom:.9rem;">
                            Pregunta: <em>"¿Acepta usted inversión externa en su comunidad?"</em>
                            &mdash; calculado sobre encuestados que respondieron esa pregunta.
                        </p>
                        <div class="application-kpis" style="grid-template-columns:1fr 1fr;gap:.75rem;">

                            <div class="mini-kpi strat-favorable">
                                <span class="strat-label">✅ Favorable</span>
                                <strong id="strategy-favorable">0%</strong>
                                <small id="strategy-favorable-count" style="color:#A67C52;font-size:.72rem;font-weight:400;"></small>
                                <p class="strat-tip">Respondieron <strong>"Aceptación amplia"</strong>. Personas completamente abiertas a recibir inversión externa sin condiciones.</p>
                            </div>

                            <div class="mini-kpi strat-conditioned">
                                <span class="strat-label">⚠️ Condicionada</span>
                                <strong id="strategy-conditioned">0%</strong>
                                <small id="strategy-conditioned-count" style="color:#A67C52;font-size:.72rem;font-weight:400;"></small>
                                <p class="strat-tip">Respondieron <strong>"Aceptación condicionada"</strong>. Abiertos a inversión pero con condiciones o garantías previas.</p>
                            </div>

                            <div class="mini-kpi strat-contrary">
                                <span class="strat-label">❌ Contraria</span>
                                <strong id="strategy-contrary">0%</strong>
                                <small id="strategy-contrary-count" style="color:#A67C52;font-size:.72rem;font-weight:400;"></small>
                                <p class="strat-tip">Respondieron <strong>"Rechazo preventivo"</strong>. Personas que rechazan la inversión externa como medida de precaución.</p>
                            </div>

                            <div class="mini-kpi strat-sector">
                                <span class="strat-label">📍 Sector más abierto</span>
                                <strong id="strategy-open-sector">Sin datos</strong>
                                <small style="color:#A67C52;font-size:.72rem;font-weight:400;">mayor concentración favorable</small>
                                <p class="strat-tip">Sector con la <strong>mayor cantidad absoluta</strong> de respuestas favorables ("Aceptación amplia") entre todos los sectores encuestados.</p>
                            </div>

                        </div>
                        <div id="strategy-base" style="font-size:.72rem;color:#A67C52;margin-top:.6rem;text-align:right;"></div>
                    </article>
                </div>
            </section>

            <section id="tab-reports" class="tab-panel hidden">
                <div class="section-title">
                    <h3>Reportes ejecutivos</h3>
                    <p>Resumen expandido de operacion, gestion, lectura social y decision estrategica.</p>
                </div>
                <div class="report-block-grid">
                    <article class="card">
                        <div class="section-title">
                            <h3>Operacion de campo</h3>
                            <p>Series y rankings del levantamiento.</p>
                        </div>
                        <div class="report-columns">
                            <div>
                                <h4>Dias con encuestas</h4>
                                <div id="report-daily-list" class="simple-list"></div>
                            </div>
                            <div>
                                <h4>Por sector</h4>
                                <div id="report-sector-list" class="simple-list"></div>
                            </div>
                            <div>
                                <h4>Por encuestador</h4>
                                <div id="report-surveyor-list" class="simple-list"></div>
                            </div>
                        </div>
                    </article>

                    <article class="card">
                        <div class="section-title">
                            <h3>Gestion de encuestadores</h3>
                            <p>Postulaciones y estado actual del equipo.</p>
                        </div>
                        <div id="report-management-list" class="simple-list"></div>
                    </article>

                    <article class="card">
                        <div class="section-title">
                            <h3>Lectura social y territorial</h3>
                            <p>Lo que mas se repite en el territorio levantado.</p>
                        </div>
                        <div class="report-columns">
                            <div>
                                <h4>Problematicas</h4>
                                <div id="report-problem-list" class="simple-list"></div>
                            </div>
                            <div>
                                <h4>Beneficios mencionados</h4>
                                <div id="report-benefit-list" class="simple-list"></div>
                            </div>
                            <div>
                                <h4>Riesgos temidos</h4>
                                <div id="report-risk-list" class="simple-list"></div>
                            </div>
                        </div>
                    </article>

                    <article class="card">
                        <div class="section-title">
                            <h3>KPIs estrategicos</h3>
                            <p>Postura frente a inversion y sectores criticos.</p>
                        </div>
                        <div id="report-strategic-list" class="simple-list"></div>
                    </article>
                </div>
            </section>

            <section id="tab-surveys" class="tab-panel hidden">
                <div class="section-title">
                    <h3>Encuestas levantadas</h3>
                    <p>Consulta, filtra y exporta las encuestas registradas.</p>
                </div>
                <div class="card filter-panel">
                    <div class="form-grid">
                        <div>
                            <label class="field-label" for="survey-filter-sector">Sector</label>
                            <select id="survey-filter-sector">
                                <option value="general">Todos</option>
                                <option value="centro">Centro Parroquial</option>
                                <option value="deleg">La Deleg</option>
                                <option value="sallac">Sallac</option>
                                <option value="pishio">Pishio</option>
                            </select>
                        </div>
                        <div>
                            <label class="field-label" for="survey-filter-surveyor">Encuestador</label>
                            <select id="survey-filter-surveyor">
                                <option value="">Todos</option>
                            </select>
                        </div>
                        <div>
                            <label class="field-label" for="survey-filter-date-from">Fecha desde</label>
                            <input id="survey-filter-date-from" type="date">
                        </div>
                        <div>
                            <label class="field-label" for="survey-filter-date-to">Fecha hasta</label>
                            <input id="survey-filter-date-to" type="date">
                        </div>
                        <div>
                            <label class="field-label" for="survey-filter-status">Estado</label>
                            <select id="survey-filter-status">
                                <option value="all">Todos</option>
                                <option value="sincronizada">Sincronizada</option>
                                <option value="revisada">Revisada</option>
                                <option value="observada">Observada</option>
                                <option value="Con GPS">Con GPS</option>
                                <option value="Sin GPS">Sin GPS</option>
                            </select>
                        </div>
                    </div>
                    <div class="inline-actions">
                        <button id="clear-survey-filters-button" class="secondary-button" type="button">Limpiar filtros</button>
                        <button id="export-surveys-button" class="primary-button" type="button">Exportar CSV</button>
                    </div>
                </div>
                <div id="surveys-list" class="stack-list"></div>
            </section>

            <section id="tab-survey" class="tab-panel hidden">
                <div id="surveyor-workspace" class="surveyor-stack hidden">
                    <article id="surveyor-notice" class="card notice-card hidden">
                        <strong id="surveyor-notice-title">Estado del levantamiento</strong>
                        <p id="surveyor-notice-text" class="helper-text">Listo para trabajar.</p>
                    </article>
                </div>

                <form id="survey-form" class="survey-form">
                    <div class="card">
                        <div class="section-title">
                            <h3>Identificacion y contexto</h3>
                            <p>Campos base para ubicar la encuesta y al equipo de campo.</p>
                        </div>
                        <div class="form-grid">
                            <div>
                                <label class="field-label" for="sector">Sector</label>
                                <select id="sector" name="sector" required>
                                    <option value="">Selecciona</option>
                                    <option value="centro">Centro Parroquial</option>
                                    <option value="deleg">La Deleg</option>
                                    <option value="sallac">Sallac</option>
                                    <option value="pishio">Pishio</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="community">Comunidad o barrio</label>
                                <input id="community" name="community" type="text" required>
                            </div>
                            <div>
                                <label class="field-label" for="survey-date">Fecha y hora</label>
                                <input id="survey-date" name="survey_date" type="datetime-local" required>
                            </div>
                            <div id="surveyor-select-wrapper">
                                <label class="field-label" for="surveyor-id">Encuestador</label>
                                <select id="surveyor-id" name="surveyor_id"></select>
                            </div>
                            <div id="assigned-surveyor-card" class="hidden readonly-card">
                                <label class="field-label">Encuestador asignado</label>
                                <div id="assigned-surveyor-name" class="readonly-value">Sin asignar</div>
                                <div id="assigned-surveyor-zone" class="helper-text"></div>
                            </div>
                            <div>
                                <label class="field-label" for="respondent-gender">Genero</label>
                                <select id="respondent-gender" name="respondent_gender" required>
                                    <option value="">Selecciona</option>
                                    <option>Mujer</option>
                                    <option>Hombre</option>
                                    <option>Otro</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="age-range">Rango de edad</label>
                                <select id="age-range" name="age_range" required>
                                    <option value="">Selecciona</option>
                                    <option>18-25</option>
                                    <option>26-35</option>
                                    <option>36-45</option>
                                    <option>46-60</option>
                                    <option>61 o mas</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="education-level">Nivel educativo</label>
                                <select id="education-level" name="education_level">
                                    <option value="">Selecciona</option>
                                    <option>Primaria</option>
                                    <option>Secundaria</option>
                                    <option>Tecnico</option>
                                    <option>Universitario</option>
                                    <option>Ninguno</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="occupation">Ocupacion principal</label>
                                <input id="occupation" name="occupation" type="text" required>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="section-title">
                            <h3>Problematicas y dinamica social</h3>
                            <p>Preguntas amplias para leer el clima territorial sin entrar de forma brusca al tema minero.</p>
                        </div>
                        <div class="form-stack">
                            <div>
                                <label class="field-label" for="primary-problem">Principal problematica actual</label>
                                <select id="primary-problem" name="primary_problem" required>
                                    <option value="">Selecciona</option>
                                    <option>Inseguridad</option>
                                    <option>Falta de empleo</option>
                                    <option>Agua y saneamiento</option>
                                    <option>Vias en mal estado</option>
                                    <option>Salud</option>
                                    <option>Migracion juvenil</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="youth-path">A que se dedican los jovenes al terminar sus estudios</label>
                                <select id="youth-path" name="youth_path" required>
                                    <option value="">Selecciona</option>
                                    <option>Migracion por falta de oportunidades</option>
                                    <option>Agricultura o trabajo informal</option>
                                    <option>Continuan estudios superiores</option>
                                    <option>Empleo local eventual</option>
                                </select>
                            </div>
                            <fieldset>
                                <legend class="field-label">Limitaciones economicas frecuentes para mujeres</legend>
                                <div class="check-grid">
                                    <label><input type="checkbox" name="women_roles" value="Precios bajos por intermediarios"> Precios bajos por intermediarios</label>
                                    <label><input type="checkbox" name="women_roles" value="Sobrecarga de cuidados"> Sobrecarga de cuidados</label>
                                    <label><input type="checkbox" name="women_roles" value="Poco acceso a financiamiento"> Poco acceso a financiamiento</label>
                                    <label><input type="checkbox" name="women_roles" value="Mercados limitados"> Mercados limitados</label>
                                </div>
                            </fieldset>
                        </div>
                    </div>

                    <div class="card">
                        <div class="section-title">
                            <h3>Condiciones del hogar y validacion territorial</h3>
                            <p>Sirve para contrastar en campo informacion socioeconomica tipo INEC.</p>
                        </div>
                        <div class="form-grid">
                            <div>
                                <label class="field-label" for="water-source">Fuente principal de agua</label>
                                <select id="water-source" name="water_source" required>
                                    <option value="">Selecciona</option>
                                    <option>Red publica con tratamiento</option>
                                    <option>Vertiente comunal sin purificacion</option>
                                    <option>Rio o acequia</option>
                                    <option>Tanquero u otra compra</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="has-sewer">Alcantarillado</label>
                                <select id="has-sewer" name="has_sewer" required>
                                    <option value="">Selecciona</option>
                                    <option>Si tiene</option>
                                    <option>No tiene</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="has-internet">Conectividad a internet</label>
                                <select id="has-internet" name="has_internet">
                                    <option value="">Selecciona</option>
                                    <option>Si estable</option>
                                    <option>Intermitente</option>
                                    <option>No tiene</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="road-status">Estado de vias</label>
                                <select id="road-status" name="road_status">
                                    <option value="">Selecciona</option>
                                    <option>Bueno</option>
                                    <option>Regular</option>
                                    <option>Malo</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="household-income">Ingresos del hogar</label>
                                <select id="household-income" name="household_income">
                                    <option value="">Selecciona</option>
                                    <option>No cubre la canasta</option>
                                    <option>Cubre apenas</option>
                                    <option>Cubre con algo de holgura</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="authority-trust">Confianza en autoridades</label>
                                <select id="authority-trust" name="authority_trust">
                                    <option value="">Selecciona</option>
                                    <option>Alta</option>
                                    <option>Media</option>
                                    <option>Baja</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="section-title">
                            <h3>Clima politico y percepcion territorial</h3>
                            <p>Bloque util para entender la postura comunitaria frente a proyectos externos.</p>
                        </div>
                        <div class="form-stack">
                            <div>
                                <label class="field-label" for="political-climate">Como se esta manejando la parte politica local</label>
                                <select id="political-climate" name="political_climate" required>
                                    <option value="">Selecciona</option>
                                    <option>Desconfianza institucional</option>
                                    <option>Division comunitaria</option>
                                    <option>Estabilidad relativa</option>
                                    <option>Conflicto abierto entre actores</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="social-priority">Prioridad del territorio si aparece una gran inversion externa</label>
                                <select id="social-priority" name="social_priority" required>
                                    <option value="">Selecciona</option>
                                    <option>Proteger agua y paramos</option>
                                    <option>Generar empleo rapido</option>
                                    <option>Mejorar vias y servicios</option>
                                    <option>Fortalecer produccion local</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="investment-acceptance">Aceptacion frente a proyectos externos que prometen empleo</label>
                                <select id="investment-acceptance" name="investment_acceptance" required>
                                    <option value="">Selecciona</option>
                                    <option>Rechazo preventivo</option>
                                    <option>Aceptacion condicionada</option>
                                    <option>Aceptacion amplia</option>
                                </select>
                            </div>
                            <div>
                                <label class="field-label" for="mine-reopening-perception">Como creen que beneficiaria la reapertura de la mina Silver 1</label>
                                <select id="mine-reopening-perception" name="mine_reopening_perception" required>
                                    <option value="">Selecciona</option>
                                    <option>Beneficiaria mucho</option>
                                    <option>Beneficiaria algo</option>
                                    <option>Beneficio dudoso</option>
                                    <option>No beneficiaria</option>
                                </select>
                            </div>
                            <fieldset>
                                <legend class="field-label">Beneficios esperados</legend>
                                <div class="check-grid">
                                    <label><input type="checkbox" name="mine_benefits" value="Empleo juvenil"> Empleo juvenil</label>
                                    <label><input type="checkbox" name="mine_benefits" value="Movimiento comercial"> Movimiento comercial</label>
                                    <label><input type="checkbox" name="mine_benefits" value="Obras comunitarias"> Obras comunitarias</label>
                                    <label><input type="checkbox" name="mine_benefits" value="Ninguno claro"> Ninguno claro</label>
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend class="field-label">Riesgos mas temidos</legend>
                                <div class="check-grid">
                                    <label><input type="checkbox" name="mine_risks" value="Contaminacion del agua"> Contaminacion del agua</label>
                                    <label><input type="checkbox" name="mine_risks" value="Danos al suelo"> Danos al suelo</label>
                                    <label><input type="checkbox" name="mine_risks" value="Conflicto social"> Conflicto social</label>
                                    <label><input type="checkbox" name="mine_risks" value="Poca transparencia"> Poca transparencia</label>
                                </div>
                            </fieldset>
                            <div>
                                <label class="field-label" for="comments">Observaciones adicionales</label>
                                <textarea id="comments" name="comments" rows="4"></textarea>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="section-title">
                            <h3>Ubicacion</h3>
                            <p>Puedes capturar GPS del dispositivo o ingresarlo manualmente si hace falta.</p>
                        </div>
                        <div class="form-grid">
                            <div>
                                <label class="field-label" for="latitude">Latitud</label>
                                <input id="latitude" name="latitude" type="number" step="0.0000001">
                            </div>
                            <div>
                                <label class="field-label" for="longitude">Longitud</label>
                                <input id="longitude" name="longitude" type="number" step="0.0000001">
                            </div>
                        </div>
                        <div class="inline-actions">
                            <button id="capture-gps-button" class="secondary-button" type="button">Capturar GPS</button>
                            <span id="gps-status" class="helper-text">Aun no se ha capturado una coordenada.</span>
                        </div>
                        <div class="location-map-shell">
                            <div id="survey-location-map" class="survey-location-map"></div>
                            <p id="map-status" class="helper-text">
                                Usa el boton de GPS para ubicarte. Tambien puedes tocar el mapa para ajustar el punto manualmente.
                            </p>
                        </div>
                    </div>

                    <div class="form-footer">
                        <span id="save-status" class="helper-text">Listo para guardar.</span>
                        <button id="cancel-edit-button" class="secondary-button hidden" type="button">Cancelar edicion</button>
                        <button class="primary-button" type="submit">Guardar encuesta</button>
                    </div>
                </form>
                <div id="offline-summary-card" class="card hidden">
                    <div class="section-title">
                        <h3>Sincronizacion pendiente</h3>
                        <p>Este aviso solo aparece cuando el dispositivo guarda encuestas sin internet.</p>
                    </div>
                    <div class="inline-actions">
                        <strong id="offline-summary-text">0 encuestas pendientes</strong>
                        <button id="show-offline-details-button" class="secondary-button" type="button">Ver detalle</button>
                    </div>
                </div>
            </section>

            <section id="tab-profile" class="tab-panel hidden">
                <article class="card surveyor-profile-card">
                    <div class="section-title">
                        <h3>Mi perfil</h3>
                        <p>Resumen operativo de la cuenta aprobada para levantar encuestas.</p>
                    </div>
                    <div class="surveyor-profile-grid">
                        <div class="profile-identity">
                            <strong id="profile-view-name">Sin asignar</strong>
                            <span id="profile-view-username" class="helper-text"></span>
                        </div>
                        <div class="profile-kv">
                            <span>Zona asignada</span>
                            <strong id="profile-view-zone">Sin zona</strong>
                        </div>
                        <div class="profile-kv">
                            <span>Estado</span>
                            <strong id="profile-view-status">Sin estado</strong>
                        </div>
                        <div class="profile-kv">
                            <span>Conexion</span>
                            <strong id="profile-view-connection">Sin definir</strong>
                        </div>
                        <div class="profile-kv">
                            <span>Borrador local</span>
                            <strong id="profile-view-draft">No</strong>
                        </div>
                    </div>
                    <div class="application-kpis surveyor-kpis">
                        <div class="mini-kpi"><span>Total propias</span><strong id="profile-total-count">0</strong></div>
                        <div class="mini-kpi"><span>Sincronizadas</span><strong id="profile-sync-count">0</strong></div>
                        <div class="mini-kpi"><span>Revisadas</span><strong id="profile-reviewed-count">0</strong></div>
                        <div class="mini-kpi"><span>Observadas</span><strong id="profile-observed-count">0</strong></div>
                    </div>
                    <div class="inline-actions">
                        <button id="profile-continue-draft-button" class="secondary-button hidden" type="button">Continuar borrador</button>
                    </div>
                </article>
            </section>

            <section id="tab-my-surveys" class="tab-panel hidden">
                <div class="section-title">
                    <h3>Mis encuestas</h3>
                    <p>Consulta y, si hace falta, vuelve a editar solo tus propias encuestas.</p>
                </div>
                <div id="my-surveys-summary" class="application-kpis surveyor-kpis"></div>
                <div id="my-surveys-list" class="stack-list"></div>
            </section>

            <section id="tab-applications" class="tab-panel hidden">
                <div class="section-title">
                    <h3>Postulaciones de encuestadores</h3>
                    <p>Revisa documentos, observa detalles y aprueba o rechaza cada solicitud.</p>
                </div>
                <div class="inline-actions section-actions">
                    <button id="export-applications-button" class="primary-button" type="button">Exportar CSV</button>
                </div>
                <div class="subtabs" id="application-subtabs">
                    <button class="subtab active" data-status="all" type="button">Todas <span id="count-all">0</span></button>
                    <button class="subtab" data-status="pending" type="button">Pendientes <span id="count-pending">0</span></button>
                    <button class="subtab" data-status="in_review" type="button">En revision <span id="count-in_review">0</span></button>
                    <button class="subtab" data-status="approved" type="button">Aprobados <span id="count-approved">0</span></button>
                    <button class="subtab" data-status="rejected" type="button">Rechazados <span id="count-rejected">0</span></button>
                </div>
                <div id="applications-list" class="stack-list"></div>
            </section>

            <section id="tab-surveyors" class="tab-panel hidden">
                <div class="section-title">
                    <h3>Encuestadores activos</h3>
                    <p>Control de estado operativo, zona asignada y reseteo de clave.</p>
                </div>
                <div id="surveyors-list" class="stack-list"></div>
            </section>

            <section id="tab-audit" class="tab-panel hidden">
                <div class="section-title">
                    <h3>Auditoria de movimientos</h3>
                    <p>Consulta las acciones administrativas y operativas registradas por el sistema.</p>
                </div>
                <div class="card filter-panel">
                    <div class="form-grid">
                        <div>
                            <label class="field-label" for="audit-filter-action">Accion</label>
                            <select id="audit-filter-action">
                                <option value="all">Todas</option>
                                <option value="login">Login</option>
                                <option value="register_application">Registro postulacion</option>
                                <option value="review_application">Revision postulacion</option>
                                <option value="update_surveyor_status">Estado encuestador</option>
                                <option value="update_surveyor_profile">Zona encuestador</option>
                                <option value="reset_password">Reset clave</option>
                                <option value="save_survey">Guardar encuesta</option>
                            </select>
                        </div>
                        <div>
                            <label class="field-label" for="audit-filter-date-from">Fecha desde</label>
                            <input id="audit-filter-date-from" type="date">
                        </div>
                        <div>
                            <label class="field-label" for="audit-filter-date-to">Fecha hasta</label>
                            <input id="audit-filter-date-to" type="date">
                        </div>
                    </div>
                    <div class="inline-actions">
                        <button id="apply-audit-filters-button" class="secondary-button" type="button">Aplicar filtros</button>
                        <button id="export-audit-button" class="primary-button" type="button">Exportar CSV</button>
                    </div>
                </div>
                <div id="audit-list" class="stack-list"></div>
            </section>

            <section id="tab-offline" class="tab-panel hidden">
                <div class="offline-grid">
                    <article class="card">
                        <div class="section-title">
                            <h3>Cola offline</h3>
                            <p>Encuestas guardadas localmente mientras el equipo esta sin internet.</p>
                        </div>
                        <div class="big-counter" id="offline-count">0 formularios</div>
                        <div class="inline-actions">
                            <button id="sync-button" class="success-button" type="button">Forzar sincronizacion</button>
                            <span id="sync-status" class="helper-text">Sin pendientes por ahora.</span>
                        </div>
                    </article>
                    <article class="card">
                        <div class="section-title">
                            <h3>Registros pendientes</h3>
                            <p>Se conservan en el navegador del dispositivo.</p>
                        </div>
                        <div id="offline-list" class="offline-list">
                            <p class="empty-state">No hay encuestas pendientes.</p>
                        </div>
                    </article>
                </div>
            </section>
            <!-- =========================================================
                 TAB: PREGUNTAS — Gr&aacute;ficas por pregunta de encuesta
                 ========================================================= -->
            <section id="tab-preguntas" class="tab-panel hidden">
                <div class="analisis-topbar">
                    <div class="analisis-topbar-left">
                        <h2 class="analisis-titulo">Respuestas por Pregunta</h2>
                        <p class="analisis-subtitulo">Distribuci&oacute;n real de respuestas &middot; Actualizado desde la base de datos</p>
                    </div>
                    <div class="analisis-topbar-right">
                        <select id="preguntas-sector-filter" class="analisis-select">
                            <option value="general">Todo San Bartolome</option>
                        </select>
                        <button id="preguntas-refresh-btn" class="analisis-refresh-btn" type="button">&#8635; Actualizar</button>
                    </div>
                </div>
                <div id="preguntas-loading" class="analisis-loading hidden">
                    <div class="analisis-spinner"></div>
                </div>
                <div id="preguntas-empty" class="analisis-empty hidden">
                    <p>No hay encuestas registradas todav&iacute;a.</p>
                </div>
                <div id="preguntas-content" class="hidden"></div>
            </section>

            <!-- =========================================================
                 TAB: ANÁLISIS EXPERTO DE ENCUESTAS (IA / PIVOT-style)
                 ========================================================= -->
            <section id="tab-analisis" class="tab-panel hidden">

                <!-- Barra de control -->
                <div class="analisis-topbar">
                    <div class="analisis-topbar-left">
                        <h2 class="analisis-titulo">Análisis Experto de Encuestas</h2>
                        <p class="analisis-subtitulo">Estadística descriptiva &middot; Sentimiento comunitario &middot; Actualización automática cada 90 s</p>
                    </div>
                    <div class="analisis-topbar-right">
                        <select id="analisis-sector-filter" class="analisis-select">
                            <option value="general">Todo San Bartolome</option>
                        </select>
                        <button id="analisis-refresh-btn" class="analisis-refresh-btn" type="button">&#8635; Actualizar</button>
                        <button id="analisis-pdf-btn" class="analisis-refresh-btn" type="button" style="background:#c43d45;" title="Exportar reporte técnico en PDF">&#128196; PDF</button>
                        <span id="analisis-last-update" class="analisis-timestamp">Sin cargar</span>
                    </div>
                </div>

                <!-- Estados -->
                <div id="analisis-loading" class="analisis-loading hidden">
                    <div class="analisis-spinner"></div>
                    <p>Procesando datos del campo&hellip;</p>
                </div>
                <div id="analisis-empty" class="analisis-empty hidden">
                    <div class="analisis-empty-icon" style="font-size:36px; color:var(--muted); line-height:1;">&#9998;</div>
                    <p>Sin encuestas registradas aún.</p>
                    <small>El análisis aparecerá automáticamente cuando lleguen datos de campo.</small>
                </div>

                <!-- Contenido principal -->
                <div id="analisis-content" class="hidden">

                    <!-- KPI Row -->
                    <div class="analisis-kpi-row">
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-blue">#</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Total Encuestas</span>
                                <strong id="analisis-total-n" class="kpi-value">—</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-teal">~</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Índice Neto Global</span>
                                <strong id="kpi-indice-global" class="kpi-value">—</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-green">+</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Sentimiento Positivo</span>
                                <strong id="analisis-pos-global" class="kpi-value kpi-green-val">—</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-red">-</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Sentimiento Negativo</span>
                                <strong id="analisis-neg-global" class="kpi-value kpi-red-val">—</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card kpi-wide">
                            <div class="kpi-icon-wrap kpi-orange">!</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Problemática Principal</span>
                                <strong id="analisis-problema" class="kpi-value kpi-problem-text">—</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Resumen ejecutivo -->
                    <div class="analisis-ejecutivo-card" id="analisis-ejecutivo">
                        <div class="analisis-ejecutivo-left">
                            <div class="analisis-label-pill" id="analisis-nivel-badge">ANALIZANDO&hellip;</div>
                            <h3 id="analisis-narrativa" class="analisis-narrativa">Cargando análisis experto&hellip;</h3>
                        </div>
                        <div class="analisis-ejecutivo-right">
                            <canvas id="chart-sentimiento-global" width="230" height="230"></canvas>
                            <div class="analisis-donut-legend">
                                <div class="donut-leg-item">
                                    <span class="legend-dot" style="background:#0f9f6e"></span>
                                    <span>Positivo</span>
                                    <strong id="leg-pos">—</strong>%
                                </div>
                                <div class="donut-leg-item">
                                    <span class="legend-dot" style="background:#d97706"></span>
                                    <span>Neutro</span>
                                    <strong id="leg-neu">—</strong>%
                                </div>
                                <div class="donut-leg-item">
                                    <span class="legend-dot" style="background:#c43d45"></span>
                                    <span>Negativo</span>
                                    <strong id="leg-neg">—</strong>%
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Radar de dimensiones -->
                    <div class="analisis-section-row">
                        <div class="premium-radar-header">
                            <h3 class="analisis-section-header">Vista Radar — Comparativa por Dimensión</h3>
                            <p class="analisis-section-desc">Cada eje evalúa el sentimiento mediante un <b>Índice Neto</b> (escala -100 a +100 puntos), calculado como: <i>% Positivo menos % Negativo</i>. Verde = favorable, rojo = crítico.</p>
                        </div>
                    </div>
                    <div class="card analisis-radar-card">
                        <canvas id="chart-radar-dimensiones" height="110"></canvas>
                    </div>

                    <!-- Dimensiones -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Análisis Detallado por Dimensión</h3>
                            <p class="analisis-section-desc">Distribución de respuestas y sentimiento por cada eje temático de la encuesta parroquial.</p>
                        </div>
                    </div>
                    <div id="analisis-dimensiones-grid" class="analisis-dim-grid"></div>

                    <!-- Percepciones mineras -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Percepciones sobre la Actividad Minera</h3>
                            <p class="analisis-section-desc">Selección múltiple — un encuestado puede indicar varios ítems.</p>
                        </div>
                    </div>
                    <div class="analisis-mining-grid">
                        <div class="card analisis-mining-card">
                            <h4 class="analisis-card-title analisis-title-green">Beneficios percibidos</h4>
                            <div id="analisis-beneficios-list" class="analisis-bar-list"></div>
                        </div>
                        <div class="card analisis-mining-card">
                            <h4 class="analisis-card-title analisis-title-red">Riesgos percibidos</h4>
                            <div id="analisis-riesgos-list" class="analisis-bar-list"></div>
                        </div>
                    </div>

                    <!-- Conocimiento minero -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Nivel de Conocimiento sobre Minería</h3>
                            <p class="analisis-section-desc">Semáforo: <span style="color:#4caf50; font-weight:600;">&#9679;</span> &ge;60% buen conocimiento &nbsp;<span style="color:#ff9800; font-weight:600;">&#9679;</span> 30-59% parcial &nbsp;<span style="color:#e53935; font-weight:600;">&#9679;</span> &lt;30% socializaci&oacute;n urgente</p>
                        </div>
                    </div>
                    <div class="card analisis-conocimiento-card">
                        <div id="analisis-conocimiento-grid" class="analisis-conocimiento-grid"></div>
                    </div>

                    <!-- Correlaciones -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Correlaciones y Cruces Estratégicos</h3>
                            <p class="analisis-section-desc">Diferencia expresada en puntos porcentuales (pp) entre grupos comparados.</p>
                        </div>
                    </div>
                    <div id="analisis-correlaciones" class="analisis-corr-list"></div>

                    <!-- Tendencia temporal -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Tendencia del Levantamiento (últimos 14 días)</h3>
                            <p class="analisis-section-desc">Barras: encuestas por día &nbsp;&middot;&nbsp; Línea: % de apertura a inversión minera.</p>
                        </div>
                    </div>
                    <div class="card analisis-chart-card">
                        <canvas id="chart-tendencia" height="320"></canvas>
                    </div>

                    <!-- Gauge de sentimiento -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Gauge de Sentimiento Neto</h3>
                            <p class="analisis-section-desc">Semicírculo de &minus;100 a +100 puntos. Verde = favorable, rojo = crítico.</p>
                        </div>
                    </div>
                    <div class="card analisis-chart-card" style="max-width:420px;margin:0 auto;">
                        <canvas id="chart-gauge" height="180"></canvas>
                    </div>

                    <!-- Distribución por sector -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Distribución por Sector</h3>
                            <p class="analisis-section-desc">Número de encuestas registradas por zona geográfica.</p>
                        </div>
                    </div>
                    <div class="card analisis-chart-card">
                        <div id="analisis-sector-dist" class="analisis-bar-list"></div>
                    </div>

                </div><!-- /analisis-content -->

            </section><!-- /tab-analisis -->

        </main><!-- /app-main -->
    </div><!-- /app-shell -->

    <!-- ===================== SCRIPTS ===================== -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="frontend/app.js?v=<?= time() ?>"></script>
</body>
</html>
