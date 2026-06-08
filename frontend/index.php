<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=UTF-8');
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
                <button id="tab-button-llm" class="tab" data-tab="llm">LLM</button>
                <button id="tab-button-offline" class="tab hidden" data-tab="offline">Cola Offline</button>
            </nav>

            <section id="tab-dashboard" class="tab-panel">
                <div class="panel-row">
                    <div class="card">
                        <label class="field-label" for="sector-filter">Sector en monitoreo</label>
                        <select id="sector-filter">
                            <option value="general">Todas las zonas</option>
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
                        <span class="eyebrow">Total de encuestas</span>
                        <h3 id="kpi-total">0</h3>
                        <div style="margin-top:8px;">
                            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:4px;">
                                <span id="kpi-total-pct-label">0% de meta</span>
                                <span>Meta: 300</span>
                            </div>
                            <div class="progress" title="Cumplimiento de meta (300 encuestas)">
                                <div id="kpi-total-bar" class="progress-bar"></div>
                            </div>
                        </div>
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
                    <article class="card kpi-card" title="Nivel de confianza estadistica del muestreo">
                        <span class="eyebrow">Nivel de confianza</span>
                        <h3 id="kpi-confidence" style="color:#0f9f6e;">95%</h3>
                        <small style="font-size:.72rem;color:var(--muted);">Z = 1.96 &middot; p = 0.5</small>
                    </article>
                    <article class="card kpi-card" title="Margen de error muestral para las encuestas registradas">
                        <span class="eyebrow">Error muestral</span>
                        <h3 id="kpi-margin-error" style="color:#d97706;">&plusmn;--</h3>
                        <small id="kpi-margin-formula" style="font-size:.72rem;color:var(--muted);">1.96 &times; &radic;(0.25/n)</small>
                    </article>
                </div>

                <!-- Tacometros de sentimiento por dimension -->
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
                            <h3>Aceptacion a Inversion Externa</h3>
                        </div>
                        <p style="font-size:.78rem;color:#A67C52;margin-bottom:.9rem;">
                            Pregunta: <em>"&iquest;Acepta usted inversion externa en su comunidad?"</em>
                            &mdash; calculado sobre encuestados que respondieron esa pregunta.
                        </p>
                        <div class="application-kpis" style="grid-template-columns:1fr 1fr;gap:.75rem;">

                            <div class="mini-kpi strat-favorable">
                                <span class="strat-label">&#10003; Favorable</span>
                                <strong id="strategy-favorable">0%</strong>
                                <small id="strategy-favorable-count" style="color:#A67C52;font-size:.72rem;font-weight:400;"></small>
                                <p class="strat-tip">Respondieron <strong>"Aceptacion amplia"</strong>. Personas completamente abiertas a recibir inversion externa sin condiciones.</p>
                            </div>

                            <div class="mini-kpi strat-conditioned">
                                <span class="strat-label">&#9888; Condicionada</span>
                                <strong id="strategy-conditioned">0%</strong>
                                <small id="strategy-conditioned-count" style="color:#A67C52;font-size:.72rem;font-weight:400;"></small>
                                <p class="strat-tip">Respondieron <strong>"Aceptacion condicionada"</strong>. Abiertos a inversion pero con condiciones o garantias previas.</p>
                            </div>

                            <div class="mini-kpi strat-contrary">
                                <span class="strat-label">&#10007; Contraria</span>
                                <strong id="strategy-contrary">0%</strong>
                                <small id="strategy-contrary-count" style="color:#A67C52;font-size:.72rem;font-weight:400;"></small>
                                <p class="strat-tip">Respondieron <strong>"Rechazo preventivo"</strong>. Personas que rechazan la inversion externa como medida de precaucion.</p>
                            </div>

                            <div class="mini-kpi strat-sector">
                                <span class="strat-label">&#128205; Sector mas abierto</span>
                                <strong id="strategy-open-sector">Sin datos</strong>
                                <small style="color:#A67C52;font-size:.72rem;font-weight:400;">mayor concentracion favorable</small>
                                <p class="strat-tip">Sector con la <strong>mayor cantidad absoluta</strong> de respuestas favorables ("Aceptacion amplia") entre todos los sectores encuestados.</p>
                            </div>

                        </div>
                        <div id="strategy-base" style="font-size:.72rem;color:#A67C52;margin-top:.6rem;text-align:right;"></div>
                    </article>
                </div>

                <!-- ═══ LISTADO DE ENCUESTAS REALIZADAS ═══ -->
                <article class="card" style="margin-top:1.2rem;">
                    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                        <h3>Encuestas Realizadas</h3>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <input id="dash-survey-search" type="text" placeholder="Buscar encuestado, sector…"
                                style="padding:5px 10px;border:1px solid #d1c5b0;border-radius:6px;font-size:.82rem;width:200px;">
                            <span id="dash-survey-count" style="font-size:.8rem;color:#A67C52;font-weight:600;"></span>
                        </div>
                    </div>
                    <div style="overflow-x:auto;margin-top:.6rem;">
                        <table id="dash-surveys-table" style="width:100%;border-collapse:collapse;font-size:.82rem;">
                            <thead>
                                <tr style="background:#f5ede0;color:#5a3e28;">
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">#</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Fecha</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Sector</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Comunidad</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Encuestador/a</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Género</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Edad</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Ocupación</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Problemática</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Clima político</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Inversión</th>
                                    <th style="padding:8px 10px;text-align:left;white-space:nowrap;">Estado</th>
                                </tr>
                            </thead>
                            <tbody id="dash-surveys-body">
                                <tr><td colspan="12" style="padding:20px;text-align:center;color:#A67C52;">Cargando encuestas…</td></tr>
                            </tbody>
                        </table>
                    </div>
                </article>

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

            <section id="tab-llm" class="tab-panel hidden">
                <div class="section-title" style="border-bottom:2px solid #D7CCC8;padding-bottom:16px;margin-bottom:20px;">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <span style="font-size:2rem;line-height:1;">🤖</span>
                        <div>
                            <h3 style="margin:0;font-size:1.25rem;color:#4E342E;font-weight:700;">An&aacute;lisis IA &mdash; NVIDIA LLM</h3>
                            <p style="margin:2px 0 0;color:#8D6E63;font-size:0.85rem;">Sentimientos, predicciones y plan estrat&eacute;gico generados por inteligencia artificial en tiempo real.</p>
                        </div>
                    </div>
                </div>

                <!-- Filtro y boton -->
                <div class="card filter-panel" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:200px;">
                        <label class="field-label" for="llm-sector-filter" style="font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);">🗺️ Zona a analizar</label>
                        <select id="llm-sector-filter" style="margin-top:4px;">
                            <option value="general">Todas las zonas</option>
                        </select>
                    </div>
                    <div style="padding-top:20px;display:flex;gap:8px;flex-wrap:wrap;">
                        <button id="llm-generate-btn" class="primary-button" type="button" style="white-space:nowrap;">&#9889; Analizar con IA</button>
                        <button id="llm-pdf-btn" class="analisis-refresh-btn" type="button" style="background:#6F4E37;white-space:nowrap;" title="Exportar reporte LLM NVIDIA en PDF">&#128196; Reporte PDF</button>
                    </div>
                </div>

                <!-- Loading -->
                <div id="llm-loading" class="hidden">
                    <div class="ia-loading" style="padding:32px;">
                        <span class="ia-spinner"></span>
                        <div style="margin-top:16px;text-align:center;">
                            <strong id="llm-progress-msg" style="font-size:1rem;">Calculando estadísticas...</strong><br>
                            <small style="color:var(--text-muted);">Las gráficas aparecen en segundos &mdash; el texto del LLM sigue procesando.</small>
                            <div id="llm-zonas-progress" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;"></div>
                        </div>
                    </div>
                </div>

                <!-- Error -->
                <div id="llm-error" class="hidden ia-error"></div>
                <div id="llm-results" class="hidden">
                    <!-- Indicador no-bloqueante: IA enriqueciendo texto en background -->
                    <div id="llm-ai-enriching" style="display:none;align-items:center;gap:10px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:10px 16px;margin-bottom:16px;">
                        <span style="display:inline-block;width:14px;height:14px;border:2px solid #60a5fa;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;"></span>
                        <span style="font-size:0.82rem;color:#93c5fd;">IA generando interpretaciones en segundo plano&hellip; Las gr&aacute;ficas ya est&aacute;n listas.</span>
                    </div>
                    <!-- Barra: motor + zona analizada -->
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span id="llm-motor-badge" class="analisis-label-pill" style="background:#1e3a5f;color:#60a5fa;"></span>
                            <span style="font-size:0.72rem;color:#8D6E63;">&#128202; An&aacute;lisis generado por IA sobre datos reales de encuestas</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;background:#FFF8E1;border:1px solid #D7CCC8;border-radius:20px;padding:4px 12px;">
                            <span style="font-size:0.8rem;">&#128507;</span>
                            <span style="font-size:0.75rem;font-weight:700;color:#4E342E;">Zona:&nbsp;</span>
                            <span id="llm-zona-activa-badge" style="font-size:0.78rem;font-weight:800;color:#6F4E37;">Todas las zonas</span>
                        </div>
                    </div>

                    <!-- KPI Row -->
                    <div class="analisis-kpi-row" style="margin-bottom:16px;">
                        <div class="analisis-kpi-card" style="border-top:3px solid #60a5fa;">
                            <div class="kpi-icon-wrap kpi-blue" style="font-size:1.3rem;">🎯</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Predicci&oacute;n</span>
                                <strong id="llm-prediccion" class="kpi-value" style="font-size:1.1rem;">--</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card" style="border-top:3px solid #22c55e;">
                            <div class="kpi-icon-wrap kpi-green" style="font-size:1.3rem;">✅</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Aceptaci&oacute;n</span>
                                <strong id="llm-prob-aceptacion" class="kpi-value kpi-green-val">--</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card" style="border-top:3px solid #f59e0b;">
                            <div class="kpi-icon-wrap kpi-orange" style="font-size:1.3rem;">⚖️</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Neutral</span>
                                <strong id="llm-prob-neutral" class="kpi-value kpi-problem-text">--</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card" style="border-top:3px solid #ef4444;">
                            <div class="kpi-icon-wrap kpi-red" style="font-size:1.3rem;">❌</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Rechazo</span>
                                <strong id="llm-prob-rechazo" class="kpi-value kpi-red-val">--</strong>
                            </div>
                        </div>
                    </div>
                    <!-- Barra de sentimiento global visual con etiquetas -->
                    <div id="llm-sentiment-bar-wrap" style="margin-bottom:20px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:4px;">
                            <span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;">&#128202; Distribuci&oacute;n de Sentimiento &mdash; <span id="llm-sentiment-zona-label" style="color:#6F4E37;font-weight:700;">Todas las zonas</span></span>
                            <span style="font-size:0.68rem;color:#8D6E63;font-style:italic;">&#129302; Modelo RF+MLP sobre encuestas reales</span>
                        </div>
                        <!-- Barra visual -->
                        <div style="display:flex;height:18px;border-radius:8px;overflow:hidden;gap:2px;margin-bottom:8px;" id="llm-global-sentiment-bar">
                            <div id="llm-bar-acept" style="width:34%;background:linear-gradient(90deg,#16a34a,#22c55e);transition:width 0.8s;border-radius:6px 0 0 6px;display:flex;align-items:center;justify-content:center;">
                                <span id="llm-bar-acept-label" style="font-size:0.65rem;font-weight:800;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.3);">--</span>
                            </div>
                            <div id="llm-bar-neutr" style="width:23%;background:linear-gradient(90deg,#d97706,#f59e0b);transition:width 0.8s;display:flex;align-items:center;justify-content:center;">
                                <span id="llm-bar-neutr-label" style="font-size:0.65rem;font-weight:800;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.3);">--</span>
                            </div>
                            <div id="llm-bar-rech" style="width:43%;background:linear-gradient(90deg,#b91c1c,#ef4444);transition:width 0.8s;border-radius:0 6px 6px 0;display:flex;align-items:center;justify-content:center;">
                                <span id="llm-bar-rech-label" style="font-size:0.65rem;font-weight:800;color:#fff;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.3);">--</span>
                            </div>
                        </div>
                        <!-- Leyenda con valores -->
                        <div style="display:flex;gap:16px;flex-wrap:wrap;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="width:10px;height:10px;border-radius:50%;background:#22c55e;flex-shrink:0;"></span>
                                <span style="font-size:0.78rem;color:#3E2723;">Aceptaci&oacute;n: <strong id="llm-sent-acept-val" style="color:#16a34a;">--</strong></span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></span>
                                <span style="font-size:0.78rem;color:#3E2723;">Neutro: <strong id="llm-sent-neutr-val" style="color:#d97706;">--</strong></span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;flex-shrink:0;"></span>
                                <span style="font-size:0.78rem;color:#3E2723;">Rechazo: <strong id="llm-sent-rech-val" style="color:#b91c1c;">--</strong></span>
                            </div>
                        </div>
                    </div>

                    <!-- Resumen Ejecutivo -->
                    <div class="analisis-ejecutivo-card" style="margin-bottom:24px;">
                        <div class="analisis-ejecutivo-left">
                            <div class="analisis-label-pill">RESUMEN EJECUTIVO NVIDIA</div>
                            <h3 id="llm-resumen" class="analisis-narrativa" style="font-size:1.1rem; line-height:1.6; font-weight:400; color:var(--text-color);"></h3>
                        </div>
                        <div class="analisis-ejecutivo-right">
                            <canvas id="llm-donut-stats" width="230" height="230"></canvas>
                        </div>
                    </div>

                    <!-- Caja de razonamiento -->
                    <div id="llm-thinking-box" class="hidden" style="background:#0f172a;border:1px solid #1e3a5f;border-radius:8px;padding:14px;margin-bottom:18px;max-height:170px;overflow-y:auto;font-size:0.78rem;color:#94a3b8;font-family:monospace;white-space:pre-wrap;line-height:1.6;"></div>

                    <!-- ===== GRÁFICA: IMPORTANCIA DE FACTORES ===== -->
                    <div class="analisis-section-row" style="margin-top:8px;">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                            <div>
                                <h3 class="analisis-section-header">&#128202; Importancia de Factores</h3>
                                <p class="analisis-section-desc">Peso relativo de cada dimensi&oacute;n en la percepci&oacute;n comunitaria seg&uacute;n el sector seleccionado. A mayor puntaje, mayor influencia sobre la aceptaci&oacute;n o rechazo del proyecto minero.</p>
                            </div>
                            <span id="llm-factores-sector-badge" style="font-size:0.72rem;font-weight:700;padding:4px 12px;border-radius:20px;border:1px solid #6F4E37;color:#6F4E37;background:rgba(111,78,55,0.08);white-space:nowrap;align-self:flex-start;margin-top:4px;">&#128507; Todas las zonas</span>
                        </div>
                    </div>
                    <div class="card" style="margin-bottom:24px;background:#fff;border:1px solid #D7CCC8;padding:20px;">
                        <!-- Leyenda de colores -->
                        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:0.75rem;font-weight:600;">
                            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#b91c1c;margin-right:5px;vertical-align:middle;"></span>Cr&iacute;tico (&ge;75%)</span>
                            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#d97706;margin-right:5px;vertical-align:middle;"></span>Relevante (55-74%)</span>
                            <span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#16a34a;margin-right:5px;vertical-align:middle;"></span>Moderado (&lt;55%)</span>
                        </div>
                        <div style="position:relative;height:320px;">
                            <canvas id="llm-factores-chart"></canvas>
                        </div>
                    </div>

                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Sentimientos por Dimensi&oacute;n</h3>
                            <p class="analisis-section-desc">An&aacute;lisis de sentimiento por cada eje tem&aacute;tico &mdash; procesado por IA</p>
                        </div>
                    </div>
                    <div id="llm-stats-dimensiones-grid" class="analisis-dim-grid" style="margin-bottom:24px;"></div>

                    <!-- Factores + Recomendaciones -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Hallazgos Cr&iacute;ticos y Estrategia</h3>
                            <p class="analisis-section-desc">Evaluaci&oacute;n de factores de riesgo y recomendaciones directas</p>
                        </div>
                    </div>
                    <div class="analisis-mining-grid" style="margin-bottom:24px;">
                        <div class="card analisis-mining-card">
                            <h4 class="analisis-card-title analisis-title-red">Factores Cr&iacute;ticos</h4>
                            <ul id="llm-factores" style="list-style:disc;padding-left:18px;margin-top:10px;line-height:1.7;"></ul>
                        </div>
                        <div class="card analisis-mining-card">
                            <h4 class="analisis-card-title analisis-title-green">Recomendaciones</h4>
                            <ul id="llm-recomendaciones" style="list-style:disc;padding-left:18px;margin-top:10px;line-height:1.7;"></ul>
                        </div>
                    </div>

                    <!-- Análisis por zona LLM -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Evaluaci&oacute;n Zonal (NVIDIA)</h3>
                        </div>
                    </div>
                    <div id="llm-zonas-llm-grid" class="analisis-dim-grid" style="margin-bottom:24px;"></div>
                    
                    <div class="analisis-section-row">
                        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                            <div>
                                <h3 class="analisis-section-header">Distribución de Sentimientos por Zona</h3>
                                <p class="analisis-section-desc">Cada barra representa una zona de la parroquia. Los colores muestran qué proporción respondió de forma <strong style="color:#16a34a;">favorable</strong>, <strong style="color:#d97706;">neutral</strong> o <strong style="color:#b91c1c;">desfavorable</strong>. Al pasar el cursor sobre una barra verás la predicción y hallazgo de la IA.</p>
                            </div>
                            <span id="llm-zonas-chart-badge" style="font-size:0.72rem;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid #D7CCC8;color:#8D6E63;background:rgba(111,78,55,0.08);white-space:nowrap;align-self:flex-start;margin-top:4px;">📊 Datos estadísticos</span>
                        </div>
                    </div>
                    <div class="card analisis-chart-card" style="margin-bottom:24px;background:#fff;border:1px solid #D7CCC8;">
                        <div style="position:relative;height:300px;padding:8px 0 4px;">
                            <canvas id="llm-zonas-chart"></canvas>
                        </div>
                    </div>

                    <!-- Radar — mismo estilo que Vista Radar del tab Análisis IA -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Vista Radar &mdash; Comparativa por Dimensi&oacute;n</h3>
                            <p class="analisis-section-desc">Cada eje eval&uacute;a el sentimiento mediante un <strong>&Iacute;ndice Neto</strong> (escala -100 a +100 pts), calculado como: <em>% Positivo menos % Negativo</em>. Verde = favorable, rojo = cr&iacute;tico. Misma metodolog&iacute;a que el tab An&aacute;lisis IA &mdash; compare ambos radares para verificar consistencia.</p>
                        </div>
                    </div>
                    <div class="card analisis-radar-card" style="margin-bottom:24px;background:linear-gradient(135deg,#111827 0%,#1e3a8a 100%);border:1px solid rgba(255,255,255,0.1);padding:24px 16px 16px;flex-direction:column;">
                        <div style="position:relative;width:100%;height:700px;max-width:900px;margin:0 auto;">
                            <canvas id="llm-radar-chart"></canvas>
                        </div>
                    </div>



                    <!-- Plan Estratégico -->
                    <div style="margin-bottom:8px;padding:20px 24px 16px;background:linear-gradient(135deg,#4E342E 0%,#6F4E37 100%);border-radius:16px;display:flex;align-items:flex-start;gap:16px;">
                        <div style="font-size:2rem;line-height:1;flex-shrink:0;">🗺️</div>
                        <div>
                            <div style="font-size:0.7rem;font-weight:700;letter-spacing:.1em;color:rgba(255,220,180,0.8);text-transform:uppercase;margin-bottom:4px;">Plan Generado por NVIDIA IA</div>
                            <h3 id="llm-plan-titulo" style="margin:0 0 6px;font-size:1.2rem;color:#fff;font-weight:700;">Plan Estrat&eacute;gico</h3>
                            <p id="llm-plan-diagnostico" style="margin:0;font-size:0.85rem;color:rgba(255,220,180,0.85);line-height:1.5;"></p>
                        </div>
                    </div>

                    <!-- Fases -->
                    <div style="margin-bottom:6px;padding:4px 0 8px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                            <span style="font-size:1.1rem;">🔄</span>
                            <h4 style="margin:0;font-size:1rem;font-weight:700;color:#4E342E;">Fases de Implementaci&oacute;n</h4>
                        </div>
                        <div id="llm-plan-fases" class="analisis-dim-grid"></div>
                    </div>

                    <!-- Indicadores -->
                    <div style="margin-bottom:6px;padding:4px 0 8px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                            <span style="font-size:1.1rem;">📈</span>
                            <h4 style="margin:0;font-size:1rem;font-weight:700;color:#4E342E;">Indicadores de Seguimiento</h4>
                        </div>
                        <div style="overflow-x:auto;border-radius:12px;border:1px solid #D7CCC8;background:#fff;">
                            <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
                                <thead>
                                    <tr style="background:#FFF8E1;border-bottom:2px solid #D7CCC8;">
                                        <th style="padding:12px 16px;text-align:left;color:#4E342E;font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;">Indicador</th>
                                        <th style="padding:12px 16px;text-align:left;color:#4E342E;font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;">Meta</th>
                                        <th style="padding:12px 16px;text-align:left;color:#4E342E;font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;">⏱ Plazo</th>
                                    </tr>
                                </thead>
                                <tbody id="llm-plan-indicadores"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Acciones Finales -->
                    <div style="margin-bottom:6px;padding:4px 0 8px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
                            <span style="font-size:1.1rem;">⚡</span>
                            <h4 style="margin:0;font-size:1rem;font-weight:700;color:#4E342E;">Acciones Prioritarias</h4>
                        </div>
                        <ol id="llm-plan-acciones" style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;"></ol>
                    </div>

                    <!-- Conclusión -->
                    <div id="llm-conclusion-card" style="margin-top:8px;border-radius:16px;overflow:hidden;border:1px solid #D7CCC8;">
                        <div style="background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);padding:16px 20px;border-bottom:1px solid #bbf7d0;display:flex;align-items:center;gap:10px;">
                            <span style="font-size:1.3rem;">&#128161;</span>
                            <h4 style="margin:0;color:#14532d;font-size:1rem;font-weight:700;">Conclusi&oacute;n General del An&aacute;lisis IA</h4>
                        </div>
                        <div style="background:#fff;padding:20px 24px;">
                            <p id="llm-conclusion" style="margin:0;line-height:1.8;color:#3E2723;font-size:0.95rem;"></p>
                        </div>
                    </div>

                    <!-- ===== EJES ESTRATÉGICOS ===== -->
                    <div id="llm-ejes-section" class="hidden" style="margin-top:28px;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #D7CCC8;">
                            <span style="font-size:1.4rem;">&#9889;</span>
                            <div>
                                <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#4E342E;">Ejes Estrat&eacute;gicos del Proyecto Minero</h3>
                                <p style="margin:2px 0 0;font-size:0.8rem;color:#8D6E63;">Ordenados por prioridad seg&uacute;n el an&aacute;lisis de dimensiones cr&iacute;ticas de las encuestas</p>
                            </div>
                        </div>
                        <div id="llm-ejes-grid" style="display:flex;flex-direction:column;gap:16px;"></div>
                    </div>

                    <!-- ===== MEJORES PRÁCTICAS MINERAS ===== -->
                    <div id="llm-practicas-section" class="hidden" style="margin-top:28px;">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #D7CCC8;">
                            <span style="font-size:1.4rem;">&#127759;</span>
                            <div>
                                <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#4E342E;">Mejores Pr&aacute;cticas Mineras de Referencia</h3>
                                <p style="margin:2px 0 0;font-size:0.8rem;color:#8D6E63;">Marcos internacionales y casos nacionales aplicables al contexto de San Bartolom&eacute;</p>
                            </div>
                        </div>
                        <!-- Tabs locales/internacionales -->
                        <div style="display:flex;gap:8px;margin-bottom:16px;">
                            <button id="tab-practicas-int" onclick="switchPracticas('int')" style="flex:1;padding:8px;border-radius:8px;border:2px solid #0e4eb0;background:#0e4eb0;color:#fff;font-weight:700;font-size:0.82rem;cursor:pointer;">&#127760; Internacionales</button>
                            <button id="tab-practicas-loc" onclick="switchPracticas('loc')" style="flex:1;padding:8px;border-radius:8px;border:2px solid #D7CCC8;background:#fff;color:#4E342E;font-weight:700;font-size:0.82rem;cursor:pointer;">&#127466;&#127464; Ecuador / Locales</button>
                        </div>
                        <div id="llm-practicas-int" style="display:flex;flex-direction:column;gap:12px;"></div>
                        <div id="llm-practicas-loc" style="display:none;flex-direction:column;gap:12px;"></div>
                    </div>

                    <!-- ===== RECOMENDACIONES MINERAS ===== -->
                    <div id="llm-rec-mineras-section" class="hidden" style="margin-top:28px;">

                        <!-- Header -->
                        <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
                            <span style="font-size:2.2rem;flex-shrink:0;">&#9935;&#65039;</span>
                            <div>
                                <div style="font-size:0.68rem;font-weight:700;letter-spacing:.12em;color:rgba(200,220,255,0.7);text-transform:uppercase;margin-bottom:4px;">An&aacute;lisis IA &mdash; Datos de Encuestas</div>
                                <h3 style="margin:0 0 4px;font-size:1.15rem;color:#fff;font-weight:800;">Recomendaciones para el Proyecto Minero</h3>
                                <p style="margin:0;font-size:0.82rem;color:rgba(200,220,255,0.75);">Generado con base en las respuestas de encuestados: riesgos percibidos, beneficios esperados, conocimiento t&eacute;cnico y aceptaci&oacute;n por zona.</p>
                            </div>
                        </div>

                        <!-- Viabilidad + KPIs -->
                        <div id="llm-rec-viabilidad" style="margin-bottom:20px;"></div>

                        <!-- 2 columnas: Fortalezas | Riesgos críticos -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                                    <span style="font-size:1rem;">&#9989;</span>
                                    <h4 style="margin:0;font-size:0.9rem;font-weight:700;color:#15803d;">Fortalezas Identificadas</h4>
                                </div>
                                <ul id="llm-rec-fortalezas" style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;"></ul>
                            </div>
                            <div>
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                                    <span style="font-size:1rem;">&#9888;&#65039;</span>
                                    <h4 style="margin:0;font-size:0.9rem;font-weight:700;color:#b91c1c;">Riesgos Cr&iacute;ticos a Gestionar</h4>
                                </div>
                                <ul id="llm-rec-riesgos" style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;"></ul>
                            </div>
                        </div>

                        <!-- Acciones inmediatas -->
                        <div style="margin-bottom:20px;">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                                <span style="font-size:1.1rem;">&#128161;</span>
                                <h4 style="margin:0;font-size:0.95rem;font-weight:700;color:#4E342E;">Acciones Inmediatas Recomendadas</h4>
                                <span style="font-size:0.7rem;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:20px;padding:2px 10px;font-weight:700;">Basadas en encuestas</span>
                            </div>
                            <ol id="llm-rec-acciones" style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;"></ol>
                        </div>

                </div><!-- /llm-results -->
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
                 TAB: PREGUNTAS &mdash; Gr&aacute;ficas por pregunta de encuesta
                 ========================================================= -->
            <section id="tab-preguntas" class="tab-panel hidden">
                <div class="analisis-topbar">
                    <div class="analisis-topbar-left">
                        <h2 class="analisis-titulo">Respuestas por Pregunta</h2>
                        <p class="analisis-subtitulo">Distribuci&oacute;n real de respuestas &middot; Actualizado desde la base de datos</p>
                    </div>
                    <div class="analisis-topbar-right">
                        <select id="preguntas-sector-filter" class="analisis-select">
                            <option value="general">Todas las zonas</option>
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
                 TAB: ANALISIS EXPERTO DE ENCUESTAS (IA / PIVOT-style)
                 ========================================================= -->
            <section id="tab-analisis" class="tab-panel hidden">

                <!-- Barra de control -->
                <div class="analisis-topbar">
                    <div class="analisis-topbar-left">
                        <h2 class="analisis-titulo">Analisis Experto de Encuestas</h2>
                        <p class="analisis-subtitulo">Estadistica descriptiva &middot; Sentimiento comunitario &middot; Actualizacion automatica cada 90 s</p>
                    </div>
                    <div class="analisis-topbar-right">
                        <select id="analisis-sector-filter" class="analisis-select">
                            <option value="general">Todas las zonas</option>
                        </select>
                        <button id="analisis-refresh-btn" class="analisis-refresh-btn" type="button">Actualizar</button>
                        <button id="analisis-pdf-btn" class="analisis-refresh-btn" type="button" style="background:#7c3aed;" title="Exportar reporte tecnico-cientifico en PDF">Reporte PDF</button>
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
                    <p>Sin encuestas registradas aun.</p>
                    <small>El analisis aparecera automaticamente cuando lleguen datos de campo.</small>
                </div>

                <!-- Contenido principal -->
                <div id="analisis-content" class="hidden">

                    <!-- KPI Row -->
                    <div class="analisis-kpi-row">
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-blue">#</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Total Encuestas</span>
                                <strong id="analisis-total-n" class="kpi-value">&mdash;</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-teal">~</div>
                            <div class="kpi-info">
                                <span class="kpi-label">&Iacute;ndice Neto Global</span>
                                <strong id="kpi-indice-global" class="kpi-value">&mdash;</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-green">+</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Sentimiento Positivo</span>
                                <strong id="analisis-pos-global" class="kpi-value kpi-green-val">&mdash;</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card">
                            <div class="kpi-icon-wrap kpi-red">-</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Sentimiento Negativo</span>
                                <strong id="analisis-neg-global" class="kpi-value kpi-red-val">&mdash;</strong>
                            </div>
                        </div>
                        <div class="analisis-kpi-card kpi-wide">
                            <div class="kpi-icon-wrap kpi-orange">!</div>
                            <div class="kpi-info">
                                <span class="kpi-label">Problem&aacute;tica Principal</span>
                                <strong id="analisis-problema" class="kpi-value kpi-problem-text">&mdash;</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Resumen ejecutivo -->
                    <div class="analisis-ejecutivo-card" id="analisis-ejecutivo">
                        <div class="analisis-ejecutivo-left">
                            <div class="analisis-label-pill" id="analisis-nivel-badge">ANALIZANDO&hellip;</div>
                            <h3 id="analisis-narrativa" class="analisis-narrativa">Cargando analisis experto&hellip;</h3>
                        </div>
                        <div class="analisis-ejecutivo-right">
                            <canvas id="chart-sentimiento-global" width="230" height="230"></canvas>
                            <div class="analisis-donut-legend">
                                <div class="donut-leg-item">
                                    <span class="legend-dot" style="background:#0f9f6e"></span>
                                    <span>Positivo</span>
                                    <strong id="leg-pos">&mdash;</strong>%
                                </div>
                                <div class="donut-leg-item">
                                    <span class="legend-dot" style="background:#d97706"></span>
                                    <span>Neutro</span>
                                    <strong id="leg-neu">&mdash;</strong>%
                                </div>
                                <div class="donut-leg-item">
                                    <span class="legend-dot" style="background:#c43d45"></span>
                                    <span>Negativo</span>
                                    <strong id="leg-neg">&mdash;</strong>%
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Radar de dimensiones -->
                    <div class="analisis-section-row">
                        <div class="premium-radar-header">
                            <h3 class="analisis-section-header">Vista Radar &ndash; Comparativa por Dimensi&oacute;n</h3>
                            <p class="analisis-section-desc">Cada eje eval&uacute;a el sentimiento mediante un <b>&Iacute;ndice Neto</b> (escala -100 a +100 puntos), calculado como: <i>% Positivo menos % Negativo</i>. Verde = favorable, rojo = cr&iacute;tico. Los datos se actualizan autom&aacute;ticamente desde la base de datos con cada recarga.</p>
                        </div>
                    </div>
                    <div class="card analisis-radar-card">
                        <canvas id="chart-radar-dimensiones" height="110"></canvas>
                    </div>

                    <!-- Dimensiones -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">An&aacute;lisis Detallado por Dimensi&oacute;n</h3>
                            <p class="analisis-section-desc">Distribuci&oacute;n de respuestas y sentimiento por cada eje tem&aacute;tico de la encuesta parroquial.</p>
                        </div>
                    </div>
                    <div id="analisis-dimensiones-grid" class="analisis-dim-grid"></div>

                    <!-- Percepciones mineras -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Percepciones sobre la Actividad Minera</h3>
                            <p class="analisis-section-desc">Selecci&oacute;n m&uacute;ltiple &mdash; un encuestado puede indicar varios &iacute;tems.</p>
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
                            <h3 class="analisis-section-header">Nivel de Conocimiento sobre Mineria</h3>
                            <p class="analisis-section-desc">Semaforo: <span style="color:#4caf50; font-weight:600;">&#9679;</span> &ge;60% buen conocimiento &nbsp;<span style="color:#ff9800; font-weight:600;">&#9679;</span> 30-59% parcial &nbsp;<span style="color:#e53935; font-weight:600;">&#9679;</span> &lt;30% socializaci&oacute;n urgente</p>
                        </div>
                    </div>
                    <div class="card analisis-conocimiento-card">
                        <div id="analisis-conocimiento-grid" class="analisis-conocimiento-grid"></div>
                    </div>

                    <!-- Correlaciones -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Correlaciones y Cruces Estrategicos</h3>
                            <p class="analisis-section-desc">Diferencia expresada en puntos porcentuales (pp) entre grupos comparados.</p>
                        </div>
                    </div>
                    <div id="analisis-correlaciones" class="analisis-corr-list"></div>

                    <!-- Tendencia temporal -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Tendencia del Levantamiento (ultimos 14 dias)</h3>
                            <p class="analisis-section-desc">Barras: encuestas por dia &nbsp;&middot;&nbsp; Linea: % de apertura a inversion minera.</p>
                        </div>
                    </div>
                    <div class="card analisis-chart-card" style="max-width:520px;margin:0 auto;padding:12px 16px">
                        <div style="position:relative;height:180px">
                          <canvas id="chart-tendencia"></canvas>
                        </div>
                    </div>


                    <!-- Distribucion por sector -->
                    <div class="analisis-section-row">
                        <div>
                            <h3 class="analisis-section-header">Distribucion por Sector</h3>
                            <p class="analisis-section-desc">Numero de encuestas registradas por zona geografica.</p>
                        </div>
                    </div>
                    <div class="card analisis-chart-card">
                        <div id="analisis-sector-dist" class="analisis-bar-list"></div>
                    </div>

                    <!-- IA MINERA -->
                    <div id="ia-minera-box" class="hidden" style="margin-top:24px"></div>
                    <!-- Plan Gemini -->
                    <div id="gemini-plan-box" class="hidden" style="margin-top:24px"></div>

                </div><!-- /analisis-content -->

            </section><!-- /tab-analisis -->

        </main><!-- /app-main -->
    </div><!-- /app-shell -->

    <!-- ===================== MODAL VER ENCUESTA ===================== -->
    <div id="survey-detail-modal" class="survey-modal-overlay" style=