const state = {
    currentUser: null,
    assignedSurveyor: null,
    dashboard: null,
    applications: [],
    surveyors: [],
    surveys: [],
    auditLogs: [],
    mySurveys: [],
    applicationFilter: 'all',
    editingSurvey: null,
    dimGaugeCharts: {},
};
let mapInstance = null;
let mapLayerGroup = null;
let formMapInstance = null;
let formMapMarker = null;

const STORAGE_KEY = 'san_bartolome_pending_surveys';
const DRAFT_STORAGE_PREFIX = 'san_bartolome_survey_draft';

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    setDefaultSurveyDate();
    refreshNetworkChip();
    renderOfflineQueue();
    initializeSurveyLocationMap();
    registerServiceWorker();
    // Attempt to restore session if user is already logged in
    try {
        await bootstrapApp();
    } catch (e) {
        console.debug('No active session on load:', e.message);
    }
});

function bindEvents() {
    document.getElementById('switch-login').addEventListener('click', () => showAuthMode('login'));
    document.getElementById('switch-register').addEventListener('click', () => showAuthMode('register'));
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegistration);
    document.getElementById('logout-button').addEventListener('click', logout);
    document.getElementById('status-logout').addEventListener('click', logout);
    document.getElementById('sector-filter').addEventListener('change', loadDashboard);
    document.getElementById('survey-form').addEventListener('submit', submitSurvey);
    document.getElementById('capture-gps-button').addEventListener('click', captureGps);
    document.getElementById('latitude').addEventListener('input', syncFormMapFromInputs);
    document.getElementById('longitude').addEventListener('input', syncFormMapFromInputs);
    document.getElementById('sync-button').addEventListener('click', syncPendingSurveys);
    document.getElementById('show-offline-details-button').addEventListener('click', () => switchTab('offline'));
    document.getElementById('cancel-edit-button').addEventListener('click', cancelSurveyEdit);
    document.getElementById('profile-continue-draft-button').addEventListener('click', restoreSurveyDraft);
    document.getElementById('export-applications-button').addEventListener('click', exportApplications);

    document.getElementById('apply-survey-filters-button').addEventListener('click', loadSurveys);
    document.getElementById('export-surveys-button').addEventListener('click', exportSurveys);
    document.getElementById('apply-audit-filters-button').addEventListener('click', loadAuditLogs);
    document.getElementById('export-audit-button').addEventListener('click', exportAuditLogs);
    document.getElementById('survey-form').addEventListener('input', handleSurveyDraftChange);
    document.getElementById('survey-form').addEventListener('change', handleSurveyDraftChange);
    document.getElementById('login-password').addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            handleLogin(event);
        }
    });

    document.querySelectorAll('.tab').forEach((button) => {
        button.addEventListener('click', async () => {
            switchTab(button.dataset.tab);
            if (button.dataset.tab === 'applications' && state.currentUser?.role === 'admin') {
                await loadApplications();
            }
            if (button.dataset.tab === 'surveyors' && state.currentUser?.role === 'admin') {
                await loadSurveyors();
            }
            if (button.dataset.tab === 'surveys' && state.currentUser?.role === 'admin') {
                await loadSurveys();
            }
            if (button.dataset.tab === 'audit' && state.currentUser?.role === 'admin') {
                await loadAuditLogs();
            }
            if (button.dataset.tab === 'analisis') {
                await loadAnalisis();
            }
            if (button.dataset.tab === 'my-surveys' && state.currentUser?.role === 'surveyor') {
                await loadMySurveys();
            }
        });
    });

    document.querySelectorAll('.subtab').forEach((button) => {
        button.addEventListener('click', () => {
            state.applicationFilter = button.dataset.status;
            document.querySelectorAll('.subtab').forEach((item) => item.classList.toggle('active', item === button));
            renderApplications();
        });
    });

    window.addEventListener('online', () => {
        refreshNetworkChip();
        syncPendingSurveys();
    });
    window.addEventListener('offline', refreshNetworkChip);
}

function showAuthMode(mode) {
    const isLogin = mode === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
    document.getElementById('switch-login').classList.toggle('active', isLogin);
    document.getElementById('switch-register').classList.toggle('active', !isLogin);
}

function apiUrl(action, params = {}) {
    const url = new URL('api.php', window.location.href);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
}

