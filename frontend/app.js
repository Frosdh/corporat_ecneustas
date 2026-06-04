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
// Total real de encuestas en la base — persiste en localStorage entre recargas
let _totalEncuestasReal = parseInt(localStorage.getItem('_totalEncuestasReal') || '0', 10) || null;

function setTotalEncuestasReal(n) {
    if (n && n > 0) {
        _totalEncuestasReal = n;
        localStorage.setItem('_totalEncuestasReal', String(n));
        const kpiEl = document.getElementById('kpi-total');
        if (kpiEl) kpiEl.textContent = n;
        const meta = 300;
        const pct = Math.min(100, Math.round((n / meta) * 100));
        const bar = document.getElementById('kpi-total-bar');
        if (bar) bar.style.width = `${pct}%`;
        const lbl = document.getElementById('kpi-total-pct-label');
        if (lbl) lbl.textContent = `${pct}% de meta`;
    }
}

async function fetchTotalEncuestas() {
    try {
        const r = await requestJson('total-surveys');
        if (r?.total > 0) setTotalEncuestasReal(r.total);
    } catch (_) { }
}
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

    ['survey-filter-sector', 'survey-filter-surveyor', 'survey-filter-date-from', 'survey-filter-date-to', 'survey-filter-status'].forEach(id => {
        document.getElementById(id).addEventListener('change', loadSurveys);
    });

    document.getElementById('clear-survey-filters-button').addEventListener('click', () => {
        document.getElementById('survey-filter-sector').value = 'general';
        document.getElementById('survey-filter-surveyor').value = '';
        document.getElementById('survey-filter-date-from').value = '';
        document.getElementById('survey-filter-date-to').value = '';
        document.getElementById('survey-filter-status').value = 'all';
        loadSurveys();
    });
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
            if (button.dataset.tab === 'preguntas') {
                await loadPreguntas();
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
    if (payload.dashboard) {
        renderDashboard(payload.dashboard);
        fetchTotalEncuestas(); // corrige el total con el valor real de la base
    }
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
    const preguntasBtn = document.getElementById('tab-button-preguntas');
    if (preguntasBtn) preguntasBtn.classList.remove('hidden');
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
    fetchTotalEncuestas(); // siempre actualizar con el total real de la base
    loadDashboardSurveys(sector);
}

function renderDashboard(dashboard) {
    const summary = dashboard.summary;
    const services = dashboard.services;
    const applications = dashboard.applications || {};
    const operations = dashboard.operations || {};
    const management = dashboard.management || {};
    const social = dashboard.social || {};
    const strategic = dashboard.strategic || {};
    const pendingCount = getPendingSurveys().length;
    // Nunca mostrar un total menor al que ya se conoce (evita que sync sobreescriba con dato viejo)
    if (summary.total_surveys > (_totalEncuestasReal || 0)) _totalEncuestasReal = summary.total_surveys;
    const totalRegistradas = _totalEncuestasReal || summary.total_surveys;

    const kpiTotal = document.getElementById('kpi-total');
    if (kpiTotal) kpiTotal.textContent = totalRegistradas;
    const kpiBar = document.getElementById('kpi-total-bar');
    if (kpiBar) {
        const meta = 300;
        const pct = Math.min(100, Math.round((totalRegistradas / meta) * 100));
        kpiBar.style.width = `${pct}%`;
        const lbl = document.getElementById('kpi-total-pct-label');
        if (lbl) lbl.textContent = `${pct}% de meta`;
    }
    document.getElementById('kpi-poverty').textContent = `${summary.structural_poverty}%`;
    document.getElementById('kpi-acceptance').textContent = `${summary.acceptance_rate}%`;
    document.getElementById('kpi-climate').textContent = summary.political_climate;

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
    const stBase = strategic.stance_total ?? 0;
    setText('strategy-favorable-count', `${strategic.favorable_count ?? 0} de ${stBase} respuestas`);
    setText('strategy-conditioned-count', `${strategic.conditioned_count ?? 0} de ${stBase} respuestas`);
    setText('strategy-contrary-count', `${strategic.contrary_count ?? 0} de ${stBase} respuestas`);
    setText('strategy-base', stBase > 0 ? `Base: ${stBase} encuestados respondieron esta pregunta` : '');

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

    Object.values(state.dimGaugeCharts).forEach(ch => { try { ch.destroy(); } catch (e) { } });
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
        const color = d.indice >= 15 ? '#0f9f6e' : d.indice <= -15 ? '#c43d45' : '#d97706';
        const bgColor = d.indice >= 15 ? 'rgba(15,159,110,0.10)' : d.indice <= -15 ? 'rgba(196,61,69,0.09)' : 'rgba(217,119,6,0.09)';
        const label = d.indice >= 15 ? 'Favorable' : d.indice <= -15 ? 'Cr&iacute;tico' : 'Ambivalente';
        const icon = icons[i] || icons[0];

        // Ensure values are numbers and round properly
        const pos = d.positivo_pct || 0;
        const neu = d.neutro_pct || 0;
        const neg = d.negativo_pct || 0;

        return `
            <div class="dash-gauge-card-item">
                <div class="dg-top">
                    <span class="dg-icon" style="color:${color}">${icon}</span>
                    <span class="dg-titulo">${escapeHtml(d.titulo).toUpperCase()}</span>
                </div>
                <div class="dg-circle-wrap">
                    <canvas id="dg-${i}" width="160" height="160"></canvas>
                    <div class="dg-center-val" style="color:${color}">
                        <strong>${pos}%</strong>
                        <span style="font-size:0.75rem;letter-spacing:0">Favorable</span>
                    </div>
                </div>
                <div class="dg-bottom" style="flex-direction:column;align-items:stretch;gap:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                        <span class="dg-badge" style="background:${bgColor};color:${color}">${label}</span>
                        <span class="dg-n">${d.n > 0 ? d.n + ' resp.' : 'Sin datos'}</span>
                    </div>
                    <div class="dg-sentiment-bar-wrap" style="margin-top:8px;">
                        <div class="dg-sentiment-bar" style="height:6px;border-radius:3px;display:flex;overflow:hidden;background:rgba(255,255,255,0.05);">
                            <div class="dg-sb-pos" style="width: ${pos}%; background:#0f9f6e; transition:width 0.5s;"></div>
                            <div class="dg-sb-neu" style="width: ${neu}%; background:#a1a1aa; transition:width 0.5s;"></div>
                            <div class="dg-sb-neg" style="width: ${neg}%; background:#c43d45; transition:width 0.5s;"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--muted); margin-top:4px;">
                            <span style="color:#0f9f6e">${pos}% Pos</span>
                            <span style="color:#a1a1aa">${neu}% Neu</span>
                            <span style="color:#c43d45">${neg}% Neg</span>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');

    dims.forEach((d, i) => {
        const canvas = document.getElementById('dg-' + i);
        if (!canvas || typeof Chart === 'undefined') return;
        const sweep = 270;
        const pctVal = d.positivo_pct || 0;
        const filled = Math.max(2, Math.min(sweep - 2, (pctVal / 100) * sweep));
        const empty = sweep - filled;
        const color = d.indice >= 15 ? '#0f9f6e' : d.indice <= -15 ? '#c43d45' : '#d97706';
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
    const filters = ['sector-filter', 'analisis-sector-filter', 'preguntas-sector-filter', 'survey-filter-sector', 'llm-sector-filter'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;

        el.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'general';
        defaultOpt.textContent = 'Todas las zonas';
        el.appendChild(defaultOpt);

        sectors.forEach(item => {
            if (!item.label || item.label.toLowerCase() === 'general' || item.label.toLowerCase() === 'todas las zonas' || item.label.includes('bartolom')) return;
            const opt = document.createElement('option');
            opt.value = item.label;
            opt.textContent = item.label;
            el.appendChild(opt);
        });

        if (Array.from(el.options).some(o => o.value === currentVal)) {
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
                    <button class="primary-button" type="button" onclick="viewSurvey(${item.id})">Ver encuesta</button>
                    <button class="secondary-button" type="button" onclick="updateSurveyStatus(${item.id}, 'sincronizada')">Marcar sincronizada</button>
                    <button class="success-button" type="button" onclick="updateSurveyStatus(${item.id}, 'revisada')">Marcar revisada</button>
                    <button class="danger-button" type="button" onclick="updateSurveyStatus(${item.id}, 'observada')">Marcar observada</button>
                </div>
            </article>
        `).join('');
}

// normaliza lista separada por | o array
function normalizeSurveyList(value) {
    if (!value || value === 'null' || value === '') return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value).split('|').map((s) => s.trim()).filter(Boolean);
}

// Iconos SVG (solo ASCII)
const SMD_ICONS = {
    id: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><rect x="2" y="3" width="16" height="14" rx="3"/><path d="M6 7h8M6 10h5"/></svg>',
    person: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg>',
    social: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>',
    home: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M3 10L10 3l7 7v7H3z"/><rect x="7" y="13" width="6" height="4"/></svg>',
    mine: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M5 15l3-6 4 2 3-6"/><circle cx="15" cy="5" r="1.5" fill="currentColor"/></svg>',
    comment: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H7l-4 3V5a1 1 0 011-1z"/></svg>',
    cal: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/></svg>',
    user2: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><circle cx="10" cy="7" r="3"/><path d="M5 17c0-2.761 2.239-5 5-5s5 2.239 5 5"/></svg>',
};

// Seccion siempre abierta (sin accordion)
function smdSection(iconKey, iconBg, iconColor, title, bodyHtml) {
    return '<div class="smd-section">' +
        '<div class="smd-section-header">' +
        '<div class="smd-section-icon" style="background:' + iconBg + ';color:' + iconColor + '">' + (SMD_ICONS[iconKey] || '') + '</div>' +
        '<span class="smd-section-title">' + title + '</span>' +
        '</div>' +
        '<div class="smd-section-body">' + bodyHtml + '</div>' +
        '</div>';
}

// Campo simple
function smdField(label, value) {
    var empty = !value || value === 'null' || value === '';
    return '<div class="smd-field">' +
        '<span class="smd-field-label">' + label + '</span>' +
        '<span class="smd-field-value' + (empty ? ' empty' : '') + '">' + (empty ? '&mdash;' : escapeHtml(String(value))) + '</span>' +
        '</div>';
}

// Pregunta radio (una opcion)
function smdRadioQ(question, options, selected) {
    var sel = (selected || '').trim().toLowerCase();
    var matched = false;
    var opts = options.map(function (opt) {
        var active = false;
        var displayOpt = opt;
        if (sel !== '') {
            if (sel === opt.toLowerCase()) {
                active = true;
                matched = true;
            } else if (opt.toLowerCase() === 'otro' && sel.startsWith('otro:')) {
                active = true;
                matched = true;
                displayOpt = selected; // Mostrar el texto completo "Otro: ..."
            }
        }
        return '<span class="smd-opt' + (active ? ' smd-opt-active' : '') + '">' +
            '<span class="smd-opt-dot' + (active ? ' smd-opt-dot-active' : '') + '"></span>' +
            escapeHtml(displayOpt) + '</span>';
    });

    if (sel !== '' && !matched) {
        opts.push('<span class="smd-opt smd-opt-active"><span class="smd-opt-dot smd-opt-dot-active"></span>' + escapeHtml(selected) + '</span>');
    }

    var none = sel === '' ? '<span class="smd-no-answer">Sin respuesta</span>' : '';
    return '<div class="smd-question">' +
        '<div class="smd-q-label">' + question + '</div>' +
        '<div class="smd-opts">' + opts.join('') + none + '</div>' +
        '</div>';
}

// Pregunta checkbox (multiple)
var CHECK_SVG = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" stroke-width="2.2"><path d="M2 6l3 3 5-5"/></svg>';
function smdCheckQ(question, options, selected) {
    var sel = normalizeSurveyList(selected).map(function (s) { return s.toLowerCase(); });
    var selOriginal = normalizeSurveyList(selected);
    var matchedIndices = [];

    var opts = options.map(function (opt) {
        var idx = sel.indexOf(opt.toLowerCase());
        var active = idx !== -1;
        if (active) matchedIndices.push(idx);
        return '<span class="smd-opt' + (active ? ' smd-opt-active' : '') + '">' +
            '<span class="smd-opt-check' + (active ? ' smd-opt-check-active' : '') + '">' + (active ? CHECK_SVG : '') + '</span>' +
            escapeHtml(opt) + '</span>';
    });

    for (var i = 0; i < selOriginal.length; i++) {
        if (matchedIndices.indexOf(i) === -1 && selOriginal[i].trim() !== '') {
            opts.push('<span class="smd-opt smd-opt-active"><span class="smd-opt-check smd-opt-check-active">' + CHECK_SVG + '</span>' + escapeHtml(selOriginal[i]) + '</span>');
        }
    }

    var none = sel.length === 0 ? '<span class="smd-no-answer">Sin respuesta</span>' : '';
    return '<div class="smd-question">' +
        '<div class="smd-q-label">' + question + '</div>' +
        '<div class="smd-opts">' + opts.join('') + none + '</div>' +
        '</div>';
}

// Campo de texto libre
function smdTextQ(question, value) {
    var empty = !value || value === 'null' || value === '';
    return '<div class="smd-question">' +
        '<div class="smd-q-label">' + question + '</div>' +
        '<div class="smd-text-answer' + (empty ? ' empty' : '') + '">' + (empty ? 'Sin respuesta' : escapeHtml(String(value))) + '</div>' +
        '</div>';
}

