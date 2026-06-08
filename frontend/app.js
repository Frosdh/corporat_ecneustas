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

    document.getElementById('preguntas-sector-filter')?.addEventListener('change', () => loadPreguntas(true));

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
            if (button.dataset.tab === 'llm') {
                // Sincronizar sector y disparar análisis NVIDIA si no está ya corriendo
                const llmSf = document.getElementById('llm-sector-filter');
                const analisisSf = document.getElementById('analisis-sector-filter');
                if (llmSf && analisisSf && llmSf.value === 'general' && analisisSf.value !== 'general') {
                    llmSf.value = analisisSf.value;
                }
                if (typeof generateLLMNvidia === 'function') generateLLMNvidia();
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
        signal: options.signal,
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
            const label = item.label;
            if (!label || label.toLowerCase() === 'general' || label.toLowerCase() === 'todas las zonas') return;
            const opt = document.createElement('option');
            opt.value = label;        // Backend ya devuelve UTF-8 correcto
            opt.textContent = label;
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
        login: { icon: '\u{1F510}', label: 'Inicio de sesión', color: '#3b82f6', bg: '#eff6ff' },
        logout: { icon: '\u{1F6AA}', label: 'Cierre de sesión', color: '#6b7280', bg: '#f9fafb' },
        save_survey: { icon: '\u{1F4CB}', label: 'Encuesta guardada', color: '#059669', bg: '#ecfdf5' },
        register_application: { icon: '\u{1F4DD}', label: 'Postulación registrada', color: '#7c3aed', bg: '#f5f3ff' },
        review_application: { icon: '\u{1F50D}', label: 'Postulación revisada', color: '#d97706', bg: '#fffbeb' },
        update_surveyor_profile: { icon: '✏️', label: 'Perfil actualizado', color: '#0284c7', bg: '#e0f2fe' },
        update_surveyor_status: { icon: '\u{1F504}', label: 'Estado actualizado', color: '#ea580c', bg: '#fff7ed' },
        reset_password: { icon: '🔑', label: 'Clave restablecida', color: '#be185d', bg: '#fdf2f8' },
    };

    list.innerHTML = state.auditLogs.map((item) => {
        const meta = ACTION_META[item.action_type] || { icon: '\u{1F4CC}', label: item.action_type, color: '#6b7280', bg: '#f9fafb' };
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
                        <span class="audit-time">\u{1F4C5} ${escapeHtml(datePart || '')} &nbsp;⏰ ${escapeHtml(timePart || '')}</span>
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

/** Limpia texto del backend: quita emojis, control chars, y artefactos de double-encoding */
function cleanText(str) {
    if (!str) return '';
    return String(str)
        // Remove common double-encoded UTF-8 artifacts
        .replace(/\u00c3[\u0080-\u00bf]/g, function(m) {
            var map = {'\u00c3\u00a1':'a','\u00c3\u00a9':'e','\u00c3\u00ad':'i','\u00c3\u00b3':'o','\u00c3\u00ba':'u',
                       '\u00c3\u0081':'A','\u00c3\u0089':'E','\u00c3\u008d':'I','\u00c3\u0093':'O','\u00c3\u009a':'U',
                       '\u00c3\u00b1':'n','\u00c3\u0091':'N'};
            return map[m] || '';
        })
        // Remove emoji (surrogate pairs and common emoji ranges)
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/[\u2600-\u27FF\uFE00-\uFE0F\u2702-\u27B0]/g, '')
        // Remove control characters (except space, tab, newline)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        .trim();
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
    if (llmBtn) llmBtn.addEventListener('click', () => generateLLMNvidia(true));

    const llmPdfBtn = document.getElementById('llm-pdf-btn');
    if (llmPdfBtn) llmPdfBtn.addEventListener('click', () => generateLLMNvidiaPDF());
    const llmFilter = document.getElementById('llm-sector-filter');
    if (llmFilter) llmFilter.addEventListener('change', () => {
        // Forzar nueva carga al cambiar zona — siempre resetear el sector guardado
        window._llmCurrentSector = null;
        generateLLMNvidia();
    });
});

let _analisisAbortController = null;
async function loadAnalisis(force = false) {
    const sector = document.getElementById('analisis-sector-filter')?.value ?? 'general';
    
    // Evitar cargar si ya es el mismo sector y no se fuerza
    if (!force && window._analisisCurrentSector === sector && document.getElementById('analisis-content') && !document.getElementById('analisis-content').classList.contains('hidden')) {
        return;
    }
    window._analisisCurrentSector = sector;

    // Abortar peticiones anteriores si hay multiples clics rapidos
    if (_analisisAbortController) {
        _analisisAbortController.abort();
    }
    _analisisAbortController = new AbortController();
    const signal = _analisisAbortController.signal;

    setAnalisisUI('loading');
    try {
        const payload = await requestJson('analisis', { params: { sector }, signal });
        analisisState.data = payload.analisis;
        if (!analisisState.data || analisisState.data.total === 0) {
            setAnalisisUI('empty');
            const emptyEl = document.getElementById('analisis-empty');
            if (emptyEl) emptyEl.innerHTML = `<p style="padding:24px;text-align:center;color:#888">
                Sin encuestas para <strong>${sector === 'general' ? 'todas las zonas' : sector}</strong>.
                Verifica que la zona tiene encuestas registradas.</p>`;
            return;
        }
        renderAnalisis(analisisState.data);
        setAnalisisUI('content');
        // Cargar IA minera en paralelo (no bloquea el render principal)
        requestJson('ia_minera', { params: { sector }, signal })
            .then(iaPayload => {
                analisisState.iaMinera = iaPayload;
                renderIAMinera(iaPayload);
            })
            .catch(err => { if (err.name !== 'AbortError') console.warn('IA minera no disponible:', err); });
        // Cargar plan Gemini en paralelo
        const geminiBox = document.getElementById('gemini-plan-box');
        if (geminiBox) {
            geminiBox.classList.remove('hidden');
            geminiBox.innerHTML = '<div class="ia-loading"><span class="ia-spinner"></span> Gemini est&aacute; analizando regulaci&oacute;n, mejores pr&aacute;cticas y generando el plan estrat&eacute;gico...</div>';
            requestJson('plan_gemini', { params: { sector }, signal })
                .then(gPayload => {
                    analisisState.planGemini = gPayload;
                    renderPlanGemini(gPayload);
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        geminiBox.innerHTML = '<div class="ia-error">&#9888; Plan Gemini no disponible: ' + err.message + '</div>';
                    }
                });
        }
        
        // Sincronizar zona en filtro LLM (solo sincroniza, no dispara NVIDIA — eso es del tab LLM)
        const llmSectorFilter = document.getElementById('llm-sector-filter');
        if (llmSectorFilter) llmSectorFilter.value = sector;

        // Sincronizar total con el dashboard
        const totalReal = analisisState.data.total_encuestas ?? analisisState.data.total ?? 0;
        setTotalEncuestasReal(totalReal);
        const ts = document.getElementById('analisis-last-update');
        if (ts) ts.textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-EC');
        clearTimeout(analisisState.autoRefreshTimer);
        analisisState.autoRefreshTimer = setTimeout(() => loadAnalisis(), 90000);
    } catch (err) {
        if (err.name !== 'AbortError') {
            setAnalisisUI('empty');
            console.error('Error en analisis:', err);
            const emptyEl = document.getElementById('analisis-empty');
            if (emptyEl) emptyEl.innerHTML = `<p style="padding:24px;text-align:center;color:#c00">
                Error al cargar análisis: ${err.message || 'Error del servidor.'}<br>
                <small>Revisa la consola para más detalles.</small></p>`;
        }
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


function renderFactoresChart(factores) {
    const ctx = document.getElementById('llm-factores-chart');
    if (!ctx || !factores.length || typeof Chart === 'undefined') return;
    const existing = Chart.getChart(ctx);
    if (existing) existing.destroy();

    const sector = document.getElementById('llm-sector-filter')?.value || 'general';
    const sectorLabel = sector === 'general' ? 'Todas las zonas' : sector;
    const badge = document.getElementById('llm-factores-sector-badge');
    if (badge) badge.textContent = '🗺️ ' + sectorLabel;

    // Ajustar alto según número de factores
    const h = Math.max(280, factores.length * 46 + 60);
    if (ctx.parentElement) ctx.parentElement.style.height = h + 'px';

    const sorted = [...factores].sort((a,b) => b.score_pct - a.score_pct);
    const labels = sorted.map(f => f.factor);
    const values = sorted.map(f => f.score_pct);
    const colors  = values.map(v => v>=75 ? 'rgba(185,28,28,0.85)' : v>=55 ? 'rgba(217,119,6,0.85)' : 'rgba(22,163,74,0.85)');
    const borders = values.map(v => v>=75 ? '#b91c1c' : v>=55 ? '#d97706' : '#15803d');
    const niveles = values.map(v => v>=75 ? 'Critico' : v>=55 ? 'Relevante' : 'Moderado');

    new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Importancia (%)', data: values, backgroundColor: colors, borderColor: borders, borderWidth: 1.5, borderRadius: 6, borderSkipped: false }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255,248,225,0.97)', titleColor: '#3E2723', bodyColor: '#6F4E37', borderColor: '#D7CCC8', borderWidth: 1, padding: 10,
                    callbacks: {
                        title: items => labels[items[0].dataIndex] || '',
                        label: c => '  Influencia: ' + c.parsed.x + '%  [' + niveles[c.dataIndex] + ']',
                        afterLabel: () => '  Zona: ' + sectorLabel,
                    },
                },
            },
            scales: {
                x: { max: 100, ticks: { color:'#8D6E63', font:{size:11}, callback: v => v+'%' }, grid:{color:'#EDE0D0'}, border:{color:'#D7CCC8'}, title:{display:true,text:'Nivel de influencia (%)',color:'#8D6E63',font:{size:11}} },
                y: { ticks: { color:'#3E2723', font:{size:12,weight:'600'} }, grid:{display:false}, border:{color:'#D7CCC8'} },
            },
            animation: { duration: 800, easing: 'easeOutQuart' },
        },
    });
}