async function requestJson(action, options = {}) {
    const response = await fetch(apiUrl(action, options.params || {}), {
        method: options.method || 'GET',
        headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
        const detail = payload.error ? ` Detalle: ${payload.error}` : '';
        throw new Error((payload.message || 'Error inesperado.') + detail);
    }
    return payload;
}

async function handleLogin(event) {
    if (event) event.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorNode = document.getElementById('login-error');

    try {
        errorNode.classList.add('hidden');
        const payload = await requestJson('login', {
            method: 'POST',
            body: { username, password },
        });
        state.currentUser = payload.user;
        await bootstrapApp();
    } catch (error) {
        errorNode.textContent = error.message;
        errorNode.classList.remove('hidden');
    }
}

async function handleRegistration(event) {
    event.preventDefault();
    const form = document.getElementById('register-form');
    const errorNode = document.getElementById('register-error');
    const successNode = document.getElementById('register-success');
    const formData = new FormData(form);

    if (formData.get('password') !== document.getElementById('reg-password-confirm').value) {
        errorNode.textContent = 'Las claves no coinciden.';
        errorNode.classList.remove('hidden');
        successNode.classList.add('hidden');
        return;
    }

    try {
        errorNode.classList.add('hidden');
        const payload = await requestJson('register-application', {
            method: 'POST',
            body: formData,
        });
        successNode.textContent = `${payload.message} Usuario solicitado: ${payload.application.username}.`;
        successNode.classList.remove('hidden');
        form.reset();
    } catch (error) {
        errorNode.textContent = error.message;
        errorNode.classList.remove('hidden');
        successNode.classList.add('hidden');
    }
}

async function bootstrapApp() {
    const payload = await requestJson('bootstrap');
    state.currentUser = payload.user;
    state.assignedSurveyor = payload.assigned_surveyor;
    state.dashboard = payload.dashboard;

    document.getElementById('user-badge').textContent = payload.user.display_name;
    document.getElementById('role-badge').textContent = humanRole(payload.user);

    if (payload.user.role === 'surveyor' && payload.user.account_status !== 'approved') {
        renderStatusScreen(payload.user);
        return;
    }

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('status-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    applyRoleUi();
    hydrateSurveyorField();
    if (payload.user.role === 'surveyor' && payload.user.account_status === 'approved') {
        await loadMySurveys();
        renderSurveyorProfile();
        renderSurveyorNotice();
        updateDraftButtons();
    }
    if (payload.dashboard) renderDashboard(payload.dashboard);
    renderOfflineQueue();
    await syncPendingSurveys(false);
}

function renderStatusScreen(user) {
    const title = document.getElementById('status-title');
    const message = document.getElementById('status-message');
    const meta = document.getElementById('status-meta');

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('status-screen').classList.remove('hidden');

    const statusMap = {
        pending: ['Solicitud recibida', 'Tu postulacion fue registrada y esta pendiente de revision administrativa.'],
        in_review: ['Solicitud en revision', 'Tu postulacion esta siendo revisada por el administrador.'],
        rejected: ['Solicitud rechazada', 'Tu postulacion no fue aprobada por el momento. Revisa las observaciones con el administrador.'],
        suspended: ['Cuenta suspendida', 'Tu cuenta fue suspendida temporalmente. Contacta al administrador para reactivarla.'],
    };

    const [statusTitle, statusMessage] = statusMap[user.account_status] || ['Estado de cuenta', 'Tu cuenta tiene un estado especial.'];
    title.textContent = statusTitle;
    message.textContent = statusMessage;
    meta.innerHTML = `
        <div class="status-pill-large">Usuario: ${escapeHtml(user.username)}</div>
        <div class="status-pill-large">Estado: ${escapeHtml(user.account_status)}</div>
    `;
}

function humanRole(user) {
    if (user.role === 'admin') return 'Administrador';
    if (user.account_status !== 'approved') return 'Postulante';
    return 'Encuestador';
}

function applyRoleUi() {
    const isAdmin = state.currentUser?.role === 'admin';
    const isSurveyor = state.currentUser?.role === 'surveyor';

    // Dashboard: visible para admin Y encuestador aprobado
    document.getElementById('tab-button-dashboard').classList.remove('hidden');
    document.getElementById('tab-button-surveys').classList.toggle('hidden', !isAdmin);
    document.getElementById('tab-button-profile').classList.toggle('hidden', isAdmin);
    document.getElementById('tab-button-my-surveys').classList.toggle('hidden', isAdmin);
    document.getElementById('tab-button-applications').classList.toggle('hidden', !isAdmin);
    document.getElementById('tab-button-surveyors').classList.toggle('hidden', !isAdmin);
    document.getElementById('tab-button-reports').classList.toggle('hidden', !isAdmin);
    document.getElementById('tab-button-audit').classList.toggle('hidden', !isAdmin);
    document.getElementById('tab-button-offline').classList.add('hidden');
    document.getElementById('network-chip').classList.toggle('hidden', isAdmin);
    document.getElementById('network-card').classList.add('hidden');

    // Análisis IA visible para admin Y encuestador aprobado
    const analisisBtn = document.getElementById('tab-button-analisis');
    if (analisisBtn) analisisBtn.classList.remove('hidden');

    document.getElementById('surveyor-select-wrapper').classList.toggle('hidden', !isAdmin);
    document.getElementById('assigned-surveyor-card').classList.toggle('hidden', isAdmin);
    document.getElementById('surveyor-workspace').classList.toggle('hidden', isAdmin);

    if (!isAdmin) {
        // Encuestador aprobado: puede ver Dashboard y sus propias secciones
        document.getElementById('tab-dashboard').classList.remove('hidden');
        document.getElementById('tab-surveys').classList.add('hidden');
        document.getElementById('tab-applications').classList.add('hidden');
        document.getElementById('tab-surveyors').classList.add('hidden');
        document.getElementById('tab-reports').classList.add('hidden');
        document.getElementById('tab-audit').classList.add('hidden');
        document.getElementById('tab-profile').classList.remove('hidden');
        document.getElementById('tab-my-surveys').classList.remove('hidden');
        // Encuestadores arrancan en el Dashboard
        switchTab('dashboard');
        document.getElementById('assigned-surveyor-name').textContent = state.assignedSurveyor?.full_name || state.currentUser?.display_name || '';
        document.getElementById('assigned-surveyor-zone').textContent = state.assignedSurveyor?.assigned_zone || '';
    } else {
        switchTab('dashboard');
    }
}

function hydrateSurveyorField() {
    const select = document.getElementById('surveyor-id');
    select.innerHTML = '<option value="">Selecciona</option>';

    if (state.currentUser?.role === 'surveyor' && state.assignedSurveyor) {
        select.innerHTML = `<option value="${state.assignedSurveyor.id}" selected>${escapeHtml(state.assignedSurveyor.full_name)}</option>`;
        return;
    }

    loadSurveyorsField();
}

async function loadSurveyorsField() {
    if (state.currentUser?.role !== 'admin') return;
    const payload = await requestJson('surveyors');
    state.surveyors = payload.surveyors;
    const select = document.getElementById('surveyor-id');
    select.innerHTML = '<option value="">Selecciona</option>';
    state.surveyors.filter((item) => item.account_status === 'approved').forEach((surveyor) => {
        const option = document.createElement('option');
        option.value = surveyor.id;
        option.dataset.name = surveyor.full_name;
        option.textContent = `${surveyor.full_name} - ${surveyor.assigned_zone}`;
        select.appendChild(option);
    });

    const surveyorFilter = document.getElementById('survey-filter-surveyor');
    if (surveyorFilter) {
        surveyorFilter.innerHTML = '<option value="">Todos</option>';
        state.surveyors.filter((item) => item.account_status === 'approved').forEach((surveyor) => {
            const option = document.createElement('option');
            option.value = surveyor.id;
            option.textContent = `${surveyor.full_name} - ${surveyor.assigned_zone}`;
            surveyorFilter.appendChild(option);
        });
    }
}

async function loadDashboard() {
    const sectorEl = document.getElementById('sector-filter');
    const sector = sectorEl ? sectorEl.value : 'general';
    const payload = await requestJson('dashboard', { params: { sector } });
    state.dashboard = payload.dashboard;
    renderDashboard(payload.dashboard);
}

function renderDashboard(dashboard) {
    const summary = dashboard.summary;
    const services = dashboard.services;
    const applications = dashboard.applications || {};
    const operations = dashboard.operations || {};
    const management = dashboard.management || {};
    const social = dashboard.social || {};
    const strategic = dashboard.strategic || {};

    document.getElementById('kpi-total').textContent = `${summary.total_surveys} / ${summary.target_surveys}`;
    document.getElementById('kpi-poverty').textContent = `${summary.structural_poverty}%`;
    document.getElementById('kpi-acceptance').textContent = `${summary.acceptance_rate}%`;
    document.getElementById('kpi-climate').textContent = summary.political_climate;
    document.getElementById('kpi-total-bar').style.width = `${summary.coverage_pct}%`;
    updateMetric('metric-water', 'metric-water-bar', services.water_risk);
    updateMetric('metric-sewer', 'metric-sewer-bar', services.sewer_gap);
    updateMetric('metric-income', 'metric-income-bar', services.income_pressure);
    document.getElementById('applications-pending').textContent = applications.pending || 0;
    document.getElementById('applications-review').textContent = applications.in_review || 0;
    document.getElementById('applications-approved').textContent = applications.approved || 0;
    document.getElementById('applications-rejected').textContent = applications.rejected || 0;

    setText('ops-synced', String(operations.synchronized_count ?? 0));
    setText('ops-offline-pending', String(operations.offline_pending_count ?? 0));
    setText('ops-productivity', String(operations.avg_productivity_per_surveyor ?? 0));
    setText(
        'ops-last-day',
        operations.surveys_per_day?.length
            ? `${operations.surveys_per_day[operations.surveys_per_day.length - 1].survey_day}: ${operations.surveys_per_day[operations.surveys_per_day.length - 1].total}`
            : '-'
    );
    setText('ops-offline-note', operations.offline_pending_note || 'Sin observaciones.');

    setText('mgmt-active', String(management.surveyors_active ?? 0));
    setText('mgmt-suspended', String(management.surveyors_suspended ?? 0));
    setText('mgmt-approval-hours', `${management.avg_approval_hours ?? 0} h`);
    setText('mgmt-approval-rate', `${management.approval_rate ?? 0}%`);

    setText('social-top-problem', social.top_primary_problem || 'Sin datos');
    setText('social-top-trust', social.authority_trust_top || 'Sin datos');
    setText('social-top-investment', social.investment_acceptance_top || 'Sin datos');
    setText('social-top-reopening', social.reopening_perception_top || 'Sin datos');

    setText('strategy-favorable', `${strategic.favorable_pct ?? 0}%`);
    setText('strategy-conditioned', `${strategic.conditioned_pct ?? 0}%`);
    setText('strategy-contrary', `${strategic.contrary_pct ?? 0}%`);
    setText('strategy-open-sector', strategic.top_open_sector || 'Sin datos');

    renderDimGauges(dashboard.dimensiones_sentimiento || []);
    renderDimGauges(dashboard.dimensiones_sentimiento || []);
    renderMap(dashboard.map_points || []);
    renderReports(dashboard);

    if (dashboard.operations && dashboard.operations.surveys_by_sector) {
        populateSectorFilters(dashboard.operations.surveys_by_sector);
    }
}

function renderDimGauges(dims) {
    const grid = document.getElementById('dash-gauge-grid');
    if (!grid) return;

    Object.values(state.dimGaugeCharts).forEach(ch => { try { ch.destroy(); } catch (e) {} });
    state.dimGaugeCharts = {};

    if (!dims || dims.length === 0) {
        grid.innerHTML = '<p style="color:var(--muted);font-size:0.82rem">Sin datos suficientes aun.</p>';
        return;
    }

    // Iconos SVG por dimension (mismo orden que lib.php)
    const icons = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 8v4l3 3"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    ];

    grid.innerHTML = dims.map((d, i) => {
        const color  = d.indice >= 15 ? '#0f9f6e' : d.indice <= -15 ? '#c43d45' : '#d97706';
        const bgColor = d.indice >= 15 ? 'rgba(15,159,110,0.12)' : d.indice <= -15 ? 'rgba(196,61,69,0.11)' : 'rgba(217,119,6,0.11)';
        const label  = d.indice >= 15 ? 'Favorable' : d.indice <= -15 ? 'Cr&iacute;tico' : 'Ambivalente';
        const sign   = d.indice > 0 ? '+' : '';
        const icon   = icons[i] || icons[0];
        return `
            <div class="dash-gauge-card-item">
                <div class="dg-top">
                    <span class="dg-icon" style="color:${color}">${icon}</span>
                    <span class="dg-titulo">${escapeHtml(d.titulo).toUpperCase()}</span>
                </div>
                <div class="dg-circle-wrap">
                    <canvas id="dg-${i}" width="160" height="160"></canvas>
                    <div class="dg-center-val" style="color:${color}">
                        <strong>${sign}${d.indice}</strong>
                        <span>pts</span>
                    </div>
                </div>
                <div class="dg-bottom">
                    <span class="dg-badge" style="background:${bgColor};color:${color}">${label}</span>
                    <span class="dg-n">${d.n > 0 ? d.n + ' resp.' : 'Sin datos'}</span>
                </div>
            </div>`;
    }).join('');

    dims.forEach((d, i) => {
        const canvas = document.getElementById('dg-' + i);
        if (!canvas || typeof Chart === 'undefined') return;

        // 270° speedometer: start bottom-left (135°), sweep 270°, gap 90° at bottom
        // index -100..+100 mapped to 0..270 degrees
        const sweep    = 270;
        const gap      = 90;
        const filled   = Math.max(2, Math.min(sweep - 2, (d.indice + 100) / 200 * sweep));
        const emptyArc = sweep - filled;
        const color    = d.indice >= 15 ? '#0f9f6e' : d.indice <= -15 ? '#c43d45' : '#d97706';

        state.dimGaugeCharts['g' + i] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    // filled arc | empty arc | transparent gap
                    data: [filled, emptyArc, gap],
                    backgroundColor: [color, '#ede0d0', 'transparent'],
                    borderWidth: 0,
                    hoverOffset: 0,
                }],
            },
            options: {
                rotation: 135,       // start at bottom-left
                circumference: 360,  // full circle so gap renders as transparent
                cutout: '72%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                animation: { duration: 800, easing: 'easeOutQuart' },
            },
        });
    });
}


function renderDimGauges(dims) {
    const grid = document.getElementById('dash-gauge-grid');
    if (!grid) return;

    Object.values(state.dimGaugeCharts).forEach(ch => { try { ch.destroy(); } catch (e) {} });
    state.dimGaugeCharts = {};

    if (!dims || dims.length === 0) {
        grid.innerHTML = '<p style="color:var(--muted);font-size:0.82rem">Sin datos suficientes aun.</p>';
        return;
    }

    const icons = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    ];

    grid.innerHTML = dims.map((d, i) => {
        const color    = d.indice >= 15 ? '#0f9f6e' : d.indice <= -15 ? '#c43d45' : '#d97706';
        const bgColor  = d.indice >= 15 ? 'rgba(15,159,110,0.10)' : d.indice <= -15 ? 'rgba(196,61,69,0.09)' : 'rgba(217,119,6,0.09)';
        const label    = d.indice >= 15 ? 'Favorable' : d.indice <= -15 ? 'Cr&iacute;tico' : 'Ambivalente';
        const sign     = d.indice > 0 ? '+' : '';
        const icon     = icons[i] || icons[0];
        return `
            <div class="dash-gauge-card-item">
                <div class="dg-top">
                    <span class="dg-icon" style="color:${color}">${icon}</span>
                    <span class="dg-titulo">${escapeHtml(d.titulo).toUpperCase()}</span>
                </div>
                <div class="dg-circle-wrap">
                    <canvas id="dg-${i}" width="160" height="160"></canvas>
                    <div class="dg-center-val" style="color:${color}">
                        <strong>${sign}${d.indice}</strong>
                        <span>pts</span>
                    </div>
                </div>
                <div class="dg-bottom">
                    <span class="dg-badge" style="background:${bgColor};color:${color}">${label}</span>
                    <span class="dg-n">${d.n > 0 ? d.n + ' resp.' : 'Sin datos'}</span>
                </div>
            </div>`;
    }).join('');

    dims.forEach((d, i) => {
        const canvas = document.getElementById('dg-' + i);
        if (!canvas || typeof Chart === 'undefined') return;
        const sweep  = 270;
        const filled = Math.max(2, Math.min(sweep - 2, (d.indice + 100) / 200 * sweep));
        const empty  = sweep - filled;
        const color  = d.indice >= 15 ? '#0f9f6e' : d.indice <= -15 ? '#c43d45' : '#d97706';
        state.dimGaugeCharts['g' + i] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [filled, empty, 90],
                    backgroundColor: [color, '#ede0d0', 'transparent'],
                    borderWidth: 0,
                    hoverOffset: 0,
                }],
            },
            options: {
                rotation: 135,
                circumference: 360,
                cutout: '72%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                animation: { duration: 800, easing: 'easeOutQuart' },
            },
        });
    });
}