async function viewSurvey(surveyId) {
    var modal = document.getElementById('survey-detail-modal');
    document.getElementById('survey-modal-header-left').innerHTML = '<h2>Cargando...</h2>';
    document.getElementById('survey-modal-status-badge').textContent = '';
    document.getElementById('survey-modal-body').innerHTML =
        '<div style="text-align:center;padding:3rem 1rem;color:#A67C52;">Cargando encuesta...</div>';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    try {
        var payload = await requestJson('get-survey', { params: { id: surveyId } });
        var item = payload.survey;
        if (!item) {
            document.getElementById('survey-modal-body').innerHTML =
                '<div style="text-align:center;padding:2rem;color:red;">No se encontr&oacute; la encuesta</div>';
            return;
        }

        var st = item.survey_status || 'sincronizada';
        var stLabel = st.charAt(0).toUpperCase() + st.slice(1);
        document.getElementById('survey-modal-header-left').innerHTML =
            '<h2>' + escapeHtml(item.community || '-') + ' &mdash; ' + escapeHtml(item.sector || '-') + '</h2>' +
            '<div class="survey-modal-meta">' +
            '<span>' + SMD_ICONS.cal + ' ' + escapeHtml(item.survey_date || '-') + '</span>' +
            '<span>' + SMD_ICONS.user2 + ' ' + escapeHtml(item.surveyor_name || 'Sin nombre') + '</span>' +
            '</div>';
        var badge = document.getElementById('survey-modal-status-badge');
        badge.textContent = stLabel;
        badge.className = 'survey-modal-status-badge status-' + st;

        var hasGps = item.latitude && item.longitude;
        var gpsHtml = hasGps
            ? '<div class="smd-gps-card"><div class="smd-gps-dot"></div><div>' +
            '<div class="smd-gps-label">Coordenadas GPS</div>' +
            '<div class="smd-gps-coords">Lat ' + escapeHtml(String(item.latitude)) + ' &middot; Lon ' + escapeHtml(String(item.longitude)) + '</div>' +
            '</div></div>'
            : '<div class="smd-no-gps">Sin coordenadas GPS</div>';

        var respondentName = [item.respondent_name, item.respondent_last_name].filter(Boolean).join(' ');
        var sections = [];

        // 1. Identificacion
        sections.push(smdSection('id', 'rgba(166,124,82,.15)', '#6F4E37', 'Identificaci&oacute;n y Contexto',
            '<div class="smd-grid">' +
            smdField('Sector', item.sector) +
            smdField('Comunidad / Barrio', item.community) +
            smdField('Fecha', item.survey_date) +
            smdField('Encuestador', item.surveyor_name) +
            '</div>' + gpsHtml
        ));

        // 2. Datos del encuestado
        sections.push(smdSection('person', 'rgba(224,169,109,.2)', '#A67C52', 'Datos del Encuestado',
            (respondentName ? '<div class="smd-grid">' + smdField('Nombre', respondentName) +
                (item.respondent_id_document ? smdField('C&eacute;dula', item.respondent_id_document) : '') +
                (item.respondent_phone ? smdField('Tel&eacute;fono', item.respondent_phone) : '') +
                (item.respondent_email ? smdField('Correo', item.respondent_email) : '') +
                '</div>' : '') +
            smdRadioQ('G&eacute;nero del encuestado', ['Mujer', 'Hombre', 'Otro'], item.respondent_gender) +
            smdRadioQ('Rango de edad', ['18-25', '26-35', '36-45', '46-60', '61 o mas'], item.age_range) +
            smdRadioQ('Nivel de educaci&oacute;n', ['Primaria', 'Secundaria', 'Tecnico', 'Universitario', 'Ninguno'], item.education_level) +
            smdTextQ('Ocupaci&oacute;n principal', item.occupation) +
            smdRadioQ('Ingreso familiar', ['No cubre la canasta', 'Cubre apenas', 'Cubre con algo de holgura'], item.household_income)
        ));

        // 3. Problematicas
        sections.push(smdSection('social', 'rgba(239,68,68,.1)', '#dc2626', 'Problem&aacute;ticas y Din&aacute;mica Social',
            smdCheckQ('Problem&aacute;ticas principales (selecci&oacute;n m&uacute;ltiple)',
                ['Inseguridad', 'Falta de empleo', 'Agua y saneamiento', 'Vias en mal estado', 'Salud', 'Migracion juvenil'],
                item.primary_problem) +
            smdRadioQ('&iquest;A qu&eacute; se dedican los j&oacute;venes?',
                ['Migracion por falta de oportunidades', 'Agricultura o trabajo informal', 'Continuan estudios superiores', 'Empleo local eventual', 'Otro'],
                item.youth_path) +
            smdCheckQ('Limitaciones econ&oacute;micas para mujeres (selecci&oacute;n m&uacute;ltiple)',
                ['Precios bajos por intermediarios', 'Sobrecarga de cuidados', 'Poco acceso a financiamiento', 'Mercados limitados por seleccion'],
                item.women_roles) +
            smdRadioQ('Clima pol&iacute;tico local',
                ['Desconfianza institucional', 'Division comunitaria', 'Estabilidad relativa', 'Conflicto abierto entre actores'],
                item.political_climate) +
            smdRadioQ('Confianza en autoridades', ['Alta', 'Media', 'Baja'], item.authority_trust) +
            smdCheckQ('Prioridad social (selecci&oacute;n m&uacute;ltiple)',
                ['Proteger agua y paramos', 'Generar empleo rapido', 'Mejorar vias y servicios', 'Fortalecer produccion local', 'Turismo', 'Viviendas', 'Mineria?'],
                item.social_priority) +
            smdRadioQ('Aceptaci&oacute;n de inversi&oacute;n externa',
                ['Rechazo preventivo', 'Aceptacion condicionada', 'Aceptacion amplia'],
                item.investment_acceptance)
        ));

        // 4. Hogar
        sections.push(smdSection('home', 'rgba(16,185,129,.1)', '#059669', 'Condiciones del Hogar',
            smdRadioQ('Fuente principal de agua',
                ['Red publica con tratamiento', 'Vertiente comunal sin purificacion', 'Rio o acequia', 'Tanquero u otra compra'],
                item.water_source) +
            smdRadioQ('Alcantarillado', ['Si tiene', 'No tiene'], item.has_sewer) +
            smdRadioQ('Fosa s&eacute;ptica', ['Si tiene', 'No tiene'], item.has_septic) +
            smdRadioQ('Internet', ['Si estable', 'Intermitente', 'No tiene'], item.has_internet) +
            smdRadioQ('Estado de v&iacute;as', ['Bueno', 'Regular', 'Malo'], item.road_status) +
            smdRadioQ('&iquest;Qui&eacute;n deber&iacute;a arreglar las v&iacute;as?',
                ['GAD Parroquial', 'GAD Cantonal', 'GAD Provincial'], item.road_who_fixes)
        ));

        // 5. Mineria
        sections.push(smdSection('mine', 'rgba(111,78,55,.12)', '#6F4E37', 'Percepci&oacute;n Minera',
            smdRadioQ('Percepci&oacute;n sobre reapertura minera',
                ['Beneficiaria mucho', 'Beneficiaria algo', 'Beneficio dudoso', 'No beneficiaria'],
                item.mine_reopening_perception) +
            smdCheckQ('Beneficios esperados (selecci&oacute;n m&uacute;ltiple)',
                ['Empleo juvenil', 'Movimiento comercial', 'Obras comunitarias', 'Pago de impuestos', 'Ninguno claro'],
                item.mine_benefits) +
            smdCheckQ('Riesgos percibidos (selecci&oacute;n m&uacute;ltiple)',
                ['Contaminacion del agua', 'Danos al suelo', 'Conflicto social', 'Poca transparencia'],
                item.mine_risks) +
            smdRadioQ('&iquest;Conoce tipos de miner&iacute;a?', ['Si', 'No', 'Primera vez que escucho'], item.knows_mining_types) +
            smdRadioQ('&iquest;Conoce beneficios de la miner&iacute;a?', ['Si', 'No', 'Primera vez que escucho'], item.knows_mining_benefits) +
            smdRadioQ('&iquest;Conoce la miner&iacute;a moderna?', ['Si', 'No', 'Primera vez que escucho esto'], item.knows_modern_mining) +
            smdRadioQ('&iquest;Conoce las minas locales?', ['Si', 'No', 'Hay que investigar'], item.knows_local_mines) +
            smdRadioQ('&iquest;Hay garant&iacute;as ambientales?', ['Si', 'No', 'Asi deber\u00EDa ser'], item.knows_env_guarantees)
        ));

        // 6. Observaciones
        if (item.comments && item.comments.trim()) {
            sections.push(smdSection('comment', 'rgba(99,102,241,.12)', '#4f46e5', 'Observaciones',
                '<div class="smd-comments-block">' + escapeHtml(item.comments) + '</div>'
            ));
        }

        document.getElementById('survey-modal-body').innerHTML = sections.join('');

    } catch (error) {
        document.getElementById('survey-modal-body').innerHTML =
            '<div style="text-align:center;padding:2rem;color:red;">Error: ' + escapeHtml(error.message) + '</div>';
    }
}

function closeSurveyModal(event) {
    if (event.target === document.getElementById('survey-detail-modal') ||
        (event.target.closest && event.target.closest('.survey-modal-close'))) {
        document.getElementById('survey-detail-modal').style.display = 'none';
        document.body.style.overflow = '';
    }
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

    const ACTION_META = {
        login: { icon: '🔐', label: 'Inicio de sesión', color: '#3b82f6', bg: '#eff6ff' },
        logout: { icon: '🚪', label: 'Cierre de sesión', color: '#6b7280', bg: '#f9fafb' },
        save_survey: { icon: '📋', label: 'Encuesta guardada', color: '#059669', bg: '#ecfdf5' },
        register_application: { icon: '📝', label: 'Postulación registrada', color: '#7c3aed', bg: '#f5f3ff' },
        review_application: { icon: '🔍', label: 'Postulación revisada', color: '#d97706', bg: '#fffbeb' },
        update_surveyor_profile: { icon: '✏️', label: 'Perfil actualizado', color: '#0284c7', bg: '#e0f2fe' },
        update_surveyor_status: { icon: '🔄', label: 'Estado actualizado', color: '#ea580c', bg: '#fff7ed' },
        reset_password: { icon: '🔑', label: 'Clave restablecida', color: '#be185d', bg: '#fdf2f8' },
    };

    list.innerHTML = state.auditLogs.map((item) => {
        const meta = ACTION_META[item.action_type] || { icon: '📌', label: item.action_type, color: '#6b7280', bg: '#f9fafb' };
        const details = item.details || {};
        const detailEntries = Object.entries(details).filter(([k]) => k !== 'status' || item.action_type !== 'login');
        const detailHtml = detailEntries.length
            ? detailEntries.map(([k, v]) => `
                <div class="audit-detail-item">
                    <span class="audit-detail-key">${escapeHtml(k.replace(/_/g, ' '))}</span>
                    <span class="audit-detail-val">${escapeHtml(String(v))}</span>
                </div>`).join('')
            : '<div class="audit-detail-item"><span class="audit-detail-val" style="color:var(--muted)">Sin detalles</span></div>';

        const [datePart, timePart] = (item.created_at || '').split(' ');

        return `
        <article class="audit-entry">
            <div class="audit-icon-col">
                <div class="audit-icon" style="background:${meta.bg};color:${meta.color}">${meta.icon}</div>
                <div class="audit-timeline-line"></div>
            </div>
            <div class="audit-body">
                <div class="audit-header">
                    <div class="audit-title-row">
                        <span class="audit-action-label" style="color:${meta.color}">${escapeHtml(meta.label)}</span>
                        <span class="audit-entity-badge">${escapeHtml(item.entity_type)}</span>
                    </div>
                    <div class="audit-meta-row">
                        <span class="audit-actor">👤 ${escapeHtml(item.actor_name || '—')}</span>
                        <span class="audit-time">📅 ${escapeHtml(datePart || '')} &nbsp;⏰ ${escapeHtml(timePart || '')}</span>
                        ${item.entity_id ? `<span class="audit-id">ID: ${escapeHtml(String(item.entity_id))}</span>` : ''}
                    </div>
                </div>
                <div class="audit-details">${detailHtml}</div>
            </div>
        </article>`;
    }).join('');
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
                <button class="primary-button" type="button" onclick="viewSurvey(${item.id})">Ver encuesta</button>
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
    iaMinera: null,
    charts: {},
    autoRefreshTimer: null,
};

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('analisis-refresh-btn');
    if (btn) btn.addEventListener('click', () => loadAnalisis(true));
    const sf = document.getElementById('analisis-sector-filter');
    if (sf) sf.addEventListener('change', () => loadAnalisis(true));
    const pdfBtn = document.getElementById('analisis-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => generateAnalisisPDF());

    // Eventos para el nuevo modulo LLM Nvidia
    const llmBtn = document.getElementById('llm-generate-btn');
    if (llmBtn) llmBtn.addEventListener('click', () => generateLLMNvidia());
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
        // Cargar IA minera en paralelo (no bloquea el render principal)
        requestJson('ia_minera', { params: { sector } })
            .then(iaPayload => {
                analisisState.iaMinera = iaPayload;
                renderIAMinera(iaPayload);
            })
            .catch(err => console.warn('IA minera no disponible:', err));
        // Cargar plan Gemini en paralelo
        const geminiBox = document.getElementById('gemini-plan-box');
        if (geminiBox) {
            geminiBox.classList.remove('hidden');
            geminiBox.innerHTML = '<div class="ia-loading"><span class="ia-spinner"></span> Gemini est&aacute; analizando regulaci&oacute;n, mejores pr&aacute;cticas y generando el plan estrat&eacute;gico...</div>';
            requestJson('plan_gemini', { params: { sector } })
                .then(gPayload => {
                    analisisState.planGemini = gPayload;
                    renderPlanGemini(gPayload);
                })
                .catch(err => {
                    geminiBox.innerHTML = '<div class="ia-error">&#9888; Plan Gemini no disponible: ' + err.message + '</div>';
                });
        }
        // Sincronizar total con el dashboard
        const totalReal = analisisState.data.total_encuestas ?? analisisState.data.total ?? 0;
        setTotalEncuestasReal(totalReal);
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

    // Mostrar spinner IA mientras carga
    const iaBox = document.getElementById('ia-minera-box');
    if (iaBox) {
        iaBox.innerHTML = `<div class="ia-loading"><span class="ia-spinner"></span> Entrenando modelo de IA con los datos del sector...</div>`;
        iaBox.classList.remove('hidden');
    }
}