// ── EJES ESTRATEGICOS ─────────────────────────────────────────
function renderEjesEstrategicos(ejes) {
    const section = document.getElementById('llm-ejes-section');
    const grid    = document.getElementById('llm-ejes-grid');
    if (!section || !grid || !ejes.length) return;
    section.classList.remove('hidden');

    const prioColors = {
        CRITICA: { border:'#b91c1c', bg:'#fff1f2', badge:'#b91c1c', badgeBg:'#fee2e2', icon:'&#128308;' },
        MEDIA:   { border:'#d97706', bg:'#fffbeb', badge:'#d97706', badgeBg:'#fef3c7', icon:'&#128993;' },
        BAJA:    { border:'#16a34a', bg:'#f0fdf4', badge:'#16a34a', badgeBg:'#dcfce7', icon:'&#128994;' },
    };
    const iconMap = { mining:'&#9935;&#65039;', governance:'&#127963;&#65039;', trust:'&#129309;', investment:'&#128176;', economy:'&#127807;', knowledge:'&#128218;' };

    grid.innerHTML = ejes.map(e => {
        const c  = prioColors[e.prioridad] || prioColors.MEDIA;
        const ic = iconMap[e.icono] || '&#11088;';
        return `<div style="background:${c.bg};border:1px solid ${c.border}44;border-left:5px solid ${c.border};border-radius:14px;padding:18px 20px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                    <span style="font-size:1.8rem;flex-shrink:0;">${ic}</span>
                    <div>
                        <h4 style="margin:0 0 3px;font-size:0.95rem;font-weight:800;color:#3E2723;">${escapeHtml(e.titulo)}</h4>
                        <p style="margin:0;font-size:0.82rem;color:#6F4E37;line-height:1.5;">${escapeHtml(e.descripcion)}</p>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                    <span style="font-size:0.7rem;font-weight:800;background:${c.badgeBg};color:${c.badge};border:1px solid ${c.badge}55;border-radius:20px;padding:3px 10px;white-space:nowrap;">${c.icon} ${e.prioridad}</span>
                    <span style="font-size:0.68rem;color:#8D6E63;background:#FFF8E1;border:1px solid #EDE0D0;border-radius:20px;padding:2px 8px;">&#205;ndice: ${e.indice>0?'+':''}${e.indice} pts</span>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-size:0.72rem;font-weight:700;color:#8D6E63;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Acciones Clave</div>
                <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;">
                    ${(e.acciones||[]).map(a=>`<li style="display:flex;align-items:flex-start;gap:8px;font-size:0.84rem;color:#3E2723;line-height:1.5;"><span style="flex-shrink:0;color:${c.border};font-weight:900;margin-top:2px;">&#9654;</span><span>${escapeHtml(a)}</span></li>`).join('')}
                </ul>
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding-top:10px;border-top:1px solid ${c.border}33;">
                <span style="font-size:0.7rem;color:#8D6E63;">&#128209; Normativa:</span>
                <span style="font-size:0.75rem;font-weight:600;color:#4E342E;">${escapeHtml(e.normativa||'')}</span>
            </div>
        </div>`;
    }).join('');
}

// ── MEJORES PRACTICAS MINERAS ─────────────────────────────────
function renderMejoresPracticas(practicas) {
    const section = document.getElementById('llm-practicas-section');
    if (!section) return;
    section.classList.remove('hidden');

    const nivelColors = {
        Internacional: { bg:'#eff6ff', border:'#0e4eb0', badge:'#0e4eb0' },
        Nacional:      { bg:'#f0fdf4', border:'#16a34a', badge:'#16a34a' },
        Regional:      { bg:'#fdf4ff', border:'#7c3aed', badge:'#7c3aed' },
    };
    const renderList = (items, containerId) => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = (items||[]).map(p => {
            const c = nivelColors[p.nivel] || nivelColors.Internacional;
            return `<div style="background:${c.bg};border:1px solid ${c.border}44;border-radius:12px;padding:16px 18px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                        <h4 style="margin:0 0 3px;font-size:0.92rem;font-weight:800;color:#1e293b;">${escapeHtml(p.nombre)}</h4>
                        <div style="font-size:0.75rem;color:#64748b;font-style:italic;">${escapeHtml(p.entidad)}</div>
                    </div>
                    <span style="font-size:0.7rem;font-weight:800;background:${c.badge};color:#fff;border-radius:20px;padding:3px 10px;white-space:nowrap;flex-shrink:0;">${escapeHtml(p.nivel)}</span>
                </div>
                <p style="margin:0 0 10px;font-size:0.83rem;color:#334155;line-height:1.55;">${escapeHtml(p.descripcion)}</p>
                <div style="background:rgba(255,255,255,0.7);border:1px solid ${c.border}33;border-radius:8px;padding:10px 12px;">
                    <div style="font-size:0.7rem;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">&#128204; Aplicabilidad en San Bartolom&#233;</div>
                    <p style="margin:0;font-size:0.82rem;color:#475569;line-height:1.5;">${escapeHtml(p.aplicabilidad)}</p>
                </div>
                ${p.url?`<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;font-size:0.75rem;color:${c.badge};font-weight:600;text-decoration:none;">&#128279; Ver referencia &#8594;</a>`:''}
            </div>`;
        }).join('');
    };
    renderList(practicas.internacionales, 'llm-practicas-int');
    renderList(practicas.locales,         'llm-practicas-loc');
}

window.switchPracticas = function(tab) {
    const intEl=document.getElementById('llm-practicas-int'), locEl=document.getElementById('llm-practicas-loc');
    const btnI=document.getElementById('tab-practicas-int'), btnL=document.getElementById('tab-practicas-loc');
    if (!intEl||!locEl) return;
    if (tab==='int') {
        intEl.style.display='flex'; locEl.style.display='none';
        btnI.style.cssText='flex:1;padding:8px;border-radius:8px;border:2px solid #0e4eb0;background:#0e4eb0;color:#fff;font-weight:700;font-size:0.82rem;cursor:pointer;';
        btnL.style.cssText='flex:1;padding:8px;border-radius:8px;border:2px solid #D7CCC8;background:#fff;color:#4E342E;font-weight:700;font-size:0.82rem;cursor:pointer;';
    } else {
        intEl.style.display='none'; locEl.style.display='flex';
        btnL.style.cssText='flex:1;padding:8px;border-radius:8px;border:2px solid #16a34a;background:#16a34a;color:#fff;font-weight:700;font-size:0.82rem;cursor:pointer;';
        btnI.style.cssText='flex:1;padding:8px;border-radius:8px;border:2px solid #D7CCC8;background:#fff;color:#4E342E;font-weight:700;font-size:0.82rem;cursor:pointer;';
    }
};

// ── RECOMENDACIONES MINERAS ───────────────────────────────────
function renderRecMineras(rec) {
    const section = document.getElementById('llm-rec-mineras-section');
    if (!section) return;
    section.classList.remove('hidden');

    const esc = (s) => escapeHtml(String(s || ''));

    // ── Viabilidad ──
    const v = rec.viabilidad_social || {};
    const vColors = { ALTA: { bg:'#dcfce7', border:'#16a34a', text:'#14532d', badge:'#16a34a' },
                      MEDIA:{ bg:'#fef3c7', border:'#d97706', text:'#92400e', badge:'#d97706' },
                      BAJA: { bg:'#fee2e2', border:'#b91c1c', text:'#7f1d1d', badge:'#b91c1c' } };
    const vc = vColors[v.nivel] || vColors.BAJA;
    const viabEl = document.getElementById('llm-rec-viabilidad');
    if (viabEl) viabEl.innerHTML = `
        <div style="background:${vc.bg};border:2px solid ${vc.border};border-radius:14px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
                <div style="font-size:0.72rem;font-weight:700;color:${vc.text};text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Viabilidad Social del Proyecto Minero</div>
                <p style="margin:0;font-size:0.88rem;color:${vc.text};line-height:1.5;">${esc(v.resumen)}</p>
            </div>
            <span style="font-size:1.1rem;font-weight:800;background:${vc.badge};color:#fff;border-radius:12px;padding:8px 20px;white-space:nowrap;flex-shrink:0;">
                ${v.nivel === 'ALTA' ? '&#9989;' : v.nivel === 'MEDIA' ? '&#9888;&#65039;' : '&#10060;'} ${esc(v.nivel)}
            </span>
        </div>`;

    // ── Fortalezas ──
    const fortEl = document.getElementById('llm-rec-fortalezas');
    if (fortEl) fortEl.innerHTML = (rec.fortalezas || []).map(f => `
        <li style="display:flex;align-items:flex-start;gap:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;">
            <span style="color:#16a34a;font-weight:800;flex-shrink:0;margin-top:1px;">&#9650;</span>
            <span style="font-size:0.84rem;color:#166534;line-height:1.5;">${esc(f)}</span>
        </li>`).join('');

    // ── Riesgos críticos ──
    const riesEl = document.getElementById('llm-rec-riesgos');
    if (riesEl) riesEl.innerHTML = (rec.riesgos_criticos || []).map(r => `
        <li style="display:flex;align-items:flex-start;gap:10px;background:#fff1f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;">
            <span style="color:#b91c1c;font-weight:800;flex-shrink:0;margin-top:1px;">&#9660;</span>
            <span style="font-size:0.84rem;color:#7f1d1d;line-height:1.5;">${esc(r)}</span>
        </li>`).join('');

    // ── Acciones inmediatas ──
    const acEl = document.getElementById('llm-rec-acciones');
    const acIcons = ['&#128270;','&#9888;&#65039;','&#128176;','&#128101;','&#128203;'];
    if (acEl) acEl.innerHTML = (rec.acciones_inmediatas || []).map((a, i) => `
        <li style="display:flex;align-items:flex-start;gap:14px;background:#fff;border:1px solid #EDE0D0;border-left:4px solid ${i===0?'#b91c1c':'#6F4E37'};border-radius:10px;padding:12px 16px;">
            <span style="font-size:1.3rem;flex-shrink:0;">${acIcons[i % acIcons.length]}</span>
            <div>
                <span style="font-size:0.68rem;font-weight:800;color:${i===0?'#b91c1c':'#8D6E63'};text-transform:uppercase;letter-spacing:.08em;">${i===0?'&#9889; PRIORITARIO':'Acci&#243;n '+(i+1)}</span>
                <p style="margin:3px 0 0;font-size:0.87rem;color:#3E2723;line-height:1.55;">${esc(a)}</p>
            </div>
        </li>`).join('');

    // ── Pasos licenciamiento ──
    const pasEl = document.getElementById('llm-rec-pasos');
    const stepColors = ['#0e4eb0','#0369a1','#0891b2','#059669','#16a34a','#d97706','#6F4E37'];
    if (pasEl) pasEl.innerHTML = (rec.pasos_licenciamiento || []).map((p, i) => `
        <li style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;background:#fff;border:1px solid #EDE0D0;border-radius:10px;border-left:4px solid ${stepColors[i%stepColors.length]};">
            <span style="flex-shrink:0;min-width:24px;height:24px;border-radius:50%;background:${stepColors[i%stepColors.length]};color:#fff;font-size:0.72rem;font-weight:800;display:flex;align-items:center;justify-content:center;">${i+1}</span>
            <span style="font-size:0.85rem;color:#3E2723;line-height:1.5;">${esc(p)}</span>
        </li>`).join('');

    // ── Estrategia por zona ──
    const zonaEl = document.getElementById('llm-rec-zonas');
    if (zonaEl) zonaEl.innerHTML = (rec.estrategia_por_zona || []).map(z => {
        const rc = z.rechazo > 60 ? '#b91c1c' : z.rechazo > 40 ? '#d97706' : '#16a34a';
        const bg = z.rechazo > 60 ? '#fff1f2' : z.rechazo > 40 ? '#fffbeb' : '#f0fdf4';
        return `<div style="background:${bg};border:1px solid ${rc}44;border-top:3px solid ${rc};border-radius:12px;padding:14px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                <strong style="font-size:0.88rem;color:#3E2723;">${esc(z.zona)}</strong>
                <div style="display:flex;gap:6px;font-size:0.72rem;font-weight:700;">
                    <span style="background:rgba(34,197,94,0.15);color:#16a34a;border-radius:20px;padding:2px 8px;">&#9989; ${z.aceptacion}%</span>
                    <span style="background:rgba(239,68,68,0.15);color:#b91c1c;border-radius:20px;padding:2px 8px;">&#10007; ${z.rechazo}%</span>
                </div>
            </div>
            <p style="margin:0;font-size:0.82rem;color:#5D4037;line-height:1.5;">&#128204; ${esc(z.estrategia)}</p>
        </div>`;
    }).join('');

    // ── Semáforo de indicadores ──
    const semEl = document.getElementById('llm-rec-semaforo');
    const semColors = { verde:'#16a34a', naranja:'#d97706', rojo:'#b91c1c' };
    const semBg     = { verde:'#f0fdf4', naranja:'#fffbeb', rojo:'#fff1f2' };
    const semIcon   = { verde:'&#128994;', naranja:'&#128993;', rojo:'&#128308;' };
    if (semEl) semEl.innerHTML = (rec.indicadores_licencia_social || []).map(ind => {
        const sc = ind.semaforo || 'rojo';
        return `<div style="display:flex;align-items:center;gap:14px;background:${semBg[sc]};border:1px solid ${semColors[sc]}33;border-radius:10px;padding:12px 16px;">
            <span style="font-size:1.4rem;flex-shrink:0;">${semIcon[sc]}</span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.82rem;font-weight:700;color:#3E2723;">${esc(ind.indicador)}</div>
                <div style="font-size:0.75rem;color:#8D6E63;margin-top:2px;">Actual: <strong style="color:${semColors[sc]};">${esc(ind.actual)}</strong> &nbsp;&#8594;&nbsp; Meta: <strong>${esc(ind.meta)}</strong></div>
            </div>
            <span style="font-size:0.72rem;font-weight:800;background:${semColors[sc]};color:#fff;border-radius:20px;padding:4px 12px;white-space:nowrap;">${sc.toUpperCase()}</span>
        </div>`;
    }).join('');
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
                legend: { position: 'bottom', labels: { font: { size: 11, weight: '600' }, padding: 10, color: '#3E2723', usePointStyle: true } },
                tooltip: { backgroundColor: 'rgba(255,248,225,0.97)', titleColor: '#3E2723', bodyColor: '#6F4E37', borderColor: '#D7CCC8', borderWidth: 1, callbacks: { label: (c) => ' ' + c.label + ': ' + c.parsed + '%' } },
            },
            animation: { duration: 700 },
        },
    });
}

// ==========================================
// NVIDIA NEMOTRON LLM — SSE STREAMING
// ==========================================

// Dos fases: 1) stats instantáneo, 2) LLM completo en fetch normal
let _llmEventSource = null;

function generateLLMNvidia(force = false) {
    const sector  = document.getElementById('llm-sector-filter')?.value ?? 'general';
    const btn     = document.getElementById('llm-generate-btn');
    const loading = document.getElementById('llm-loading');
    const errBox  = document.getElementById('llm-error');
    const results = document.getElementById('llm-results');
    const thinking= document.getElementById('llm-thinking-box');
    const progBox = document.getElementById('llm-progress-msg');
    const zonasProg = document.getElementById('llm-zonas-progress');

    // Evitar peticiones duplicadas si ya esta procesando el mismo sector
    if (!force && _llmEventSource && window._llmCurrentSector === sector) {
        return; // Ya esta cargando
    }
    
    // Evitar recargar si ya tenemos los resultados del mismo sector en pantalla y no hay error
    if (!force && window._llmCurrentSector === sector && results && !results.classList.contains('hidden')) {
        return; 
    }

    window._llmCurrentSector = sector;

    // Cancelar si hay una solicitud en curso
    if (_llmEventSource) { _llmEventSource.close(); _llmEventSource = null; }

    if (btn) btn.disabled = true;
    if (loading) loading.classList.remove('hidden');
    if (errBox) errBox.classList.add('hidden');
    if (results) results.classList.add('hidden');
    if (thinking) { thinking.classList.add('hidden'); thinking.textContent = ''; }
    if (progBox) progBox.textContent = 'Iniciando análisis NVIDIA...';
    if (zonasProg) zonasProg.innerHTML = '';

    // ── RESET TOTAL: destruir todas las gráficas anteriores y limpiar los grids ──
    // Destruir todos los charts LLM anteriores (claves exactas de analisisState.charts)
    ['llm-radar', 'llm-zonas', 'llm-donut-global', 'llm-donut-llm-radar-chart'].forEach(k => destroyChart(k));
    Object.keys(analisisState.charts).filter(k =>
        k.startsWith('llm-dim-') || k.startsWith('llm-stats-dim-') ||
        k.startsWith('llm-zona-gauge-') || k.startsWith('llm-donut-')
    ).forEach(k => destroyChart(k));

    // Limpiar el canvas del radar manualmente
    const radarCanvas = document.getElementById('llm-radar-chart');
    if (radarCanvas && typeof Chart !== 'undefined') {
        const existingRadar = Chart.getChart(radarCanvas);
        if (existingRadar) existingRadar.destroy();
    }

    // Poner todos los grids en estado de espera (placeholder)
    ['llm-stats-dimensiones-grid', 'llm-zonas-llm-grid'].forEach(id => {
        const grid = document.getElementById(id);
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:48px 24px;
                            background:rgba(0,0,0,0.03);border-radius:12px;
                            border:2px dashed rgba(0,0,0,0.1);">
                    <div style="font-size:2rem;margin-bottom:12px;opacity:0.3;">&#9881;</div>
                    <p style="color:var(--text-muted,rgba(0,0,0,0.45));font-size:0.9rem;margin:0 0 4px;font-weight:600;">
                        Esperando an&aacute;lisis de IA
                    </p>
                    <p style="color:var(--text-muted,rgba(0,0,0,0.3));font-size:0.78rem;margin:0;">
                        Zona: <strong>${sector}</strong>
                    </p>
                </div>`;
        }
    });

    // Limpiar textos y listas que la IA llena
    ['llm-resumen', 'llm-conclusion', 'llm-factores', 'llm-recomendaciones',
     'llm-plan-fases', 'llm-plan-indicadores', 'llm-plan-acciones'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    // Construir URL SSE
    const base = apiUrl('llm_nvidia_stream', { sector });
    const es = new EventSource(base, { withCredentials: true });
    _llmEventSource = es;

    es.onmessage = function(e) {
        let obj;
        try { obj = JSON.parse(e.data); } catch(_) { return; }

        switch (obj.type) {
            case 'progress':
                if (progBox) progBox.textContent = obj.mensaje || '';
                if (zonasProg && obj.zonas && obj.zonas.length > 0) {
                    zonasProg.innerHTML = obj.zonas.map(z =>
                        `<span class="llm-zona-badge">${escapeHtml(z)}</span>`
                    ).join('');
                }
                break;

            case 'stats':
                if (results) results.classList.remove('hidden');
                if (obj.stats) { renderLLMStats(obj.stats); window._llmLastStats = obj.stats; }
                if (loading) loading.classList.add('hidden');
                if (btn) btn.disabled = false;
                // Mostrar indicador "IA enriqueciendo..." no bloqueante
                if (progBox) {
                    progBox.textContent = '';
                    const aiBox = document.getElementById('llm-ai-enriching');
                    if (aiBox) { aiBox.style.display = 'flex'; }
                }
                break;

            case 'thinking':
                // Solo actualizar caja de razonamiento en background — sin bloquear UI
                if (thinking) {
                    thinking.textContent += obj.text;
                    thinking.scrollTop = thinking.scrollHeight;
                }
                break;

            case 'result':
                if (results) results.classList.remove('hidden');
                if (btn) btn.disabled = false;
                if (loading) loading.classList.add('hidden');
                if (thinking) thinking.classList.add('hidden');

                // CRÍTICO: Cerrar conexión para que el navegador no intente reconectar y lance onerror
                es.close();
                _llmEventSource = null;
                const aiBoxResult = document.getElementById('llm-ai-enriching');
                if (aiBoxResult) aiBoxResult.style.display = 'none';

                // Guardar payload para generacion de PDF
                window._llmLastPayload = obj;

                // Renderizar DESPUÉS de que el browser haya recalculado el layout (container visible)
                // para que Chart.js mida las dimensiones reales del canvas
                requestAnimationFrame(() => {
                    setTimeout(() => renderLLMNvidia(obj), 50);
                });
                break;

            case 'llm_update':
                // Enriquecimiento NVIDIA llegó: actualizar solo texto narrativo
                if (obj.resumen_ejecutivo) setText('llm-resumen', obj.resumen_ejecutivo);
                if (obj.conclusion)        setText('llm-conclusion', obj.conclusion);
                if (obj.interpretaciones_dim && obj.interpretaciones_dim.length > 0) {
                    // Actualizar interpretaciones en las cards ya renderizadas
                    obj.interpretaciones_dim.forEach(d => {
                        const grid = document.getElementById('llm-stats-dimensiones-grid');
                        if (!grid) return;
                        grid.querySelectorAll('.analisis-interpretacion').forEach(el => {
                            const card = el.closest('[data-titulo]') || el.closest('.card');
                            const h4   = card && card.querySelector('h4');
                            if (h4 && h4.textContent.trim().includes(d.titulo)) {
                                el.textContent = d.interpretacion;
                            }
                        });
                    });
                }
                // Ocultar indicador "enriqueciendo"
                es.close(); _llmEventSource = null;
                const aiBox2 = document.getElementById('llm-ai-enriching');
                if (aiBox2) aiBox2.style.display = 'none';
                break;

            case 'error':
                es.close(); _llmEventSource = null;
                // Si ya mostramos stats, no mostrar error prominente — solo ocultar indicador
                const aiBox3 = document.getElementById('llm-ai-enriching');
                if (aiBox3) {
                    aiBox3.innerHTML = '⚠️ <span style="font-size:0.78rem;color:#f87171;">Texto IA no disponible — datos estadísticos mostrados.</span>';
                    setTimeout(() => { aiBox3.style.display = 'none'; }, 4000);
                } else if (errBox) {
                    errBox.textContent = 'Error: ' + (obj.error || 'Error desconocido');
                    errBox.classList.remove('hidden');
                }
                if (btn) btn.disabled = false;
                if (loading) loading.classList.add('hidden');
                break;
        }
    };

    es.onerror = function() {
        // Si ya cerramos intencionalmente, ignorar
        if (!_llmEventSource) return;
        es.close(); _llmEventSource = null;
        if (errBox) {
            errBox.textContent = 'Error de conexion con el servidor. Verifique su sesion e intentelo de nuevo.';
            errBox.classList.remove('hidden');
        }
        if (btn) btn.disabled = false;
        if (loading) loading.classList.add('hidden');
    };
}