function populateSectorFilters(sectors) {
    const filters = ['sector-filter', 'analisis-sector-filter'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;

        el.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'general';
        defaultOpt.textContent = id === 'analisis-sector-filter' ? 'Todo San Bartolom\u00e9' : 'Todo San Bartolome';
        el.appendChild(defaultOpt);

        sectors.forEach(item => {
            if (!item.label || item.label.toLowerCase() === 'general' || item.label.toLowerCase() === 'todo san bartolome' || item.label.toLowerCase() === 'todo san bartolomé') return;
            const opt = document.createElement('option');
            opt.value = item.label;
            opt.textContent = item.label;
            el.appendChild(opt);
        });

        if ([...el.options].some(opt => opt.value === currentVal)) {
            el.value = currentVal;
        } else {
            el.value = 'general';
        }
    });
}

function renderReports(dashboard) {
    const operations = dashboard.operations || {};
    const management = dashboard.management || {};
    const social = dashboard.social || {};
    const strategic = dashboard.strategic || {};

    renderSimpleList('report-daily-list', (operations.surveys_per_day || []).map((item) => ({
        label: item.survey_day || item.label || 'Sin fecha',
        value: `${item.total}`,
    })), 'Sin registros diarios.');

    renderSimpleList('report-sector-list', (operations.surveys_by_sector || []).map((item) => ({
        label: item.label,
        value: `${item.total}`,
    })), 'Sin datos por sector.');

    renderSimpleList('report-surveyor-list', (operations.surveys_by_surveyor || []).map((item) => ({
        label: item.label,
        value: `${item.total}`,
    })), 'Sin datos por encuestador.');

    renderSimpleList('report-management-list', [
        { label: 'Postulaciones pendientes', value: `${management.applications_pending ?? 0}` },
        { label: 'Postulaciones en revision', value: `${management.applications_in_review ?? 0}` },
        { label: 'Postulaciones aprobadas', value: `${management.applications_approved ?? 0}` },
        { label: 'Postulaciones rechazadas', value: `${management.applications_rejected ?? 0}` },
        { label: 'Encuestadores activos', value: `${management.surveyors_active ?? 0}` },
        { label: 'Encuestadores suspendidos', value: `${management.surveyors_suspended ?? 0}` },
        { label: 'Tiempo promedio de aprobacion', value: `${management.avg_approval_hours ?? 0} h` },
        { label: 'Tasa de aprobacion', value: `${management.approval_rate ?? 0}%` },
    ], 'Sin datos de gestion.');

    renderSimpleList('report-problem-list', (social.primary_problem_breakdown || []).map((item) => ({
        label: item.label,
        value: `${item.total}`,
    })), 'Sin problematicas registradas.');

    renderSimpleList('report-benefit-list', (social.top_benefits || []).map((item) => ({
        label: item.label,
        value: `${item.total}`,
    })), 'Sin beneficios registrados.');

    renderSimpleList('report-risk-list', (social.top_risks || []).map((item) => ({
        label: item.label,
        value: `${item.total}`,
    })), 'Sin riesgos registrados.');

    renderSimpleList('report-strategic-list', [
        { label: 'Porcentaje favorable a reapertura', value: `${strategic.favorable_pct ?? 0}%` },
        { label: 'Porcentaje condicionado', value: `${strategic.conditioned_pct ?? 0}%` },
        { label: 'Porcentaje contrario', value: `${strategic.contrary_pct ?? 0}%` },
        { label: 'Sector con mayor oposicion', value: strategic.top_oppose_sector || 'Sin datos' },
        { label: 'Sector con mayor apertura', value: strategic.top_open_sector || 'Sin datos' },
        { label: 'Apertura con presion por ingresos', value: `${strategic.income_openness_pct ?? 0}%` },
        { label: 'Apertura con deficit de servicios', value: `${strategic.services_openness_pct ?? 0}%` },
        { label: 'Zona con mayor conflictividad', value: strategic.top_conflict_sector || 'Sin datos' },
        { label: 'Zona con menor confianza institucional', value: strategic.lowest_trust_sector || 'Sin datos' },
    ], 'Sin lectura estrategica todavia.');
}