function renderIAMinera(payload) {
    const box = document.getElementById('ia-minera-box');
    if (!box) return;

    if (!payload?.ok) {
        box.innerHTML = `<div class="ia-error">&#9888; IA Minera: ${payload?.error || 'No disponible'}</div>`;
        return;
    }

    const d = payload;
    const claseColor = { 'Aceptacion': '#0f9f6e', 'Neutral': '#d97706', 'Rechazo': '#c43d45' };
    const claseIcon = { 'Aceptacion': '&#10003;', 'Neutral': '&#9888;', 'Rechazo': '&#10007;' };
    const pred = d.prediccion_global;
    const probs = d.probabilidades_globales || {};

    const factoresHtml = (d.importancia_factores || []).slice(0, 6).map(f => `
        <div class="ia-factor-row">
            <span class="ia-factor-label">${f.factor}</span>
            <div class="ia-factor-bar-wrap">
                <div class="ia-factor-bar" style="width:${f.score_pct}%;background:${f.score_pct > 60 ? '#0e4eb0' : f.score_pct > 30 ? '#d97706' : '#94a3b8'}"></div>
            </div>
            <span class="ia-factor-score">${f.score_pct}%</span>
        </div>`).join('');

    const sectorHtml = (d.prediccion_por_sector || []).slice(0, 6).map(s => `
        <tr>
            <td>${s.sector}</td>
            <td style="color:#0f9f6e;font-weight:700">${s.Aceptacion}%</td>
            <td style="color:#d97706;font-weight:700">${s.Neutral}%</td>
            <td style="color:#c43d45;font-weight:700">${s.Rechazo}%</td>
            <td style="font-size:0.8rem;color:#64748b">${s.n}</td>
        </tr>`).join('');

    const recsHtml = (d.recomendaciones_ia || []).map((r, i) =>
        `<li><strong>R${i + 1}:</strong> ${r}</li>`).join('');

    box.innerHTML = `
    <div class="ia-minera-card">
        <div class="ia-header">
            <div>
                <h3>IA Minera &mdash; Modelo Predictivo</h3>
                <p>${d.modelo} &middot; ${d.encuestas_entrenadas} encuestas entrenadas &middot; Cobertura: ${d.cobertura_datos}%</p>
            </div>
            <div class="ia-pred-pill" style="background:${claseColor[pred] || '#555'}">
                ${claseIcon[pred] || '&bull;'} Predicci&oacute;n: <strong>${pred}</strong>
            </div>
        </div>

        <div class="ia-probs">
            ${Object.entries(probs).map(([c, p]) => `
            <div class="ia-prob-item">
                <div class="ia-prob-bar-wrap">
                    <div class="ia-prob-bar" style="height:${p}%;background:${claseColor[c] || '#888'}"></div>
                </div>
                <span class="ia-prob-val" style="color:${claseColor[c]}">${p}%</span>
                <span class="ia-prob-label">${c}</span>
            </div>`).join('')}
        </div>

        <h4 class="ia-sub">Importancia de Factores (Information Gain)</h4>
        <div class="ia-factores">${factoresHtml}</div>

        ${sectorHtml ? `
        <h4 class="ia-sub">Predicci&oacute;n por Sector Geogr&aacute;fico</h4>
        <table class="ia-sector-tbl">
            <thead><tr><th>Sector</th><th style="color:#0f9f6e">&#10003; Acepta</th><th style="color:#d97706">&#9888; Neutro</th><th style="color:#c43d45">&#10007; Rechaza</th><th>n</th></tr></thead>
            <tbody>${sectorHtml}</tbody>
        </table>` : ''}

        <h4 class="ia-sub">Recomendaciones del Modelo</h4>
        <ul class="ia-recs">${recsHtml}</ul>

        <div class="ia-perfiles">
            <div class="ia-perfil ia-perfil-acept">
                <h5>&#10003; Perfil de Aceptaci&oacute;n</h5>
                ${(d.perfil_aceptacion || []).map(p => `<div class="ia-perf-row"><span>${p.factor}:</span><strong>${p.valor}</strong><em>${p.pct}%</em></div>`).join('') || '<p>Sin datos suficientes</p>'}
            </div>
            <div class="ia-perfil ia-perfil-rec">
                <h5>&#10007; Perfil de Rechazo</h5>
                ${(d.perfil_rechazo || []).map(p => `<div class="ia-perf-row"><span>${p.factor}:</span><strong>${p.valor}</strong><em>${p.pct}%</em></div>`).join('') || '<p>Sin datos suficientes</p>'}
            </div>
        </div>

        ${(() => {
            const kb = d.base_conocimiento;
            if (!kb || !kb.total_papers) return '';
            const papersHtml = (kb.papers || []).map((p, i) =>
                `<div class="kb-paper"><span class="kb-num">${i + 1}</span><div>
                    <strong>${p.autores || ''} (${p.anio || '?'})</strong>
                    <span class="kb-titulo"> ${p.titulo || ''}</span>
                    <em> ${p.revista || ''}</em>
                </div></div>`).join('');
            return `<div class="kb-box">
                <div class="kb-header">Base de Conocimiento Cient&iacute;fico &mdash; ${kb.total_papers} art&iacute;culos analizados
                    ${kb.updated_at ? `<small style="opacity:.7;font-weight:400"> &middot; actualizada: ${kb.updated_at}</small>` : ''}
                </div>
                <div class="kb-body">
                    <div class="kb-tags">
                        ${(kb.top_riesgos || []).map(r => `<span class="kb-tag kb-tag-rsk">${r}</span>`).join('')}
                        ${(kb.top_beneficios || []).map(b => `<span class="kb-tag kb-tag-ben">${b}</span>`).join('')}
                    </div>
                    <div class="kb-papers">${papersHtml}</div>
                </div>
            </div>`;
        })()}
    </div>`;
}

function renderPlanGemini(payload) {
    const box = document.getElementById('gemini-plan-box');
    if (!box) return;

    if (!payload?.ok) {
        box.innerHTML = `<div class="ia-error">&#9888; Plan Gemini: ${payload?.error || 'No disponible'}</div>`;
        return;
    }

    const p = payload.plan;
    const esc = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Marco regulatorio
    const regHtml = (p.marco_regulatorio || []).map(r =>
        `<div class="gm-reg-item"><strong>${esc(r.norma)}</strong><p>${esc(r.aplicacion)}</p></div>`
    ).join('');

    // Mejores prácticas
    const pracHtml = (p.mejores_practicas || []).map(pr => {
        const col = pr.nivel === 'Internacional' ? '#0e4eb0' : pr.nivel === 'Nacional' ? '#0f9f6e' : pr.nivel === 'Regional' ? '#7c3aed' : '#d97706';
        return `<div class="gm-prac-item">
            <span class="gm-nivel" style="background:${col}">${esc(pr.nivel)}</span>
            <strong>${esc(pr.practica)}</strong>
            <em>${esc(pr.referencia)}</em>
            <p>${esc(pr.aplicabilidad)}</p>
        </div>`;
    }).join('');

    // Ejes estratégicos
    const ejesHtml = (p.ejes_estrategicos || []).map(e =>
        `<div class="gm-eje">
            <div class="gm-eje-header"><strong>${esc(e.eje)}</strong></div>
            <p class="gm-eje-desc">${esc(e.descripcion)}</p>
            <div class="gm-eje-body">
                <div><span class="gm-lbl">Actores:</span> ${(e.actores || []).map(esc).join(', ')}</div>
                <ul>${(e.acciones || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul>
                <div class="gm-indicador"><strong>Indicador:</strong> ${esc(e.indicador)}</div>
            </div>
        </div>`
    ).join('');

    // Academia
    const ac = p.vinculacion_academia || {};
    const acadHtml = `
        <div class="gm-grid2">
            <div class="gm-sub-box">
                <h5>Instituciones sugeridas</h5>
                <ul>${(ac.instituciones_sugeridas || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
            <div class="gm-sub-box">
                <h5>L&iacute;neas de investigaci&oacute;n</h5>
                <ul>${(ac.lineas_investigacion || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
        </div>
        <div class="gm-sub-box" style="margin-top:10px">
            <h5>Programas propuestos</h5>
            <ul>${(ac.programas_propuestos || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>`;

    // Empleo y formación
    const emp = p.plan_empleo_formacion || {};
    const empHtml = `
        <div class="gm-grid2">
            <div class="gm-sub-box">
                <h5>Perfiles requeridos</h5>
                <ul>${(emp.perfiles_requeridos || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
            <div class="gm-sub-box">
                <h5>Instituciones de capacitaci&oacute;n</h5>
                <ul>${(emp.instituciones_capacitacion || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
        </div>
        <div class="gm-sub-box" style="margin-top:10px">
            <h5>Metas</h5>
            <ul>${(emp.metas || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>`;

    // Turismo y agricultura
    const ta = p.turismo_agricultura || {};
    const taHtml = `
        <div class="gm-grid2">
            <div class="gm-sub-box">
                <h5>Turismo comunitario</h5>
                <ul>${(ta.oportunidades_turismo || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
            <div class="gm-sub-box">
                <h5>Agricultura sostenible</h5>
                <ul>${(ta.oportunidades_agricultura || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
        </div>
        <p class="gm-sinergia"><strong>Sinergia:</strong> ${esc(ta.sinergias)}</p>`;

    // Cronograma
    const cronHtml = (p.cronograma_estrategico || []).map(f =>
        `<div class="gm-cron-row">
            <div class="gm-cron-lbl">${esc(f.fase)}<br><small>${esc(f.periodo)}</small></div>
            <ul>${(f.hitos || []).map(h => `<li>${esc(h)}</li>`).join('')}</ul>
        </div>`
    ).join('');

    // Recomendaciones finales
    const recsHtml = (p.recomendaciones_finales || []).map((r, i) =>
        `<li><strong>R${i + 1}:</strong> ${esc(r)}</li>`).join('');

    const motor = payload.motor || 'Gemini API';
    const isLocal = motor === 'Local Expert Engine';
    const mainTitle = isLocal ? 'IA Local &mdash; Plan Estrat&eacute;gico Parroquial' : 'Gemini IA &mdash; Plan Estrat&eacute;gico Integral';
    const badgeText = isLocal ? 'Motor Experto Local (Offline)' : 'Powered by Gemini';
    const headerBg = isLocal ? 'linear-gradient(135deg,#6f4e37,#a67c52)' : 'linear-gradient(135deg,#1a73e8,#0d47a1)';

    box.innerHTML = `
    <div class="gm-card">
        <div class="gm-header" style="background:${headerBg}">
            <div>
                <h3>${mainTitle}</h3>
                <p>${esc(p.titulo || '')} &middot; ${payload.total_encuestas} encuestas &middot; Sector: ${esc(payload.sector)}</p>
            </div>
            <span class="gm-badge">${esc(badgeText)}</span>
        </div>

        <div class="gm-narr">${esc(p.diagnostico_contextual)}</div>

        <div class="gm-section-title">&#128196; Marco Regulatorio Aplicable</div>
        <div class="gm-reg-list">${regHtml}</div>

        <div class="gm-section-title">&#127758; Mejores Pr&aacute;cticas Mineras</div>
        <div class="gm-prac-list">${pracHtml}</div>

        <div class="gm-section-title">&#127919; Ejes Estrat&eacute;gicos</div>
        ${ejesHtml}

        <div class="gm-section-title">&#127979; Vinculaci&oacute;n con la Academia</div>
        ${acadHtml}

        <div class="gm-section-title">&#128188; Empleo y Formaci&oacute;n T&eacute;cnica</div>
        ${empHtml}

        <div class="gm-section-title">&#127968; Turismo y Agricultura</div>
        ${taHtml}

        <div class="gm-section-title">&#128197; Cronograma Estrat&eacute;gico</div>
        ${cronHtml}

        <div class="gm-section-title">&#128161; Recomendaciones Finales</div>
        <ul class="gm-recs">${recsHtml}</ul>


        <div class="gm-conclusion">${esc(p.conclusion)}</div>
    </div>`;
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

// ==========================================
// NVIDIA NEMOTRON LLM
// ==========================================
async function generateLLMNvidia() {
    const sector = document.getElementById('llm-sector-filter')?.value ?? 'general';
    const btn = document.getElementById('llm-generate-btn');
    const loading = document.getElementById('llm-loading');
    const errBox = document.getElementById('llm-error');
    const results = document.getElementById('llm-results');

    if (btn) btn.disabled = true;
    if (loading) loading.classList.remove('hidden');
    if (errBox) errBox.classList.add('hidden');
    if (results) results.classList.add('hidden');

    try {
        const payload = await requestJson('llm_nvidia', { params: { sector } });
        
        if (!payload || !payload.ok) {
            throw new Error(payload?.error || 'Error desconocido de la API.');
        }

        renderLLMNvidia(payload);
        if (results) results.classList.remove('hidden');

    } catch (error) {
        if (errBox) {
            errBox.textContent = 'Error: ' + error.message;
            errBox.classList.remove('hidden');
        }
    } finally {
        if (btn) btn.disabled = false;
        if (loading) loading.classList.add('hidden');
    }
}

function renderLLMNvidia(payload) {
    // Resumen
    setText('llm-resumen', payload.resumen_ejecutivo);
    setText('llm-prediccion', payload.prediccion_global);

    const probs = payload.probabilidades_globales || {};
    setText('llm-prob-aceptacion', (probs.Aceptacion ?? '--') + '%');
    setText('llm-prob-neutral', (probs.Neutral ?? '--') + '%');
    setText('llm-prob-rechazo', (probs.Rechazo ?? '--') + '%');

    // Factores
    const factoresBox = document.getElementById('llm-factores');
    if (factoresBox) {
        const facts = payload.importancia_factores || [];
        factoresBox.innerHTML = facts.map(f => `<li><strong>${escapeHtml(f.factor)}:</strong> ${f.score_pct}% de peso predictivo</li>`).join('');
    }

    // Recomendaciones
    const recsBox = document.getElementById('llm-recomendaciones');
    if (recsBox) {
        const recs = payload.recomendaciones_ia || [];
        recsBox.innerHTML = recs.map(r => `<li>${escapeHtml(r)}</li>`).join('');
    }

    // Plan
    const plan = payload.plan_estrategico || {};
    setText('llm-plan-titulo', plan.titulo || 'Plan Estratégico');
    setText('llm-plan-diagnostico', plan.diagnostico_contextual || '');

    const accionesBox = document.getElementById('llm-plan-acciones');
    if (accionesBox) {
        const acciones = plan.recomendaciones_finales || [];
        accionesBox.innerHTML = acciones.map(a => `<li>${escapeHtml(a)}</li>`).join('');
    }
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
    const canvas = document.getElementById('chart-tendencia');
    if (!canvas || !tendencia || tendencia.length === 0 || typeof Chart === 'undefined') return;
    destroyChart('tendencia');

    const ctx = canvas.getContext('2d');

    // Gradiente para las barras
    const gradientBar = ctx.createLinearGradient(0, 0, 0, 400);
    gradientBar.addColorStop(0, 'rgba(14, 78, 176, 0.9)');
    gradientBar.addColorStop(1, 'rgba(14, 78, 176, 0.3)');

    // Gradiente para la linea de tendencia
    const gradientLine = ctx.createLinearGradient(0, 0, 0, 400);
    gradientLine.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    gradientLine.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    analisisState.charts['tendencia'] = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: tendencia.map(t => t.dia),
            datasets: [
                {
                    label: 'Encuestas por d\u00EDa',
                    data: tendencia.map(t => t.total),
                    backgroundColor: gradientBar,
                    hoverBackgroundColor: 'rgba(14, 78, 176, 1)',
                    borderColor: 'rgba(14, 78, 176, 1)',
                    borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
                    borderRadius: 6,
                    borderSkipped: false,
                    yAxisID: 'y',
                    order: 2,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Apertura a inversi\u00F3n (%)',
                    data: tendencia.map(t => t.apertura_pct),
                    type: 'line',
                    borderColor: '#10B981',
                    borderWidth: 3,
                    backgroundColor: gradientLine,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#10B981',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#10B981',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y2',
                    order: 1
                },
            ],
        },
        options: {
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 12,
                        font: { size: 11, weight: '500' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.9)',
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    boxPadding: 4,
                    usePointStyle: true,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + (context.dataset.yAxisID === 'y2' ? '%' : '');
                            }
                            return label;
                        }
                    }
                },
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#6B7280', font: { size: 11 } }
                },
                y: {
                    position: 'left',
                    title: { display: true, text: 'Nº Encuestas', font: { size: 11, weight: '600' }, color: '#6B7280' },
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false, borderDash: [4, 4] },
                    ticks: { color: '#6B7280', font: { size: 11 } },
                    beginAtZero: true
                },
                y2: {
                    position: 'right',
                    max: 100,
                    title: { display: true, text: 'Apertura (%)', font: { size: 11, weight: '600' }, color: '#6B7280' },
                    grid: { display: false, drawBorder: false },
                    ticks: { callback: v => v + '%', color: '#6B7280', font: { size: 11 } },
                    beginAtZero: true
                },
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            },
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
let radarDimChart = null;
function renderRadarDimensiones(dimensiones) {
    const ctx = document.getElementById('chart-radar-dimensiones');
    if (!ctx || !dimensiones || !dimensiones.length) return;
    if (radarDimChart) { radarDimChart.destroy(); radarDimChart = null; }
    const labels = dimensiones.map(d => d.titulo);
    // Usar índice neto (-100 a +100) para concordar con el resto de gráficas
    const vals = dimensiones.map(d => d.sentimiento.indice ?? 0);
    const pointColors = dimensiones.map(d => {
        const idx = d.sentimiento.indice ?? 0;
        return idx >= 10 ? '#0f9f6e' : (idx <= -10 ? '#c43d45' : '#d97706');
    });
    radarDimChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: 'Índice Neto de Sentimiento (pts)',
                data: vals,
                backgroundColor: 'rgba(56, 189, 248, 0.25)',
                borderColor: '#38bdf8',
                borderWidth: 2,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 8,
            }],
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: -100, max: 100,
                    ticks: {
                        stepSize: 25,
                        font: { size: 13 },
                        color: 'rgba(255,255,255,0.7)',
                        backdropColor: 'transparent',
                        z: 10,
                        callback: v => (v > 0 ? '+' : '') + v,
                    },
                    pointLabels: {
                        font: { size: 15, weight: 'bold' },
                        color: '#f8fafc',
                    },
                    grid: { color: 'rgba(255,255,255,0.15)', circular: true },
                    angleLines: { color: 'rgba(255,255,255,0.15)' },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx2 => {
                            const v = ctx2.raw;
                            return ` Índice: ${v > 0 ? '+' : ''}${v} pts`;
                        },
                    },
                },
            },
            animation: { duration: 800, easing: 'easeOutQuart' },
        },
    });
}