/** Muestra estadísticas locales calculadas por Python ANTES de que el LLM responda */
function renderLLMStats(stats) {
    // Probabilidades globales estadísticas
    const probs = stats.probabilidades_globales || {};
    setText('llm-prob-aceptacion', (probs.Aceptacion ?? '--') + '%');
    setText('llm-prob-neutral',    (probs.Neutral    ?? '--') + '%');
    setText('llm-prob-rechazo',    (probs.Rechazo    ?? '--') + '%');
    setText('llm-prediccion', stats.prediccion_global || '--');

    // Actualizar color del KPI prediccion
    const predEl = document.getElementById('llm-prediccion');
    if (predEl) {
        const pred = stats.prediccion_global || '';
        predEl.style.color = pred === 'Aceptacion' ? '#22c55e' : pred === 'Rechazo' ? '#ef4444' : '#f59e0b';
    }

    // Actualizar barra de sentimiento global con etiquetas
    const bA = document.getElementById('llm-bar-acept');
    const bN = document.getElementById('llm-bar-neutr');
    const bR = document.getElementById('llm-bar-rech');
    if (bA && bN && bR) {
        const pa = probs.Aceptacion ?? 0, pn = probs.Neutral ?? 0, pr = probs.Rechazo ?? 0;
        bA.style.width = pa + '%';
        bN.style.width = pn + '%';
        bR.style.width = pr + '%';
        // Etiquetas dentro de la barra
        const lA = document.getElementById('llm-bar-acept-label');
        const lN = document.getElementById('llm-bar-neutr-label');
        const lR = document.getElementById('llm-bar-rech-label');
        if (lA) lA.textContent = pa >= 8 ? pa + '%' : '';
        if (lN) lN.textContent = pn >= 8 ? pn + '%' : '';
        if (lR) lR.textContent = pr >= 8 ? pr + '%' : '';
        // Leyenda con valores
        const vA = document.getElementById('llm-sent-acept-val');
        const vN = document.getElementById('llm-sent-neutr-val');
        const vR = document.getElementById('llm-sent-rech-val');
        if (vA) vA.textContent = pa + '%';
        if (vN) vN.textContent = pn + '%';
        if (vR) vR.textContent = pr + '%';
    }

    // Gráfica donut sentimiento global estadístico
    renderLLMSentimientoDonut(stats.sentimiento_global || probs, 'llm-donut-stats');

    // Gráfica barras por sector
    renderLLMZonasChart(stats.sectores_detalle || []);

    // En lugar de renderizar inmediatamente con stats locales, ponemos placeholders
    // para que sea la IA quien llene todo (según la petición del usuario).
    
    const gridsToWait = ['llm-stats-dimensiones-grid', 'llm-zonas-llm-grid'];
    gridsToWait.forEach(id => {
        const grid = document.getElementById(id);
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:48px 24px;
                            background:rgba(111,78,55,0.04);border-radius:12px;
                            border:2px dashed #D7CCC8;">
                    <div style="font-size:2rem;margin-bottom:12px;opacity:0.5;">⚙️</div>
                    <p style="color:#6F4E37;font-size:0.9rem;margin:0 0 4px;font-weight:600;">
                        Esperando análisis de IA
                    </p>
                    <p style="color:#8D6E63;font-size:0.78rem;margin:0;">
                        Los resultados detallados aparecerán aquí cuando NVIDIA finalice el análisis.
                    </p>
                </div>`;
        }
    });

    // Limpiar radar chart para que empiece en blanco
    const radarCtx = document.getElementById('llm-radar-chart');
    if (radarCtx && typeof Chart !== 'undefined') {
        destroyChart('llm-radar-chart-obj');
        const ctx2d = radarCtx.getContext('2d');
        if (ctx2d) ctx2d.clearRect(0, 0, radarCtx.width, radarCtx.height);
    }
}

function renderLLMNvidia(payload) {
    // Motor, zona activa y resumen
    const motor = payload.motor || 'NVIDIA Nemotron-3-Super-120B';
    setText('llm-motor-badge', motor);
    setText('llm-resumen', payload.resumen_ejecutivo || '');
    setText('llm-conclusion', payload.conclusion || '');

    // Actualizar badge de zona activa en todos los lugares donde aparece
    const sector = document.getElementById('llm-sector-filter')?.value || 'general';
    const sectorLabel = sector === 'general' ? 'Todas las zonas' : sector;
    const zonaBadge = document.getElementById('llm-zona-activa-badge');
    if (zonaBadge) zonaBadge.textContent = sectorLabel;
    const factoresBadge = document.getElementById('llm-factores-sector-badge');
    if (factoresBadge) factoresBadge.textContent = '\u{1F5FA}️ ' + sectorLabel;
    const sentZonaLabel = document.getElementById('llm-sentiment-zona-label');
    if (sentZonaLabel) sentZonaLabel.textContent = sectorLabel;

    // Grafica importancia de factores
    if (payload.importancia_factores && payload.importancia_factores.length)
        renderFactoresChart(payload.importancia_factores);
    // Ejes estrategicos
    if (payload.ejes_estrategicos && payload.ejes_estrategicos.length)
        renderEjesEstrategicos(payload.ejes_estrategicos);
    // Mejores practicas
    if (payload.mejores_practicas)
        renderMejoresPracticas(payload.mejores_practicas);
    // Recomendaciones mineras
    if (payload.recomendaciones_mineras)
        renderRecMineras(payload.recomendaciones_mineras);

    setText('llm-prediccion', payload.prediccion_global || '--');

    // Enriquecer card de conclusión con resumen visual
    const conclusionCard = document.getElementById('llm-conclusion-card');
    if (conclusionCard && payload.prediccion_global) {
        const pred = payload.prediccion_global;
        const prbs = payload.probabilidades_globales || {};
        const isAcept = pred === 'Aceptacion' || pred === 'Aceptación';
        const isRech  = pred === 'Rechazo';
        const accent  = isAcept ? '#16a34a' : isRech ? '#b91c1c' : '#d97706';
        const bgFrom  = isAcept ? '#f0fdf4' : isRech ? '#fff1f2' : '#fffbeb';
        const bgTo    = isAcept ? '#dcfce7' : isRech ? '#ffe4e6' : '#fef3c7';
        const hdr     = conclusionCard.querySelector('div:first-child');
        if (hdr) {
            hdr.style.background = `linear-gradient(135deg,${bgFrom} 0%,${bgTo} 100%)`;
            hdr.style.borderBottomColor = accent + '55';
            const icon = isAcept ? '&#10003;' : isRech ? '&#9888;' : '&#9878;';
            hdr.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;gap:12px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.3rem;">${icon}</span>
                        <h4 style="margin:0;color:#14532d;font-size:1rem;font-weight:700;">Conclusi&#243;n General del An&#225;lisis IA</h4>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:0.78rem;font-weight:700;background:rgba(34,197,94,0.15);color:#16a34a;border-radius:20px;padding:3px 12px;border:1px solid #16a34a55;">&#10003; ${prbs.Aceptacion ?? '--'}% Aceptaci&#243;n</span>
                        <span style="font-size:0.78rem;font-weight:700;background:rgba(245,158,11,0.15);color:#d97706;border-radius:20px;padding:3px 12px;border:1px solid #d9770655;">&#9878;&#65039; ${prbs.Neutral ?? '--'}% Neutral</span>
                        <span style="font-size:0.78rem;font-weight:700;background:rgba(239,68,68,0.15);color:#b91c1c;border-radius:20px;padding:3px 12px;border:1px solid #b91c1c55;">&#10007; ${prbs.Rechazo ?? '--'}% Rechazo</span>
                    </div>
                </div>`;
        }
    }

    const probs = payload.probabilidades_globales || {};
    setText('llm-prob-aceptacion', (probs.Aceptacion ?? '--') + '%');
    setText('llm-prob-neutral',    (probs.Neutral    ?? '--') + '%');
    setText('llm-prob-rechazo',    (probs.Rechazo    ?? '--') + '%');

    // Actualizar color de prediccion
    const predEl2 = document.getElementById('llm-prediccion');
    if (predEl2) {
        const pred2 = payload.prediccion_global || '';
        predEl2.style.color = pred2 === 'Aceptacion' ? '#22c55e' : pred2 === 'Rechazo' ? '#ef4444' : '#f59e0b';
    }

    // Actualizar barra de sentimiento con etiquetas
    const bA2 = document.getElementById('llm-bar-acept');
    const bN2 = document.getElementById('llm-bar-neutr');
    const bR2 = document.getElementById('llm-bar-rech');
    if (bA2 && bN2 && bR2) {
        const pa2 = probs.Aceptacion ?? 0;
        const pn2 = probs.Neutral    ?? 0;
        const pr2 = probs.Rechazo    ?? 0;
        bA2.style.width = pa2 + '%';
        bN2.style.width = pn2 + '%';
        bR2.style.width = pr2 + '%';
        const lA2 = document.getElementById('llm-bar-acept-label');
        const lN2 = document.getElementById('llm-bar-neutr-label');
        const lR2 = document.getElementById('llm-bar-rech-label');
        if (lA2) lA2.textContent = pa2 >= 8 ? pa2 + '%' : '';
        if (lN2) lN2.textContent = pn2 >= 8 ? pn2 + '%' : '';
        if (lR2) lR2.textContent = pr2 >= 8 ? pr2 + '%' : '';
        const vA2 = document.getElementById('llm-sent-acept-val');
        const vN2 = document.getElementById('llm-sent-neutr-val');
        const vR2 = document.getElementById('llm-sent-rech-val');
        if (vA2) vA2.textContent = pa2 + '%';
        if (vN2) vN2.textContent = pn2 + '%';
        if (vR2) vR2.textContent = pr2 + '%';
    }

    // Actualizar donut de stats con datos del LLM
    renderLLMSentimientoDonut(payload.sentimiento_global || probs, 'llm-donut-stats');

    // Factores de importancia
    const factoresBox = document.getElementById('llm-factores');
    if (factoresBox) {
        const facts = payload.importancia_factores || [];
        const fColors = ['#ef4444','#f97316','#f59e0b','#84cc16','#22c55e'];
        factoresBox.innerHTML = facts.map((f, i) => {
            const col = fColors[Math.min(i, fColors.length - 1)];
            return `<li style="margin-bottom:10px;list-style:none;padding:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                    <span style="font-size:0.85rem;color:var(--text-color);font-weight:500;">${i+1}. ${escapeHtml(f.factor)}</span>
                    <span style="font-size:0.78rem;color:${col};font-weight:700;min-width:38px;text-align:right;">${f.score_pct}%</span>
                </div>
                <div style="background:#EDE0D0;border-radius:4px;height:6px;overflow:hidden;">
                    <div style="width:${f.score_pct}%;height:100%;background:${col};border-radius:4px;transition:width 0.9s ease;"></div>
                </div>
            </li>`;
        }).join('');
    }

    // Recomendaciones
    const recsBox = document.getElementById('llm-recomendaciones');
    if (recsBox) {
        const recs = payload.recomendaciones_ia || [];
        recsBox.innerHTML = recs.map(r =>
            `<li style="margin-bottom:8px;padding-left:4px;border-left:3px solid #3b82f6;">${escapeHtml(r)}</li>`
        ).join('');
    }

    // Análisis por zona (LLM)
    const zonasIA = payload.analisis_por_zona || payload.stats_locales?.sectores_detalle || [];
    renderLLMAnalissiZonas(zonasIA);
    // Actualizar la gráfica de barras con los datos procesados por NVIDIA
    if (zonasIA.length > 0) {
        renderLLMZonasChart(zonasIA, true);
    }

    // Dimensiones con gráficas
    if (payload.dimensiones && payload.dimensiones.length > 0) {
        // Llenamos el grid superior de Sentimientos por Dimensión
        renderLLMDimensiones(payload.dimensiones, 'llm-stats-dimensiones-grid', 'llm-stats-dim-');
        renderLLMRadarChart(payload.dimensiones);
    }

    // Plan estratégico
    const plan = payload.plan_estrategico || {};
    setText('llm-plan-titulo', plan.titulo || 'Plan Estratégico');
    setText('llm-plan-diagnostico', plan.diagnostico_contextual || '');

    // Fases del plan
    const fasesBox = document.getElementById('llm-plan-fases');
    if (fasesBox && plan.fases && plan.fases.length > 0) {
        // Paleta de colores por número de fase
        const faseColors = [
            { border: '#d97706', bg: 'rgba(245,158,11,0.07)', badge: '#fef3c7', badgeText: '#92400e', icon: '\u{1F50D}' }, // Fase 0 — Diagn&#243;stico
            { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)', badge: '#dbeafe', badgeText: '#1e40af', icon: '\u{1F91D}' }, // Fase 1 — Socializaci&#243;n
            { border: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', badge: '#ede9fe', badgeText: '#5b21b6', icon: '\u{1F4CB}' }, // Fase 2 — Di&#225;logo
            { border: '#22c55e', bg: 'rgba(34,197,94,0.06)',  badge: '#dcfce7', badgeText: '#14532d', icon: '\u{1F4CA}' }, // Fase 3 — Monitoreo
        ];
        fasesBox.innerHTML = plan.fases.map((f, idx) => {
            const c = faseColors[idx % faseColors.length];
            // Extraer número de fase del nombre si existe
            const numMatch = f.fase.match(/\d+/);
            const faseNum  = numMatch ? parseInt(numMatch[0]) : idx;
            const color    = faseColors[faseNum % faseColors.length];
            return `
            <div style="background:${color.bg};border:1px solid ${color.border}33;border-top:4px solid ${color.border};border-radius:14px;padding:18px;position:relative;overflow:hidden;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
                        <span style="font-size:1.4rem;flex-shrink:0;">${color.icon}</span>
                        <h4 style="margin:0;font-size:0.95rem;font-weight:700;color:#3E2723;line-height:1.3;">${escapeHtml(f.fase)}</h4>
                    </div>
                    <span style="flex-shrink:0;font-size:0.72rem;font-weight:700;background:${color.badge};color:${color.badgeText};border-radius:20px;padding:3px 10px;white-space:nowrap;">\u{1F4C5} ${escapeHtml(f.periodo)}</span>
                </div>
                <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;">
                    ${(f.acciones || []).map(a => `
                    <li style="display:flex;align-items:flex-start;gap:8px;font-size:0.84rem;color:#5D4037;line-height:1.5;">
                        <span style="flex-shrink:0;color:${color.border};font-weight:700;margin-top:1px;">&#9656;</span>
                        <span>${escapeHtml(a)}</span>
                    </li>`).join('')}
                </ul>
            </div>`;
        }).join('');
    }

    // Indicadores del plan
    const indBox = document.getElementById('llm-plan-indicadores');
    if (indBox && plan.indicadores && plan.indicadores.length > 0) {
        indBox.innerHTML = plan.indicadores.map((ind, i) => {
            const isEven = i % 2 === 0;
            // Detectar si la meta es positiva (tiene >, >=, Favorable) o crítica
            const metaLower = (ind.meta || '').toLowerCase();
            const metaColor = metaLower.includes('favorable') ? '#16a34a'
                            : metaLower.startsWith('>') || metaLower.startsWith('>=') ? '#0369a1'
                            : '#6F4E37';
            return `<tr style="border-bottom:1px solid #EDE0D0;${isEven ? '' : 'background:#FFFDF7;'}">
                <td style="padding:12px 16px;color:#3E2723;font-weight:500;">${escapeHtml(ind.nombre)}</td>
                <td style="padding:12px 16px;font-weight:700;color:${metaColor};">${escapeHtml(ind.meta)}</td>
                <td style="padding:12px 16px;color:#8D6E63;">
                    <span style="background:#FFF8E1;border:1px solid #EDE0D0;border-radius:20px;padding:2px 10px;font-size:0.82rem;white-space:nowrap;">${escapeHtml(ind.plazo)}</span>
                </td>
            </tr>`;
        }).join('');
    }

    // Acciones Finales
    const accionesBox = document.getElementById('llm-plan-acciones');
    if (accionesBox) {
        const acciones = plan.recomendaciones_finales || [];
        const accionIcons = ['\u{1F3AF}', '\u{1F517}', '\u{1F4E2}', '\u2705', '\u2699\uFE0F', '\u{1F4CC}'];
        accionesBox.innerHTML = acciones.map((a, i) => `
            <li style="display:flex;align-items:flex-start;gap:14px;background:#fff;border:1px solid #EDE0D0;border-left:4px solid #6F4E37;border-radius:10px;padding:12px 16px;">
                <span style="font-size:1.2rem;flex-shrink:0;line-height:1.4;">${accionIcons[i % accionIcons.length]}</span>
                <div>
                    <span style="font-size:0.7rem;font-weight:700;color:#8D6E63;text-transform:uppercase;letter-spacing:.08em;">Acci&#243;n ${i + 1}</span>
                    <p style="margin:2px 0 0;font-size:0.88rem;color:#3E2723;line-height:1.55;">${escapeHtml(a)}</p>
                </div>
            </li>`).join('');
    }
}

/** Recomendaciones mineras basadas en datos de encuestas */

/** Donut de sentimiento (positivo/neutro/negativo) */
function renderLLMSentimientoDonut(sentData, canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    destroyChart('llm-donut-' + canvasId);

    const pos = sentData.positivo_pct ?? sentData.Aceptacion ?? 0;
    const neu = sentData.neutro_pct   ?? sentData.Neutral    ?? 0;
    const neg = sentData.negativo_pct ?? sentData.Rechazo    ?? 0;

    analisisState.charts['llm-donut-' + canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Aceptaci\u00f3n', 'Neutro', 'Rechazo'],
            datasets: [{
                data: [pos, neu, neg],
                backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                borderColor: ['#16a34a', '#d97706', '#dc2626'],
                borderWidth: 2,
                hoverOffset: 8,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#3E2723',
                        font: { size: 12, weight: '600' },
                        padding: 16,
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true,
                        pointStyleWidth: 12,
                    },
                },
                tooltip: { backgroundColor: 'rgba(255,248,225,0.97)', titleColor: '#3E2723', bodyColor: '#6F4E37', borderColor: '#D7CCC8', borderWidth: 1, callbacks: { label: (c) => ` ${c.label}: ${c.parsed.toFixed(1)}%` } },
            },
            animation: { duration: 900, easing: 'easeInOutQuart' },
        },
    });
}

/** Gráfica de barras por zona (estadístico) */
function renderLLMZonasChart(sectores, fromIA = false) {
    const ctx = document.getElementById('llm-zonas-chart');
    if (!ctx || !sectores.length || typeof Chart === 'undefined') return;
    destroyChart('llm-zonas');

    // Normalizar: la IA usa campo "zona", las estad\u00edsticas usan "sector"
    const normalized = sectores.map(s => ({
        sector: s.zona || s.sector || '\u2014',
        aceptacion_pct: s.aceptacion_pct ?? 0,
        neutral_pct:    s.neutral_pct    ?? 0,
        rechazo_pct:    s.rechazo_pct    ?? 0,
        n:              s.n              ?? 0,
        prediccion:     s.prediccion     || null,
        hallazgo_clave: s.hallazgo_clave || null,
    }));

    // Actualizar badge de fuente en el encabezado de la secci\u00f3n
    const badge = document.getElementById('llm-zonas-chart-badge');
    if (badge) {
        badge.textContent = fromIA ? '\ud83e\udd16 Datos analizados por NVIDIA' : '\ud83d\udcca Datos estad\u00edsticos';
        badge.style.background = fromIA ? 'rgba(34,197,94,0.12)' : 'rgba(111,78,55,0.08)';
        badge.style.color       = fromIA ? '#16a34a'               : '#8D6E63';
        badge.style.borderColor = fromIA ? '#16a34a'               : '#D7CCC8';
    }

    // Colores del tema claro
    const INK   = '#3E2723';   // texto principal
    const MUTED = '#8D6E63';   // texto secundario
    const GRID  = '#D7CCC8';   // l\u00edneas de cuadr\u00edcula

    const labels = normalized.map(s => {
        // Wrap long zone names into two lines for legibility
        const name = s.sector || '';
        return name.length > 14 ? name.match(/.{1,14}(\s|$)/g) || [name] : name;
    });

    // Colores de barra: si viene de IA, resaltar seg\u00fan predicci\u00f3n
    const barColorAcept = normalized.map(s =>
        fromIA && s.prediccion === 'Rechazo' ? 'rgba(34,197,94,0.45)' : 'rgba(34,197,94,0.87)'
    );
    const barColorRech = normalized.map(s =>
        fromIA && s.prediccion === 'Rechazo' ? 'rgba(239,68,68,0.95)' : 'rgba(239,68,68,0.85)'
    );

    analisisState.charts['llm-zonas'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '\u2705 Aceptaci\u00f3n',
                    data: normalized.map(s => s.aceptacion_pct),
                    backgroundColor: barColorAcept,
                    borderColor: '#16a34a',
                    borderWidth: 1,
                    borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
                },
                {
                    label: '\u2696\ufe0f Neutral',
                    data: normalized.map(s => s.neutral_pct),
                    backgroundColor: 'rgba(245,158,11,0.85)',
                    borderColor: '#d97706',
                    borderWidth: 1,
                    borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
                },
                {
                    label: '\u274c Rechazo',
                    data: normalized.map(s => s.rechazo_pct),
                    backgroundColor: barColorRech,
                    borderColor: '#b91c1c',
                    borderWidth: 1,
                    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: {
                        color: INK,
                        font: { size: 11, weight: '600' },
                        maxRotation: 30,
                        minRotation: 0,
                    },
                    border: { color: GRID },
                },
                y: {
                    stacked: true,
                    max: 100,
                    ticks: {
                        color: MUTED,
                        font: { size: 11 },
                        callback: v => v + '%',
                    },
                    grid: { color: GRID },
                    border: { color: GRID },
                    title: {
                        display: true,
                        text: 'Porcentaje de respuestas (%)',
                        color: MUTED,
                        font: { size: 11 },
                    },
                },
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: INK,
                        font: { size: 12, weight: '600' },
                        padding: 18,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(255,248,225,0.97)',
                    titleColor: INK,
                    bodyColor: MUTED,
                    borderColor: GRID,
                    borderWidth: 1,
                    callbacks: {
                        title: (items) => `Zona: ${normalized[items[0].dataIndex]?.sector || ''}`,
                        label: (c) => `  ${c.dataset.label.replace(/^.\s/, '')}: ${c.parsed.y}%`,
                        afterBody: (items) => {
                            const i = items[0]?.dataIndex;
                            if (i == null) return '';
                            const s = normalized[i];
                            const lines = [`  Total encuestas: ${s.n ?? '\u2014'}`];
                            if (fromIA && s.prediccion) {
                                const icon = s.prediccion === 'Aceptacion' ? '\u2705' : s.prediccion === 'Rechazo' ? '\u274c' : '\u2696\ufe0f';
                                lines.push(`  Predicci\u00f3n IA: ${icon} ${s.prediccion}`);
                            }
                            if (fromIA && s.hallazgo_clave) {
                                lines.push(`  \ud83d\udca1 ${s.hallazgo_clave}`);
                            }
                            return lines;
                        },
                    },
                },
            },
            animation: { duration: 700 },
        },
    });
}

/** Análisis por zona generado por el LLM */
function renderLLMAnalissiZonas(zonas) {
    const box = document.getElementById('llm-zonas-llm-grid');
    if (!box) return;
    if (!zonas || !zonas.length) { box.innerHTML = ''; return; }

    Object.keys(analisisState.charts).filter(k => k.startsWith('llm-zona-gauge-')).forEach(k => destroyChart(k));

    box.innerHTML = zonas.map((z, i) => {
        const pred = z.prediccion || (z.aceptacion_pct >= z.rechazo_pct ? 'Aceptacion' : 'Rechazo');
        const color = pred === 'Aceptacion' ? '#22c55e' : pred === 'Rechazo' ? '#ef4444' : '#f59e0b';
        const icon  = pred === 'Aceptacion' ? '&#10004;' : pred === 'Rechazo' ? '&#10008;' : '&#9888;';
        const acept = z.aceptacion_pct ?? 0;
        const neutr = z.neutral_pct ?? 0;
        const rech  = z.rechazo_pct ?? 0;
        const chartId = 'zona-gauge-' + i;

        return `
        <div class="card analisis-dim-card" style="border-top:3px solid ${color};padding:20px;position:relative;overflow:hidden;text-align:center;">
            <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${color}80,${color});"></div>
            <div style="margin-bottom:12px;">
                <h4 style="font-size:1.15rem;font-weight:700;color:var(--text-color);margin:0;margin-bottom:8px;">${icon} ${escapeHtml(z.zona || z.sector || '')}</h4>
                <span style="font-size:0.75rem;background:rgba(255,255,255,0.08);color:#94a3b8;border-radius:20px;padding:4px 14px;white-space:nowrap;letter-spacing:0.5px;">${z.n ?? 0} encuestas evaluadas</span>
            </div>
            
            <div style="position:relative;width:100%;height:140px;margin-bottom:16px;margin-top:16px;">
                <canvas id="${chartId}"></canvas>
                <div style="position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:1.4rem;font-weight:800;color:${color};">
                    ${acept}%<br><span style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Aceptaci&#243;n</span>
                </div>
            </div>
            <div style="display:flex;justify-content:center;gap:12px;font-size:0.75rem;margin-bottom:14px;color:rgba(255,255,255,0.6);">
                <span><span style="color:#22c55e;">&#9679;</span> ${acept}%</span>
                <span><span style="color:#f59e0b;">&#9679;</span> ${neutr}%</span>
                <span><span style="color:#ef4444;">&#9679;</span> ${rech}%</span>
            </div>
            
            ${z.hallazgo_clave ? `<p style="font-size:0.88rem;color:var(--text-muted);margin:0;line-height:1.6;border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;text-align:left;">${escapeHtml(z.hallazgo_clave)}</p>` : ''}
        </div>`;
    }).join('');

    setTimeout(() => {
        if(typeof Chart === 'undefined') return;
        zonas.forEach((z, i) => {
            const ctx = document.getElementById('zona-gauge-' + i);
            if (!ctx) return;
            const acept = z.aceptacion_pct ?? 0;
            const neutr = z.neutral_pct ?? 0;
            const rech  = z.rechazo_pct ?? 0;
            
            analisisState.charts['llm-zona-gauge-' + i] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Aceptaci\u00f3n', 'Neutral', 'Rechazo'],
                    datasets: [{
                        data: [acept, neutr, rech],
                        backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                        borderWidth: 0,
                        hoverOffset: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    circumference: 180,
                    rotation: -90,
                    cutout: '80%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}%` } }
                    },
                    animation: { duration: 1200, easing: 'easeOutCubic' }
                }
            });
        });
    }, 100);
}