function renderSimpleList(containerId, items, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div><span>${emptyMessage}</span><strong>-</strong></div>`;
        return;
    }
    container.innerHTML = items.map((item) => `
        <div>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
        </div>
    `).join('');
}

function updateMetric(textId, barId, value) {
    document.getElementById(textId).textContent = `${value}%`;
    document.getElementById(barId).style.width = `${value}%`;
}

function renderMap(points) {
    const map = document.getElementById('map-canvas');
    if (!points.length) {
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
            mapLayerGroup = null;
        }
        map.innerHTML = '';
        map.innerHTML = '<div class="map-empty">Aun no hay coordenadas registradas. Las nuevas encuestas con GPS apareceran aqui.</div>';
        return;
    }

    if (!mapInstance) {
        map.innerHTML = '';
        mapInstance = L.map('map-canvas');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapInstance);
        mapLayerGroup = L.layerGroup().addTo(mapInstance);
    }

    mapLayerGroup.clearLayers();
    const bounds = [];

    points.forEach((point) => {
        const lat = Number(point.latitude);
        const lng = Number(point.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        bounds.push([lat, lng]);

        const popup = `
            <div class="map-popup">
                <strong>${escapeHtml(point.community || 'Sin comunidad')}</strong><br>
                <span>Sector: ${escapeHtml(point.sector || 'Sin sector')}</span><br>
                <span>Encuestador: ${escapeHtml(point.surveyor_name || 'No definido')}</span><br>
                <span>Fecha: ${escapeHtml(point.survey_date || 'Sin fecha')}</span><br>
                <span>Estado: ${escapeHtml(point.survey_status || 'sincronizada')}</span>
            </div>
        `;

        L.marker([lat, lng]).addTo(mapLayerGroup).bindPopup(popup);
    });

    if (bounds.length === 1) {
        mapInstance.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
        mapInstance.fitBounds(bounds, { padding: [30, 30] });
    }
}

function initializeSurveyLocationMap() {
    const container = document.getElementById('survey-location-map');
    if (!container || typeof L === 'undefined' || formMapInstance) return;

    formMapInstance = L.map('survey-location-map', {
        zoomControl: true,
    }).setView([-2.9596, -78.7817], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(formMapInstance);

    formMapInstance.on('click', (event) => {
        setSurveyLocation(event.latlng.lat, event.latlng.lng, true);
        document.getElementById('gps-status').textContent = 'Punto ajustado manualmente en el mapa.';
        document.getElementById('map-status').textContent = 'El punto fue actualizado manualmente. Verifica que coincida con la comunidad visitada.';
        saveSurveyDraft();
    });
}

function setSurveyLocation(latitude, longitude, shouldCenter = false) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !formMapInstance) return;

    document.getElementById('latitude').value = lat.toFixed(7);
    document.getElementById('longitude').value = lng.toFixed(7);

    if (!formMapMarker) {
        formMapMarker = L.marker([lat, lng], { draggable: true }).addTo(formMapInstance);
        formMapMarker.on('dragend', () => {
            const point = formMapMarker.getLatLng();
            document.getElementById('latitude').value = point.lat.toFixed(7);
            document.getElementById('longitude').value = point.lng.toFixed(7);
            document.getElementById('gps-status').textContent = 'Punto corregido arrastrando el marcador.';
            document.getElementById('map-status').textContent = 'La ubicacion se ajusto manualmente desde el marcador.';
            saveSurveyDraft();
        });
    } else {
        formMapMarker.setLatLng([lat, lng]);
    }

    if (shouldCenter) {
        formMapInstance.setView([lat, lng], 16);
    }
}

function syncFormMapFromInputs() {
    const latitude = document.getElementById('latitude').value;
    const longitude = document.getElementById('longitude').value;
    if (latitude !== '' && longitude !== '') {
        setSurveyLocation(latitude, longitude, false);
    }
}

async function loadApplications() {
    const payload = await requestJson('applications');
    state.applications = payload.applications;
    updateApplicationCounts(payload.applications);
    renderApplications();
}

function updateApplicationCounts(applications) {
    const counts = {
        all: applications.length,
        pending: 0,
        in_review: 0,
        approved: 0,
        rejected: 0,
    };

    applications.forEach((item) => {
        const key = item.review_status || 'pending';
        if (Object.prototype.hasOwnProperty.call(counts, key)) {
            counts[key] += 1;
        }
    });

    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-pending').textContent = counts.pending;
    document.getElementById('count-in_review').textContent = counts.in_review;
    document.getElementById('count-approved').textContent = counts.approved;
    document.getElementById('count-rejected').textContent = counts.rejected;
}

function renderApplications() {
    const list = document.getElementById('applications-list');
    const filtered = state.applicationFilter === 'all'
        ? state.applications
        : state.applications.filter((item) => item.review_status === state.applicationFilter);

    if (!filtered.length) {
        list.innerHTML = '<div class="card empty-state">No hay postulaciones registradas todavia.</div>';
        return;
    }

    const statusLabel = { pending: 'Pendiente', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', suspended: 'Suspendido' };

    list.innerHTML = filtered.map((item) => {
        const documents = (item.documents || []).map((doc) => `
            <a class="doc-link" href="${apiUrl('document', { id: doc.id })}" target="_blank" rel="noopener">${escapeHtml(doc.doc_type)} &mdash; ${escapeHtml(doc.original_name)}</a>
        `).join('');

        const parts = [item.document_number, item.phone, item.email].filter(Boolean).map(escapeHtml);

        return `
            <article class="card application-card">
                <div class="application-head">
                    <div>
                        <h3 style="margin-bottom:6px;">${escapeHtml(item.full_name)}</h3>
                        <p style="color:var(--muted);font-size:13px;margin:0;">${parts.join(' &nbsp;|&nbsp; ')}</p>
                    </div>
                    <span class="status-badge status-${escapeHtml(item.review_status)}">${statusLabel[item.review_status] || escapeHtml(item.review_status)}</span>
                </div>
                <div class="application-grid" style="margin-top:12px;">
                    <div><strong>Parroquia:</strong> ${escapeHtml(item.parish)}</div>
                    <div><strong>Canton:</strong> ${escapeHtml(item.canton)}</div>
                    <div><strong>Zona solicitada:</strong> ${escapeHtml(item.requested_zone)}</div>
                    <div><strong>Usuario:</strong> ${escapeHtml(item.username || '')}</div>
                </div>
                <p class="long-text" style="margin-top:8px;"><strong>Direccion:</strong> ${escapeHtml(item.address)}</p>
                <p class="long-text" style="margin-top:4px;"><strong>Experiencia:</strong> ${escapeHtml(item.prior_experience)}</p>
                <div class="doc-list" style="margin-top:10px;">${documents || '<span class="helper-text">Sin documentos cargados.</span>'}</div>
                ${item.review_status === 'approved' ? `
                    <div class="review-final-block review-final-approved" style="margin-top:14px; padding:14px 16px; background:rgba(46,125,50,0.07); border:1.5px solid rgba(46,125,50,0.3); border-radius:8px;">
                        <div style="margin-bottom:8px;">
                            <strong style="color:#2e7d32; font-size:15px;">Solicitud Aprobada</strong>
                        </div>
                        <p style="margin:0 0 4px 0; font-size:14px;"><strong>Zona asignada:</strong> ${escapeHtml(item.requested_zone?.trim() || 'Por asignar')}</p>
                        ${item.review_notes ? `<p style="margin:0; font-size:14px;"><strong>Observaciones:</strong> ${escapeHtml(item.review_notes)}</p>` : ''}
                    </div>
                ` : item.review_status === 'rejected' ? `
                    <div class="review-final-block review-final-rejected" style="margin-top:14px; padding:14px 16px; background:rgba(198,40,40,0.06); border:1.5px solid rgba(198,40,40,0.25); border-radius:8px;">
                        <div style="margin-bottom:8px;">
                            <strong style="color:#c62828; font-size:15px;">Solicitud Rechazada</strong>
                        </div>
                        ${item.review_notes ? `<p style="margin:0; font-size:14px;"><strong>Observaciones:</strong> ${escapeHtml(item.review_notes)}</p>` : '<p style="margin:0; font-size:14px; color:var(--muted);">Sin observaciones.</p>'}
                    </div>
                ` : `
                    <div class="review-grid" style="margin-top:14px;">
                        <div>
                            <label class="field-label">Zona final asignada</label>
                            <input id="zone-${item.id}" type="text" placeholder="Ej. Sallac, Centro Parroquial..." value="${escapeHtml(item.requested_zone || '')}">
                        </div>
                        <div>
                            <label class="field-label">Observaciones de revision</label>
                            <textarea id="notes-${item.id}" rows="3" placeholder="Escribe observaciones...">${escapeHtml(item.review_notes || '')}</textarea>
                        </div>
                    </div>
                    <div class="inline-actions" style="margin-top:14px;">
                        <button id="btn-review-${item.id}" class="secondary-button" type="button" onclick="reviewApplication(${item.id}, 'in_review', this.closest('.inline-actions'))">En revision</button>
                        <button id="btn-approve-${item.id}" class="success-button" type="button" onclick="reviewApplication(${item.id}, 'approved', this.closest('.inline-actions'))">Aprobar</button>
                        <button id="btn-reject-${item.id}" class="danger-button" type="button" onclick="reviewApplication(${item.id}, 'rejected', this.closest('.inline-actions'))">Rechazar</button>
                    </div>
                `}
                <div id="review-feedback-${item.id}" class="review-feedback hidden"></div>
            </article>
        `;
    }).join('');
}

async function reviewApplication(applicationId, decision, actionsContainer) {
    const notes = document.getElementById(`notes-${applicationId}`)?.value || '';
    const assignedZone = document.getElementById(`zone-${applicationId}`)?.value || '';
    const feedbackEl = document.getElementById(`review-feedback-${applicationId}`);

    // Deshabilitar botones para evitar doble clic
    if (actionsContainer) {
        actionsContainer.querySelectorAll('button').forEach((btn) => {
            btn.disabled = true;
            btn.style.opacity = '0.6';
        });
    }
    if (feedbackEl) {
        feedbackEl.textContent = 'Procesando...';
        feedbackEl.className = 'review-feedback review-feedback-loading';
    }

    try {
        await requestJson('review-application', {
            method: 'POST',
            body: {
                application_id: applicationId,
                decision,
                notes,
                assigned_zone: assignedZone,
            },
        });

        if (feedbackEl) {
            const decisionLabel = { approved: 'Aprobado', rejected: 'Rechazado', in_review: 'En revisión' }[decision] || decision;
            feedbackEl.textContent = `\u2713 ${decisionLabel} correctamente.`;
            feedbackEl.className = 'review-feedback review-feedback-success';
        }

        // Recargar datos tras 600 ms para que el usuario vea el mensaje
        setTimeout(async () => {
            try {
                await Promise.all([loadApplications(), loadSurveyors(), loadDashboard()]);
            } catch (reloadError) {
                console.warn('Error al recargar datos:', reloadError.message);
            }
        }, 600);
    } catch (error) {
        if (feedbackEl) {
            feedbackEl.textContent = `Error: ${error.message}`;
            feedbackEl.className = 'review-feedback review-feedback-error';
        } else {
            alert(`Error al procesar la solicitud: ${error.message}`);
        }
        // Re-habilitar botones si hubo error
        if (actionsContainer) {
            actionsContainer.querySelectorAll('button').forEach((btn) => {
                btn.disabled = false;
                btn.style.opacity = '';
            });
        }
    }
}

async function loadSurveyors() {
    if (state.currentUser?.role !== 'admin') return;
    const payload = await requestJson('surveyors');
    state.surveyors = payload.surveyors;
    const list = document.getElementById('surveyors-list');

    if (!payload.surveyors.length) {
        list.innerHTML = '<div class="card empty-state">No hay encuestadores aprobados todavia.</div>';
        return;
    }

    list.innerHTML = payload.surveyors.map((item) => `
        <article class="card application-card">
            <div class="application-head">
                <div>
                    <h3>${escapeHtml(item.full_name)}</h3>
                    <p style="color:var(--muted);font-size:13px;margin:0;">${[item.document_number, item.email, item.phone].filter(Boolean).map(escapeHtml).join(' &nbsp;|&nbsp; ')}</p>
                </div>
                <span class="status-badge status-${escapeHtml(item.account_status || 'approved')}">${{ approved: 'Aprobado', suspended: 'Suspendido', pending: 'Pendiente', in_review: 'En revisión', rejected: 'Rechazado' }[item.account_status] || escapeHtml(item.account_status || 'approved')}</span>
            </div>
            <div class="application-grid">
                <div><strong>Zona:</strong> ${escapeHtml(item.assigned_zone || '')}</div>
                <div><strong>Usuario:</strong> ${escapeHtml(item.username || '')}</div>
                <div><strong>Estado de campo:</strong> ${escapeHtml(item.status || '')}</div>
                <div><strong>Parroquia:</strong> ${escapeHtml(item.parish || '')}</div>
            </div>
            <div class="review-grid compact-grid">
                <input id="zone-update-${item.user_id}" type="text" placeholder="Nueva zona asignada" value="${escapeHtml(item.assigned_zone || '')}">
                <button class="secondary-button" type="button" onclick="updateSurveyorProfile(${item.user_id})">Guardar zona</button>
            </div>
            <div class="inline-actions">
                <button class="secondary-button" type="button" onclick="changeSurveyorStatus(${item.user_id}, 'approved')">Activar</button>
                <button class="warning-button" type="button" onclick="changeSurveyorStatus(${item.user_id}, 'suspended')">Suspender</button>
            </div>
            <div class="review-grid compact-grid">
                <input id="reset-pass-${item.user_id}" type="password" placeholder="Nueva clave (min. 8)">
                <button class="primary-button" type="button" onclick="resetPassword(${item.user_id})">Resetear clave</button>
            </div>
        </article>
    `).join('');
}

async function updateSurveyorProfile(userId) {
    const assignedZone = document.getElementById(`zone-update-${userId}`).value;
    await requestJson('update-surveyor-profile', {
        method: 'POST',
        body: { user_id: userId, assigned_zone: assignedZone },
    });
    await loadSurveyors();
    await loadSurveyorsField();
}

function getSurveyFilters() {
    return {
        sector: document.getElementById('survey-filter-sector').value,
        surveyor_id: document.getElementById('survey-filter-surveyor').value,
        date_from: document.getElementById('survey-filter-date-from').value,
        date_to: document.getElementById('survey-filter-date-to').value,
        status: document.getElementById('survey-filter-status').value,
    };
}

async function loadSurveys() {
    if (state.currentUser?.role !== 'admin') return;
    if (!state.surveyors.length) {
        await loadSurveyorsField();
    }
    const payload = await requestJson('surveys', { params: getSurveyFilters() });
    state.surveys = payload.surveys;
    renderSurveys();
}

function renderSurveys() {
    const list = document.getElementById('surveys-list');
    if (!state.surveys.length) {
        list.innerHTML = '<div class="card empty-state">No hay encuestas registradas con esos filtros.</div>';
        return;
    }

    list.innerHTML = state.surveys.map((item) => `
        <article class="card application-card">
                <div class="application-head">
                    <div>
                        <h3>${escapeHtml(item.community)} - ${escapeHtml(item.sector)}</h3>
                        <p>${escapeHtml(item.survey_date)} | ${escapeHtml(item.surveyor_name || 'Sin nombre')}</p>
                    </div>
                    <span class="status-badge status-${item.survey_status === 'revisada' ? 'approved' : (item.survey_status === 'observada' ? 'rejected' : 'in_review')}">${escapeHtml(item.survey_status)}</span>
                </div>
                <div class="application-grid">
                    <div><strong>Genero:</strong> ${escapeHtml(item.respondent_gender)}</div>
                    <div><strong>Edad:</strong> ${escapeHtml(item.age_range)}</div>
                    <div><strong>Ocupacion:</strong> ${escapeHtml(item.occupation)}</div>
                    <div><strong>Problematica:</strong> ${escapeHtml(item.primary_problem)}</div>
                    <div><strong>Clima politico:</strong> ${escapeHtml(item.political_climate)}</div>
                    <div><strong>Percepcion reapertura:</strong> ${escapeHtml(item.mine_reopening_perception)}</div>
                    <div><strong>GPS:</strong> ${escapeHtml(item.record_status)}</div>
                    <div><strong>Estado:</strong> ${escapeHtml(item.survey_status)}</div>
                </div>
                <div class="inline-actions">
                    <button class="secondary-button" type="button" onclick="updateSurveyStatus(${item.id}, 'sincronizada')">Marcar sincronizada</button>
                    <button class="success-button" type="button" onclick="updateSurveyStatus(${item.id}, 'revisada')">Marcar revisada</button>
                    <button class="danger-button" type="button" onclick="updateSurveyStatus(${item.id}, 'observada')">Marcar observada</button>
                </div>
            </article>
        `).join('');
}

function exportSurveys() {
    const url = apiUrl('export', { type: 'surveys', ...getSurveyFilters() });
    window.open(url, '_blank');
}

async function updateSurveyStatus(surveyId, surveyStatus) {
    await requestJson('update-survey-status', {
        method: 'POST',
        body: { survey_id: surveyId, survey_status: surveyStatus },
    });
    await Promise.all([loadSurveys(), loadDashboard(), loadAuditLogs().catch(() => { })]);
}

function getAuditFilters() {
    return {
        action_type: document.getElementById('audit-filter-action').value,
        date_from: document.getElementById('audit-filter-date-from').value,
        date_to: document.getElementById('audit-filter-date-to').value,
    };
}

async function loadAuditLogs() {
    if (state.currentUser?.role !== 'admin') return;
    const payload = await requestJson('audit-logs', { params: getAuditFilters() });
    state.auditLogs = payload.logs;
    renderAuditLogs();
}

function renderAuditLogs() {
    const list = document.getElementById('audit-list');
    if (!state.auditLogs.length) {
        list.innerHTML = '<div class="card empty-state">No hay movimientos registrados con esos filtros.</div>';
        return;
    }

    list.innerHTML = state.auditLogs.map((item) => `
        <article class="card application-card">
            <div class="application-head">
                <div>
                    <h3>${escapeHtml(item.action_type)}</h3>
                    <p>${escapeHtml(item.created_at)} | ${escapeHtml(item.actor_name)}</p>
                </div>
                <span class="status-badge status-in_review">${escapeHtml(item.entity_type)}</span>
            </div>
            <div class="application-grid">
                <div><strong>Entidad ID:</strong> ${escapeHtml(item.entity_id ?? '')}</div>
                <div><strong>Detalle:</strong> ${escapeHtml(JSON.stringify(item.details || {}))}</div>
            </div>
        </article>
    `).join('');
}

function exportAuditLogs() {
    const url = apiUrl('export', { type: 'audit', ...getAuditFilters() });
    window.open(url, '_blank');
}

function exportApplications() {
    const url = apiUrl('export', { type: 'applications' });
    window.open(url, '_blank');
}

async function changeSurveyorStatus(userId, status) {
    await requestJson('update-surveyor-status', {
        method: 'POST',
        body: { user_id: userId, status },
    });
    await loadSurveyors();
}

async function resetPassword(userId) {
    const newPassword = document.getElementById(`reset-pass-${userId}`).value;
    await requestJson('reset-password', {
        method: 'POST',
        body: { user_id: userId, new_password: newPassword },
    });
    document.getElementById(`reset-pass-${userId}`).value = '';
}

function getPendingSurveys() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (error) {
        return [];
    }
}

function setPendingSurveys(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function renderOfflineQueue() {
    const items = getPendingSurveys();
    document.getElementById('offline-count').textContent = `${items.length} formularios`;
    document.getElementById('offline-summary-text').textContent = `${items.length} encuestas pendientes`;
    const list = document.getElementById('offline-list');
    const chip = document.getElementById('offline-chip');
    const summaryCard = document.getElementById('offline-summary-card');
    const shouldShowCompact = state.currentUser?.role === 'surveyor' && items.length > 0;

    chip.textContent = `${items.length} pendientes`;
    chip.classList.toggle('hidden', !shouldShowCompact);
    summaryCard.classList.toggle('hidden', !shouldShowCompact);

    if (!items.length) {
        list.innerHTML = '<p class="empty-state">No hay encuestas pendientes.</p>';
        document.getElementById('sync-status').textContent = 'Sin pendientes por ahora.';
        renderSurveyorNotice();
        return;
    }

    list.innerHTML = items.map((item, index) => `
        <article class="offline-item">
            <strong>Ficha ${index + 1} - ${escapeHtml(item.community || 'Sin comunidad')}</strong>
            <div>Sector: ${escapeHtml(item.sector || 'Sin sector')}</div>
            <div>Encuestador: ${escapeHtml(item.surveyor_name || 'No definido')}</div>
            <div>Fecha: ${escapeHtml(item.survey_date || 'Sin fecha')}</div>
        </article>
    `).join('');
    renderSurveyorNotice();
}

function isAppOnline() {
    return navigator.onLine;
}

function refreshNetworkChip() {
    const chip = document.getElementById('network-chip');
    const statusNode = document.getElementById('network-card-status');
    const online = isAppOnline();
    chip.textContent = online ? 'En linea' : 'Sin conexion';
    chip.className = `chip ${online ? 'chip-online' : 'chip-offline'}`;
    chip.classList.toggle('hidden', state.currentUser?.role === 'admin');
    if (statusNode) {
        statusNode.textContent = online ? 'Con conexion a internet.' : 'Sin conexion. Las encuestas nuevas se guardaran localmente.';
    }
    renderSurveyorProfile();
    renderSurveyorNotice();
}

function setDefaultSurveyDate() {
    const input = document.getElementById('survey-date');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
}

function collectFormData() {
    const form = document.getElementById('survey-form');
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.client_uuid = state.editingSurvey?.client_uuid || generateClientUuid();
    payload.surveyor_name = getSelectedSurveyorName();
    payload.women_roles = formData.getAll('women_roles');
    payload.mine_benefits = formData.getAll('mine_benefits');
    payload.mine_risks = formData.getAll('mine_risks');
    payload.survey_date = normalizeDatetimeLocal(payload.survey_date);
    return payload;
}

function getSelectedSurveyorName() {
    if (state.currentUser?.role === 'surveyor') {
        return state.assignedSurveyor?.full_name || state.currentUser?.display_name || '';
    }
    const select = document.getElementById('surveyor-id');
    const option = select.options[select.selectedIndex];
    return option?.dataset?.name || '';
}

async function loadMySurveys() {
    if (state.currentUser?.role !== 'surveyor') return;
    const payload = await requestJson('my-surveys');
    state.mySurveys = payload.surveys;
    renderMySurveys();
}

function renderMySurveys() {
    const list = document.getElementById('my-surveys-list');
    renderMySurveySummary();
    if (!state.mySurveys.length) {
        list.innerHTML = '<div class="card empty-state">Aun no has registrado encuestas.</div>';
        return;
    }

    list.innerHTML = state.mySurveys.map((item) => `
        <article class="card application-card">
            <div class="application-head">
                <div>
                    <h3>${escapeHtml(item.community)} - ${escapeHtml(item.sector)}</h3>
                    <p>${escapeHtml(item.survey_date)} | Estado: ${escapeHtml(item.survey_status)}</p>
                </div>
                <span class="status-badge status-${item.survey_status === 'revisada' ? 'approved' : (item.survey_status === 'observada' ? 'rejected' : 'in_review')}">${escapeHtml(item.survey_status)}</span>
            </div>
            <div class="application-grid">
                <div><strong>Genero:</strong> ${escapeHtml(item.respondent_gender)}</div>
                <div><strong>Edad:</strong> ${escapeHtml(item.age_range)}</div>
                <div><strong>Ocupacion:</strong> ${escapeHtml(item.occupation)}</div>
                <div><strong>Problematica:</strong> ${escapeHtml(item.primary_problem)}</div>
            </div>
            <div class="inline-actions">
                ${renderOwnSurveyAction(item)}
            </div>
        </article>
    `).join('');
    renderSurveyorProfile();
}

function editOwnSurvey(clientUuid) {
    const survey = state.mySurveys.find((item) => item.client_uuid === clientUuid);
    if (!survey) return;
    if (survey.survey_status === 'revisada') {
        setSurveyorNotice('Encuesta revisada', 'Esta encuesta ya fue revisada por administracion y no puede editarse desde campo.', 'warning');
        switchTab('my-surveys');
        return;
    }

    state.editingSurvey = survey;
    fillSurveyForm(survey);
    document.getElementById('save-status').textContent = survey.survey_status === 'observada'
        ? 'Editando una encuesta observada. Al guardarla volvera a quedar sincronizada para revision.'
        : 'Editando una encuesta ya registrada.';
    document.getElementById('cancel-edit-button').classList.remove('hidden');
    setSurveyorNotice(
        survey.survey_status === 'observada' ? 'Correccion requerida' : 'Edicion habilitada',
        survey.survey_status === 'observada'
            ? 'Corrige la encuesta observada y vuelve a guardarla para enviarla otra vez a revision.'
            : 'Puedes ajustar esta encuesta mientras siga sin revision administrativa.',
        survey.survey_status === 'observada' ? 'warning' : 'success'
    );
    switchTab('survey');
}

function fillSurveyForm(survey) {
    document.getElementById('sector').value = survey.sector || '';
    document.getElementById('community').value = survey.community || '';
    document.getElementById('survey-date').value = formatDatetimeLocal(survey.survey_date);
    document.getElementById('respondent-gender').value = survey.respondent_gender || '';
    document.getElementById('age-range').value = survey.age_range || '';
    document.getElementById('education-level').value = survey.education_level || '';
    document.getElementById('occupation').value = survey.occupation || '';
    document.getElementById('primary-problem').value = survey.primary_problem || '';
    document.getElementById('youth-path').value = survey.youth_path || '';
    document.getElementById('water-source').value = survey.water_source || '';
    document.getElementById('has-sewer').value = survey.has_sewer || '';
    document.getElementById('has-internet').value = survey.has_internet || '';
    document.getElementById('road-status').value = survey.road_status || '';
    document.getElementById('household-income').value = survey.household_income || '';
    document.getElementById('authority-trust').value = survey.authority_trust || '';
    document.getElementById('political-climate').value = survey.political_climate || '';
    document.getElementById('social-priority').value = survey.social_priority || '';
    document.getElementById('investment-acceptance').value = survey.investment_acceptance || '';
    document.getElementById('mine-reopening-perception').value = survey.mine_reopening_perception || '';
    document.getElementById('comments').value = survey.comments || '';
    document.getElementById('latitude').value = survey.latitude || '';
    document.getElementById('longitude').value = survey.longitude || '';
    document.getElementById('gps-status').textContent = survey.latitude && survey.longitude
        ? 'La encuesta ya tiene una ubicacion cargada.'
        : 'Aun no se ha capturado una coordenada.';
    document.getElementById('map-status').textContent = survey.latitude && survey.longitude
        ? 'Puedes revisar o corregir visualmente el punto de esta encuesta.'
        : 'Usa el boton de GPS para ubicarte. Tambien puedes tocar el mapa para ajustar el punto manualmente.';
    if (survey.latitude && survey.longitude) {
        setSurveyLocation(survey.latitude, survey.longitude, true);
    }

    setCheckboxGroup('women_roles', survey.women_roles || []);
    setCheckboxGroup('mine_benefits', survey.mine_benefits || []);
    setCheckboxGroup('mine_risks', survey.mine_risks || []);
}

function setCheckboxGroup(name, values) {
    const normalized = Array.isArray(values) ? values : [];
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
        input.checked = normalized.includes(input.value);
    });
}

function formatDatetimeLocal(value) {
    if (!value) return '';
    return String(value).replace(' ', 'T').slice(0, 16);
}

function cancelSurveyEdit() {
    state.editingSurvey = null;
    document.getElementById('cancel-edit-button').classList.add('hidden');
    document.getElementById('save-status').textContent = 'Listo para guardar.';
    resetForm();
    restoreDraftPreview();
    renderSurveyorNotice();
}

function generateClientUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID().replaceAll('-', '');
    }
    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function normalizeDatetimeLocal(value) {
    if (!value) return '';
    return `${value.replace('T', ' ')}:00`;
}

async function submitSurvey(event) {
    event.preventDefault();
    const form = document.getElementById('survey-form');
    const status = document.getElementById('save-status');

    if (!form.reportValidity()) {
        status.textContent = 'Revisa los campos obligatorios antes de guardar.';
        setSurveyorNotice('Formulario incompleto', 'Hay campos obligatorios pendientes antes de poder guardar la encuesta.', 'warning');
        return;
    }

    const payload = collectFormData();
    if (state.editingSurvey?.client_uuid) {
        payload.client_uuid = state.editingSurvey.client_uuid;
        payload.survey_status = state.editingSurvey.survey_status === 'observada'
            ? 'sincronizada'
            : (state.editingSurvey.survey_status || 'sincronizada');
    }

    if (!isAppOnline()) {
        queueSurvey(payload);
        return;
    }

    try {
        status.textContent = 'Guardando en servidor...';
        const response = await requestJson('save-survey', {
            method: 'POST',
            body: payload,
        });
        status.textContent = response.message;
        clearSurveyDraft();
        if (response.dashboard) renderDashboard(response.dashboard);
        if (state.currentUser?.role === 'surveyor') {
            await loadMySurveys();
        }
        state.editingSurvey = null;
        document.getElementById('cancel-edit-button').classList.add('hidden');
        setSurveyorNotice('Encuesta enviada', 'La encuesta se guardo correctamente en el servidor y ya forma parte del historial del encuestador.', 'success');
        resetForm();
    } catch (error) {
        status.textContent = 'No se pudo enviar al servidor. Se guardara localmente para sincronizar despues.';
        setSurveyorNotice('Guardado local', 'No hubo conexion estable con el servidor. La encuesta se guardara en este dispositivo hasta poder sincronizarla.', 'warning');
        queueSurvey(payload);
    }
}

function queueSurvey(payload) {
    const items = getPendingSurveys().filter((item) => item.client_uuid !== payload.client_uuid);
    items.unshift(payload);
    setPendingSurveys(items);
    clearSurveyDraft();
    renderOfflineQueue();
    document.getElementById('save-status').textContent = 'Encuesta guardada localmente para sincronizar despues.';
    state.editingSurvey = null;
    document.getElementById('cancel-edit-button').classList.add('hidden');
    resetForm();
}

async function syncPendingSurveys(showMessages = true) {
    const items = getPendingSurveys();
    if (!items.length) {
        if (showMessages) document.getElementById('sync-status').textContent = 'No hay pendientes que sincronizar.';
        return;
    }
    if (!isAppOnline()) {
        document.getElementById('sync-status').textContent = 'Sin internet disponible para sincronizar.';
        return;
    }

    try {
        document.getElementById('sync-status').textContent = 'Sincronizando registros pendientes...';
        const response = await requestJson('sync', {
            method: 'POST',
            body: { surveys: items },
        });
        setPendingSurveys([]);
        renderOfflineQueue();
        if (response.dashboard) renderDashboard(response.dashboard);
        document.getElementById('sync-status').textContent = `${response.saved_count} encuestas sincronizadas correctamente.`;
        if (state.currentUser?.role === 'surveyor') {
            await loadMySurveys();
            setSurveyorNotice('Sincronizacion completada', `${response.saved_count} encuestas pendientes ya quedaron enviadas correctamente al servidor.`, 'success');
            switchTab('survey');
        }
    } catch (error) {
        document.getElementById('sync-status').textContent = error.message;
        setSurveyorNotice('Sincronizacion pendiente', error.message, 'warning');
    }
}

function resetForm() {
    document.getElementById('survey-form').reset();
    setDefaultSurveyDate();
    document.getElementById('gps-status').textContent = 'Aun no se ha capturado una coordenada.';
    document.getElementById('map-status').textContent = 'Usa el boton de GPS para ubicarte. Tambien puedes tocar el mapa para ajustar el punto manualmente.';
    if (formMapMarker && formMapInstance) {
        formMapInstance.removeLayer(formMapMarker);
        formMapMarker = null;
        formMapInstance.setView([-2.9596, -78.7817], 12);
    }
    updateDraftButtons();
}

function captureGps() {
    if (!('geolocation' in navigator)) {
        document.getElementById('gps-status').textContent = 'Este navegador no soporta geolocalizacion.';
        document.getElementById('map-status').textContent = 'Este equipo no permite leer GPS desde el navegador.';
        return;
    }
    document.getElementById('gps-status').textContent = 'Buscando coordenadas...';
    document.getElementById('map-status').textContent = isAppOnline()
        ? 'Intentando leer la ubicacion del dispositivo.'
        : 'Intentando leer GPS sin internet. En algunos equipos puede tardar mas.';
    navigator.geolocation.getCurrentPosition(
        (position) => {
            setSurveyLocation(position.coords.latitude, position.coords.longitude, true);
            document.getElementById('gps-status').textContent = 'GPS capturado correctamente.';
            document.getElementById('map-status').textContent = 'Ubicacion capturada. Verifica en el mapa si el punto coincide con el lugar visitado.';
            saveSurveyDraft();
        },
        () => {
            document.getElementById('gps-status').textContent = 'No se pudo leer el GPS del dispositivo.';
            document.getElementById('map-status').textContent = 'Si el equipo no logra leer GPS, puedes ingresar coordenadas manualmente o ajustar el punto en el mapa.';
        },
        { enableHighAccuracy: true, timeout: 12000 }
    );
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.remove('hidden');
}

function renderOwnSurveyAction(item) {
    if (item.survey_status === 'revisada') {
        return '<span class="helper-text">Ya fue revisada y queda bloqueada para edicion.</span>';
    }
    if (item.survey_status === 'observada') {
        return `<button class="warning-button" type="button" onclick="editOwnSurvey('${escapeJs(item.client_uuid)}')">Corregir observada</button>`;
    }
    return `<button class="secondary-button" type="button" onclick="editOwnSurvey('${escapeJs(item.client_uuid)}')">Editar</button>`;
}

function renderMySurveySummary() {
    const counts = getMySurveyCounts();
    document.getElementById('my-surveys-summary').innerHTML = `
        <div class="mini-kpi"><span>Total propias</span><strong>${counts.total}</strong></div>
        <div class="mini-kpi"><span>Sincronizadas</span><strong>${counts.sincronizada}</strong></div>
        <div class="mini-kpi"><span>Revisadas</span><strong>${counts.revisada}</strong></div>
        <div class="mini-kpi"><span>Observadas</span><strong>${counts.observada}</strong></div>
    `;
}

function getMySurveyCounts() {
    return state.mySurveys.reduce((acc, item) => {
        acc.total += 1;
        const key = item.survey_status || 'sincronizada';
        if (Object.prototype.hasOwnProperty.call(acc, key)) {
            acc[key] += 1;
        }
        return acc;
    }, { total: 0, sincronizada: 0, revisada: 0, observada: 0 });
}

function renderSurveyorProfile() {
    if (state.currentUser?.role !== 'surveyor') return;

    const counts = getMySurveyCounts();
    const zone = state.assignedSurveyor?.assigned_zone || 'Sin zona';
    const displayName = state.assignedSurveyor?.full_name || state.currentUser?.display_name || 'Encuestador';
    const username = state.currentUser?.username ? `Usuario: ${state.currentUser.username}` : '';
    const accountStatus = translateAccountStatus(state.currentUser?.account_status || 'approved');
    const connection = isAppOnline() ? 'En linea' : 'Sin conexion';
    const draftText = getStoredDraft() ? 'Si' : 'No';

    setText('profile-view-name', displayName);
    setText('profile-view-username', username);
    setText('profile-view-zone', zone);
    setText('profile-view-status', accountStatus);
    setText('profile-view-connection', connection);

    setText('profile-total-count', String(counts.total));
    setText('profile-sync-count', String(counts.sincronizada));
    setText('profile-reviewed-count', String(counts.revisada));
    setText('profile-observed-count', String(counts.observada));
    setText('profile-view-draft', draftText);

    updateDraftButtons();
}

function translateAccountStatus(status) {
    const labels = {
        approved: 'Aprobado para campo',
        pending: 'Pendiente',
        in_review: 'En revision',
        rejected: 'Rechazado',
        suspended: 'Suspendido',
    };
    return labels[status] || status;
}

function setSurveyorNotice(title, text, variant = 'default') {
    const card = document.getElementById('surveyor-notice');
    if (!card || state.currentUser?.role !== 'surveyor') return;

    card.classList.remove('hidden', 'is-offline', 'is-success', 'is-warning');
    if (variant === 'offline') card.classList.add('is-offline');
    if (variant === 'success') card.classList.add('is-success');
    if (variant === 'warning') card.classList.add('is-warning');

    setText('surveyor-notice-title', title);
    setText('surveyor-notice-text', text);
}

function renderSurveyorNotice() {
    if (state.currentUser?.role !== 'surveyor') return;
    const pending = getPendingSurveys().length;
    if (!isAppOnline()) {
        setSurveyorNotice('Sin conexion', pending > 0
            ? `Estas trabajando sin internet. Hay ${pending} encuestas pendientes en este dispositivo.`
            : 'Estas trabajando sin internet. Las nuevas encuestas se guardaran localmente en este dispositivo.', 'offline');
        return;
    }
    if (pending > 0) {
        setSurveyorNotice('Pendientes por sincronizar', `Hay ${pending} encuestas guardadas localmente. Cuando la conexion este estable puedes sincronizarlas.`, 'warning');
        return;
    }
    if (getStoredDraft()) {
        setSurveyorNotice('Borrador disponible', 'Hay un borrador local de encuesta que puedes retomar antes de levantar una nueva ficha.', 'success');
        return;
    }
    setSurveyorNotice('Listo para campo', 'La cuenta esta en linea y sin pendientes. Puedes levantar una nueva encuesta.', 'success');
}

function getDraftStorageKey() {
    return `${DRAFT_STORAGE_PREFIX}_${state.currentUser?.id || 'guest'}`;
}

function getStoredDraft() {
    if (state.currentUser?.role !== 'surveyor') return null;
    try {
        const raw = localStorage.getItem(getDraftStorageKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        return null;
    }
}

function saveSurveyDraft() {
    if (state.currentUser?.role !== 'surveyor' || state.editingSurvey) return;
    const formData = new FormData(document.getElementById('survey-form'));
    const payload = Object.fromEntries(formData.entries());
    payload.women_roles = formData.getAll('women_roles');
    payload.mine_benefits = formData.getAll('mine_benefits');
    payload.mine_risks = formData.getAll('mine_risks');

    const hasContent = Object.entries(payload).some(([key, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return key !== 'survey_date' && String(value || '').trim() !== '';
    });

    if (!hasContent) {
        clearSurveyDraft();
        return;
    }

    localStorage.setItem(getDraftStorageKey(), JSON.stringify(payload));
    updateDraftButtons();
    renderSurveyorProfile();
    renderSurveyorNotice();
}

function handleSurveyDraftChange() {
    saveSurveyDraft();
}

function restoreSurveyDraft() {
    const draft = getStoredDraft();
    if (!draft) return;
    state.editingSurvey = null;
    document.getElementById('cancel-edit-button').classList.add('hidden');
    fillSurveyForm(draft);
    document.getElementById('save-status').textContent = 'Se cargo un borrador local pendiente de envio.';
    setSurveyorNotice('Borrador restaurado', 'Retoma y completa la encuesta borrador antes de guardarla definitivamente.', 'success');
    switchTab('survey');
}

function clearSurveyDraft() {
    if (state.currentUser?.role !== 'surveyor') return;
    localStorage.removeItem(getDraftStorageKey());
    updateDraftButtons();
    renderSurveyorProfile();
    renderSurveyorNotice();
}

function restoreDraftPreview() {
    updateDraftButtons();
    renderSurveyorProfile();
}

function updateDraftButtons() {
    const hasDraft = Boolean(getStoredDraft());
    const profileButton = document.getElementById('profile-continue-draft-button');
    if (profileButton) {
        profileButton.classList.toggle('hidden', !hasDraft);
    }
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
}

async function logout() {
    try {
        await requestJson('logout', { method: 'POST' });
    } catch (error) {
        console.warn(error);
    }

    state.currentUser = null;
    state.assignedSurveyor = null;
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('status-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('login-password').value = '';
    showAuthMode('login');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeJs(value) {
    return String(value ?? '').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');

            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        } catch (error) {
            console.warn('No se pudo registrar el service worker', error);
        }
    }
}

window.reviewApplication = reviewApplication;
window.changeSurveyorStatus = changeSurveyorStatus;
window.resetPassword = resetPassword;

window.updateSurveyorProfile = updateSurveyorProfile;
window.updateSurveyStatus = updateSurveyStatus;
window.editOwnSurvey = editOwnSurvey;

// ============================================================
//  MÓDULO DE ANÁLISIS EXPERTO DE ENCUESTAS
//  Indicadores estadísticos + sentimiento comunitario en tiempo real
// ============================================================

const analisisState = {
    data: null,
    charts: {},
    autoRefreshTimer: null,
};

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('analisis-refresh-btn');
    if (btn) btn.addEventListener('click', () => loadAnalisis(true));
    const sf = document.getElementById('analisis-sector-filter');
    if (sf) sf.addEventListener('change', () => loadAnalisis(true));
});

async function loadAnalisis() {
    const sector = document.getElementById('analisis-sector-filter')?.value ?? 'general';
    setAnalisisUI('loading');
    try {
        const payload = await requestJson('analisis', { params: { sector } });
        analisisState.data = payload.analisis;
        if (!analisisState.data || analisisState.data.total === 0) {
            setAnalisisUI('empty');
            return;
        }
        renderAnalisis(analisisState.data);
        setAnalisisUI('content');
        const ts = document.getElementById('analisis-last-update');
        if (ts) ts.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-EC');
        clearTimeout(analisisState.autoRefreshTimer);
        analisisState.autoRefreshTimer = setTimeout(() => loadAnalisis(), 90000);
    } catch (err) {
        setAnalisisUI('empty');
        console.error('Error en analisis:', err);
    }
}

function setAnalisisUI(state) {
    document.getElementById('analisis-loading')?.classList.toggle('hidden', state !== 'loading');
    document.getElementById('analisis-empty')?.classList.toggle('hidden', state !== 'empty');
    document.getElementById('analisis-content')?.classList.toggle('hidden', state !== 'content');
}

function renderAnalisis(data) {
    const r = data.resumen_ejecutivo;

    // Resumen ejecutivo
    const badge = document.getElementById('analisis-nivel-badge');
    if (badge) {
        badge.textContent = r.nivel_sentimiento;
        badge.className = 'analisis-label-pill analisis-pill-' + r.color_sentimiento;
    }
    setText('analisis-narrativa', r.narrativa);
    setText('analisis-indice-global', (r.indice_global > 0 ? '+' : '') + r.indice_global + ' pts');
    setText('analisis-pos-global', r.positivo_global + '%');
    setText('analisis-neg-global', r.negativo_global + '%');
    setText('analisis-total-n', r.total_encuestas + ' encuestas');
    setText('analisis-problema', r.problema_principal || '—');
    setText('analisis-generado-en', 'Generado: ' + data.generado_en);
    // KPI card de índice (fila superior)
    setText('kpi-indice-global', (r.indice_global > 0 ? '+' : '') + r.indice_global + ' pts');

    // Donut global de sentimiento
    renderDonutGlobal(data.sentimiento_global);
    // Leyenda manual del donut
    setText('leg-pos', data.sentimiento_global.positivo_pct);
    setText('leg-neu', data.sentimiento_global.neutro_pct);
    setText('leg-neg', data.sentimiento_global.negativo_pct);

    // Gauge de sentimiento
    renderGauge(r.indice_global);

    // Radar de dimensiones
    renderRadarDimensiones(data.dimensiones);

    // Dimensiones
    renderDimensiones(data.dimensiones);

    // Beneficios y riesgos mineros
    renderBarList('analisis-beneficios-list', data.beneficios_mineros, '#0f9f6e', 6);
    renderBarList('analisis-riesgos-list', data.riesgos_mineros, '#c43d45', 6);

    // Conocimiento minero
    renderConocimiento(data.conocimiento_minero);

    // Correlaciones
    renderCorrelaciones(data.correlaciones);

    // Tendencia temporal
    renderTendencia(data.tendencia_diaria);

    // Distribución por sector
    renderBarList('analisis-sector-dist', data.distribucion_por_sector, '#0e4eb0', 10);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '—';
}

function destroyChart(key) {
    if (analisisState.charts[key]) {
        try { analisisState.charts[key].destroy(); } catch (e) { }
        delete analisisState.charts[key];
    }
}

function truncate(str, max) {
    return str.length > max ? str.substring(0, max) + '...' : str;
}

function sentColor(sent) {
    if (sent === 'positivo') return '#0f9f6e';
    if (sent === 'negativo') return '#c43d45';
    return '#d97706';
}

function renderDonutGlobal(sent) {
    const ctx = document.getElementById('chart-sentimiento-global');
    if (!ctx || typeof Chart === 'undefined') return;
    destroyChart('global');
    analisisState.charts['global'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positivo', 'Neutro', 'Negativo'],
            datasets: [{
                data: [sent.positivo_pct, sent.neutro_pct, sent.negativo_pct],
                backgroundColor: ['#0f9f6e', '#d97706', '#c43d45'],
                borderWidth: 0,
            }],
        },
        options: {
            cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, color: 'rgba(255,255,255,0.8)' } },
                tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + c.parsed + '%' } },
            },
            animation: { duration: 700 },
        },
    });
}

function renderDimensiones(dimensiones) {
    const grid = document.getElementById('analisis-dimensiones-grid');
    if (!grid) return;

    // Destruir charts anteriores de dimensiones
    Object.keys(analisisState.charts).filter(k => k.startsWith('dim-')).forEach(k => destroyChart(k));
    grid.innerHTML = '';

    dimensiones.forEach((dim, idx) => {
        const sent = dim.sentimiento;
        const items = (dim.distribucion.items || []).slice(0, 7);
        const sentClass = sent.indice >= 15 ? 'sent-positive' : sent.indice <= -15 ? 'sent-negative' : 'sent-neutral';
        const sentLabel = sent.indice >= 15 ? 'Favorable' : sent.indice <= -15 ? 'Cr&iacute;tico' : 'Ambivalente';
        const chartId = 'chart-dim-' + idx;

        const card = document.createElement('div');
        card.className = 'card analisis-dim-card';
        card.innerHTML = `
            <div class="analisis-dim-header">
                <h4 class="analisis-dim-titulo">${escapeHtml(dim.titulo)}</h4>
                <span class="analisis-sent-badge ${sentClass}">
                    ${sentLabel} (${sent.indice > 0 ? '+' : ''}${sent.indice} pts)
                </span>
            </div>
            <div class="analisis-dim-meters">
                <div class="analisis-sent-row">
                    <span class="analisis-sent-label sent-pos-label">Positivo ${sent.positivo_pct}%</span>
                    <div class="analisis-sent-track"><div class="analisis-sent-fill sent-pos-fill" style="width:${sent.positivo_pct}%"></div></div>
                </div>
                <div class="analisis-sent-row">
                    <span class="analisis-sent-label sent-neu-label">Neutro ${sent.neutro_pct}%</span>
                    <div class="analisis-sent-track"><div class="analisis-sent-fill sent-neu-fill" style="width:${sent.neutro_pct}%"></div></div>
                </div>
                <div class="analisis-sent-row">
                    <span class="analisis-sent-label sent-neg-label">Negativo ${sent.negativo_pct}%</span>
                    <div class="analisis-sent-track"><div class="analisis-sent-fill sent-neg-fill" style="width:${sent.negativo_pct}%"></div></div>
                </div>
            </div>
            <canvas id="${chartId}" height="150"></canvas>
            <p class="analisis-interpretacion">${escapeHtml(dim.interpretacion)}</p>
        `;
        grid.appendChild(card);

        if (items.length > 0 && typeof Chart !== 'undefined') {
            const chartCtx = document.getElementById(chartId);
            if (chartCtx) {
                analisisState.charts['dim-' + idx] = new Chart(chartCtx, {
                    type: 'bar',
                    data: {
                        labels: items.map(it => truncate(it.label, 30)),
                        datasets: [{
                            data: items.map(it => it.pct),
                            backgroundColor: items.map(it => sentColor(it.sentimiento)),
                            borderRadius: 4,
                        }],
                    },
                    options: {
                        indexAxis: 'y',
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (c) => ' ' + c.parsed.x + '% (' + (dim.distribucion.total_respondentes) + ' encuestas)' } },
                        },
                        scales: {
                            x: { max: 100, ticks: { callback: v => v + '%', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                            y: { ticks: { font: { size: 10 } }, grid: { display: false } },
                        },
                        animation: { duration: 500 },
                    },
                });
            }
        }
    });
}

function renderBarList(containerId, items, color, limit) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items || items.length === 0) {
        el.innerHTML = '<p class="empty-state">Sin datos suficientes.</p>';
        return;
    }
    el.innerHTML = items.slice(0, limit).map(item => `
        <div class="analisis-bar-item">
            <div class="analisis-bar-meta">
                <span class="analisis-bar-label">${escapeHtml(item.label)}</span>
                <span class="analisis-bar-pct">${item.pct}% (${item.count})</span>
            </div>
            <div class="analisis-bar-track">
                <div class="analisis-bar-fill" style="width:${item.pct}%;background:${color}"></div>
            </div>
        </div>
    `).join('');
}

function renderConocimiento(conocimiento) {
    const grid = document.getElementById('analisis-conocimiento-grid');
    if (!grid || !conocimiento) return;
    grid.innerHTML = conocimiento.map(item => {
        const posItem = item.dist.items.find(i => i.sentimiento === 'positivo');
        const pct = posItem ? posItem.pct : 0;
        const col = pct >= 60 ? '#0f9f6e' : pct >= 30 ? '#d97706' : '#c43d45';
        const lbl = pct >= 60 ? 'Buen nivel de conocimiento'
                  : pct >= 30 ? 'Conocimiento parcial &mdash; requiere refuerzo'
                  : 'Bajo conocimiento &mdash; socializaci&oacute;n urgente';
        return `
            <div class="analisis-conoc-item">
                <div class="analisis-conoc-header">
                    <span class="analisis-conoc-label">${escapeHtml(item.label)}</span>
                    <span class="analisis-conoc-pct" style="color:${col}">${pct}%</span>
                </div>
                <div class="analisis-bar-track">
                    <div class="analisis-bar-fill" style="width:${pct}%;background:${col}"></div>
                </div>
                <small class="analisis-sent-label">${lbl}</small>
            </div>
        `;
    }).join('');
}

function renderCorrelaciones(correlaciones) {
    const el = document.getElementById('analisis-correlaciones');
    if (!el || !correlaciones) return;
    el.innerHTML = correlaciones.map(corr => {
        const diff = +(corr.valor_a - corr.valor_b).toFixed(1);
        const col = diff > 5 ? '#0f9f6e' : diff < -5 ? '#c43d45' : '#d97706';
        return `
            <div class="card analisis-corr-card">
                <div class="analisis-corr-header">
                    <h4>${escapeHtml(corr.titulo)}</h4>
                    <span class="analisis-corr-diff" style="color:${col}">Δ ${Math.abs(diff).toFixed(1)}pp</span>
                </div>
                <div class="analisis-corr-bars">
                    <div class="analisis-corr-item">
                        <span>${escapeHtml(corr.label_a)}</span>
                        <div class="analisis-bar-track"><div class="analisis-bar-fill" style="width:${corr.valor_a}%;background:#0e4eb0"></div></div>
                        <span class="analisis-bar-pct">${corr.valor_a}%</span>
                    </div>
                    <div class="analisis-corr-item">
                        <span>${escapeHtml(corr.label_b)}</span>
                        <div class="analisis-bar-track"><div class="analisis-bar-fill" style="width:${corr.valor_b}%;background:#5c85d6"></div></div>
                        <span class="analisis-bar-pct">${corr.valor_b}%</span>
                    </div>
                </div>
                <p class="analisis-interpretacion">${escapeHtml(corr.interpretacion)}</p>
            </div>
        `;
    }).join('');
}

function renderTendencia(tendencia) {
    const ctx = document.getElementById('chart-tendencia');
    if (!ctx || !tendencia || tendencia.length === 0 || typeof Chart === 'undefined') return;
    destroyChart('tendencia');
    analisisState.charts['tendencia'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: tendencia.map(t => t.dia),
            datasets: [
                {
                    label: 'Encuestas por dia',
                    data: tendencia.map(t => t.total),
                    backgroundColor: 'rgba(14,78,176,0.75)',
                    borderRadius: 4,
                    yAxisID: 'y',
                },
                {
                    label: 'Apertura a inversion (%)',
                    data: tendencia.map(t => t.apertura_pct),
                    type: 'line',
                    borderColor: '#0f9f6e',
                    backgroundColor: 'rgba(15,159,110,0.1)',
                    pointRadius: 4,
                    fill: true,
                    tension: 0.35,
                    yAxisID: 'y2',
                },
            ],
        },
        options: {
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { mode: 'index', intersect: false },
            },
            scales: {
                y: { position: 'left', title: { display: true, text: 'Encuestas' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                y2: { position: 'right', max: 100, title: { display: true, text: 'Apertura (%)' }, grid: { display: false }, ticks: { callback: v => v + '%' } },
            },
            animation: { duration: 700 },
        },
    });
}

// ============================================================
//  GAUGE — índice neto de sentimiento (semicírculo -100 a +100)
// ============================================================
function renderGauge(indice) {
    const ctx = document.getElementById('chart-gauge');
    if (!ctx || typeof Chart === 'undefined') return;
    destroyChart('gauge');

    const val = Math.max(-100, Math.min(100, indice));
    const pct = (val + 100) / 200;
    const fillAngle = pct;
    const emptyAngle = 1 - pct;

    const fillColor = val >= 15 ? '#0f9f6e'
        : val <= -15 ? '#c43d45'
            : '#d97706';

    analisisState.charts['gauge'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [fillAngle, emptyAngle, 1],
                backgroundColor: [fillColor, 'rgba(200,200,200,0.15)', 'rgba(0,0,0,0)'],
                borderWidth: 0,
            }],
        },
        options: {
            rotation: -90,
            circumference: 180,
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { duration: 600 },
        },
    });
}

// ============================================================
//  RADAR — comparativa de dimensiones
// ============================================================
function renderRadarDimensiones(dimensiones) {
    const ctx = document.getElementById('chart-radar-dimensiones');

}