// ============================================================
//  TAB PREGUNTAS — graficas por pregunta de encuesta
// ============================================================
const preguntasCharts = {};

async function loadPreguntas() {
    const sector = document.getElementById('preguntas-sector-filter')?.value ?? 'general';
    setPreguntasUI('loading');
    try {
        const payload = await requestJson('preguntas', { params: { sector } });
        const data = payload.preguntas;
        if (!data || data.total === 0) {
            setPreguntasUI('empty');
            return;
        }
        renderPreguntas(data);
        setPreguntasUI('content');
    } catch (err) {
        setPreguntasUI('empty');
        console.error('Error en preguntas:', err);
    }
}

function setPreguntasUI(mode) {
    document.getElementById('preguntas-loading')?.classList.toggle('hidden', mode !== 'loading');
    document.getElementById('preguntas-empty')?.classList.toggle('hidden', mode !== 'empty');
    document.getElementById('preguntas-content')?.classList.toggle('hidden', mode !== 'content');
}

// Paleta amplia y variada — se rota aleatoriamente en cada render
const _PALETA_BASE = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#14B8A6',
    '#6366F1', '#A855F7', '#22C55E', '#FB923C', '#E11D48',
    '#0EA5E9', '#D97706', '#16A34A', '#7C3AED', '#DC2626',
];
let _paletaOffset = 0;

function getChartColors(n) {
    // Cada llamada rota el offset para que cada grafica tenga colores distintos
    const palette = [..._PALETA_BASE];
    // Shuffle con offset actual
    const rotated = [...palette.slice(_paletaOffset), ...palette.slice(0, _paletaOffset)];
    _paletaOffset = (_paletaOffset + Math.max(2, n)) % palette.length;
    return rotated.slice(0, n);
}

function randomizePaletaOffset() {
    _paletaOffset = Math.floor(Math.random() * _PALETA_BASE.length);
}

function renderPreguntas(data) {
    // Rotar paleta aleatoriamente en cada render para colores frescos
    randomizePaletaOffset();
    // Destroy old charts
    Object.values(preguntasCharts).forEach(c => c && c.destroy());
    Object.keys(preguntasCharts).forEach(k => delete preguntasCharts[k]);

    const container = document.getElementById('preguntas-content');
    container.innerHTML = '';

    data.grupos.forEach(grupo => {
        if (!grupo.preguntas || !grupo.preguntas.length) return;

        const section = document.createElement('div');
        section.className = 'preguntas-grupo';
        section.innerHTML = `<h3 class="preguntas-grupo-titulo">${escapeHtml(grupo.titulo)}</h3>
            <div class="preguntas-grid" id="pg-${escapeHtml(grupo.id)}"></div>`;
        container.appendChild(section);

        const grid = section.querySelector('.preguntas-grid');

        grupo.preguntas.forEach(preg => {
            if (!preg.distribucion || !preg.distribucion.length) return;

            const cardId = 'pc-' + preg.campo;
            const canvasId = 'canvas-' + preg.campo;
            const n = preg.respondentes ?? 0;

            const card = document.createElement('div');
            card.className = 'preguntas-card' + (preg.tipo === 'donut' ? ' preguntas-card-sm' : '');
            card.innerHTML = `
                <p class="preguntas-card-q">${escapeHtml(preg.pregunta)}</p>
                <span class="preguntas-n">${n} respuesta${n !== 1 ? 's' : ''}</span>
                <div class="preguntas-chart-wrap">
                    <canvas id="${canvasId}"></canvas>
                </div>`;
            grid.appendChild(card);

            const ctx = card.querySelector('canvas');
            if (!ctx) return;

            const labels = preg.distribucion.map(d => d.label);
            const counts = preg.distribucion.map(d => d.count);
            const colors = getChartColors(labels.length);

            if (preg.tipo === 'donut') {
                preguntasCharts[preg.campo] = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels,
                        datasets: [{ data: counts, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }],
                    },
                    options: {
                        cutout: '55%',
                        plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 12 } },
                            tooltip: { callbacks: { label: ctx2 => ` ${ctx2.label}: ${ctx2.raw} (${preg.distribucion[ctx2.dataIndex]?.pct ?? 0}%)` } },
                        },
                        animation: { duration: 600 },
                    },
                });
            } else {
                // Horizontal bar — ASCII labels only for Chart.js canvas
                const safeLabels = labels.map(l => l.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 30));
                preguntasCharts[preg.campo] = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: safeLabels,
                        datasets: [{
                            data: counts,
                            backgroundColor: colors,
                            borderRadius: 4,
                            borderWidth: 0,
                        }],
                    },
                    options: {
                        indexAxis: 'y',
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: ctx2 => ` ${labels[ctx2.dataIndex]}: ${ctx2.raw} (${preg.distribucion[ctx2.dataIndex]?.pct ?? 0}%)` } },
                        },
                        scales: {
                            x: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                            y: { ticks: { font: { size: 10 } } },
                        },
                        animation: { duration: 600 },
                    },
                });
            }
        });
    });
}

// ============================================================
//  LISTADO DE ENCUESTAS EN DASHBOARD
// ============================================================
let _dashSurveys = [];

async function loadDashboardSurveys(sector) {
    try {
        const payload = await requestJson('surveys', { params: { sector: sector || 'general', limit: 500 } });
        let backendSurveys = payload.surveys || [];

        const pending = getPendingSurveys().map(p => ({
            ...p,
            survey_status: 'Pendiente (Offline)',
            id: p.client_uuid || Math.random().toString(36).substring(7)
        }));

        let allSurveys = [...pending, ...backendSurveys];
        if (sector && sector !== 'general') {
            allSurveys = allSurveys.filter(s => s.sector === sector);
        }

        _dashSurveys = allSurveys;
        renderDashboardSurveys(_dashSurveys);
        const search = document.getElementById('dash-survey-search');
        if (search) {
            search.oninput = () => {
                const q = search.value.toLowerCase().trim();
                const filtered = q
                    ? _dashSurveys.filter(s =>
                        (s.sector || '').toLowerCase().includes(q) ||
                        (s.community || '').toLowerCase().includes(q) ||
                        (s.surveyor_name || '').toLowerCase().includes(q) ||
                        (s.occupation || '').toLowerCase().includes(q) ||
                        (s.primary_problem || '').toLowerCase().includes(q))
                    : _dashSurveys;
                renderDashboardSurveys(filtered);
            };
        }
    } catch (e) {
        console.error('Error cargando listado de encuestas:', e);
    }
}

function renderDashboardSurveys(surveys) {
    const tbody = document.getElementById('dash-surveys-body');
    const count = document.getElementById('dash-survey-count');
    if (!tbody) return;

    if (count) count.textContent = surveys.length + ' registros';

    if (!surveys.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="padding:20px;text-align:center;color:#A67C52;">Sin encuestas registradas en este sector.</td></tr>';
        return;
    }

    const statusColors = {
        'sincronizada': '#0f9f6e',
        'revisada': '#0e4eb0',
        'observada': '#d97706',
        'Pendiente (Offline)': '#6b7280'
    };
    const statusLabels = {
        'sincronizada': '✓ Sincronizada',
        'revisada': '✓ Revisada',
        'observada': '⚠ Observada',
        'Pendiente (Offline)': '⌛ Pendiente'
    };

    tbody.innerHTML = surveys.map((s, i) => {
        const fecha = s.survey_date ? s.survey_date.split(' ')[0] : '—';
        const statusColor = statusColors[s.survey_status] || '#888';
        const statusLabel = statusLabels[s.survey_status] || (s.survey_status || '—');
        const rowBg = i % 2 === 0 ? '#fff' : '#fdf8f2';
        return `<tr style="background:${rowBg};border-bottom:1px solid #f0e8db;">
            <td style="padding:7px 10px;color:#888;font-size:.78rem;">${s.id}</td>
            <td style="padding:7px 10px;white-space:nowrap;">${escapeHtml(fecha)}</td>
            <td style="padding:7px 10px;font-weight:600;color:#5a3e28;">${escapeHtml(s.sector || '—')}</td>
            <td style="padding:7px 10px;">${escapeHtml(s.community || '—')}</td>
            <td style="padding:7px 10px;">${escapeHtml(s.surveyor_name || '—')}</td>
            <td style="padding:7px 10px;">${escapeHtml(s.respondent_gender || '—')}</td>
            <td style="padding:7px 10px;">${escapeHtml(s.age_range || '—')}</td>
            <td style="padding:7px 10px;">${escapeHtml(s.occupation || '—')}</td>
            <td style="padding:7px 10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${escapeHtml(s.primary_problem || '')}">${escapeHtml(s.primary_problem || '—')}</td>
            <td style="padding:7px 10px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${escapeHtml(s.political_climate || '')}">${escapeHtml(s.political_climate || '—')}</td>
            <td style="padding:7px 10px;">${escapeHtml(s.investment_acceptance || '—')}</td>
            <td style="padding:7px 10px;white-space:nowrap;">
                <span style="background:${statusColor}18;color:${statusColor};
                    padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:700;">
                    ${escapeHtml(statusLabel)}
                </span>
            </td>
        </tr>`;
    }).join('');
}


// ============================================================
//  REPORTE TECNICO-CIENTIFICO - HTML + BLOB + PRINT
// ============================================================