function renderLLMRadarChart(dimensiones) {
    const ctx = document.getElementById('llm-radar-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    destroyChart('llm-radar');
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    // IDENTICO a renderRadarDimensiones: escala -100 a +100, fondo oscuro
    const labels = dimensiones.map(d => d.titulo || '');
    const vals   = dimensiones.map(d => d.sentimiento?.indice ?? 0);
    const pointColors = vals.map(v =>
        v >= 10 ? '#0f9f6e' : v <= -10 ? '#c43d45' : '#d97706'
    );

    analisisState.charts['llm-radar'] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels,
            datasets: [{
                label: '\u00cdndice Neto de Sentimiento (pts)',
                data: vals,
                backgroundColor: 'rgba(56,189,248,0.2)',
                borderColor: '#38bdf8',
                borderWidth: 2.5,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 9,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: -100, max: 100,
                    ticks: {
                        stepSize: 25,
                        font: { size: 12, weight: '600' },
                        color: 'rgba(255,255,255,0.75)',
                        backdropColor: 'rgba(10,20,50,0.45)',
                        z: 10,
                        callback: v => (v > 0 ? '+' : '') + v,
                    },
                    pointLabels: {
                        font: { size: 13, weight: 'bold' },
                        color: (ctx2) => {
                            const v = vals[ctx2.index] ?? 0;
                            return v >= 10 ? '#4ade80' : v <= -10 ? '#f87171' : '#fbbf24';
                        },
                        padding: 8,
                    },
                    grid:       { color: 'rgba(255,255,255,0.12)', circular: true },
                    angleLines: { color: 'rgba(255,255,255,0.15)' },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,20,50,0.92)',
                    titleColor: '#fff',
                    bodyColor: 'rgba(255,255,255,0.8)',
                    borderColor: 'rgba(56,189,248,0.4)',
                    borderWidth: 1,
                    callbacks: {
                        title: (items) => dimensiones[items[0].dataIndex]?.titulo || '',
                        label: ctx2 => {
                            const v = ctx2.raw;
                            const lbl = v >= 10 ? 'Favorable' : v <= -10 ? 'Critico' : 'Neutro';
                            return ' ' + lbl + ': ' + (v > 0 ? '+' : '') + v + ' pts';
                        },
                    },
                },
            },
            animation: { duration: 900, easing: 'easeInOutQuart' },
        },
    });
}