async function generateAnalisisPDF() {
    const data = analisisState.data;
    if (!data) { alert('Carga primero el análisis antes de exportar.'); return; }

    const btn = document.getElementById('analisis-pdf-btn');
    if (btn) { btn.disabled = true; btn.textContent = '... Generando'; }

    try {
        const r = data.resumen_ejecutivo || {};
        const sg = data.sentimiento_global || {};

        const sEl = document.getElementById('analisis-sector-filter');
        const sector = sEl?.selectedOptions[0]?.text || 'Todo San Bartolomé';
        const sVal = sEl?.value || 'general';

        // Obtener datos IA minera (si ya están en estado úsalos, si no pedir)
        let iaData = analisisState.iaMinera;
        if (!iaData) {
            try { iaData = await requestJson('ia_minera', { params: { sector: sVal } }); } catch { iaData = null; }
        }

        const now = new Date();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const fecha = `${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;

        // --- Captura graficas ---
        async function cap(id) {
            const el = document.getElementById(id);
            if (!el) return null;
            try {
                const c = await html2canvas(el, { backgroundColor: '#1e2235', scale: 2, useCORS: true, logging: false });
                return c.toDataURL('image/png');
            } catch { return null; }
        }
        const [imgDonut, imgRadar, imgTendencia] = await Promise.all([
            cap('chart-sentimiento-global'),
            cap('chart-radar-dimensiones'),
            cap('chart-tendencia'),
        ]);
        const imgsDim = [];
        for (let i = 0; i < (data.dimensiones || []).length; i++) {
            imgsDim.push(await cap('chart-dim-' + i));
        }

        // --- Fetch preguntas ---
        let pregData = null;
        try {
            const pp = await requestJson('preguntas', { params: { sector: sVal } });
            if (pp?.preguntas?.total > 0) pregData = pp.preguntas;
        } catch { /* sin preguntas */ }

        // --- Helpers ---
        const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const p = v => (Number(v) || 0).toFixed(1) + '%';
        const n = v => Number(v) || 0;
        const sgn = v => { const x = n(v); return (x >= 0 ? '+' : '') + x; };

        function sentColor(i) { const x = n(i); return x >= 15 ? '#0f9f6e' : x <= -15 ? '#c43d45' : '#d97706'; }
        function sentLabel(i) { const x = n(i); return x >= 15 ? 'FAVORABLE' : x <= -15 ? 'CRÍTICO' : 'AMBIVALENTE'; }

        function barRow(label, pctVal, count, color) {
            const w = Math.min(100, Math.max(0, n(pctVal)));
            const cntTxt = count !== undefined ? ` <small style="color:#888">(n=${n(count)})</small>` : '';
            return `<div class="br">
              <span class="bl">${esc(label)}</span>
              <div class="bt"><div class="bf" style="width:${w}%;background:${color}"></div></div>
              <span class="bp" style="color:${color}">${w.toFixed(1)}%${cntTxt}</span>
            </div>`;
        }

        // --- Dimensiones ---
        let dimsHtml = '';
        (data.dimensiones || []).forEach((dim, i) => {
            const ds = dim.sentimiento || {};
            const col = sentColor(ds.indice);
            const lbl = sentLabel(ds.indice);
            const img = imgsDim[i] ? `<div class="dim-img-wrap"><img src="${imgsDim[i]}"></div>` : '';
            const bars = (dim.distribucion?.items || []).slice(0, 8).map(it => barRow(it.label, it.pct, undefined, col)).join('');
            dimsHtml += `
            <div class="dim-card no-break">
              <div class="dim-h" style="background:${col}">
                <span class="dim-name">${esc(dim.nombre)}</span>
                <span class="dim-badge">${lbl} &nbsp; ${sgn(ds.indice)} pts</span>
              </div>
              <div class="dim-stats">
                <span style="color:#0f9f6e">&#9650; Positivo: ${p(ds.positivo_pct)}</span>
                <span style="color:#d97706">&#9679; Neutro: ${p(ds.neutro_pct)}</span>
                <span style="color:#c43d45">&#9660; Negativo: ${p(ds.negativo_pct)}</span>
              </div>
              <div class="dim-body">${img}<div class="dim-bars">${bars}</div></div>
            </div>`;
        });

        // --- Preguntas ---
        let pregHtml = '';
        let chartsCode = '';
        let cIdx = 0;
        if (pregData) {
            (pregData.grupos || []).forEach(g => {
                if (!g.preguntas?.length) return;
                pregHtml += `<div class="pg-grupo"><h3 class="pg-gtit">${esc(g.titulo)}</h3><div class="pg-grid">`;
                g.preguntas.forEach(preg => {
                    if (!preg.distribucion?.length) return;
                    const cid = 'c' + (cIdx++);
                    const isDo = preg.tipo === 'donut';
                    const clab = preg.distribucion.map(d => d.label);
                    const cdat = preg.distribucion.map(d => d.count);
                    const ctype = isDo ? 'doughnut' : 'bar';
                    // Altura dinámica para barras horizontales: ~34px por categoría
                    const barH = Math.max(140, (clab.length * 34) + 40);
                    const wrapH = isDo ? 200 : barH;
                    const cardMinH = isDo ? 220 : (barH + 70);
                    pregHtml += `<div class="pg-card no-break" style="min-height:${cardMinH}px;"><p class="pg-q">${esc(preg.pregunta)}</p><p class="pg-n">n = ${n(preg.respondentes)} respuestas</p><div style="position:relative;width:100%;max-width:100%;overflow:hidden;height:${wrapH}px;"><canvas id="${cid}"></canvas></div></div>`;
                    // Acortar etiquetas largas para que no desborden el eje
                    const safeLab = clab.map(l => { const s = String(l); return s.length > 28 ? s.slice(0, 27) + '…' : s; });
                    const legendCfg = isDo ? '{display:true,position:"bottom"}' : '{display:false}';
                    const optsCommon = 'responsive:true,maintainAspectRatio:false,layout:{padding:4},plugins:{legend:' + legendCfg + '}';
                    if (isDo) {
                        chartsCode += 'new Chart(document.getElementById("' + cid + '"),{type:"doughnut",data:{labels:' + JSON.stringify(safeLab) + ',datasets:[{data:' + JSON.stringify(cdat) + ',backgroundColor:["#0e4eb0","#0f9f6e","#c43d45","#d97706","#7c3aed","#ec4899","#f59e0b","#14b8a6"]}]},options:{' + optsCommon + '}});';
                    } else {
                        // Barras horizontales: las etiquetas van en el eje Y, sin riesgo de cortarse
                        chartsCode += 'new Chart(document.getElementById("' + cid + '"),{type:"bar",data:{labels:' + JSON.stringify(safeLab) + ',datasets:[{data:' + JSON.stringify(cdat) + ',backgroundColor:["#0e4eb0","#0f9f6e","#c43d45","#d97706","#7c3aed","#ec4899","#f59e0b","#14b8a6"]}]},options:{' + optsCommon + ',indexAxis:"y",scales:{x:{beginAtZero:true,ticks:{font:{size:9}}},y:{ticks:{font:{size:9},autoSkip:false}}}}});';
                    }
                });
                pregHtml += '</div></div>';
            });
        }

        // --- Percepciones mineras ---
        const benHtml = (data.beneficios_mineros || []).map(it => barRow(it.label, it.pct, it.n, '#0f9f6e')).join('');
        const rskHtml = (data.riesgos_mineros || []).map(it => barRow(it.label, it.pct, it.n, '#c43d45')).join('');
        const conocHtml = (data.conocimiento_minero || []).map(it => {
            const kp = n(it.pct);
            const kc = kp >= 60 ? '#0f9f6e' : kp >= 30 ? '#d97706' : '#c43d45';
            return `<div class="krow"><span class="kdot" style="background:${kc}"></span>
              <span>${esc(it.label)}</span><strong style="color:${kc}">${kp.toFixed(1)}%</strong></div>`;
        }).join('');

        // --- Correlaciones ---
        const corrHtml = (data.correlaciones || []).map(c => `
          <div class="corr no-break">
            <strong>${esc(c.titulo)}</strong>
            <p>${esc(c.descripcion || c.interpretacion || '')}</p>
          </div>`).join('');

        // --- Sector dist ---
        const sectorHtml = (data.distribucion_por_sector || []).map(it => barRow(it.label, it.pct, it.n, '#0e4eb0')).join('');

        // --- Nivel / color ---
        const nvlColor = { verde: '#0f9f6e', amarillo: '#d97706', rojo: '#c43d45' }[r.color_sentimiento] || '#555';
        const indice = n(r.indice_global);

        // --- Conclusion mejorada ---
        const dimCriticas = (data.dimensiones || []).filter(d => n(d.sentimiento?.indice) <= -15).map(d => d.titulo).filter(Boolean);
        const dimFav = (data.dimensiones || []).filter(d => n(d.sentimiento?.indice) >= 15).map(d => d.titulo).filter(Boolean);
        const critTxt = dimCriticas.length ? `Las dimensiones que requieren atenci&oacute;n urgente son: <strong>${dimCriticas.join(', ')}</strong>.` : '';
        const favTxt = dimFav.length ? `Las &aacute;reas con mayor favorabilidad comunitaria son: <strong>${dimFav.join(', ')}</strong>.` : '';

        const concl = `
          <p>El an&aacute;lisis de las encuestas comunitarias en la zona <strong>"${esc(sector)}"</strong> revela
          un &iacute;ndice neto de sentimiento de <strong>${sgn(indice)} puntos</strong>, categorizado como
          <strong style="color:${nvlColor}">${esc(r.nivel_sentimiento)}</strong> dentro de la escala
          de &minus;100 a +100 puntos. Esta clasificaci&oacute;n indica que el ${p(r.negativo_global)} de la ciudadan&iacute;a
          expresa preocupaci&oacute;n, rechazo o insatisfacci&oacute;n frente a las dimensiones evaluadas, mientras
          que &uacute;nicamente el ${p(r.positivo_global)} presenta una posici&oacute;n favorable.</p>
          <p style="margin-top:12px">La problem&aacute;tica que mayor preocupaci&oacute;n genera en la ciudadan&iacute;a es
          <strong>"${esc(r.problema_principal)}"</strong>. ${critTxt} ${favTxt}</p>
          <p style="margin-top:12px">Frente a este escenario, se plantean las siguientes l&iacute;neas de acci&oacute;n:</p>
          <ul class="recomend">
            <li>Priorizar intervenciones de pol&iacute;tica p&uacute;blica en las dimensiones con &iacute;ndice cr&iacute;tico, articulando
                respuestas concretas a las problem&aacute;ticas de mayor recurrencia en las encuestas.</li>
            <li>Fortalecer la confianza institucional mediante espacios de di&aacute;logo comunitario y rendici&oacute;n
                de cuentas transparente entre las autoridades del GAD y la ciudadan&iacute;a.</li>
            <li>Implementar programas de socializaci&oacute;n sobre actividad minera responsable,
                especialmente en sectores con bajo nivel de conocimiento (sem&aacute;foro rojo),
                garantizando el acceso a informaci&oacute;n objetiva, t&eacute;cnica y en lenguaje accesible.</li>
            <li>Dise&ntilde;ar estrategias diferenciadas por sector geogr&aacute;fico, considerando las brechas de
                sentimiento detectadas entre zonas con mayor y menor participaci&oacute;n en el levantamiento.</li>
            <li>Mantener un sistema de monitoreo continuo mediante encuestas peri&oacute;dicas que permita
                evaluar el impacto de las intervenciones y ajustar las estrategias de acuerdo con la
                evoluci&oacute;n del sentimiento comunitario.</li>
          </ul>`;

        // ============================================================
        //  PÁGINAS COMPLEMENTARIAS - EVITA ANIDAR TEMPLATE LITERALS (EVITA ERRORES EN EL EDITOR)
        // ============================================================

        // Page 7B: Metodología
        let p7b_html = '';
        if (iaData?.metodologia) {
            const met = iaData.metodologia;
            const modelos = (met.fase_clasificacion?.modelos || []).map(m =>
                `<tr><td><strong>${esc(m.nombre)}</strong></td><td>${esc(m.arquitectura || '')}</td>
               <td style="text-align:center">${m.precision ? m.precision + '%' : 'N/A'}</td>
               <td>${esc(m.uso)}</td></tr>`
            ).join('');
            const componentes = (met.fase_analisis?.componentes || []).map(c =>
                `<li style="margin-bottom:6px;font-size:9.5pt">${esc(c)}</li>`).join('');
            const proceso = (met.fase_plan_estrategico?.proceso || []).map((p, i) =>
                `<div style="display:flex;gap:12px;margin-bottom:8px;align-items:flex-start">
                 <div style="min-width:22px;height:22px;background:#0e4eb0;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8pt;font-weight:800">${i + 1}</div>
                 <span style="font-size:9.5pt;color:#334155;padding-top:2px">${esc(p)}</span>
               </div>`).join('');
            const variables = (met.fase_recoleccion?.variables_clave || []).join(', ');
            const temas = (met.fase_vectorizacion?.temas_identificados || []).join(', ');
            const limitaciones = (met.limitaciones || []).map(l =>
                `<li style="font-size:9pt;color:#64748b;margin-bottom:5px">${esc(l)}</li>`).join('');
            p7b_html = `
<div class="page" style="page-break-before:always">
<style>
.met-hdr{font-size:11pt;font-weight:800;color:#0a2a6e;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid #0a2a6e}
.met-tbl{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:14px}
.met-tbl th{background:#0a2a6e;color:#fff;padding:7px 10px;font-size:8.5pt;text-align:left}
.met-tbl td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}
.met-fase{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:12px}
.met-fase h4{font-size:10pt;font-weight:800;color:#0e4eb0;margin:0 0 8px}
.met-fase p{font-size:9.5pt;color:#334155;margin:0 0 6px;line-height:1.6}
.met-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
</style>
  <div style="background:linear-gradient(135deg,#0a2a6e,#1155bb);color:#fff;padding:22px 40px;border-radius:0">
    <h2 style="font-size:16pt;font-weight:900;margin:0 0 4px">8A. Metodolog&iacute;a del Estudio</h2>
    <p style="opacity:.8;font-size:9.5pt">${esc(met.nombre || '')} &middot; ${met.fase_recoleccion?.total_registros || 0} registros procesados</p>
  </div>

  <div class="met-hdr">Descripci&oacute;n del Proceso Metodol&oacute;gico</div>
  <div class="met-grid2">
    <div class="met-fase">
      <h4>&#128196; Fase 1 &mdash; Recopilaci&oacute;n de Datos</h4>
      <p>${esc(met.fase_recoleccion?.descripcion || '')}</p>
      <p><strong>Instrumento:</strong> ${esc(met.fase_recoleccion?.instrumento || '')}</p>
      <p style="font-size:8.5pt;color:#64748b"><strong>Variables clave:</strong> ${esc(variables)}</p>
    </div>
    <div class="met-fase">
      <h4>&#128202; Fase 2 &mdash; Vectorizaci&oacute;n TF-IDF</h4>
      <p>${esc(met.fase_vectorizacion?.descripcion || '')}</p>
      <p><strong>T&eacute;cnica:</strong> ${esc(met.fase_vectorizacion?.tecnica || '')}</p>
      <p style="font-size:8.5pt;color:#64748b"><strong>Temas identificados:</strong> ${esc(temas)}</p>
    </div>
    <div class="met-fase">
      <h4>&#129504; Fase 3 &mdash; Clasificaci&oacute;n IA</h4>
      <p>${esc(met.fase_clasificacion?.descripcion || '')}</p>
      <p><strong>Variable objetivo:</strong> ${esc(met.fase_clasificacion?.variable_objetivo || '')}</p>
      <p><strong>Registros de entrenamiento:</strong> ${met.fase_clasificacion?.n_entrenamiento || 0}</p>
    </div>
    <div class="met-fase">
      <h4>&#128269; Fase 4 &mdash; An&aacute;lisis Estad&iacute;stico</h4>
      <p>${esc(met.fase_analisis?.descripcion || '')}</p>
      <ul style="padding-left:16px;margin:6px 0">${componentes}</ul>
    </div>
  </div>

  <div class="met-hdr">Modelos de Inteligencia Artificial Utilizados</div>
  <table class="met-tbl">
    <tr><th>Modelo</th><th>Arquitectura / Par&aacute;metros</th><th>Precisi&oacute;n</th><th>Uso</th></tr>
    ${modelos}
  </table>

  <div class="met-hdr">Proceso de Generaci&oacute;n del Plan Estrat&eacute;gico</div>
  ${proceso}

  <div class="met-hdr">Limitaciones del Estudio</div>
  <ul style="padding-left:20px">${limitaciones}</ul>

  <div class="pie"><span>Metodolog&iacute;a &middot; IA Minera &middot; San Bartolom&eacute;</span><span>${fecha}</span></div>
</div>`;
        }

        // Page 8: IA Minera
        let p8_html = '';
        if (iaData?.ok) {
            const ia = iaData;
            const claseColor = { 'Aceptacion': '#0f9f6e', 'Neutral': '#d97706', 'Rechazo': '#c43d45' };
            const pred = ia.prediccion_global || 'Sin datos';
            const probs = ia.probabilidades_globales || {};
            const predColor = claseColor[pred] || '#555';

            const factoresHtml = (ia.importancia_factores || []).slice(0, 6).map(f => {
                const barColor = f.score_pct > 60 ? '#0e4eb0' : f.score_pct > 30 ? '#d97706' : '#94a3b8';
                return `<div class="ia-row">
      <span class="ia-flabel">${esc(f.factor)}</span>
      <div class="ia-fbar-w"><div class="ia-fbar" style="width:${f.score_pct}%;background:${barColor}"></div></div>
      <span class="ia-fscore">${f.score_pct}%</span>
    </div>`;
            }).join('');

            const sectorHtml2 = (ia.prediccion_por_sector || []).slice(0, 6).map(s =>
                `<tr><td>${esc(s.sector)}</td>
     <td style="color:#0f9f6e;font-weight:700">${s.Aceptacion}%</td>
     <td style="color:#d97706;font-weight:700">${s.Neutral}%</td>
     <td style="color:#c43d45;font-weight:700">${s.Rechazo}%</td>
     <td style="color:#94a3b8">${s.n}</td></tr>`
            ).join('');

            const recsHtml2 = (ia.recomendaciones_ia || []).map((rec, i) =>
                `<li><strong>R${i + 1}:</strong> ${esc(rec)}</li>`).join('');

            const perfilAcHtml = (ia.perfil_aceptacion || []).map(p =>
                `<div class="ia-prow"><span>${esc(p.factor)}:</span> <strong>${esc(p.valor)}</strong> <em>${p.pct}%</em></div>`).join('') || '<p style="color:#888;font-size:9pt">Sin datos suficientes</p>';
            const perfilReHtml = (ia.perfil_rechazo || []).map(p =>
                `<div class="ia-prow"><span>${esc(p.factor)}:</span> <strong>${esc(p.valor)}</strong> <em>${p.pct}%</em></div>`).join('') || '<p style="color:#888;font-size:9pt">Sin datos suficientes</p>';

            const probBars = Object.entries(probs).map(([c, pv]) =>
                `<div class="ia-pitem">
      <div class="ia-pbar-w"><div class="ia-pbar" style="height:${pv}%;background:${claseColor[c] || '#888'}"></div></div>
      <span class="ia-pval" style="color:${claseColor[c] || '#888'}">${pv}%</span>
      <span class="ia-plabel">${esc(c)}</span>
    </div>`).join('');

            p8_html = `
<style>
.ia-cover{background:linear-gradient(135deg,#0a2a6e,#1155bb);color:#fff;padding:28px 42px;border-radius:0}
.ia-cover h2{font-size:18pt;font-weight:900;margin-bottom:4px}
.ia-cover p{font-size:10pt;opacity:.8}
.ia-pred-badge{display:inline-block;padding:8px 20px;border-radius:24px;font-weight:800;
  font-size:11pt;color:#fff;margin-top:10px}
.ia-kpi3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0 20px}
.ia-kpi-c{border-radius:9px;padding:14px;text-align:center;color:#fff}
.ia-kpi-c .v{font-size:20pt;font-weight:900;display:block;margin-bottom:3px}
.ia-kpi-c .l{font-size:8pt;opacity:.9;text-transform:uppercase;font-weight:600}
.ia-probs-row{display:flex;justify-content:center;gap:20px;margin-bottom:20px;
  padding:16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0}
.ia-pitem{display:flex;flex-direction:column;align-items:center;gap:6px}
.ia-pbar-w{width:44px;height:80px;background:#e2e8f0;border-radius:6px;
  display:flex;align-items:flex-end;overflow:hidden}
.ia-pbar{width:100%;border-radius:6px 6px 0 0}
.ia-pval{font-size:13pt;font-weight:800}
.ia-plabel{font-size:9pt;color:#64748b;font-weight:600}
.ia-st2{font-size:11pt;font-weight:800;color:#0a2a6e;margin:16px 0 8px;
  padding-bottom:5px;border-bottom:2px solid #0a2a6e}
.ia-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;font-size:9.5pt}
.ia-flabel{width:175px;flex-shrink:0;color:#334155;font-weight:500}
.ia-fbar-w{flex:1;height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden}
.ia-fbar{height:100%;border-radius:5px}
.ia-fscore{width:38px;text-align:right;font-weight:700;font-size:9pt;color:#475569}
.ia-tbl{width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:16px}
.ia-tbl th{background:#0a2a6e;color:#fff;padding:8px 12px;font-size:9pt;text-align:left}
.ia-tbl td{padding:8px 12px;border-bottom:1px solid #f1f5f9;vertical-align:top}
.ia-recs2{padding-left:20px;color:#334155;margin-bottom:16px}
.ia-recs2 li{margin-bottom:8px;font-size:9.5pt;line-height:1.65}
.ia-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
.ia-pcard{border-radius:8px;padding:14px 16px}
.ia-pcard h5{font-size:10pt;font-weight:800;margin:0 0 8px}
.ia-prow{display:flex;align-items:center;gap:8px;font-size:9pt;
  color:#475569;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.05)}
.ia-prow span{flex:1}.ia-prow strong{color:#1e293b;font-weight:700}
.ia-prow em{font-style:normal;font-size:8.5pt;color:#64748b;margin-left:auto}
.ia-modelo-note{font-size:8.5pt;color:#94a3b8;text-align:center;margin-top:12px;font-style:italic}
</style>
<div class="page">
  <div class="ia-cover">
    <h2>8. IA Minera &mdash; Modelo Predictivo de Aceptaci&oacute;n</h2>
    <p>Clasificador Naive Bayes entrenado con los datos reales de encuestas &middot; ${ia.encuestas_entrenadas} registros &middot; Cobertura: ${ia.cobertura_datos}%</p>
    <div class="ia-pred-badge" style="background:${predColor}">
      Predicci&oacute;n global: ${esc(pred)}
    </div>
  </div>

  <div class="ia-kpi3">
    <div class="ia-kpi-c" style="background:#0e4eb0"><span class="v">${ia.total_encuestas}</span><span class="l">Encuestas totales</span></div>
    <div class="ia-kpi-c" style="background:${predColor}"><span class="v">${esc(pred)}</span><span class="l">Predicci&oacute;n dominante</span></div>
    <div class="ia-kpi-c" style="background:#475569"><span class="v">${ia.cobertura_datos}%</span><span class="l">Cobertura del modelo</span></div>
  </div>

  <div class="ia-st2">8.1 Probabilidades Predichas por Clase</div>
  <div class="ia-probs-row">${probBars}</div>

  <div class="ia-st2">8.2 Importancia de Factores — Red Neuronal + Random Forest</div>
  ${factoresHtml}

  ${sectorHtml2 ? `
  <div class="ia-st2">8.3 Predicci&oacute;n por Sector Geogr&aacute;fico</div>
  <table class="ia-tbl">
    <tr><th>Sector</th><th>&#10003; Acepta</th><th>&#9888; Neutro</th><th>&#10007; Rechaza</th><th>n</th></tr>
    ${sectorHtml2}
  </table>` : ''}

  <div class="ia-st2">8.4 Recomendaciones del Modelo</div>
  <ul class="ia-recs2">${recsHtml2}</ul>

  <div class="ia-st2">8.5 Perfiles Comunitarios</div>
  <div class="ia-grid2">
    <div class="ia-pcard" style="background:#f0fdf4;border:1px solid #bbf7d0">
      <h5 style="color:#166534">&#10003; Perfil de Aceptaci&oacute;n</h5>${perfilAcHtml}
    </div>
    <div class="ia-pcard" style="background:#fef2f2;border:1px solid #fecaca">
      <h5 style="color:#991b1b">&#10007; Perfil de Rechazo</h5>${perfilReHtml}
    </div>
  </div>
  <div class="ia-modelo-note">Modelo: ${esc(ia.modelo || 'Red Neuronal MLP + Random Forest')} &middot; Generado autom&aacute;ticamente &middot; ${fecha}</div>
  <div class="pie"><span>IA Minera &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>`;
        }

        // Page 8B: Demografía & Conocimiento Minero
        let p8b_html = '';
        if (iaData?.ok) {
            const ia = iaData;
            const demo = ia.demografia || {};
            const know = ia.conocimiento_minero || {};
            const knowIdx = know.indice_conocimiento || 0;
            const knowColor = knowIdx >= 60 ? '#0f9f6e' : knowIdx >= 30 ? '#d97706' : '#c43d45';
            const knowNivel = knowIdx >= 60 ? 'ALTO' : knowIdx >= 30 ? 'MEDIO' : 'BAJO';

            const genRows = (demo.genero || []).map(g =>
                `<tr><td>${esc(g.valor)}</td><td style="text-align:center">${g.n}</td><td style="text-align:center">${g.pct}%</td></tr>`).join('');
            const edadRows = (demo.edad || []).map(e =>
                `<tr><td>${esc(e.valor)}</td><td style="text-align:center">${e.n}</td><td style="text-align:center">${e.pct}%</td></tr>`).join('');
            const educRows = (demo.educacion || []).slice(0, 6).map(e =>
                `<tr><td>${esc(e.valor)}</td><td style="text-align:center">${e.n}</td><td style="text-align:center">${e.pct}%</td></tr>`).join('');

            const gvpRows = (demo.genero_vs_percepcion || []).map(g =>
                `<tr><td>${esc(g.genero)}</td><td>${g.n}</td>
               <td style="color:#0f9f6e;font-weight:700">${g.aceptacion_pct}%</td>
               <td style="color:#c43d45;font-weight:700">${g.rechazo_pct}%</td>
               <td style="color:#d97706;font-weight:700">${g.neutral_pct}%</td></tr>`).join('');

            const knowRows = (know.por_campo || []).map(k => {
                const kc = k.nivel === 'Alto' ? '#0f9f6e' : k.nivel === 'Medio' ? '#d97706' : '#c43d45';
                const w = Math.min(100, k.pct_positivo);
                return `<div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:9pt;margin-bottom:3px">
                  <span style="color:#334155">${esc(k.pregunta)}</span>
                  <strong style="color:${kc}">${k.pct_positivo}% — ${esc(k.nivel)}</strong>
                </div>
                <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">
                  <div style="width:${w}%;height:100%;background:${kc};border-radius:4px"></div>
                </div>
              </div>`;
            }).join('');

            const cruceRows = (know.cruce_vs_aceptacion || []).slice(0, 5).map(c => {
                const dif = c.diferencia_pp;
                const dc = dif > 0 ? '#0f9f6e' : '#c43d45';
                return `<tr>
                <td style="font-size:8.5pt">${esc(c.pregunta)}</td>
                <td style="text-align:center;color:#0f9f6e;font-weight:700">${c.acept_si_conoce}%</td>
                <td style="text-align:center;color:#c43d45;font-weight:600">${c.acept_no_conoce}%</td>
                <td style="text-align:center;color:${dc};font-weight:800">${dif > 0 ? '+' : ''}${dif} pp</td>
              </tr>`;
            }).join('');

            const temasHtml = (ia.vectorizacion_temas || []).slice(0, 10).map(t => {
                const w = Math.min(100, Math.round(t.relevancia * 2000));
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:9pt">
                <span style="width:160px;color:#334155">${esc(t.tema)}</span>
                <div style="flex:1;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden">
                  <div style="width:${w}%;height:100%;background:#0e4eb0;border-radius:4px"></div>
                </div>
                <span style="width:45px;text-align:right;font-size:8pt;color:#64748b">${t.relevancia.toFixed(4)}</span>
              </div>`;
            }).join('');

            if (genRows || knowRows) {
                p8b_html = `
<div class="page" style="page-break-before:always">
<style>
.demo-tbl{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:0}
.demo-tbl th{background:#0a2a6e;color:#fff;padding:7px 10px;font-size:8.5pt}
.demo-tbl td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
.demo-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:14px 0}
.demo-card{border:1px solid #e2e8f0;border-radius:8px;padding:14px}
.demo-card h4{font-size:10pt;font-weight:800;color:#0a2a6e;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
.sec-hdr{font-size:11pt;font-weight:800;color:#0a2a6e;margin:20px 0 10px;padding-bottom:5px;border-bottom:2px solid #0a2a6e}
.know-badge{display:inline-block;padding:4px 14px;border-radius:20px;color:#fff;font-weight:800;font-size:11pt}
</style>
  <div style="background:linear-gradient(135deg,#0a2a6e,#1155bb);color:#fff;padding:22px 40px;border-radius:0;margin:-1px">
    <h2 style="font-size:16pt;font-weight:900;margin:0 0 4px">8B. An&aacute;lisis Demogr&aacute;fico y Conocimiento Minero</h2>
    <p style="opacity:.8;font-size:9.5pt">Vectorizaci&oacute;n completa de la base de datos &middot; ${ia.total_encuestas || ia.encuestas_entrenadas} encuestados analizados</p>
  </div>

  <div class="sec-hdr">Distribuci&oacute;n Demogr&aacute;fica</div>
  <div class="demo-grid">
    <div class="demo-card">
      <h4>G&eacute;nero</h4>
      <table class="demo-tbl"><tr><th>G&eacute;nero</th><th>n</th><th>%</th></tr>${genRows}</table>
    </div>
    <div class="demo-card">
      <h4>Rango de Edad</h4>
      <table class="demo-tbl"><tr><th>Edad</th><th>n</th><th>%</th></tr>${edadRows}</table>
    </div>
    <div class="demo-card">
      <h4>Nivel de Educaci&oacute;n</h4>
      <table class="demo-tbl"><tr><th>Educaci&oacute;n</th><th>n</th><th>%</th></tr>${educRows}</table>
    </div>
  </div>

  ${gvpRows ? `
  <div class="sec-hdr">Percepci&oacute;n Minera por G&eacute;nero</div>
  <table class="demo-tbl" style="margin-bottom:18px">
    <tr><th>G&eacute;nero</th><th>n</th><th style="color:#a7f3d0">&#10003; Acepta</th><th style="color:#fca5a5">&#10007; Rechaza</th><th style="color:#fcd34d">&#9888; Neutro</th></tr>
    ${gvpRows}
  </table>` : ''}

  <div class="sec-hdr">&Iacute;ndice de Conocimiento Minero Comunitario</div>
  <div style="text-align:center;margin:10px 0 16px">
    <span class="know-badge" style="background:${knowColor}">${knowIdx}% &mdash; ${knowNivel}</span>
    <p style="font-size:9pt;color:#64748b;margin-top:6px">Promedio de 5 dimensiones de conocimiento minero evaluadas en la encuesta</p>
  </div>
  ${knowRows}

  ${cruceRows ? `
  <div class="sec-hdr">Correlaci&oacute;n: Conocimiento vs Aceptaci&oacute;n Minera</div>
  <table class="demo-tbl">
    <tr><th>Dimensi&oacute;n</th><th>Acepta (s&iacute; conoce)</th><th>Acepta (no conoce)</th><th>Diferencia</th></tr>
    ${cruceRows}
  </table>
  <p style="font-size:8.5pt;color:#64748b;margin-top:8px;font-style:italic">
    Una diferencia positiva indica que el conocimiento favorece la aceptaci&oacute;n.
  </p>` : ''}

  ${temasHtml ? `
  <div class="sec-hdr">Vectorizaci&oacute;n TF-IDF &mdash; Temas Dominantes en Textos Comunitarios</div>
  <p style="font-size:9pt;color:#64748b;margin-bottom:10px">T&eacute;rminos m&aacute;s representativos extra&iacute;dos de comentarios, problemas, prioridades y percepciones libres.</p>
  ${temasHtml}` : ''}

  <div class="pie"><span>An&aacute;lisis Demogr&aacute;fico &middot; IA Minera &middot; San Bartolom&eacute;</span><span>${fecha}</span></div>
</div>`;
            }
        }

        // Page 9: Plan Estratégico Minero (Gemini o Fallback)
        let p9_html = '';
        const planGeminiData = analisisState.planGemini;
        if (!planGeminiData || !planGeminiData.plan) {
            const benMin = (data.beneficios_mineros || []);
            const rskMin = (data.riesgos_mineros || []);
            const topBen = benMin.slice(0, 4).map(b => esc(b.label)).join(', ') || 'Generación de empleo, ingresos al GAD, mejora de vialidad';
            const topRsk = rskMin.slice(0, 4).map(r2 => esc(r2.label)).join(', ') || 'Contaminación ambiental, impacto en fuentes de agua, conflictos sociales';
            const dimMinera = (data.dimensiones || []).find(d => /miner/i.test(d.nombre || d.titulo || ''));
            const idxMin = dimMinera ? n(dimMinera.sentimiento?.indice) : indice;
            const sentMin = idxMin >= 15 ? 'favorable' : idxMin <= -15 ? 'crítico' : 'ambivalente';
            const apoyoPct = dimMinera ? p(dimMinera.sentimiento?.positivo_pct) : p(sg.positivo_pct);
            const rechazoPct = dimMinera ? p(dimMinera.sentimiento?.negativo_pct) : p(sg.negativo_pct);
            const nivelRiesgo = idxMin <= -15 ? 'ALTO' : idxMin <= 0 ? 'MEDIO' : 'BAJO';
            const riesgoColor = nivelRiesgo === 'ALTO' ? '#c43d45' : nivelRiesgo === 'MEDIO' ? '#d97706' : '#0f9f6e';

            p9_html = `
<div class="page">
  <div class="ph"><h2>9. Plan Estrat&eacute;gico de Reapertura (Offline Fallback)</h2><p>An&aacute;lisis del territorio</p></div>
  <div class="narr">No se pudo cargar el plan estrat&eacute;gico detallado. Cargue la pestaña "An&aacute;lisis IA" primero para asegurar la generaci&oacute;n del reporte completo.</div>
  <div class="pie"><span>Plan Estrat&eacute;gico &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>`;
        } else {
            const p = planGeminiData.plan;
            const motor = planGeminiData.motor || 'Gemini API';
            const isLocal = motor === 'Local Expert Engine' || planGeminiData.fuente === 'ia_local';
            const mainTitle = isLocal ? 'IA Local &mdash; Plan Estrat&eacute;gico Parroquial' : 'Gemini IA &mdash; Plan Estrat&eacute;gico Integral';
            const badgeText = isLocal ? 'Motor Experto Local (Offline)' : 'Powered by Gemini';
            const headerBg = isLocal ? 'linear-gradient(135deg,#6f4e37,#a67c52)' : 'linear-gradient(135deg,#1a73e8,#0d47a1)';

            // Marco regulatorio
            const regHtml = (p.marco_regulatorio || []).map(r =>
                `<div class="gm-reg-item" style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9;page-break-inside:avoid;">
                    <strong style="color:#0f3460;font-size:10pt;display:block;">${esc(r.norma)}</strong>
                    <p style="font-size:9.5pt;color:#334155;margin-top:4px;line-height:1.5">${esc(r.aplicacion)}</p>
                </div>`
            ).join('');

            // Mejores prácticas
            const pracHtml = (p.mejores_practicas || []).map(pr => {
                const col = pr.nivel === 'Internacional' ? '#0e4eb0' : pr.nivel === 'Nacional' ? '#0f9f6e' : pr.nivel === 'Regional' ? '#7c3aed' : '#d97706';
                return `<div class="gm-prac-item" style="margin-bottom:15px;padding:12px;background:#f8fafc;border-left:4px solid ${col};border-radius:0 8px 8px 0;page-break-inside:avoid;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <strong style="font-size:10pt;color:#1e293b">${esc(pr.practica)}</strong>
                        <span style="background:${col};color:#fff;font-size:8pt;padding:2px 8px;border-radius:10px;font-weight:700;">${esc(pr.nivel)}</span>
                    </div>
                    <em style="font-size:8.5pt;color:#64748b;display:block;margin-bottom:4px;font-style:italic;">Referencia: ${esc(pr.referencia)}</em>
                    <p style="font-size:9pt;color:#475569;line-height:1.4">${esc(pr.aplicabilidad)}</p>
                </div>`;
            }).join('');

            // Ejes estratégicos
            const ejesHtml = (p.ejes_estrategicos || []).map(e =>
                `<div class="gm-eje-pdf no-break" style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:12px;background:#fff;page-break-inside:avoid;">
                    <div style="border-bottom:1px solid #f1f5f9;padding-bottom:6px;margin-bottom:8px;">
                        <strong style="color:#0e4eb0;font-size:10.5pt;">${esc(e.eje)}</strong>
                        <p style="font-size:9.5pt;color:#475569;margin-top:4px;line-height:1.45;">${esc(e.descripcion)}</p>
                    </div>
                    <div style="font-size:9pt;color:#334155;margin-bottom:6px;">
                        <strong>Actores involucrados:</strong> ${(e.actores || []).map(esc).join(', ')}
                    </div>
                    <ul style="padding-left:16px;margin:6px 0;font-size:9pt;color:#334155;">
                        ${(e.acciones || []).map(a => `<li style="margin-bottom:3px;">${esc(a)}</li>`).join('')}
                    </ul>
                    <div style="margin-top:8px;font-size:9pt;color:#0f9f6e;font-weight:700;background:#f0fdf4;padding:6px 10px;border-radius:6px;">
                        Meta / Indicador: ${esc(e.indicador)}
                    </div>
                </div>`
            ).join('');

            // Vinculación academia
            const ac = p.vinculacion_academia || {};
            const acadHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
                    <h5 style="margin:0 0 6px;color:#0e4eb0;font-size:9.5pt;font-weight:700;">Instituciones Sugeridas</h5>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                        ${(ac.instituciones_sugeridas || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                    </ul>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
                    <h5 style="margin:0 0 6px;color:#0e4eb0;font-size:9.5pt;font-weight:700;">L&iacute;neas de Investigaci&oacute;n</h5>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                        ${(ac.lineas_investigacion || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;margin-top:10px;">
                <h5 style="margin:0 0 6px;color:#0e4eb0;font-size:9.5pt;font-weight:700;">Programas Propuestos</h5>
                <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                    ${(ac.programas_propuestos || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                </ul>
            </div>`;

            // Plan empleo formación
            const emp = p.plan_empleo_formacion || {};
            const empHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
                    <h5 style="margin:0 0 6px;color:#0f9f6e;font-size:9.5pt;font-weight:700;">Perfiles Requeridos</h5>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                        ${(emp.perfiles_requeridos || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                    </ul>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
                    <h5 style="margin:0 0 6px;color:#0f9f6e;font-size:9.5pt;font-weight:700;">Capacitaci&oacute;n</h5>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                        ${(emp.instituciones_capacitacion || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;margin-top:10px;">
                <h5 style="margin:0 0 6px;color:#0f9f6e;font-size:9.5pt;font-weight:700;">Metas</h5>
                <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                    ${(emp.metas || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                </ul>
            </div>`;

            // Turismo y agricultura
            const ta = p.turismo_agricultura || {};
            const taHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
                    <h5 style="margin:0 0 6px;color:#7c3aed;font-size:9.5pt;font-weight:700;">Turismo Comunitario</h5>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                        ${(ta.oportunidades_turismo || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                    </ul>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">
                    <h5 style="margin:0 0 6px;color:#7c3aed;font-size:9.5pt;font-weight:700;">Agricultura Sostenible</h5>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#475569;">
                        ${(ta.oportunidades_agricultura || []).map(i => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
                    </ul>
                </div>
            </div>
            <p style="margin-top:10px;font-size:9pt;color:#475569;background:#f5f3ff;padding:8px 12px;border-radius:6px;line-height:1.5;">
                <strong>Sinergias:</strong> ${esc(ta.sinergias)}
            </p>`;

            // Cronograma
            const cronHtml = (p.cronograma_estrategico || []).map(f =>
                `<div style="display:grid;grid-template-columns:150px 1fr;gap:12px;border-bottom:1px solid #e2e8f0;padding:8px 0;page-break-inside:avoid;">
                    <div style="font-weight:700;color:#0e4eb0;font-size:9pt;">${esc(f.fase)}<br><small style="color:#64748b;font-weight:400;">${esc(f.periodo)}</small></div>
                    <ul style="padding-left:14px;margin:0;font-size:9pt;color:#334155;">
                        ${(f.hitos || []).map(h => `<li style="margin-bottom:3px;">${esc(h)}</li>`).join('')}
                    </ul>
                </div>`
            ).join('');

            // Recomendaciones finales
            const recsHtml = (p.recomendaciones_finales || []).map((r, i) =>
                `<li style="margin-bottom:8px;font-size:9.5pt;line-height:1.5;"><strong>R${i + 1}:</strong> ${esc(r)}</li>`).join('');

            p9_html = `
<div class="page" style="page-break-before:always">
<style>
.gm-header-pdf{background:${headerBg};color:#fff;padding:20px 30px;border-radius:0;margin-bottom:16px;}
.gm-header-pdf h2{font-size:15pt;font-weight:900;margin:0 0 3px;}
.gm-header-pdf p{font-size:8.5pt;opacity:.8;margin:0;}
.gm-hdr{font-size:11pt;font-weight:800;color:#0a2a6e;margin:18px 0 8px;padding-bottom:5px;border-bottom:2px solid #0a2a6e;page-break-after:avoid;}
.gm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
</style>
  <div class="gm-header-pdf">
    <h2>9. ${esc(p.titulo || mainTitle)}</h2>
    <p>${esc(badgeText)} &middot; ${esc(sector.toUpperCase())} &middot; ${fecha}</p>
  </div>

  <div class="gm-hdr">Diagn&oacute;stico Contextual (IA + Literatura)</div>
  <div style="font-size:9.5pt;line-height:1.6;color:#334155;background:#f8fafc;padding:12px 16px;border-radius:8px;border-left:4px solid #0e4eb0;margin-bottom:14px;">
    ${esc(p.diagnostico_contextual)}
  </div>

  <div class="gm-hdr">Marco Regulatorio Vigente Ecuatoriano</div>
  <div>${regHtml}</div>

  <div class="gm-hdr">Mejores Pr&aacute;cticas de Sostenibilidad Evaluadas</div>
  <div>${pracHtml}</div>

  <div class="gm-hdr">Ejes Estrat&eacute;gicos de Intervenci&oacute;n</div>
  <div>${ejesHtml}</div>

  <div class="gm-hdr">Vinculaci&oacute;n con la Academia</div>
  <div>${acadHtml}</div>

  <div class="gm-hdr">Plan de Empleo y Formaci&oacute;n T&eacute;cnica Local</div>
  <div>${empHtml}</div>

  <div class="gm-hdr">Sinergias: Turismo y Agricultura Sostenible</div>
  <div>${taHtml}</div>

  <div class="gm-hdr">Cronograma e Hitos Estrat&eacute;gicos</div>
  <div style="border:1px solid #e2e8f0;border-radius:8px;padding:0 14px;background:#fff;margin-bottom:14px;">${cronHtml}</div>

  <div class="gm-hdr">&#128161; Recomendaciones Finales para el Plan de Acción</div>
  <ul style="padding-left:20px;color:#334155;margin-bottom:16px;">${recsHtml}</ul>


  <div class="concl-box" style="margin-top:20px;page-break-inside:avoid;">${esc(p.conclusion)}</div>

  <div class="pie"><span>Plan Estrat&eacute;gico &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>`;
        }

        // ============================================================
        //  HTML DEL REPORTE
        // ============================================================
        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte T&eacute;cnico-Cient&iacute;fico &mdash; San Bartolom&eacute; &mdash; ${esc(sector)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;font-size:10.5pt;color:#1e293b;background:#fff;line-height:1.65}
h1,h2,h3,h4{font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif}

/* Portada */
.portada{background:linear-gradient(150deg,#0a3070 0%,#1155bb 55%,#0d4aa0 100%);
         color:#fff;padding:70px 55px 55px;min-height:100vh;
         display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
.portada-insignia{font-size:9pt;letter-spacing:4px;text-transform:uppercase;opacity:.65;margin-bottom:50px;font-weight:600}
.portada-titulo{font-size:32pt;font-weight:900;line-height:1.15;margin-bottom:12px;letter-spacing:-0.5px}
.portada-sub{font-size:14pt;opacity:.85;margin-bottom:35px;font-weight:300}
.portada-tabla{width:100%;border-collapse:collapse;background:rgba(255,255,255,.10);border-radius:10px;overflow:hidden}
.portada-tabla td{padding:12px 18px;font-size:10.5pt;border-bottom:1px solid rgba(255,255,255,.1)}
.portada-tabla td:first-child{font-weight:700;font-size:9pt;letter-spacing:1px;text-transform:uppercase;
                               opacity:.7;width:180px}
.portada-tabla tr:last-child td{border-bottom:none}
.nivel-pill{margin-top:28px;padding:16px 24px;border-radius:8px;text-align:center;
            font-size:13pt;font-weight:800;letter-spacing:.5px;box-shadow:0 4px 15px rgba(0,0,0,0.15)}
.portada-foot{font-size:8.5pt;opacity:.5;text-align:center;margin-top:35px}

/* Pagina */
.page{padding:32px 42px;page-break-after:always}
.page:last-of-type{page-break-after:auto}

/* Cabecera de seccion */
.ph{background:#0e4eb0;color:#fff;border-radius:7px;padding:12px 20px;margin-bottom:24px}
.ph h2{font-size:14pt;font-weight:800;margin-bottom:2px}
.ph p{font-size:9pt;opacity:.85;font-weight:300}

/* KPIs */
.krow4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.kc{border-radius:9px;padding:18px 14px;text-align:center;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.05)}
.kc .v{font-size:22pt;font-weight:900;display:block;line-height:1.1;margin-bottom:4px}
.kc .l{font-size:8.5pt;opacity:.9;text-transform:uppercase;font-weight:600;letter-spacing:0.5px}

/* Narrativa */
.narr{background:#f1f5f9;border-left:5px solid #0e4eb0;padding:16px 22px;
      border-radius:0 8px 8px 0;margin-bottom:20px;font-size:11pt;line-height:1.75;color:#334155}
.prob{display:inline-block;background:#fee2e2;color:#991b1b;padding:6px 16px;
      border-radius:20px;font-size:10pt;font-weight:700;margin-bottom:24px;}

/* Tabla sentimiento */
.stbl{width:100%;border-collapse:collapse;margin-bottom:24px}
.stbl th{background:#0e4eb0;color:#fff;padding:10px 16px;font-size:9.5pt;text-align:left;font-weight:600}
.stbl td{padding:10px 16px;font-size:10pt;border-bottom:1px solid #e2e8f0;color:#334155}
.stbl tr:nth-child(even) td{background:#f8fafc}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;vertical-align:middle}

/* Metodologia */
.metod{background:#fdfce8;border:1px solid #fde047;border-radius:8px;
       padding:16px 20px;font-size:9.5pt;line-height:1.75;margin-top:20px;color:#422006}
.metod strong{color:#854d0e;font-weight:700}

/* Barras */
.br{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:9.5pt}
.bl{width:200px;flex-shrink:0;color:#1e293b;font-weight:500}
.bt{flex:1;height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden}
.bf{height:100%;border-radius:5px}
.bp{width:90px;text-align:right;font-weight:700;font-size:9pt;color:#334155}

/* Dimensiones */
.dim-card{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.02)}
.dim-h{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;color:#fff}
.dim-name{font-weight:800;font-size:11pt;letter-spacing:0.3px}
.dim-badge{font-size:9pt;background:rgba(0,0,0,.25);padding:3px 12px;
           border-radius:15px;font-weight:700;letter-spacing:0.5px}
.dim-stats{display:flex;gap:24px;padding:10px 18px;background:#f8fafc;
           font-size:9.5pt;font-weight:700;border-bottom:1px solid #e2e8f0}
.dim-body{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:16px 18px}
.dim-img-wrap img{width:100%;border-radius:8px}
.dim-bars{padding-top:2px}

/* Preguntas */
.pg-grupo{margin-bottom:30px}
.pg-gtit{background:#1e293b;color:#f8fafc;padding:10px 18px;border-radius:8px;
         font-size:12pt;font-weight:700;margin-bottom:16px;break-after:avoid;page-break-after:avoid}
.pg-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.pg-card{border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;background:#fff;break-inside:avoid;page-break-inside:avoid;overflow:hidden;min-width:0}
.pg-card canvas{max-width:100%!important;width:100%!important}
.pg-q{font-weight:700;font-size:10.5pt;color:#0f172a;margin-bottom:6px;line-height:1.5}
.pg-n{font-size:8.5pt;color:#64748b;margin-bottom:12px;font-weight:500}

/* Mineria */
.mine-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:26px}
.mine-card{border:1px solid #e2e8f0;border-radius:10px;padding:18px;background:#fff}
.mine-card h4{font-size:11pt;margin-bottom:14px;padding-bottom:8px;
              border-bottom:2px solid;font-weight:800}

/* Conocimiento */
.krow{display:flex;align-items:center;gap:12px;padding:9px 0;
      border-bottom:1px solid #f1f5f9;font-size:10pt;color:#334155;font-weight:500}
.kdot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
.krow strong{margin-left:auto;font-size:11pt;font-weight:700}

/* Correlaciones */
.corr{background:#f8fafc;border-left:4px solid #0e4eb0;padding:14px 18px;
      border-radius:0 8px 8px 0;margin-bottom:14px}
.corr strong{display:block;font-size:10.5pt;margin-bottom:6px;color:#0e4eb0;}
.corr p{font-size:10pt;line-height:1.65;color:#475569}

/* Grafica */
.chart-wrap{text-align:center;margin:12px 0 24px}
.chart-wrap img{max-width:100%;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,.08)}
.chart-cap{font-size:9pt;color:#64748b;margin-top:8px;font-style:italic}

/* Conclusion */
.concl-box{background:#f8fafc;border:1px solid #cbd5e1;border-left:5px solid #0f9f6e;border-radius:8px;
           padding:24px 28px;font-size:11pt;line-height:1.8;color:#1e293b;}
.concl-box p{margin-bottom:14px}
.recomend{margin-top:16px;padding-left:24px;color:#334155}
.recomend li{margin-bottom:12px;font-size:10.5pt;line-height:1.7}

/* Sec title */
.st{font-size:12pt;font-weight:800;color:#0e4eb0;margin:24px 0 8px;
    padding-bottom:6px;border-bottom:2px solid #0e4eb0;}
.sd{font-size:9.5pt;color:#64748b;font-style:italic;margin-bottom:16px}

/* Pie */
.pie{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;
     font-size:8.5pt;color:#94a3b8;display:flex;justify-content:space-between;}

.no-break{page-break-inside:avoid;break-inside:avoid}

/* Cierre */
.cierre{text-align:center;padding:28px;background:#f1f5f9;border-radius:10px;
        margin-top:32px;font-size:10pt;color:#475569;line-height:1.9}

/* --- PRINT --- */
@media print{
  * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
  }
  @page{size: A4; margin: 0;}
  body{font-size:10pt; margin: 0; padding: 0;}
  .portada{height: 297mm; min-height: 297mm; padding: 70px 55px 55px; box-sizing: border-box;}
  .page{padding: 20mm 15mm; min-height: 297mm; box-sizing: border-box; margin-top: 0; width:100%; max-width:100%; overflow:hidden;}
  .portada-titulo{font-size:30pt;}
  .dim-body{grid-template-columns:130px 1fr}
  .pg-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .pg-card{break-inside:avoid!important;page-break-inside:avoid!important;overflow:hidden;min-width:0}
  .pg-card canvas{max-width:100%!important;width:100%!important}
  .dim-card,.corr,.mine-card,.gm-eje-pdf,.no-break{break-inside:avoid!important;page-break-inside:avoid!important}
  .mine-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .mine-card{min-width:0;overflow:hidden}
  .bl{width:155px}
  .kc .v{font-size:18pt}
  .krow4{gap:10px}
}
</style>
</head>
<body>

<!-- PORTADA -->
<div class="portada">
  <div>
    <div class="portada-insignia">Sistema de An&aacute;lisis Comunitario &middot; GAD Parroquial San Bartolom&eacute; &middot; Cuenca, Ecuador</div>
    <div class="portada-titulo">Reporte T&eacute;cnico-Cient&iacute;fico de Encuestas Comunitarias</div>
    <div class="portada-sub">An&aacute;lisis de Sentimiento Comunitario &amp; Estad&iacute;stica Descriptiva Territorial</div>
    <table class="portada-tabla">
      <tr><td>Zona analizada</td><td>${esc(sector)}</td></tr>
      <tr><td>Fecha de emisi&oacute;n</td><td>${fecha}</td></tr>
      <tr><td>Total de encuestas</td><td>${n(r.total_encuestas)} encuestas procesadas</td></tr>
      <tr><td>&Uacute;ltimo registro</td><td>${esc((data.generado_en || '').split(' ')[0])}</td></tr>
    </table>
    <div class="nivel-pill" style="background:${nvlColor}">
      Nivel de Sentimiento Comunitario: ${esc(r.nivel_sentimiento)}
      &nbsp;&nbsp;|&nbsp;&nbsp;
      &Iacute;ndice Neto Global: ${sgn(indice)} puntos
    </div>
  </div>
  <div class="portada-foot">
    Documento generado autom&aacute;ticamente por el Sistema de Informaci&oacute;n Comunitaria &middot; ${fecha}
  </div>
</div>

<!-- PAG 1: RESUMEN EJECUTIVO -->
<div class="page">
  <div class="ph"><h2>1. Resumen Ejecutivo</h2><p>Indicadores globales del an&aacute;lisis de sentimiento comunitario</p></div>
  <div class="krow4">
    <div class="kc" style="background:#0e4eb0"><span class="v">${n(r.total_encuestas)}</span><span class="l">Total de Encuestas</span></div>
    <div class="kc" style="background:${nvlColor}"><span class="v">${sgn(indice)} pts</span><span class="l">&Iacute;ndice Neto Global</span></div>
    <div class="kc" style="background:#0f9f6e"><span class="v">${p(r.positivo_global)}</span><span class="l">Sentimiento Positivo</span></div>
    <div class="kc" style="background:#c43d45"><span class="v">${p(r.negativo_global)}</span><span class="l">Sentimiento Negativo</span></div>
  </div>
  <div class="narr">${esc(r.narrativa)}</div>
  <div class="prob">&#9888; Problem&aacute;tica principal identificada: ${esc(r.problema_principal)}</div>
  <div class="st">Distribuci&oacute;n del Sentimiento Global</div>
  <table class="stbl">
    <tr><th>Sentimiento</th><th>Porcentaje</th><th>Interpretaci&oacute;n</th></tr>
    <tr><td><span class="dot" style="background:#0f9f6e"></span>Positivo</td>
        <td><strong style="color:#0f9f6e">${p(sg.positivo_pct)}</strong></td>
        <td>Respuestas favorables en las dimensiones evaluadas</td></tr>
    <tr><td><span class="dot" style="background:#d97706"></span>Neutro</td>
        <td><strong style="color:#d97706">${p(sg.neutro_pct)}</strong></td>
        <td>Posici&oacute;n intermedia, ambivalente o sin definici&oacute;n clara</td></tr>
    <tr><td><span class="dot" style="background:#c43d45"></span>Negativo</td>
        <td><strong style="color:#c43d45">${p(sg.negativo_pct)}</strong></td>
        <td>Respuestas de rechazo, insatisfacci&oacute;n o cr&iacute;tica</td></tr>
  </table>
  <div class="metod">
    <strong>Marco Metodol&oacute;gico &mdash;</strong> El an&aacute;lisis aplica estad&iacute;stica descriptiva y procesamiento
    de lenguaje natural (NLP) sobre las encuestas de la parroquia San Bartolom&eacute;. El
    <strong>&Iacute;ndice Neto de Sentimiento</strong> se calcula como: <em>% Positivo &minus; % Negativo</em>
    (escala &minus;100 a +100 puntos). Valores &ge; +15 se clasifican como <em>Favorable</em>,
    entre &minus;15 y +15 como <em>Ambivalente</em>, y &le; &minus;15 como <em>Cr&iacute;tico</em>.
  </div>
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 2: GRAFICAS -->
<div class="page">
  <div class="ph"><h2>2. An&aacute;lisis Gr&aacute;fico de Sentimiento</h2><p>Visualizaciones capturadas en tiempo real del sistema de an&aacute;lisis</p></div>
  ${imgDonut ? `
  <div class="st">2.1 Distribuci&oacute;n de Sentimiento Comunitario</div>
  <div class="sd">Proporci&oacute;n de encuestas clasificadas como Positivo, Neutro y Negativo sobre el total analizado.</div>
  <div class="chart-wrap"><img src="${imgDonut}"></div>` : ''}
  ${imgRadar ? `
  <div class="st">2.2 Fortaleza de Dimensiones</div>
  <div class="sd">Puntaje neto obtenido en cada una de las dimensiones analizadas (de &minus;100 a +100 puntos).</div>
  <div class="chart-wrap"><img src="${imgRadar}" style="max-height:360px"></div>` : ''}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 3: DETALLE DE DIMENSIONES -->
<div class="page">
  <div class="ph"><h2>3. Sentimiento Detallado por Dimensi&oacute;n</h2><p>An&aacute;lisis del &Iacute;ndice Neto y respuestas porcentuales por &aacute;rea de inter&eacute;s</p></div>
  ${dimsHtml}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 4: PREGUNTAS DETALLADAS -->
${pregHtml ? `
<div class="page">
  <div class="ph"><h2>4. Respuestas Detalladas a Preguntas Clave</h2><p>Distribuci&oacute;n de opciones seleccionadas en el formulario de encuesta</p></div>
  ${pregHtml}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>` : ''}

<!-- PAG 5: PERCEPCIONES MINERAS -->
<div class="page">
  <div class="ph"><h2>5. Percepciones e Impacto de la Actividad Minera</h2><p>Evaluaci&oacute;n comunitaria de riesgos, beneficios y conocimiento minero</p></div>
  <div class="mine-grid">
    <div class="mine-card no-break">
      <h4 style="color:#0f9f6e;border-color:#0f9f6e">Beneficios Percibidos</h4>
      ${benHtml || '<p style="color:#888;font-size:9pt">Sin datos registrados</p>'}
    </div>
    <div class="mine-card no-break">
      <h4 style="color:#c43d45;border-color:#c43d45">Riesgos Percibidos</h4>
      ${rskHtml || '<p style="color:#888;font-size:9pt">Sin datos registrados</p>'}
    </div>
  </div>
  <div class="st">5.3 Nivel de Conocimiento sobre Miner&iacute;a</div>
  <div class="sd">Sem&aacute;foro: &#128994; &ge; 60% &mdash; conocimiento adecuado &nbsp;&middot;&nbsp; &#128993; 30&ndash;59% &mdash; conocimiento parcial &nbsp;&middot;&nbsp; &#128308; &lt; 30% &mdash; socializaci&oacute;n urgente</div>
  ${conocHtml || '<p style="color:#888;font-size:9pt">Sin datos registrados</p>'}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 6: CORRELACIONES Y TENDENCIA -->
<div class="page">
  <div class="ph"><h2>6. Correlaciones, Tendencia Temporal y Distribuci&oacute;n Geogr&aacute;fica</h2><p>Cruces estrat&eacute;gicos, evoluci&oacute;n del levantamiento y cobertura por sector</p></div>
  <div class="st">6.1 Correlaciones y Cruces Estrat&eacute;gicos</div>
  <div class="sd">Diferencia expresada en puntos porcentuales (pp) entre grupos comparados.</div>
  ${corrHtml || '<p style="color:#888;font-size:9pt">Sin correlaciones disponibles</p>'}
  ${imgTendencia ? `
  <div class="st">6.2 Tendencia del Levantamiento (&uacute;ltimos 14 d&iacute;as)</div>
  <div class="sd">Barras: n&uacute;mero de encuestas por d&iacute;a &middot; L&iacute;nea: porcentaje de apertura a inversi&oacute;n minera.</div>
  <div class="chart-wrap"><img src="${imgTendencia}" style="max-width:580px"></div>` : ''}
  <div class="st">6.3 Distribuci&oacute;n por Sector Geogr&aacute;fico</div>
  <div class="sd">N&uacute;mero de encuestas registradas por zona dentro de la parroquia.</div>
  ${sectorHtml || '<p style="color:#888;font-size:9pt">Sin datos de sector</p>'}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 7: CONCLUSIONES -->
<div class="page">
  <div class="ph"><h2>7. Conclusiones y Recomendaciones</h2><p>S&iacute;ntesis anal&iacute;tica y l&iacute;neas de acci&oacute;n basadas en los datos del territorio</p></div>
  <div class="concl-box">${concl}</div>
  <div class="cierre">
    <strong>Documento generado autom&aacute;ticamente</strong> por el Sistema de An&aacute;lisis Comunitario de San Bartolom&eacute;.<br>
    Los resultados reflejan las encuestas registradas al momento de la generaci&oacute;n del presente reporte.<br>
    <strong>Fecha:</strong> ${fecha} &nbsp;&middot;&nbsp; <strong>Zona:</strong> ${esc(sector)} &nbsp;&middot;&nbsp;
    <strong>Total procesado:</strong> ${n(r.total_encuestas)} encuestas
  </div>
  <div class="pie" style="margin-top:18px"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>${fecha}</span></div>
</div>

${p7b_html}
${p8_html}
${p8b_html}
${p9_html}

<!-- CIERRE -->
<div class="page" style="page-break-after:auto;">
  <div class="cierre">
    <strong>Fin del Reporte T&eacute;cnico-Cient&iacute;fico</strong><br>
    Documento generado autom&aacute;ticamente por el Sistema de Informaci&oacute;n Comunitaria<br>
    GAD Parroquial San Bartolom&eacute; &middot; Cuenca, Ecuador &middot; ${fecha}
  </div>
</div>


<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.js"></script>
<script>
${chartsCode}
</script>
</body>
</html>`;

        // Limpiar acentos y eñes para evitar corrupción de caracteres (mojibake) en el PDF
        const cleanHtml = html
            .replace(/á/g, '&aacute;')
            .replace(/é/g, '&eacute;')
            .replace(/í/g, '&iacute;')
            .replace(/ó/g, '&oacute;')
            .replace(/ú/g, '&uacute;')
            .replace(/ñ/g, '&ntilde;')
            .replace(/Á/g, '&Aacute;')
            .replace(/É/g, '&Eacute;')
            .replace(/Í/g, '&Iacute;')
            .replace(/Ó/g, '&Oacute;')
            .replace(/Ú/g, '&Uacute;')
            .replace(/Ñ/g, '&Ntilde;')
            .replace(/—/g, '&mdash;')
            .replace(/–/g, '&ndash;')
            .replace(/α/g, '&alpha;');

        // Abrir en nueva ventana e imprimir
        // Imprimir mediante un iframe oculto (sin popups y sin bloquear la página principal)
        const oldFrame = document.getElementById('pdf-print-frame');
        if (oldFrame) oldFrame.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'pdf-print-frame';
        // Tamaño real A4 (~96dpi) fuera de pantalla para que las gráficas se rendericen con ancho válido
        iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
        document.body.appendChild(iframe);

        const idoc = iframe.contentWindow.document;
        idoc.open('text/html;charset=utf-8', 'replace');
        idoc.write(cleanHtml);
        idoc.close();

        let printed = false;
        const doPrint = () => {
            if (printed) return;
            printed = true;
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error('Error al imprimir:', e);
            }
            // Limpiar el iframe después de imprimir; el foco vuelve a la página normalmente
            const cleanup = () => { const f = document.getElementById('pdf-print-frame'); if (f) f.remove(); };
            if (iframe.contentWindow) {
                iframe.contentWindow.onafterprint = cleanup;
            }
            setTimeout(cleanup, 60000); // respaldo por si onafterprint no dispara
        };

        // Esperar a que carguen Chart.js y se dibujen las gráficas antes de imprimir
        iframe.onload = () => setTimeout(doPrint, 1200);
        // Respaldo si onload no dispara (document.write a veces no lo lanza)
        setTimeout(doPrint, 2000);

    } catch (err) {
        console.error('Error generando PDF:', err);
        alert('Error al generar el reporte: ' + err.message);
    } finally {
        const btn = document.getElementById('analisis-pdf-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Exportar Reporte PDF'; }
    }
    
}