function renderLLMDimensiones(dimensiones, gridId, chartPrefix) {
    gridId      = gridId      || 'llm-stats-dimensiones-grid';
    chartPrefix = chartPrefix || 'llm-dim-';
    const grid = document.getElementById(gridId);
    if (!grid) return;

    // Destruir charts anteriores
    Object.keys(analisisState.charts).filter(k => k.startsWith(chartPrefix)).forEach(k => destroyChart(k));
    grid.innerHTML = '';

    dimensiones.forEach((dim, idx) => {
        const sent        = dim.sentimiento || { indice: 0, positivo_pct: 0, neutro_pct: 0, negativo_pct: 0 };
        const items       = ((dim.distribucion && dim.distribucion.items) ? dim.distribucion.items : []).slice(0, 7);
        const idxVal      = sent.indice ?? 0;
        const sentClass   = idxVal >= 15 ? 'sent-positive' : idxVal <= -15 ? 'sent-negative' : 'sent-neutral';
        const sentLabel   = idxVal >= 15 ? 'Favorable' : idxVal <= -15 ? 'Critico' : 'Ambivalente';
        const accentColor = idxVal >= 15 ? '#22c55e' : idxVal <= -15 ? '#ef4444' : '#f59e0b';
        const gaugeId     = 'gauge-' + chartPrefix + idx;
        const barId       = 'bar-'   + chartPrefix + idx;
        const gaugeVal    = Math.round(((idxVal + 100) / 2));

        const card = document.createElement('div');
        card.className = 'card analisis-dim-card';
        card.style.cssText = `border-top:3px solid ${accentColor};padding:20px;position:relative;overflow:hidden;`;

        card.innerHTML = `
            <div style="position:absolute;top:0;right:0;width:110px;height:110px;
                        background:radial-gradient(circle at top right,${accentColor}22,transparent 70%);
                        pointer-events:none;"></div>

            <div class="analisis-dim-header" style="margin-bottom:14px;">
                <h4 class="analisis-dim-titulo" style="font-size:1rem;font-weight:700;color:var(--text-color, #1e293b);margin:0 0 6px;line-height:1.35;">
                    ${escapeHtml(dim.titulo)}
                </h4>
                <span class="analisis-sent-badge ${sentClass}" style="font-size:0.78rem;padding:3px 10px;border-radius:20px;">
                    ${sentLabel}&nbsp;&nbsp;(${idxVal >= 0 ? '+' : ''}${idxVal} pts)
                </span>
            </div>

            <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                <div style="position:relative;width:106px;height:106px;flex-shrink:0;">
                    <canvas id="${gaugeId}" width="106" height="106"></canvas>
                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;
                                align-items:center;justify-content:center;padding-top:18px;">
                        <span style="font-size:1.4rem;font-weight:800;color:${accentColor};line-height:1;">
                            ${idxVal >= 0 ? '+' : ''}${idxVal}
                        </span>
                        <span style="font-size:0.58rem;color:var(--text-muted, rgba(0,0,0,0.45));text-transform:uppercase;letter-spacing:0.6px;margin-top:2px;">índice</span>
                    </div>
                </div>
                <div style="flex:1;display:flex;flex-direction:column;gap:7px;">
                    <div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:0.73rem;color:#4ade80;font-weight:600;">&#9679; Positivo</span>
                            <span style="font-size:0.73rem;color:#4ade80;font-weight:700;">${sent.positivo_pct}%</span>
                        </div>
                        <div style="background:var(--border-color, rgba(0,0,0,0.06));border-radius:4px;height:6px;overflow:hidden;">
                            <div style="width:${sent.positivo_pct}%;height:100%;background:linear-gradient(90deg,#16a34a,#4ade80);border-radius:4px;"></div>
                        </div>
                    </div>
                    <div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:0.73rem;color:#fbbf24;font-weight:600;">&#9679; Neutro</span>
                            <span style="font-size:0.73rem;color:#fbbf24;font-weight:700;">${sent.neutro_pct}%</span>
                        </div>
                        <div style="background:var(--border-color, rgba(0,0,0,0.06));border-radius:4px;height:6px;overflow:hidden;">
                            <div style="width:${sent.neutro_pct}%;height:100%;background:linear-gradient(90deg,#b45309,#fbbf24);border-radius:4px;"></div>
                        </div>
                    </div>
                    <div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                            <span style="font-size:0.73rem;color:#f87171;font-weight:600;">&#9679; Negativo</span>
                            <span style="font-size:0.73rem;color:#f87171;font-weight:700;">${sent.negativo_pct}%</span>
                        </div>
                        <div style="background:var(--border-color, rgba(0,0,0,0.06));border-radius:4px;height:6px;overflow:hidden;">
                            <div style="width:${sent.negativo_pct}%;height:100%;background:linear-gradient(90deg,#b91c1c,#f87171);border-radius:4px;"></div>
                        </div>
                    </div>
                </div>
            </div>

            ${items.length > 0 ? `
            <div style="margin-bottom:12px;">
                <p style="font-size:0.68rem;font-weight:700;color:var(--text-muted, rgba(0,0,0,0.5));text-transform:uppercase;
                           letter-spacing:1px;margin:0 0 7px;">Distribución de respuestas</p>
                <div style="position:relative;height:${Math.max(60, items.length * 22)}px;">
                    <canvas id="${barId}"></canvas>
                </div>
            </div>` : ''}

            ${dim.interpretacion ? `
            <div style="background:var(--bg-lighter, rgba(0,0,0,0.025));border-left:3px solid ${accentColor};
                        border-radius:0 6px 6px 0;padding:9px 12px;margin-top:6px;">
                <p style="font-size:0.78rem;color:var(--text-color, #334155);margin:0;line-height:1.55;">
                    ${escapeHtml(dim.interpretacion)}
                </p>
            </div>` : ''}
        `;
        grid.appendChild(card);

        if (typeof Chart !== 'undefined') {
            // --- Gauge (doughnut semicircular) ---
            const gCtx = document.getElementById(gaugeId);
            if (gCtx) {
                analisisState.charts[chartPrefix + 'g' + idx] = new Chart(gCtx, {
                    type: 'doughnut',
                    data: {
                        datasets: [{
                            data: [gaugeVal, 100 - gaugeVal],
                            backgroundColor: [accentColor, '#EDE0D0'],
                            borderWidth: 0,
                            borderRadius: [5, 0],
                        }],
                    },
                    options: {
                        cutout: '72%',
                        rotation: -90,
                        circumference: 180,
                        responsive: false,
                        plugins: { legend: { display: false }, tooltip: { enabled: false } },
                        animation: { duration: 900, easing: 'easeInOutQuart' },
                    },
                });
            }

            // --- Barras de distribución ---
            if (items.length > 0) {
                const bCtx = document.getElementById(barId);
                if (bCtx) {
                    analisisState.charts[chartPrefix + idx] = new Chart(bCtx, {
                        type: 'bar',
                        data: {
                            labels: items.map(it => truncate(it.label, 28)),
                            datasets: [{
                                data: items.map(it => it.pct),
                                backgroundColor: items.map(it => sentColor(it.sentimiento)),
                                borderRadius: 5,
                            }],
                        },
                        options: {
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { max: 100, display: false },
                                y: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#6F4E37' } },
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: { callbacks: { label: (c) => ' ' + c.parsed.x + '%' } },
                            },
                            animation: { duration: 500, easing: 'easeOutQuart' },
                        },
                    });
                }
            }
        }
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
            <canvas id="${chartId}" height="110"></canvas>
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
                        font: { size: 11, weight: '500' },
                        color: 'rgba(255,255,255,0.85)',
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10,20,50,0.93)',
                    titleColor: '#fff',
                    bodyColor: 'rgba(255,255,255,0.85)',
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    boxPadding: 4,
                    usePointStyle: true,
                    borderColor: 'rgba(56,189,248,0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null)
                                label += context.parsed.y + (context.dataset.yAxisID === 'y2' ? '%' : '');
                            return label;
                        }
                    }
                },
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
                    border: { color: 'rgba(255,255,255,0.1)' },
                },
                y: {
                    position: 'left',
                    title: { display: true, text: 'Nº Encuestas', font: { size: 11, weight: '600' }, color: 'rgba(255,255,255,0.6)' },
                    grid: { color: 'rgba(255,255,255,0.07)', drawBorder: false, borderDash: [4, 4] },
                    ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
                    border: { color: 'rgba(255,255,255,0.1)' },
                    beginAtZero: true
                },
                y2: {
                    position: 'right',
                    max: 100,
                    title: { display: true, text: 'Apertura (%)', font: { size: 11, weight: '600' }, color: 'rgba(255,255,255,0.6)' },
                    grid: { display: false, drawBorder: false },
                    ticks: { callback: v => v + '%', color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
                    border: { color: 'rgba(255,255,255,0.1)' },
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
                label: '\u00cdndice Neto de Sentimiento (pts)',
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
                        font: { size: 12, weight: '600' },
                        color: 'rgba(255,255,255,0.75)',
                        backdropColor: 'rgba(10,20,50,0.45)',
                        z: 10,
                        callback: v => (v > 0 ? '+' : '') + v,
                    },
                    pointLabels: {
                        font: { size: 13, weight: 'bold' },
                        color: (ctx2) => {
                            const v = vals[ctx2.index] ?? 0;
                            return v >= 10 ? '#4ade80' : v <= -10 ? '#f87171' : '#fbbf24';
                        },
                        padding: 8,
                    },
                    grid:       { color: 'rgba(255,255,255,0.12)', circular: true },
                    angleLines: { color: 'rgba(255,255,255,0.15)' },
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10,20,50,0.92)',
                    titleColor: '#fff',
                    bodyColor: 'rgba(255,255,255,0.8)',
                    borderColor: 'rgba(56,189,248,0.4)',
                    borderWidth: 1,
                    callbacks: {
                        title: (items) => dimensiones[items[0].dataIndex]?.titulo || '',
                        label: ctx2 => {
                            const v = ctx2.raw;
                            const lbl = v >= 10 ? 'Favorable' : v <= -10 ? 'Critico' : 'Neutro';
                            return ` ${lbl}: ${v > 0 ? '+' : ''}${v} pts`;
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

let _preguntasAbortController = null;
async function loadPreguntas(force = false) {
    const sector = document.getElementById('preguntas-sector-filter')?.value ?? 'general';
    
    // Evitar recargar si ya estamos viendo el mismo sector
    if (!force && window._preguntasCurrentSector === sector && document.getElementById('preguntas-content') && !document.getElementById('preguntas-content').classList.contains('hidden')) {
        return;
    }
    window._preguntasCurrentSector = sector;

    if (_preguntasAbortController) {
        _preguntasAbortController.abort();
    }
    _preguntasAbortController = new AbortController();
    const signal = _preguntasAbortController.signal;

    setPreguntasUI('loading');
    try {
        const payload = await requestJson('preguntas', { params: { sector }, signal });
        const data = payload.preguntas;
        if (!data || data.total === 0) {
            setPreguntasUI('empty');
            return;
        }
        renderPreguntas(data);
        setPreguntasUI('content');
    } catch (err) {
        if (err.name !== 'AbortError') {
            setPreguntasUI('empty');
            console.error('Error en preguntas:', err);
        }
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
            // Comparar normalizando acentos para cubrir encodings mixtos en la BD
            const normSector = sector.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            allSurveys = allSurveys.filter(s => {
                const ns = (s.sector || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
                return ns === normSector;
            });
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

        // --- Captura graficas (canvas.toDataURL con fondo de color para respetar el estilo oscuro) ---
        function cap(id, bgColor) {
            const el = document.getElementById(id);
            if (!el) return null;
            try {
                const cv = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
                if (!cv) return null;
                if (!bgColor) return cv.toDataURL('image/png');
                // Componer sobre fondo de color (para gráficas con fondo transparente en canvas)
                const tmp = document.createElement('canvas');
                tmp.width  = cv.width  || cv.offsetWidth  || 400;
                tmp.height = cv.height || cv.offsetHeight || 400;
                const ctx2 = tmp.getContext('2d');
                ctx2.fillStyle = bgColor;
                ctx2.fillRect(0, 0, tmp.width, tmp.height);
                ctx2.drawImage(cv, 0, 0, tmp.width, tmp.height);
                return tmp.toDataURL('image/png');
            } catch { return null; }
        }
        // El radar y el donut están sobre fondo azul oscuro; se capturan CON ese fondo
        const imgDonut    = cap('chart-sentimiento-global', '#0d1b3e');
        const imgRadar    = cap('chart-radar-dimensiones', '#0d1b3e');
        const imgTendencia = cap('chart-tendencia');
        const imgsDim = [];
        for (let i = 0; i < (data.dimensiones || []).length; i++) {
            imgsDim.push(cap('chart-dim-' + i));
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
        function sentLabel(i) { const x = n(i); return x >= 15 ? 'FAVORABLE' : x <= -15 ? 'CRITICO' : 'AMBIVALENTE'; }

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
                <span class="dim-name">${esc(dim.titulo || dim.nombre || '')}</span>
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
  <div class="metod-tags" style="margin:14px 0 8px">
    <span class="mtag mtag-purple">&#128202; Metodolog&iacute;a Mixta</span>
    <span class="mtag mtag-blue">&#128203; TF-IDF &mdash; Vectorizaci&oacute;n de Texto</span>
    <span class="mtag mtag-green">&#129504; NLP &mdash; Procesamiento de Lenguaje Natural</span>
    <span class="mtag mtag-orange">&#9889; Pipeline de 5 Fases</span>
    <span class="mtag mtag-slate">&#127759; Investigaci&oacute;n de Campo</span>
  </div>
  <div class="metod-box" style="margin-bottom:12px">
    <strong>&#128220; Metodolog&iacute;a Global &mdash; Pipeline Mixto de IA + Estad&iacute;stica</strong>
    El estudio sigue 5 fases secuenciales: <strong>1) Recopilaci&oacute;n</strong> (encuestas de campo) &rarr;
    <strong>2) Vectorizaci&oacute;n</strong> (TF-IDF convierte texto en vectores num&eacute;ricos) &rarr;
    <strong>3) Clasificaci&oacute;n</strong> (IA asigna etiqueta de sentimiento) &rarr;
    <strong>4) An&aacute;lisis estad&iacute;stico</strong> (correlaciones, distribuciones, &iacute;ndices) &rarr;
    <strong>5) Plan estrat&eacute;gico</strong> (s&iacute;ntesis con FODA + Marco L&oacute;gico).
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
  <div class="metod-tags" style="margin-top:14px">
    <span class="mtag mtag-purple">&#129504; Machine Learning (ML)</span>
    <span class="mtag mtag-blue">&#128202; Naive Bayes &mdash; Clasificador Probabil&iacute;stico</span>
    <span class="mtag mtag-green">&#127795; Random Forest &mdash; Ensemble Learning</span>
    <span class="mtag mtag-orange">&#9889; Red Neuronal MLP</span>
    <span class="mtag mtag-slate">&#128203; Aprendizaje Supervisado</span>
  </div>
  <div class="metod-box" style="margin-bottom:4px">
    <strong>&#128220; Metodolog&iacute;a &mdash; Inteligencia Artificial y Aprendizaje Autom&aacute;tico</strong>
    <strong>Naive Bayes:</strong> Clasifica cada encuesta como Aceptaci&oacute;n / Neutral / Rechazo con base en probabilidades condicionales. &nbsp;|&nbsp;
    <strong>Random Forest:</strong> Ensemble de &aacute;rboles de decisi&oacute;n para medir importancia de factores y robustez del modelo. &nbsp;|&nbsp;
    <strong>Red Neuronal MLP:</strong> Capas densas que aprenden patrones no lineales de percepci&oacute;n comunitaria. &nbsp;|&nbsp;
    <strong>Aprendizaje Supervisado:</strong> El modelo es entrenado con etiquetas reales de las encuestas del territorio.
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

/* Etiquetas de metodologia */
.metod-tags{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 16px}
.mtag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:7.5pt;
      font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.mtag-blue{background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}
.mtag-green{background:#dcfce7;color:#166534;border:1px solid #86efac}
.mtag-purple{background:#f3e8ff;color:#6b21a8;border:1px solid #c4b5fd}
.mtag-orange{background:#ffedd5;color:#9a3412;border:1px solid #fdba74}
.mtag-yellow{background:#fefce8;color:#854d0e;border:1px solid #fde047}
.mtag-slate{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}
.mtag-red{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.metod-box{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0e4eb0;
           border-radius:0 8px 8px 0;padding:12px 16px;margin:12px 0 18px;font-size:9pt;
           color:#334155;line-height:1.7}
.metod-box strong{color:#0e4eb0;display:block;margin-bottom:4px;font-size:9.5pt}

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
  <div class="metod-tags">
    <span class="mtag mtag-blue">&#128200; Investigaci&oacute;n Cuantitativa</span>
    <span class="mtag mtag-green">&#128202; Estad&iacute;stica Descriptiva</span>
    <span class="mtag mtag-purple">&#129504; NLP &mdash; Procesamiento de Lenguaje Natural</span>
    <span class="mtag mtag-orange">&#9889; &Iacute;ndice Neto de Sentimiento</span>
  </div>
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
  <div class="metod-box">
    <strong>&#128220; Marco Metodol&oacute;gico &mdash; Investigaci&oacute;n Cuantitativa + NLP</strong>
    An&aacute;lisis basado en <em>estad&iacute;stica descriptiva</em> y <em>procesamiento autom&aacute;tico de texto</em> aplicados sobre las respuestas de la encuesta comunitaria.
    El <strong>&Iacute;ndice Neto de Sentimiento</strong> se calcula como <em>% Positivo &minus; % Negativo</em> (escala &minus;100 a +100 pts).
    Valores &ge; +15 = Favorable &middot; entre &minus;15 y +15 = Ambivalente &middot; &le; &minus;15 = Cr&iacute;tico.
  </div>
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 2: GRAFICAS -->
<div class="page">
  <div class="ph"><h2>2. An&aacute;lisis Gr&aacute;fico de Sentimiento</h2><p>Visualizaciones capturadas en tiempo real del sistema de an&aacute;lisis</p></div>
  <div class="metod-tags">
    <span class="mtag mtag-blue">&#128200; Visualizaci&oacute;n de Datos</span>
    <span class="mtag mtag-green">&#9679; M&eacute;todo Mixto (Cuantitativo + Cualitativo)</span>
    <span class="mtag mtag-purple">&#128258; Gr&aacute;fica Donut &mdash; Distribuci&oacute;n Porcentual</span>
    <span class="mtag mtag-orange">&#128303; Vista Radar &mdash; Comparativa Multidimensional</span>
    <span class="mtag mtag-slate">&#128202; An&aacute;lisis de Tendencia Temporal</span>
  </div>
  ${imgDonut ? `
  <div class="st">2.1 Distribuci&oacute;n de Sentimiento Comunitario</div>
  <div class="sd">Proporci&oacute;n de encuestas clasificadas como Positivo, Neutro y Negativo sobre el total analizado. <em>Metodolog&iacute;a: Estad&iacute;stica Descriptiva &mdash; Distribuci&oacute;n de Frecuencias.</em></div>
  <div class="chart-wrap"><img src="${imgDonut}" style="max-width:340px;max-height:340px;border-radius:12px;"></div>` : '<p style="color:#888;font-size:10pt;padding:20px 0;">Gr&aacute;fica de sentimiento no disponible (abrir el tab An&aacute;lisis IA antes de exportar).</p>'}
  ${imgRadar ? `
  <div class="st">2.2 Vista Radar &mdash; Comparativa por Dimensi&oacute;n</div>
  <div class="sd">Cada eje eval&uacute;a el sentimiento mediante un &Iacute;ndice Neto (escala &minus;100 a +100 puntos), calculado como: % Positivo menos % Negativo. Verde = favorable, rojo = cr&iacute;tico. <em>Metodolog&iacute;a: An&aacute;lisis Multidimensional &mdash; Gr&aacute;fico de Radar.</em></div>
  <div class="chart-wrap"><img src="${imgRadar}" style="max-width:520px;max-height:420px;border-radius:12px;"></div>` : '<p style="color:#888;font-size:10pt;padding:20px 0;">Gr&aacute;fica radar no disponible.</p>'}
  ${imgTendencia ? `
  <div class="st">2.3 Tendencia Temporal de Encuestas</div>
  <div class="sd">Volumen de encuestas por d&iacute;a y evoluci&oacute;n del &iacute;ndice de apertura a la inversi&oacute;n. <em>Metodolog&iacute;a: An&aacute;lisis de Series Temporales.</em></div>
  <div class="chart-wrap"><img src="${imgTendencia}" style="max-height:220px"></div>` : ''}
  <div class="metod-box">
    <strong>&#128220; Metodolog&iacute;as de Visualizaci&oacute;n Aplicadas</strong>
    <strong>Gr&aacute;fico Donut:</strong> Representa la distribuci&oacute;n porcentual de sentimientos (positivo, neutro, negativo) sobre el total de encuestas. &nbsp;|&nbsp;
    <strong>Radar Chart:</strong> Compara el &Iacute;ndice Neto de cada dimensi&oacute;n en un solo plano visual, permitiendo detectar fortalezas y &aacute;reas cr&iacute;ticas simult&aacute;neamente. &nbsp;|&nbsp;
    <strong>Serie Temporal:</strong> Muestra la evoluci&oacute;n del levantamiento en los &uacute;ltimos 14 d&iacute;as.
  </div>
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 3: DETALLE DE DIMENSIONES -->
<div class="page">
  <div class="ph"><h2>3. Sentimiento Detallado por Dimensi&oacute;n</h2><p>An&aacute;lisis del &Iacute;ndice Neto y respuestas porcentuales por &aacute;rea de inter&eacute;s</p></div>
  <div class="metod-tags">
    <span class="mtag mtag-blue">&#128200; An&aacute;lisis Multidimensional</span>
    <span class="mtag mtag-green">&#9432; Estad&iacute;stica Descriptiva por Dimensi&oacute;n</span>
    <span class="mtag mtag-purple">&#129504; Clasificaci&oacute;n NLP por &Aacute;rea Tem&aacute;tica</span>
    <span class="mtag mtag-orange">&#128202; &Iacute;ndice Neto = % Positivo &minus; % Negativo</span>
  </div>
  <div class="metod-box" style="margin-bottom:16px">
    <strong>&#128220; Metodolog&iacute;a &mdash; An&aacute;lisis Cuantitativo por Dimensi&oacute;n</strong>
    Cada dimensi&oacute;n agrupa preguntas relacionadas con un &aacute;rea tem&aacute;tica (seguridad, servicios, medio ambiente, etc.). El modelo de NLP clasifica cada respuesta y calcula el <em>&Iacute;ndice Neto</em> por dimensi&oacute;n.
    Las barras muestran la distribuci&oacute;n de respuestas capturadas en el campo.
  </div>
  ${dimsHtml || '<p style="color:#888;font-size:10pt;padding:20px 0;">Carga el tab An&aacute;lisis IA para ver el detalle por dimensi&oacute;n.</p>'}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 4: PREGUNTAS DETALLADAS -->
${pregHtml ? `
<div class="page">
  <div class="ph"><h2>4. Respuestas Detalladas a Preguntas Clave</h2><p>Distribuci&oacute;n de opciones seleccionadas en el formulario de encuesta</p></div>
  <div class="metod-tags">
    <span class="mtag mtag-blue">&#128203; Encuesta (Survey Research)</span>
    <span class="mtag mtag-green">&#128200; Investigaci&oacute;n Cuantitativa</span>
    <span class="mtag mtag-orange">&#128202; Distribuci&oacute;n de Frecuencias</span>
    <span class="mtag mtag-slate">&#127358; Escala Nominal / Ordinal</span>
  </div>
  <div class="metod-box" style="margin-bottom:16px">
    <strong>&#128220; Metodolog&iacute;a &mdash; Investigaci&oacute;n por Encuesta (Survey Research)</strong>
    Las preguntas utilizan escalas nominales y ordinales (Likert) para medir percepciones. Los gr&aacute;ficos de barras horizontales y donut muestran la distribuci&oacute;n de frecuencias absolutas de cada respuesta.
    Esta metodolog&iacute;a es propia de la <em>investigaci&oacute;n cuantitativa descriptiva</em>.
  </div>
  ${pregHtml}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>` : ''}

<!-- PAG 5: PERCEPCIONES MINERAS -->
<div class="page">
  <div class="ph"><h2>5. Percepciones e Impacto de la Actividad Minera</h2><p>Evaluaci&oacute;n comunitaria de riesgos, beneficios y conocimiento minero</p></div>
  <div class="metod-tags">
    <span class="mtag mtag-blue">&#128483; Investigaci&oacute;n Cualitativa</span>
    <span class="mtag mtag-orange">&#128269; An&aacute;lisis de Percepci&oacute;n Comunitaria</span>
    <span class="mtag mtag-green">&#128994; Sem&aacute;foro de Conocimiento</span>
    <span class="mtag mtag-red">&#9888; Evaluaci&oacute;n de Riesgo Percibido</span>
    <span class="mtag mtag-purple">&#128202; M&eacute;todo Mixto</span>
  </div>
  <div class="metod-box" style="margin-bottom:16px">
    <strong>&#128220; Metodolog&iacute;a &mdash; An&aacute;lisis de Percepci&oacute;n (M&eacute;todo Mixto)</strong>
    <strong>Cualitativo:</strong> Identifica temas emergentes (beneficios y riesgos) desde las respuestas abiertas y opini&oacute;n ciudadana. &nbsp;|&nbsp;
    <strong>Cuantitativo:</strong> Mide el porcentaje de ciudadanos que reconocen cada factor y el nivel de conocimiento mediante indicadores de sem&aacute;foro (&ge;60% = Alto, 30&ndash;59% = Medio, &lt;30% = Bajo).
  </div>
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
  <div class="sd">Sem&aacute;foro: &#128994; &ge; 60% &mdash; conocimiento adecuado &nbsp;&middot;&nbsp; &#128993; 30&ndash;59% &mdash; conocimiento parcial &nbsp;&middot;&nbsp; &#128308; &lt; 30% &mdash; socializaci&oacute;n urgente. <em>Metodolog&iacute;a: Indicador de Conocimiento &mdash; Estad&iacute;stica Descriptiva.</em></div>
  ${conocHtml || '<p style="color:#888;font-size:9pt">Sin datos registrados</p>'}
  <div class="pie"><span>Reporte T&eacute;cnico-Cient&iacute;fico &middot; Encuestas Parroquiales San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>

<!-- PAG 6: CORRELACIONES Y TENDENCIA -->
<div class="page">
  <div class="ph"><h2>6. Correlaciones, Tendencia Temporal y Distribuci&oacute;n Geogr&aacute;fica</h2><p>Cruces estrat&eacute;gicos, evoluci&oacute;n del levantamiento y cobertura por sector</p></div>
  <div class="metod-tags">
    <span class="mtag mtag-blue">&#128200; Estad&iacute;stica Inferencial</span>
    <span class="mtag mtag-green">&#128257; An&aacute;lisis de Correlaci&oacute;n Bivariada</span>
    <span class="mtag mtag-orange">&#128202; An&aacute;lisis de Series Temporales</span>
    <span class="mtag mtag-purple">&#127760; Distribuci&oacute;n Geogr&aacute;fica (SIG)</span>
    <span class="mtag mtag-slate">&#128203; Cruces Estrat&eacute;gicos</span>
  </div>
  <div class="metod-box" style="margin-bottom:16px">
    <strong>&#128220; Metodolog&iacute;a &mdash; Estad&iacute;stica Inferencial y Correlacional</strong>
    <strong>Correlaci&oacute;n:</strong> Compara grupos (g&eacute;nero, edad, educaci&oacute;n) midiendo la diferencia en puntos porcentuales (pp) sobre la variable de percepci&oacute;n. &nbsp;|&nbsp;
    <strong>Serie temporal:</strong> Detecta patrones de participaci&oacute;n y tendencia del sentimiento en el tiempo. &nbsp;|&nbsp;
    <strong>Distribuci&oacute;n geogr&aacute;fica:</strong> Mapea la cobertura del levantamiento por sector parroquial.
  </div>
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
  <div class="metod-tags">
    <span class="mtag mtag-yellow">&#9878; An&aacute;lisis FODA</span>
    <span class="mtag mtag-blue">&#127959; Marco L&oacute;gico</span>
    <span class="mtag mtag-green">&#128200; Balanced Scorecard (KPIs)</span>
    <span class="mtag mtag-purple">&#128161; Design Thinking</span>
    <span class="mtag mtag-orange">&#128203; Planificaci&oacute;n Estrat&eacute;gica</span>
    <span class="mtag mtag-slate">&#128269; S&iacute;ntesis Anal&iacute;tica Mixta</span>
  </div>
  <div class="metod-box" style="margin-bottom:16px">
    <strong>&#128220; Metodolog&iacute;a &mdash; Planificaci&oacute;n Estrat&eacute;gica Integrada</strong>
    Las conclusiones combinan cuatro marcos metodol&oacute;gicos:
    <strong>FODA</strong> (identificaci&oacute;n de fortalezas, debilidades, oportunidades y amenazas desde los datos) &middot;
    <strong>Marco L&oacute;gico</strong> (vinculaci&oacute;n causa-efecto entre problem&aacute;ticas y l&iacute;neas de acci&oacute;n) &middot;
    <strong>Balanced Scorecard</strong> (m&eacute;tricas clave para seguimiento de intervenciones) &middot;
    <strong>Design Thinking</strong> (soluciones centradas en la ciudadan&iacute;a a partir de sus necesidades reales).
  </div>
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
        iframe.style.cssText = 'position:fixed;right:-9999px;top:0;width:794px;height:1123px;border:none;';
        document.body.appendChild(iframe);

        let _printed = false;
        const doPrint = () => {
            if (_printed) return;
            _printed = true;
            try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e) {}
            setTimeout(() => { const f = document.getElementById('pdf-print-frame'); if (f) f.remove(); }, 30000);
        };

        iframe.onload = () => setTimeout(doPrint, 3500);
        setTimeout(doPrint, 7000);  // fallback si onload no dispara

        // Usar Blob URL con charset explícito — garantiza UTF-8 correcto (evita Ã©/Ã­ con document.write)
        const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

    } catch (err) {
        console.error('Error generando PDF:', err);
        alert('Error al generar el reporte: ' + err.message);
    } finally {
        const btn = document.getElementById('analisis-pdf-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Exportar Reporte PDF'; }
    }

}

// ============================================================
//  GENERADOR PDF — TAB LLM NVIDIA
// ============================================================
async function generateLLMNvidiaPDF() {
    const data = window._llmLastPayload;
    if (!data || !data.ok) {
        alert('Ejecuta primero el análisis LLM antes de exportar el reporte PDF.');
        return;
    }
    const btn = document.getElementById('llm-pdf-btn');
    if (btn) { btn.disabled = true; btn.textContent = '... Generando'; }

    try {
        const sEl    = document.getElementById('llm-sector-filter');
        const sector = sEl?.selectedOptions[0]?.text || 'Todas las zonas';
        const now    = new Date();
        const meses  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const fecha  = `${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}`;

        const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const pct = v => (Number(v) || 0).toFixed(1) + '%';
        const nv  = v => Number(v) || 0;
        const sgn = v => { const x = nv(v); return (x >= 0 ? '+' : '') + x; };

        const predColor = pr => {
            if (!pr) return '#555';
            if (pr === 'Aceptacion' || pr === 'Aceptación') return '#0f9f6e';
            if (pr === 'Rechazo') return '#c43d45';
            return '#d97706';
        };
        const sentColor = i => { const x = nv(i); return x >= 15 ? '#0f9f6e' : x <= -15 ? '#c43d45' : '#d97706'; };
        const sentLabel = i => { const x = nv(i); return x >= 15 ? 'FAVORABLE' : x <= -15 ? 'CRITICO' : 'AMBIVALENTE'; };
        const barRow = (label, pctVal, color) => {
            const w = Math.min(100, Math.max(0, nv(pctVal)));
            return `<div class="br"><span class="bl">${esc(label)}</span><div class="bt"><div class="bf" style="width:${w}%;background:${color}"></div></div><span class="bp" style="color:${color}">${w.toFixed(1)}%</span></div>`;
        };

        // Capturar graficas del tab LLM — los canvas de Chart.js se leen con toDataURL() directamente
        const capCanvas = id => {
            const el = document.getElementById(id);
            if (!el) return null;
            try {
                // Si es un <canvas>, leerlo directamente (html2canvas no captura bien canvas Chart.js)
                if (el.tagName === 'CANVAS') return el.toDataURL('image/png');
                // Si es un contenedor, buscar el canvas dentro
                const cv = el.querySelector('canvas');
                if (cv) return cv.toDataURL('image/png');
                return null;
            } catch { return null; }
        };
        // capRadar eliminado: el radar se renderiza directamente en el PDF como Chart.js nativo (fondo blanco)
        const imgDonut    = capCanvas('llm-donut-stats');
        const imgFactores = capCanvas('llm-factores-chart');
        const imgZonas    = capCanvas('llm-zonas-chart');
        // Radar: extraer datos del payload y renderizar limpio en el PDF (no capturar screenshot oscuro)
        const radarDims   = data.dimensiones || [];
        const radarLabels = radarDims.map(d => d.titulo || '');
        const radarVals   = radarDims.map(d => Number(d.sentimiento?.indice ?? 0));
        const radarPtClr  = radarVals.map(v => v >= 10 ? '#0f9f6e' : v <= -10 ? '#c43d45' : '#d97706');

        // Capturar canvas de dimensiones ya renderizados en la UI
        const imgsDimGauge = [];
        const imgsDimBar   = [];
        for (let i = 0; i < radarDims.length; i++) {
            imgsDimGauge.push(capCanvas('gauge-llm-dim-' + i));
            imgsDimBar.push(capCanvas('bar-llm-dim-' + i));
        }
        // Capturar gauges por zona ya renderizados en la UI
        const imgsZonaGauge = [];
        const nZonasUI = (data.analisis_por_zona || []).length;
        for (let i = 0; i < nZonasUI; i++) {
            imgsZonaGauge.push(capCanvas('zona-gauge-' + i));
        }

        // Fetch preguntas (mismo endpoint que Análisis IA)
        const sVal = sEl?.value || 'general';
        let pregData = null;
        try {
            const pp = await requestJson('preguntas', { params: { sector: sVal } });
            if (pp?.preguntas?.total > 0) pregData = pp.preguntas;
        } catch { /* sin preguntas */ }

        const probs  = data.probabilidades_globales || {};
        const pa     = nv(probs.Aceptacion);
        const pn     = nv(probs.Neutral);
        const prv    = nv(probs.Rechazo);
        const pred   = data.prediccion_global || (pa >= prv ? 'Aceptacion' : 'Rechazo');
        const pColor = predColor(pred);
        const motor  = data.motor || 'NVIDIA Nemotron-3-Super-120B';
        const total  = nv(data.total_encuestas);

        // CSS compartido
        const CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif;font-size:10.5pt;color:#1e293b;background:#fff;line-height:1.65}
.portada{background:linear-gradient(150deg,#1e3a5f 0%,#3b82f6 55%,#1d4ed8 100%);color:#fff;padding:70px 55px 55px;min-height:100vh;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}
.portada-insignia{font-size:9pt;letter-spacing:4px;text-transform:uppercase;opacity:.65;margin-bottom:50px;font-weight:600}
.portada-titulo{font-size:28pt;font-weight:900;line-height:1.15;margin-bottom:12px}
.portada-sub{font-size:13pt;opacity:.85;margin-bottom:35px;font-weight:300}
.portada-tabla{width:100%;border-collapse:collapse;background:rgba(255,255,255,.10);border-radius:10px;overflow:hidden}
.portada-tabla td{padding:12px 18px;font-size:10.5pt;border-bottom:1px solid rgba(255,255,255,.1)}
.portada-tabla td:first-child{font-weight:700;font-size:9pt;letter-spacing:1px;text-transform:uppercase;opacity:.7;width:180px}
.portada-tabla tr:last-child td{border-bottom:none}
.nivel-pill{margin-top:28px;padding:16px 24px;border-radius:8px;text-align:center;font-size:13pt;font-weight:800}
.portada-foot{font-size:8.5pt;opacity:.5;text-align:center;margin-top:35px}
.page{padding:32px 42px;page-break-after:always}
.page:last-of-type{page-break-after:auto}
.ph{background:#1e3a5f;color:#fff;border-radius:7px;padding:12px 20px;margin-bottom:24px}
.ph h2{font-size:14pt;font-weight:800;margin-bottom:2px}
.ph p{font-size:9pt;opacity:.85;font-weight:300}
.krow4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.kc{border-radius:9px;padding:18px 14px;text-align:center;color:#fff}
.kc .v{font-size:20pt;font-weight:900;display:block;line-height:1.1;margin-bottom:4px}
.kc .l{font-size:8.5pt;opacity:.9;text-transform:uppercase;font-weight:600}
.narr{background:#f1f5f9;border-left:5px solid #1e3a5f;padding:16px 22px;border-radius:0 8px 8px 0;margin-bottom:20px;font-size:11pt;line-height:1.75;color:#334155}
.stbl{width:100%;border-collapse:collapse;margin-bottom:24px}
.stbl th{background:#1e3a5f;color:#fff;padding:10px 16px;font-size:9.5pt;text-align:left;font-weight:600}
.stbl td{padding:10px 16px;font-size:10pt;border-bottom:1px solid #e2e8f0;color:#334155}
.stbl tr:nth-child(even) td{background:#f8fafc}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;vertical-align:middle}
.metod{background:#fdfce8;border:1px solid #fde047;border-radius:8px;padding:16px 20px;font-size:9.5pt;line-height:1.75;margin-top:20px;color:#422006}
.metod strong{color:#854d0e;font-weight:700}
.metod-tags{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0 14px}
.mtag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:7.5pt;font-weight:700;letter-spacing:.3px;text-transform:uppercase}
.mtag-blue{background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}
.mtag-green{background:#dcfce7;color:#166534;border:1px solid #86efac}
.mtag-purple{background:#f3e8ff;color:#6b21a8;border:1px solid #c4b5fd}
.mtag-orange{background:#ffedd5;color:#9a3412;border:1px solid #fdba74}
.mtag-yellow{background:#fefce8;color:#854d0e;border:1px solid #fde047}
.mtag-slate{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}
.mtag-red{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.metod-box{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0e4eb0;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 16px;font-size:9pt;color:#334155;line-height:1.7}
.metod-box strong{color:#0e4eb0;display:block;margin-bottom:4px;font-size:9.5pt}
.br{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:9.5pt}
.bl{width:200px;flex-shrink:0;color:#1e293b;font-weight:500}
.bt{flex:1;height:10px;background:#e2e8f0;border-radius:5px;overflow:hidden}
.bf{height:100%;border-radius:5px}
.bp{width:90px;text-align:right;font-weight:700;font-size:9pt;color:#334155}
.dim-card{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;overflow:hidden}
.dim-h{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;color:#fff}
.dim-name{font-weight:800;font-size:11pt}
.dim-badge{font-size:9pt;background:rgba(0,0,0,.25);padding:3px 12px;border-radius:15px;font-weight:700}
.dim-stats{display:flex;gap:24px;padding:10px 18px;background:#f8fafc;font-size:9.5pt;font-weight:700;border-bottom:1px solid #e2e8f0}
.mine-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:26px}
.mine-card{border:1px solid #e2e8f0;border-radius:10px;padding:18px;background:#fff}
.mine-card h4{font-size:11pt;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid;font-weight:800}
.krow{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #f1f5f9;font-size:10pt;color:#334155;font-weight:500}
.kdot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
.krow strong{margin-left:auto;font-size:11pt;font-weight:700}
.chart-wrap{text-align:center;margin:12px 0 24px}
.chart-wrap img{max-width:100%;border-radius:10px}
.concl-box{background:#f8fafc;border:1px solid #cbd5e1;border-left:5px solid #0f9f6e;border-radius:8px;padding:24px 28px;font-size:11pt;line-height:1.8;color:#1e293b}
.recomend{margin-top:16px;padding-left:24px;color:#334155}
.recomend li{margin-bottom:12px;font-size:10.5pt;line-height:1.7}
.st{font-size:12pt;font-weight:800;color:#1e3a5f;margin:24px 0 8px;padding-bottom:6px;border-bottom:2px solid #1e3a5f}
.pie{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:8.5pt;color:#94a3b8;display:flex;justify-content:space-between}
.no-break{page-break-inside:avoid;break-inside:avoid}
.cierre{text-align:center;padding:28px;background:#f1f5f9;border-radius:10px;margin-top:32px;font-size:10pt;color:#475569;line-height:1.9}
.pg-grupo{margin-bottom:30px}
.pg-gtit{background:#1e293b;color:#f8fafc;padding:10px 18px;border-radius:8px;font-size:12pt;font-weight:700;margin-bottom:16px;break-after:avoid;page-break-after:avoid}
.pg-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.pg-card{border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;background:#fff;break-inside:avoid;page-break-inside:avoid;overflow:hidden;min-width:0}
.pg-card canvas{max-width:100%!important;width:100%!important}
.pg-q{font-weight:700;font-size:10.5pt;color:#0f172a;margin-bottom:6px;line-height:1.5}
.pg-n{font-size:8.5pt;color:#64748b;margin-bottom:12px;font-weight:500}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:0}body{font-size:10pt;margin:0;padding:0}.portada{height:297mm;min-height:297mm;box-sizing:border-box}.page{padding:20mm 15mm;min-height:297mm;box-sizing:border-box;width:100%;max-width:100%;overflow:hidden}.dim-card,.mine-card,.no-break,.pg-card{break-inside:avoid!important;page-break-inside:avoid!important}.pg-card canvas{max-width:100%!important;width:100%!important}.pg-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.bl{width:155px}.kc .v{font-size:16pt}}`;

        // PAG 1: RESUMEN EJECUTIVO
        const p1 = `<div class="page">
<div class="ph"><h2>1. Resumen Ejecutivo</h2><p>An&aacute;lisis generado por ${esc(motor)}</p></div>
<div class="metod-tags">
  <span class="mtag mtag-purple">&#129504; Random Forest + Red Neuronal MLP</span>
  <span class="mtag mtag-blue">&#129302; NVIDIA Nemotron LLM</span>
  <span class="mtag mtag-green">&#128203; Aprendizaje Supervisado</span>
  <span class="mtag mtag-orange">&#128202; An&aacute;lisis Cuantitativo</span>
  <span class="mtag mtag-slate">&#127759; Encuestas de Campo</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; IA H&iacute;brida (Random Forest + Red Neuronal + LLM NVIDIA)</strong>
  <strong>Random Forest (150 &aacute;rboles):</strong> mide la importancia relativa de cada factor socioecon&oacute;mico. &nbsp;|&nbsp;
  <strong>Red Neuronal MLP (64-32-16-8 neuronas):</strong> clasifica cada encuesta como Aceptaci&oacute;n / Neutral / Rechazo aprendiendo patrones no lineales. &nbsp;|&nbsp;
  <strong>NVIDIA Nemotron LLM:</strong> enriquece el diagn&oacute;stico con an&aacute;lisis narrativo contextualizado al territorio. &nbsp;|&nbsp;
  <strong>Escala de viabilidad:</strong> &ge;60% = Licencia Social viable &middot; 40&ndash;59% = Condicional &middot; &lt;40% = No viable sin intervenci&oacute;n.
</div>
<div class="krow4">
  <div class="kc" style="background:#1e3a5f"><span class="v">${total}</span><span class="l">Total Encuestas</span></div>
  <div class="kc" style="background:${pColor}"><span class="v">${esc(pred)}</span><span class="l">Predicci&oacute;n Global</span></div>
  <div class="kc" style="background:#0f9f6e"><span class="v">${pct(pa)}</span><span class="l">Aceptaci&oacute;n</span></div>
  <div class="kc" style="background:#c43d45"><span class="v">${pct(prv)}</span><span class="l">Rechazo</span></div>
</div>
<div class="narr">${esc(data.resumen_ejecutivo || '')}</div>
<div class="st">Distribuci&oacute;n de Probabilidades</div>
<table class="stbl">
  <tr><th>Clase</th><th>Probabilidad</th><th>Interpretaci&oacute;n</th></tr>
  <tr><td><span class="dot" style="background:#0f9f6e"></span>Aceptaci&oacute;n</td><td><strong style="color:#0f9f6e">${pct(pa)}</strong></td><td>Proporci&oacute;n favorable a la actividad minera</td></tr>
  <tr><td><span class="dot" style="background:#d97706"></span>Neutro</td><td><strong style="color:#d97706">${pct(pn)}</strong></td><td>Posici&oacute;n ambivalente o condicionada</td></tr>
  <tr><td><span class="dot" style="background:#c43d45"></span>Rechazo</td><td><strong style="color:#c43d45">${pct(prv)}</strong></td><td>Rechazo o preocupaciones cr&iacute;ticas no resueltas</td></tr>
</table>
<div class="metod"><strong>Motor IA:</strong> ${esc(motor)}. M&eacute;todo: Random Forest + Red Neuronal MLP sobre encuestas reales enriquecidas con NVIDIA Nemotron. Escala: &ge;60% = Licencia Social viable &middot; 40-59% = Condicional &middot; &lt;40% = No viable sin intervenci&oacute;n.</div>
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>`;

        // PAG 2: GRAFICAS
        let p2 = `<div class="page"><div class="ph"><h2>2. Visualizaciones del An&aacute;lisis IA</h2><p>Gr&aacute;ficas generadas por el modelo NVIDIA</p></div>
<div class="metod-tags">
  <span class="mtag mtag-blue">&#128200; Visualizaci&oacute;n de Datos</span>
  <span class="mtag mtag-purple">&#9685; Gr&aacute;fica Donut &mdash; Sentimiento</span>
  <span class="mtag mtag-green">&#127759; Distribuci&oacute;n Geogr&aacute;fica por Zona</span>
  <span class="mtag mtag-orange">&#9889; Importancia de Factores (RF)</span>
  <span class="mtag mtag-slate">&#128202; Chart.js &mdash; Canvas API</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; Visualizaci&oacute;n de Resultados IA</strong>
  <strong>Donut de Sentimiento:</strong> distribuci&oacute;n porcentual Aceptaci&oacute;n / Neutral / Rechazo calculada por el modelo IA. &nbsp;|&nbsp;
  <strong>Importancia de Factores:</strong> ranking de variables socioecon&oacute;micas seg&uacute;n el &iacute;ndice Gini del Random Forest (150 &aacute;rboles). &nbsp;|&nbsp;
  <strong>Aceptaci&oacute;n por Zona:</strong> promedio de aceptaci&oacute;n predicho por MLP agrupado geogr&aacute;ficamente por sector parroquial.
</div>`;
        if (imgDonut)    p2 += `<div class="st">2.1 Distribuci&oacute;n de Sentimiento</div><div class="chart-wrap"><img src="${imgDonut}" style="max-height:250px"></div>`;
        if (imgFactores) p2 += `<div class="st">2.2 Importancia de Factores (Random Forest + MLP)</div><div class="chart-wrap"><img src="${imgFactores}" style="max-height:200px"></div>`;
        if (imgZonas)    p2 += `<div class="st">2.3 Aceptaci&oacute;n por Zona Geogr&aacute;fica</div><div class="chart-wrap"><img src="${imgZonas}" style="max-height:200px"></div>`;
        if (!imgDonut && !imgFactores && !imgZonas) p2 += `<p style="color:#888;padding:20px 0">Gr&aacute;ficas no disponibles. Aseg&uacute;rate de que el tab LLM est&eacute; visible antes de exportar.</p>`;
        p2 += `<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;

        // PAG 2B: RADAR — Comparativa por Dimensión (canvas nativo con fondo blanco)
        let p2b = '';
        if (radarDims.length > 0) {
            p2b = `<div class="page"><div class="ph"><h2>2B. Vista Radar &mdash; Comparativa por Dimensi&oacute;n</h2><p>&Iacute;ndice Neto de Aceptaci&oacute;n por dimensi&oacute;n (escala -100 a +100 pts) &middot; Verde = favorable &middot; Rojo = cr&iacute;tico</p></div>
<div class="metod-tags">
  <span class="mtag mtag-purple">&#127962; An&aacute;lisis Multidimensional</span>
  <span class="mtag mtag-blue">&#128202; Vista Radar (Spider Chart)</span>
  <span class="mtag mtag-green">&#128203; &Iacute;ndice Neto Ponderado</span>
  <span class="mtag mtag-orange">&#9889; Escala -100 a +100 pts</span>
  <span class="mtag mtag-slate">&#127759; 6 Dimensiones Tem&aacute;ticas</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; An&aacute;lisis Radar Multidimensional</strong>
  Cada eje del radar representa una dimensi&oacute;n tem&aacute;tica (ambiente, econom&iacute;a, gobernanza, etc.). &nbsp;|&nbsp;
  <strong>&Iacute;ndice Neto:</strong> calculado como (% Positivo &minus; % Negativo), en escala de &minus;100 a +100 puntos. &nbsp;|&nbsp;
  <strong>Color del punto:</strong> verde (&ge;+10 pts) = favorable &middot; naranja (entre &minus;10 y +10) = ambivalente &middot; rojo (&le;&minus;10 pts) = cr&iacute;tico. &nbsp;|&nbsp;
  Procesado por <strong>NVIDIA Nemotron LLM</strong> sobre las respuestas de cada dimensi&oacute;n.
</div>
<div style="position:relative;width:100%;max-width:560px;height:420px;margin:0 auto 20px;"><canvas id="pdf-radar-main"></canvas></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px">
${radarDims.map(dim=>{const ds=dim.sentimiento||{};const col=sentColor(ds.indice);const lbl=sentLabel(ds.indice);return `<div style="border-radius:7px;padding:8px 12px;background:#f8fafc;border-left:4px solid ${col}"><div style="font-size:8.5pt;font-weight:700;color:#334155;margin-bottom:2px">${esc(dim.titulo||'')}</div><div style="font-size:9pt;font-weight:800;color:${col}">${sgn(ds.indice)} pts &mdash; ${lbl}</div></div>`;}).join('')}
</div>
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;
        }

        // PAG 2C: PREGUNTAS CON GRAFICAS
        let pregHtml = '';
        let chartsCode = '';
        let cIdx = 0;
        // Radar PDF: Chart.js con fondo blanco (se renderiza en el iframe junto a los demas charts)
        if (radarDims.length > 0) {
            chartsCode += 'var _rv=' + JSON.stringify(radarVals) + ';'
                + 'var _rc=document.getElementById("pdf-radar-main");'
                + 'if(_rc){new Chart(_rc,{type:"radar",data:{labels:' + JSON.stringify(radarLabels)
                + ',datasets:[{label:"Indice Neto de Sentimiento",data:_rv,'
                + 'backgroundColor:"rgba(14,78,176,0.10)",borderColor:"#0e4eb0",borderWidth:2.5,'
                + 'pointBackgroundColor:' + JSON.stringify(radarPtClr) + ','
                + 'pointBorderColor:"#fff",pointBorderWidth:2,pointRadius:7,pointHoverRadius:9}]},'
                + 'options:{responsive:true,maintainAspectRatio:false,'
                + 'scales:{r:{min:-100,max:100,'
                + 'ticks:{stepSize:25,font:{size:11,weight:"600"},color:"#64748b",'
                + 'backdropColor:"rgba(255,255,255,0.92)",'
                + 'callback:function(v){return(v>0?"+":"")+v}},'
                + 'pointLabels:{font:{size:11,weight:"bold"},'
                + 'color:function(c){var v=_rv[c.index]||0;return v>=10?"#0f9f6e":v<=-10?"#c43d45":"#d97706"},'
                + 'padding:10},'
                + 'grid:{color:"rgba(0,0,0,0.07)",circular:true},'
                + 'angleLines:{color:"rgba(0,0,0,0.10)"}}},'
                + 'plugins:{legend:{display:false}}}})}';
        }
        if (pregData) {
            (pregData.grupos || []).forEach(g => {
                if (!g.preguntas?.length) return;
                pregHtml += `<div class="pg-grupo"><h3 class="pg-gtit">${esc(g.titulo)}</h3><div class="pg-grid">`;
                g.preguntas.forEach(preg => {
                    if (!preg.distribucion?.length) return;
                    const cid  = 'llmc' + (cIdx++);
                    const isDo = preg.tipo === 'donut';
                    const clab = preg.distribucion.map(d => d.label);
                    const cdat = preg.distribucion.map(d => d.count);
                    const barH = Math.max(140, (clab.length * 34) + 40);
                    const wrapH = isDo ? 200 : barH;
                    const cardMinH = isDo ? 220 : (barH + 70);
                    pregHtml += `<div class="pg-card no-break" style="min-height:${cardMinH}px;"><p class="pg-q">${esc(preg.pregunta)}</p><p class="pg-n">n = ${nv(preg.respondentes)} respuestas</p><div style="position:relative;width:100%;max-width:100%;overflow:hidden;height:${wrapH}px;"><canvas id="${cid}"></canvas></div></div>`;
                    const safeLab = clab.map(l => { const s = String(l); return s.length > 28 ? s.slice(0, 27) + '…' : s; });
                    const legendCfg = isDo ? '{display:true,position:"bottom"}' : '{display:false}';
                    const optsCommon = 'responsive:true,maintainAspectRatio:false,layout:{padding:4},plugins:{legend:' + legendCfg + '}';
                    if (isDo) {
                        chartsCode += 'new Chart(document.getElementById("' + cid + '"),{type:"doughnut",data:{labels:' + JSON.stringify(safeLab) + ',datasets:[{data:' + JSON.stringify(cdat) + ',backgroundColor:["#0e4eb0","#0f9f6e","#c43d45","#d97706","#7c3aed","#ec4899","#f59e0b","#14b8a6"]}]},options:{' + optsCommon + '}});';
                    } else {
                        chartsCode += 'new Chart(document.getElementById("' + cid + '"),{type:"bar",data:{labels:' + JSON.stringify(safeLab) + ',datasets:[{data:' + JSON.stringify(cdat) + ',backgroundColor:["#0e4eb0","#0f9f6e","#c43d45","#d97706","#7c3aed","#ec4899","#f59e0b","#14b8a6"]}]},options:{' + optsCommon + ',indexAxis:"y",scales:{x:{beginAtZero:true,ticks:{font:{size:9}}},y:{ticks:{font:{size:9},autoSkip:false}}}}});';
                    }
                });
                pregHtml += '</div></div>';
            });
        }
        const pPreg = pregHtml ? `<div class="page">
<div class="ph"><h2>2C. Respuestas Detalladas a Preguntas Clave</h2><p>Distribuci&oacute;n de opciones seleccionadas en el formulario de encuesta</p></div>
<div class="metod-tags">
  <span class="mtag mtag-blue">&#128203; Encuesta (Survey Research)</span>
  <span class="mtag mtag-purple">&#128202; Distribuci&oacute;n de Frecuencias</span>
  <span class="mtag mtag-green">&#128201; Escala Nominal / Ordinal</span>
  <span class="mtag mtag-orange">&#9889; Investigaci&oacute;n Cuantitativa</span>
  <span class="mtag mtag-slate">&#127759; Formulario Digital de Campo</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; Investigaci&oacute;n por Encuesta (Survey Research)</strong>
  <strong>Tipo de pregunta:</strong> opciones m&uacute;ltiples (nominal) y escala de acuerdo (ordinal). &nbsp;|&nbsp;
  <strong>Distribuci&oacute;n de frecuencias:</strong> cada barra / donut muestra el conteo de respuestas seleccionadas para esa opci&oacute;n. &nbsp;|&nbsp;
  <strong>Visualizaci&oacute;n:</strong> gr&aacute;ficas de barra horizontal para preguntas de opci&oacute;n m&uacute;ltiple y donut para respuestas dicot&oacute;micas, renderizadas con Chart.js.
</div>
${pregHtml}
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div>
</div>` : '';

        // PAG 3: DIMENSIONES — tarjetas visuales con canvas capturado de la UI
        let dimsHtml = '';
        radarDims.forEach((dim, dIdx) => {
            const ds   = dim.sentimiento || {};
            const idxV = nv(ds.indice);
            const col  = sentColor(idxV);
            const lbl  = sentLabel(idxV);
            const imgG = imgsDimGauge[dIdx];  // gauge capturado de la UI
            const imgB = imgsDimBar[dIdx];    // barra distribución capturada de la UI

            dimsHtml += `<div style="border:1px solid #e2e8f0;border-top:3px solid ${col};border-radius:10px;padding:14px;background:#fff;break-inside:avoid;page-break-inside:avoid;">
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
  <span style="font-size:10pt;font-weight:800;color:#1e293b;line-height:1.3;">${esc(dim.titulo||'')}</span>
  <span style="font-size:7.5pt;padding:3px 9px;border-radius:20px;background:${col};color:#fff;font-weight:700;white-space:nowrap;margin-left:8px;">${lbl} (${sgn(idxV)} pts)</span>
</div>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
  <div style="position:relative;width:90px;height:90px;flex-shrink:0;text-align:center;">
    ${imgG ? `<img src="${imgG}" style="width:90px;height:90px;object-fit:contain;">` : `<div style="width:90px;height:90px;border-radius:50%;border:4px solid ${col};display:flex;align-items:center;justify-content:center;font-size:14pt;font-weight:900;color:${col};">${sgn(idxV)}</div>`}
  </div>
  <div style="flex:1;">
    <div style="margin-bottom:5px;"><div style="display:flex;justify-content:space-between;font-size:7.5pt;font-weight:600;margin-bottom:2px;"><span style="color:#0f9f6e;">&#9679; Positivo</span><span style="color:#0f9f6e;">${pct(ds.positivo_pct)}</span></div><div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden;"><div style="width:${Math.min(100,nv(ds.positivo_pct))}%;height:100%;background:#0f9f6e;border-radius:3px;"></div></div></div>
    <div style="margin-bottom:5px;"><div style="display:flex;justify-content:space-between;font-size:7.5pt;font-weight:600;margin-bottom:2px;"><span style="color:#d97706;">&#9679; Neutro</span><span style="color:#d97706;">${pct(ds.neutro_pct)}</span></div><div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden;"><div style="width:${Math.min(100,nv(ds.neutro_pct))}%;height:100%;background:#d97706;border-radius:3px;"></div></div></div>
    <div><div style="display:flex;justify-content:space-between;font-size:7.5pt;font-weight:600;margin-bottom:2px;"><span style="color:#c43d45;">&#9679; Negativo</span><span style="color:#c43d45;">${pct(ds.negativo_pct)}</span></div><div style="background:#e2e8f0;border-radius:3px;height:5px;overflow:hidden;"><div style="width:${Math.min(100,nv(ds.negativo_pct))}%;height:100%;background:#c43d45;border-radius:3px;"></div></div></div>
  </div>
</div>
${imgB ? `<div style="margin-bottom:8px;"><p style="font-size:6.5pt;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">Distribuci&oacute;n de respuestas</p><img src="${imgB}" style="width:100%;max-height:130px;object-fit:contain;"></div>` : ''}
${dim.interpretacion ? `<div style="background:#f8fafc;border-left:3px solid ${col};border-radius:0 6px 6px 0;padding:7px 10px;"><p style="font-size:8pt;color:#475569;margin:0;line-height:1.5;font-style:italic;">${esc(dim.interpretacion)}</p></div>` : ''}
</div>`;
        });
        const p3 = `<div class="page"><div class="ph"><h2>3. Sentimiento por Dimensi&oacute;n</h2><p>An&aacute;lisis de sentimiento por cada eje tem&aacute;tico &mdash; procesado por IA</p></div>
<div class="metod-tags">
  <span class="mtag mtag-purple">&#129504; NLP &mdash; Procesamiento de Lenguaje Natural</span>
  <span class="mtag mtag-blue">&#127962; An&aacute;lisis Multidimensional</span>
  <span class="mtag mtag-green">&#128202; &Iacute;ndice Neto de Sentimiento</span>
  <span class="mtag mtag-orange">&#9889; Clasificaci&oacute;n por Dimensi&oacute;n</span>
  <span class="mtag mtag-slate">&#129302; NVIDIA Nemotron LLM</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; Sentimiento por Dimensi&oacute;n (NLP + Clasificaci&oacute;n IA)</strong>
  Cada dimensi&oacute;n agrupa preguntas relacionadas del formulario (ambiente, econom&iacute;a, gobernanza, etc.). &nbsp;|&nbsp;
  <strong>NLP (NVIDIA LLM):</strong> analiza el texto de respuestas abiertas para detectar polaridad (positivo / neutro / negativo). &nbsp;|&nbsp;
  <strong>&Iacute;ndice Neto:</strong> % Positivo &minus; % Negativo &mdash; verde &ge;+10 pts, naranja entre &minus;10 y +10 pts, rojo &le;&minus;10 pts. &nbsp;|&nbsp;
  <strong>Gauge:</strong> representaci&oacute;n visual del &iacute;ndice neto sobre escala semicircular de &minus;100 a +100 pts.
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
${dimsHtml || '<p style="color:#888">Sin datos de dimensiones. Aseg&uacute;rate de que el tab LLM est&eacute; visible antes de exportar.</p>'}
</div>
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;

        // PAG 3B: EVALUACIÓN ZONAL (NVIDIA) — gauges capturados de la UI
        const zonasPdf = data.analisis_por_zona || [];
        let zonalHtml = '';
        zonasPdf.forEach((z, zi) => {
            const pred  = z.prediccion || (z.aceptacion_pct >= z.rechazo_pct ? 'Aceptacion' : 'Rechazo');
            const zcol  = predColor(pred);
            const icon  = pred === 'Aceptacion' || pred === 'Aceptación' ? '&#10004;' : pred === 'Rechazo' ? '&#10008;' : '&#9888;';
            const acept = nv(z.aceptacion_pct);
            const neutr = nv(z.neutral_pct);
            const rech  = nv(z.rechazo_pct);
            const imgZG = imgsZonaGauge[zi];
            zonalHtml += `<div style="border:1px solid #e2e8f0;border-top:3px solid ${zcol};border-radius:10px;padding:14px;background:#fff;break-inside:avoid;page-break-inside:avoid;text-align:center;">
<h4 style="font-size:10pt;font-weight:800;color:#1e293b;margin:0 0 4px;">${icon} ${esc(z.zona||z.sector||'')}</h4>
<p style="font-size:7.5pt;color:#94a3b8;margin:0 0 10px;">${nv(z.n)} encuestas evaluadas</p>
${imgZG ? `<img src="${imgZG}" style="width:100%;max-height:110px;object-fit:contain;margin-bottom:8px;">` : ''}
<div style="font-size:9pt;font-weight:900;color:${zcol};margin-bottom:6px;">${acept}% Aceptaci&oacute;n</div>
<div style="display:flex;justify-content:center;gap:10px;font-size:8pt;margin-bottom:10px;">
  <span style="color:#0f9f6e;">&#9679; ${acept}%</span>
  <span style="color:#d97706;">&#9679; ${neutr}%</span>
  <span style="color:#c43d45;">&#9679; ${rech}%</span>
</div>
<div style="display:flex;gap:4px;height:6px;border-radius:3px;overflow:hidden;margin-bottom:${z.hallazgo_clave ? '10px' : '0'}">
  <div style="width:${acept}%;background:#0f9f6e;"></div>
  <div style="width:${neutr}%;background:#d97706;"></div>
  <div style="width:${rech}%;background:#c43d45;"></div>
</div>
${z.hallazgo_clave ? `<p style="font-size:7.5pt;color:#475569;margin:0;line-height:1.5;text-align:left;border-top:1px solid #e2e8f0;padding-top:8px;font-style:italic;">${esc(z.hallazgo_clave)}</p>` : ''}
</div>`;
        });
        const p3b = zonasPdf.length ? `<div class="page"><div class="ph"><h2>3B. Evaluaci&oacute;n Zonal (NVIDIA)</h2><p>Predicci&oacute;n de sentimiento y distribuci&oacute;n por sector parroquial</p></div>
<div class="metod-tags">
  <span class="mtag mtag-blue">&#127759; An&aacute;lisis Geoespacial por Sector</span>
  <span class="mtag mtag-purple">&#129504; Predicci&oacute;n por Zona (MLP)</span>
  <span class="mtag mtag-green">&#127795; Random Forest &mdash; Segmentaci&oacute;n</span>
  <span class="mtag mtag-orange">&#9889; NVIDIA Nemotron LLM</span>
  <span class="mtag mtag-slate">&#128202; Gauge por Zona</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; Evaluaci&oacute;n Zonal con IA Predictiva</strong>
  Las encuestas se segmentan geogr&aacute;ficamente por sector/comunidad declarado por el encuestado. &nbsp;|&nbsp;
  <strong>MLP por zona:</strong> la Red Neuronal predice Aceptaci&oacute;n / Neutral / Rechazo para cada subgrupo zonal. &nbsp;|&nbsp;
  <strong>Gauge visual:</strong> muestra el % de aceptaci&oacute;n predicho con sem&aacute;foro de color (verde / naranja / rojo). &nbsp;|&nbsp;
  <strong>NVIDIA LLM:</strong> genera el hallazgo clave narrativo espec&iacute;fico para cada zona analizada.
</div>
${imgZonas ? `<div class="chart-wrap" style="margin-bottom:20px;"><img src="${imgZonas}" style="max-height:200px;border-radius:8px;"></div>` : ''}
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
${zonalHtml}
</div>
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>` : '';

        // PAG 4: ZONAS
        const zonas = data.analisis_por_zona || [];
        const zonaRows = zonas.map(z => {
            const zc = predColor(z.prediccion);
            return `<tr>
<td><strong>${esc(z.zona)}</strong></td>
<td style="text-align:center;color:#94a3b8">${nv(z.n)}</td>
<td style="text-align:center;color:#0f9f6e;font-weight:700">${nv(z.aceptacion_pct)}%</td>
<td style="text-align:center;color:#d97706;font-weight:700">${nv(z.neutral_pct)}%</td>
<td style="text-align:center;color:#c43d45;font-weight:700">${nv(z.rechazo_pct)}%</td>
<td style="color:${zc};font-weight:700">${esc(z.prediccion||'')}</td>
</tr>${z.hallazgo_clave ? `<tr><td colspan="6" style="font-size:8.5pt;color:#475569;padding:4px 12px 10px;border-bottom:2px solid #e2e8f0;font-style:italic">&rarr; ${esc(z.hallazgo_clave)}</td></tr>` : ''}`;
        }).join('');
        const p4 = `<div class="page"><div class="ph"><h2>4. An&aacute;lisis por Zona Geogr&aacute;fica</h2><p>Predicci&oacute;n de sentimiento por sector parroquial</p></div>
<div class="metod-tags">
  <span class="mtag mtag-blue">&#127759; Distribuci&oacute;n Geogr&aacute;fica</span>
  <span class="mtag mtag-purple">&#128202; Estad&iacute;stica Sectorial</span>
  <span class="mtag mtag-green">&#129504; Predicci&oacute;n por Zona (Random Forest)</span>
  <span class="mtag mtag-orange">&#128203; Segmentaci&oacute;n por Comunidad</span>
  <span class="mtag mtag-slate">&#9889; NVIDIA LLM &mdash; Hallazgo Zonal</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; An&aacute;lisis Geogr&aacute;fico por Sector Parroquial</strong>
  Las encuestas se agrupan por el campo <em>sector/comunidad</em> declarado en el formulario. &nbsp;|&nbsp;
  <strong>Aceptaci&oacute;n / Neutro / Rechazo:</strong> porcentajes calculados como distribuci&oacute;n emp&iacute;rica dentro de cada zona. &nbsp;|&nbsp;
  <strong>Predicci&oacute;n:</strong> etiqueta dominante asignada por el Random Forest para cada cluster zonal. &nbsp;|&nbsp;
  <strong>Hallazgo clave:</strong> generado por NVIDIA Nemotron LLM con contexto espec&iacute;fico de la zona.
</div>
${zonas.length ? `<table class="stbl"><tr><th>Zona</th><th>n</th><th>&#10003; Acepta</th><th>&#9878; Neutro</th><th>&#10007; Rechaza</th><th>Predicci&oacute;n</th></tr>${zonaRows}</table>` : '<p style="color:#888">Sin datos por zona.</p>'}
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;

        // PAG 5: PERCEPCIONES MINERAS
        const sl    = data.stats_locales || {};
        const benH  = (sl.beneficios_mineros||[]).map(it => barRow(it.label, it.pct, '#0f9f6e')).join('');
        const rskH  = (sl.riesgos_mineros  ||[]).map(it => barRow(it.label, it.pct, '#c43d45')).join('');
        const idxC  = nv(sl.indice_conocimiento);
        const cCol  = idxC >= 60 ? '#0f9f6e' : idxC >= 30 ? '#d97706' : '#c43d45';
        const cNiv  = idxC >= 60 ? 'ALTO' : idxC >= 30 ? 'MEDIO' : 'BAJO';
        const cRows = (sl.conocimiento_minero||[]).map(k => {
            const kp = nv(k.pct ?? k.si_pct);
            const kc = kp >= 60 ? '#0f9f6e' : kp >= 30 ? '#d97706' : '#c43d45';
            return `<div class="krow"><span class="kdot" style="background:${kc}"></span><span>${esc(k.label||k.pregunta||'')}</span><strong style="color:${kc}">${kp.toFixed(1)}%</strong></div>`;
        }).join('');
        const p5 = `<div class="page"><div class="ph"><h2>5. Percepciones Mineras</h2><p>Beneficios y riesgos percibidos seg&uacute;n encuestas analizadas</p></div>
<div class="metod-tags">
  <span class="mtag mtag-purple">&#128221; Investigaci&oacute;n Cualitativa</span>
  <span class="mtag mtag-blue">&#128202; An&aacute;lisis de Percepci&oacute;n Comunitaria</span>
  <span class="mtag mtag-green">&#9881; Sem&aacute;foro de Conocimiento Minero</span>
  <span class="mtag mtag-orange">&#9888; Evaluaci&oacute;n de Riesgo Percibido</span>
  <span class="mtag mtag-slate">&#127795; M&eacute;todo Mixto</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; An&aacute;lisis de Percepci&oacute;n Minera Comunitaria (M&eacute;todo Mixto)</strong>
  <strong>Beneficios / Riesgos:</strong> extra&iacute;dos de campos de selecci&oacute;n m&uacute;ltiple del formulario; las barras muestran % de encuestados que marcaron cada opci&oacute;n. &nbsp;|&nbsp;
  <strong>&Iacute;ndice de Conocimiento Minero:</strong> promedio de respuestas afirmativas en 5 dimensiones de conocimiento (tipos de miner&iacute;a, beneficios, miner&iacute;a moderna, minas locales, garant&iacute;as ambientales). &nbsp;|&nbsp;
  <strong>Sem&aacute;foro:</strong> &ge;60% = ALTO &middot; 30&ndash;59% = MEDIO &middot; &lt;30% = BAJO.
</div>
<div class="mine-grid">
  <div class="mine-card no-break"><h4 style="color:#0f9f6e;border-color:#0f9f6e">&#10003; Beneficios Percibidos</h4>${benH||'<p style="color:#888;font-size:9pt">Sin datos</p>'}</div>
  <div class="mine-card no-break"><h4 style="color:#c43d45;border-color:#c43d45">&#9888; Riesgos Percibidos</h4>${rskH||'<p style="color:#888;font-size:9pt">Sin datos</p>'}</div>
</div>
<div class="st">5.3 &Iacute;ndice de Conocimiento Minero</div>
<div style="text-align:center;margin:10px 0 16px"><span style="display:inline-block;padding:6px 20px;border-radius:20px;background:${cCol};color:#fff;font-weight:800;font-size:13pt">${idxC}% &mdash; ${cNiv}</span><p style="font-size:9pt;color:#64748b;margin-top:6px">Promedio de dimensiones de conocimiento minero evaluadas</p></div>
${cRows}
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;

        // PAG 6: RECOMENDACIONES MINERAS
        const rm    = data.recomendaciones_mineras || {};
        const viab  = rm.viabilidad_social || {};
        const vMap  = { verde:'#0f9f6e', naranja:'#d97706', rojo:'#c43d45' };
        const vCol  = vMap[viab.color] || '#555';
        const fortH = (rm.fortalezas||[]).map(f => `<li style="margin-bottom:6px;font-size:9.5pt">${esc(f)}</li>`).join('');
        const riesH = (rm.riesgos_criticos||[]).map(r => `<li style="margin-bottom:6px;font-size:9.5pt">${esc(r)}</li>`).join('');
        const accsH = (rm.acciones_inmediatas||[]).map((a,i) => `<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start"><div style="min-width:20px;height:20px;background:#0e4eb0;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8pt;font-weight:800">${i+1}</div><span style="font-size:9.5pt;color:#334155;padding-top:1px">${esc(a)}</span></div>`).join('');
        const pasH  = (rm.pasos_licenciamiento||[]).map(paso => `<div style="font-size:9.5pt;color:#334155;padding:6px 0;border-bottom:1px solid #f1f5f9;line-height:1.5">${esc(paso)}</div>`).join('');
        const semH  = (rm.indicadores_licencia_social||[]).map(ind => {
            const sc = { verde:'#0f9f6e', naranja:'#d97706', rojo:'#c43d45' }[ind.semaforo] || '#555';
            return `<tr><td style="font-size:9pt">${esc(ind.indicador)}</td><td style="text-align:center;font-weight:700;color:${sc}">${esc(ind.actual)}</td><td style="text-align:center;color:#0f9f6e;font-weight:700">${esc(ind.meta)}</td><td style="text-align:center"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${sc}"></span></td></tr>`;
        }).join('');
        const p6 = `<div class="page"><div class="ph"><h2>6. Recomendaciones y Viabilidad Minera</h2><p>Diagn&oacute;stico de viabilidad social y plan de acci&oacute;n</p></div>
<div class="metod-tags">
  <span class="mtag mtag-purple">&#128269; An&aacute;lisis FODA</span>
  <span class="mtag mtag-blue">&#127881; Viabilidad Social &mdash; Licencia Social</span>
  <span class="mtag mtag-green">&#9881; Sem&aacute;foro de Indicadores</span>
  <span class="mtag mtag-orange">&#128220; Marco Regulatorio Ecuador</span>
  <span class="mtag mtag-slate">&#129302; NVIDIA LLM &mdash; Plan de Acci&oacute;n</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; Diagn&oacute;stico de Viabilidad Social (FODA + Sem&aacute;foro de Indicadores)</strong>
  <strong>Viabilidad Social:</strong> calculada por NVIDIA LLM combinando resultados del modelo IA con contexto regulatorio (ARCOM, Convenio 169 OIT, Art. 57 Constituci&oacute;n). &nbsp;|&nbsp;
  <strong>FODA:</strong> fortalezas y riesgos extra&iacute;dos autom&aacute;ticamente de los patrones detectados por Random Forest + MLP. &nbsp;|&nbsp;
  <strong>Sem&aacute;foro:</strong> verde = meta alcanzada &middot; naranja = en proceso &middot; rojo = cr&iacute;tico / requiere intervenci&oacute;n inmediata.
</div>
<div style="background:${vCol};color:#fff;border-radius:8px;padding:14px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
  <div><strong style="font-size:12pt">${esc(viab.titulo||'Viabilidad Social del Proyecto')}</strong><p style="opacity:.9;font-size:9.5pt;margin-top:4px">${esc(viab.resumen||'')}</p></div>
  <div style="font-size:18pt;font-weight:900;white-space:nowrap;margin-left:16px">${esc(viab.nivel||'')}</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px"><h5 style="color:#166534;font-size:10pt;font-weight:800;margin:0 0 8px">&#10003; Fortalezas</h5><ul style="padding-left:16px;margin:0">${fortH||'<li style="font-size:9pt;color:#888">Sin datos</li>'}</ul></div>
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px"><h5 style="color:#991b1b;font-size:10pt;font-weight:800;margin:0 0 8px">&#9888; Riesgos Cr&iacute;ticos</h5><ul style="padding-left:16px;margin:0">${riesH||'<li style="font-size:9pt;color:#888">Sin datos</li>'}</ul></div>
</div>
<div class="st">6.3 Acciones Inmediatas</div><div style="margin-bottom:16px">${accsH||'<p style="color:#888;font-size:9pt">Sin acciones.</p>'}</div>
<div class="st">6.4 Pasos de Licenciamiento Social</div><div style="border:1px solid #e2e8f0;border-radius:8px;padding:0 14px;margin-bottom:16px;background:#fff">${pasH}</div>
${semH ? `<div class="st">6.5 Sem&aacute;foro de Licencia Social</div><table class="stbl"><tr><th>Indicador</th><th>Actual</th><th>Meta</th><th>Estado</th></tr>${semH}</table>` : ''}
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;

        // PAG 7: PLAN ESTRATEGICO
        const plan  = data.plan_estrategico || {};
        const fasH  = (plan.fases||[]).map(f => `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:12px;background:#fff;page-break-inside:avoid"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong style="color:#0e4eb0;font-size:10pt">${esc(f.fase)}</strong><span style="font-size:8.5pt;background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:12px;font-weight:700">${esc(f.periodo)}</span></div><ul style="padding-left:16px;margin:0;font-size:9.5pt;color:#334155">${(f.acciones||[]).map(a => `<li style="margin-bottom:4px;line-height:1.5">${esc(a)}</li>`).join('')}</ul></div>`).join('');
        const indH  = (plan.indicadores||[]).map(ind => `<tr><td style="font-size:9pt">${esc(ind.nombre)}</td><td style="text-align:center;color:#0f9f6e;font-weight:700">${esc(ind.meta)}</td><td style="text-align:center;color:#64748b">${esc(ind.plazo)}</td></tr>`).join('');
        const rfH   = (plan.recomendaciones_finales||[]).map((r,i) => `<li style="margin-bottom:8px;font-size:9.5pt;line-height:1.6"><strong>R${i+1}:</strong> ${esc(r)}</li>`).join('');
        const p7 = `<div class="page"><div class="ph"><h2>7. Plan Estrat&eacute;gico de Viabilidad Social</h2><p>${esc(plan.titulo||'Plan generado por NVIDIA LLM')}</p></div>
<div class="metod-tags">
  <span class="mtag mtag-purple">&#128203; Marco L&oacute;gico</span>
  <span class="mtag mtag-blue">&#129504; Planificaci&oacute;n Estrat&eacute;gica (NVIDIA LLM)</span>
  <span class="mtag mtag-green">&#127881; Fases de Intervenci&oacute;n</span>
  <span class="mtag mtag-orange">&#9881; Indicadores de &Eacute;xito SMART</span>
  <span class="mtag mtag-slate">&#128269; Design Thinking</span>
</div>
<div class="metod-box">
  <strong>&#128220; Metodolog&iacute;a &mdash; Planificaci&oacute;n Estrat&eacute;gica (Marco L&oacute;gico + NVIDIA LLM)</strong>
  <strong>NVIDIA Nemotron LLM:</strong> genera el plan estrat&eacute;gico a partir del diagn&oacute;stico de IA, los factores cr&iacute;ticos del Random Forest y los hallazgos demogr&aacute;ficos. &nbsp;|&nbsp;
  <strong>Marco L&oacute;gico:</strong> estructura las intervenciones en fases (corto / mediano / largo plazo) con hitos verificables. &nbsp;|&nbsp;
  <strong>Indicadores SMART:</strong> m&eacute;tricas con meta num&eacute;rica, mecanismo de medici&oacute;n y responsable definido.
</div>
${plan.diagnostico_contextual ? `<div style="font-size:9.5pt;line-height:1.6;color:#334155;background:#f8fafc;padding:12px 16px;border-radius:8px;border-left:4px solid #0e4eb0;margin-bottom:16px">${esc(plan.diagnostico_contextual)}</div>` : ''}
<div class="st">7.1 Fases de Intervenci&oacute;n</div>${fasH||'<p style="color:#888;font-size:9pt">Sin fases definidas.</p>'}
${indH ? `<div class="st">7.2 Indicadores de &Eacute;xito</div><table class="stbl"><tr><th>Indicador</th><th>Meta</th><th>Plazo</th></tr>${indH}</table>` : ''}
${rfH  ? `<div class="st">7.3 Recomendaciones Finales</div><ul style="padding-left:20px;color:#334155;margin-bottom:16px">${rfH}</ul>` : ''}
<div class="pie"><span>Reporte LLM NVIDIA &middot; San Bartolom&eacute;</span><span>Zona: ${esc(sector)} &middot; ${fecha}</span></div></div>`;


        // PAG 8: EJES
        const ejes = data.ejes_estrategicos || [];
        const p8 = ejes.length ? '<div class="page"><div class="ph"><h2>8. Ejes Estrategicos de Intervencion</h2><p>Dimensiones prioritarias de accion segun el modelo IA</p></div>' +
            '<div class="metod-tags">' +
            '<span class="mtag mtag-purple">&#9889; Ejes Estrat&eacute;gicos Priorizados por IA</span>' +
            '<span class="mtag mtag-blue">&#129504; Random Forest &mdash; Importancia de Factores</span>' +
            '<span class="mtag mtag-green">&#128220; Normativa Ecuatoriana (ARCOM)</span>' +
            '<span class="mtag mtag-orange">&#129302; NVIDIA Nemotron LLM</span>' +
            '<span class="mtag mtag-slate">&#127881; Design Thinking</span>' +
            '</div>' +
            '<div class="metod-box">' +
            '<strong>&#128220; Metodolog&iacute;a &mdash; Definici&oacute;n de Ejes por Modelo IA + Normativa</strong>' +
            'Los ejes estrat&eacute;gicos se derivan de los <strong>factores de mayor importancia</strong> detectados por el Random Forest (impacto &ge;10% en la decisi&oacute;n del modelo). &nbsp;|&nbsp;' +
            '<strong>NVIDIA LLM:</strong> contextualiza cada eje con acciones concretas y referencia la normativa ecuatoriana vigente (ARCOM, Ministerio de Miner&iacute;a, Convenio 169 OIT). &nbsp;|&nbsp;' +
            'Las acciones siguen el enfoque de <strong>Design Thinking</strong> centrado en las necesidades reales de la comunidad.' +
            '</div>' +
            ejes.map(e => '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:12px;background:#fff;page-break-inside:avoid">' +
                '<strong style="color:#0e4eb0;font-size:10.5pt;display:block;margin-bottom:4px">' + esc(e.titulo||e.eje||'') + '</strong>' +
                '<p style="font-size:9.5pt;color:#475569;margin:0 0 8px;line-height:1.45">' + esc(e.descripcion||'') + '</p>' +
                '<ul style="padding-left:16px;margin:0 0 8px;font-size:9pt;color:#334155">' + (e.acciones||[]).map(a => '<li style="margin-bottom:3px">' + esc(a) + '</li>').join('') + '</ul>' +
                (e.normativa ? '<div style="font-size:8.5pt;color:#64748b;background:#f8fafc;padding:5px 10px;border-radius:5px">Normativa: ' + esc(e.normativa) + '</div>' : '') +
                '</div>').join('') +
            '<div class="pie"><span>Reporte LLM NVIDIA - San Bartolome</span><span>Zona: ' + esc(sector) + ' - ' + fecha + '</span></div></div>' : '';

        // PAG 9: MEJORES PRACTICAS
        const mp = data.mejores_practicas || {};
        const mpItem = item => {
            if (typeof item === 'string') return '<li style="margin-bottom:6px;font-size:9.5pt">' + esc(item) + '</li>';
            const pr = item.practica||item.nombre||'', ref = item.referencia||item.fuente||'', apl = item.aplicabilidad||item.descripcion||'';
            return '<div style="margin-bottom:10px;padding:10px 12px;background:#f8fafc;border-left:4px solid #0e4eb0;border-radius:0 6px 6px 0">' +
                '<strong style="font-size:9.5pt;color:#0e4eb0">' + esc(pr) + '</strong>' +
                (ref ? '<em style="font-size:8.5pt;color:#64748b;display:block;margin-top:2px">Referencia: ' + esc(ref) + '</em>' : '') +
                (apl ? '<p style="font-size:9pt;color:#475569;margin:4px 0 0;line-height:1.5">' + esc(apl) + '</p>' : '') +
                '</div>';
        };
        const p9 = ((mp.internacionales||[]).length || (mp.locales||[]).length) ?
            '<div class="page"><div class="ph"><h2>9. Mejores Practicas de Sostenibilidad</h2><p>Referencias aplicables al contexto de San Bartolome</p></div>' +
            '<div class="metod-tags">' +
            '<span class="mtag mtag-blue">&#127758; Benchmarking Internacional</span>' +
            '<span class="mtag mtag-green">&#127795; Est&aacute;ndares ICMM</span>' +
            '<span class="mtag mtag-purple">&#128220; Normas IFC (Banco Mundial)</span>' +
            '<span class="mtag mtag-orange">&#9881; Buenas Pr&aacute;cticas Mineras</span>' +
            '<span class="mtag mtag-slate">&#127759; Casos Nacionales Ecuador</span>' +
            '</div>' +
            '<div class="metod-box">' +
            '<strong>&#128220; Metodolog&iacute;a &mdash; Benchmarking de Mejores Pr&aacute;cticas (ICMM / IFC / Ecuador)</strong>' +
            '<strong>Benchmarking internacional:</strong> pr&aacute;cticas extra&iacute;das de est&aacute;ndares ICMM (International Council on Mining &amp; Metals) e IFC Performance Standards (Banco Mundial). &nbsp;|&nbsp;' +
            '<strong>Casos nacionales:</strong> experiencias documentadas de proyectos mineros en Ecuador analizadas por NVIDIA LLM para su aplicabilidad al contexto de San Bartolom&eacute;. &nbsp;|&nbsp;' +
            'Cada pr&aacute;ctica incluye referencia bibliogr&aacute;fica y nivel de aplicabilidad local.' +
            '</div>' +
            ((mp.internacionales||[]).length ? '<div class="st">9.1 Internacionales</div><div>' + (mp.internacionales||[]).map(mpItem).join('') + '</div>' : '') +
            ((mp.locales||[]).length ? '<div class="st">9.2 Nacionales / Locales</div><div>' + (mp.locales||[]).map(mpItem).join('') + '</div>' : '') +
            '<div class="pie"><span>Reporte LLM NVIDIA - San Bartolome</span><span>Zona: ' + esc(sector) + ' - ' + fecha + '</span></div></div>' : '';

        // PAG 10: CONCLUSION
        const rIaH = (data.recomendaciones_ia||[]).map((r,i) =>
            '<li style="margin-bottom:10px;font-size:10.5pt;line-height:1.7"><strong>R' + (i+1) + ':</strong> ' + esc(r) + '</li>').join('');
        const p10 = '<div class="page"><div class="ph"><h2>10. Conclusion General</h2><p>Sintesis del modelo NVIDIA LLM sobre la viabilidad social minera</p></div>' +
            '<div class="metod-tags">' +
            '<span class="mtag mtag-purple">&#129504; S&iacute;ntesis Anal&iacute;tica Mixta</span>' +
            '<span class="mtag mtag-blue">&#129302; NVIDIA Nemotron LLM</span>' +
            '<span class="mtag mtag-green">&#127795; Random Forest + Red Neuronal MLP</span>' +
            '<span class="mtag mtag-orange">&#128202; Modelo Predictivo de Aceptaci&oacute;n</span>' +
            '<span class="mtag mtag-slate">&#128203; Recomendaciones IA</span>' +
            '</div>' +
            '<div class="metod-box">' +
            '<strong>&#128220; Metodolog&iacute;a &mdash; S&iacute;ntesis del Modelo NVIDIA LLM</strong>' +
            'La conclusi&oacute;n integra los resultados de <strong>tres capas de an&aacute;lisis</strong>: (1) modelo IA local (Random Forest + MLP entrenado con las encuestas reales); (2) enriquecimiento narrativo por <strong>NVIDIA Nemotron LLM</strong> con contexto territorial y regulatorio; (3) literatura cient&iacute;fica y buenas pr&aacute;cticas internacionales (ICMM / IFC). &nbsp;|&nbsp;' +
            'Las recomendaciones finales son priorizadas autom&aacute;ticamente por nivel de impacto sobre la licencia social.' +
            '</div>' +
            '<div class="concl-box">' + esc(data.conclusion||'') + '</div>' +
            (rIaH ? '<div class="st" style="margin-top:24px">Recomendaciones del Modelo IA</div><ul class="recomend">' + rIaH + '</ul>' : '') +
            '<div class="cierre" style="margin-top:24px">Documento generado automaticamente - Motor: ' + esc(motor) + ' - ' + total + ' encuestas - ' + fecha + '</div>' +
            '<div class="pie"><span>Reporte LLM NVIDIA - San Bartolome</span><span>' + fecha + '</span></div></div>';

        // HTML FINAL
        const portada = '<div class="portada"><div>' +
            '<div class="portada-insignia">NVIDIA LLM - Sistema de Analisis Comunitario - GAD Parroquial San Bartolome - Ecuador</div>' +
            '<div class="portada-titulo">Reporte Tecnico LLM - Analisis NVIDIA de Sentimiento Minero</div>' +
            '<div class="portada-sub">Prediccion de Aceptacion Social y Plan de Viabilidad Estrategica</div>' +
            '<table class="portada-tabla">' +
            '<tr><td>Zona analizada</td><td>' + esc(sector) + '</td></tr>' +
            '<tr><td>Fecha de emision</td><td>' + fecha + '</td></tr>' +
            '<tr><td>Total encuestas</td><td>' + total + ' encuestas procesadas</td></tr>' +
            '<tr><td>Motor IA</td><td>' + esc(motor) + '</td></tr>' +
            '</table>' +
            '<div class="nivel-pill" style="background:' + pColor + '">Prediccion Global: ' + esc(pred) + ' | Aceptacion: ' + pct(pa) + ' Rechazo: ' + pct(prv) + '</div>' +
            '</div><div class="portada-foot">Documento generado automaticamente - ' + fecha + '</div></div>';

        const cierre = '<div class="page" style="page-break-after:auto"><div class="cierre">Fin del Reporte LLM NVIDIA - GAD Parroquial San Bartolome - Cuenca, Ecuador - ' + fecha + '</div></div>';

        const rawHtml = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte LLM NVIDIA - San Bartolome</title><style>' + CSS + '</style></head><body>' +
            portada + p1 + p2 + p2b + pPreg + p3 + p3b + p4 + p5 + p6 + p7 + p8 + p9 + p10 + cierre +
            '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.js"><\/script>' +
            '<script>window.addEventListener("load",function(){' + chartsCode + '});<\/script></body></html>';

        const cleanHtml = rawHtml
            .replace(/á/g,'&aacute;').replace(/é/g,'&eacute;').replace(/í/g,'&iacute;')
            .replace(/ó/g,'&oacute;').replace(/ú/g,'&uacute;').replace(/ñ/g,'&ntilde;')
            .replace(/Á/g,'&Aacute;').replace(/É/g,'&Eacute;').replace(/Í/g,'&Iacute;')
            .replace(/Ó/g,'&Oacute;').replace(/Ú/g,'&Uacute;').replace(/Ñ/g,'&Ntilde;')
            .replace(/—/g,'&mdash;').replace(/–/g,'&ndash;');

        // doc.write() mantiene el origen de la página padre → CDN Chart.js carga sin bloqueo CORS
        const oldFrame = document.getElementById('pdf-print-frame');
        if (oldFrame) oldFrame.remove();
        const iframe = document.createElement('iframe');
        iframe.id = 'pdf-print-frame';
        iframe.style.cssText = 'position:fixed;right:-9999px;top:0;width:794px;height:1123px;border:none;';
        document.body.appendChild(iframe);

        let _printed = false;
        const doPrint = () => {
            if (_printed) return;
            _printed = true;
            try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e) {}
            // Esperar 30s antes de limpiar — Opera GX necesita tiempo para terminar de escribir el PDF
            setTimeout(() => { const f = document.getElementById('pdf-print-frame'); if (f) f.remove(); }, 30000);
        };

        // Esperar que Chart.js CDN cargue y renderice antes de imprimir
        iframe.onload = () => setTimeout(doPrint, 3500);
        setTimeout(doPrint, 7000);  // fallback si onload no dispara

        const idoc = iframe.contentDocument || iframe.contentWindow.document;
        idoc.open(); idoc.write(cleanHtml); idoc.close();

    } catch(err) {
        console.error('Error generando PDF LLM:', err);
        alert('Error al generar el reporte LLM: ' + err.message);
    } finally {
        const btn = document.getElementById('llm-pdf-btn');
        if (btn) { btn.disabled = false; btn.textContent = '\u{1F4C4} Reporte PDF'; }
    }
}
