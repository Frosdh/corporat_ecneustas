<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Detalle de Encuesta</title>
    <link rel="stylesheet" href="style.css">
    <style>
        /* ── Variables coffee ── */
        :root {
            --coffee-bg:      #FFF8E1;
            --coffee-latte:   #D7BFA4;
            --coffee-medium:  #A67C52;
            --coffee-dark:    #6F4E37;
            --coffee-accent:  #E0A96D;
            --coffee-surface: #F5F1ED;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            background: var(--coffee-bg);
            font-family: system-ui, -apple-system, sans-serif;
            color: var(--coffee-dark);
            min-height: 100vh;
        }

        /* ── Top bar ── */
        .ve-topbar {
            position: sticky;
            top: 0;
            z-index: 10;
            background: var(--coffee-surface);
            border-bottom: 1.5px solid var(--coffee-latte);
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: .8rem 1.4rem;
        }
        .ve-back-btn {
            display: inline-flex;
            align-items: center;
            gap: .4rem;
            background: none;
            border: 1.5px solid var(--coffee-latte);
            border-radius: 8px;
            padding: .35rem .75rem;
            font-size: .82rem;
            font-weight: 600;
            color: var(--coffee-medium);
            cursor: pointer;
            text-decoration: none;
            transition: background .15s;
        }
        .ve-back-btn:hover { background: var(--coffee-latte); color: var(--coffee-dark); }
        .ve-topbar-title {
            flex: 1;
            font-size: .95rem;
            font-weight: 700;
            color: var(--coffee-dark);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .ve-status-badge {
            display: inline-flex;
            align-items: center;
            padding: .25rem .75rem;
            border-radius: 999px;
            font-size: .7rem;
            font-weight: 700;
            letter-spacing: .05em;
            text-transform: uppercase;
            border: 1.5px solid;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .ve-status-badge.status-revisada    { color:#059669; border-color:#6ee7b7; background:#ecfdf5; }
        .ve-status-badge.status-observada   { color:#dc2626; border-color:#fca5a5; background:#fef2f2; }
        .ve-status-badge.status-sincronizada{ color:var(--coffee-medium); border-color:var(--coffee-latte); background:var(--coffee-bg); }

        /* ── Main layout ── */
        .ve-main {
            max-width: 820px;
            margin: 0 auto;
            padding: 1.5rem 1.2rem 3rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        /* ── Header card ── */
        .ve-header-card {
            background: linear-gradient(135deg, var(--coffee-surface) 0%, var(--coffee-bg) 100%);
            border: 1.5px solid var(--coffee-latte);
            border-radius: 16px;
            padding: 1.2rem 1.4rem;
        }
        .ve-header-card h1 {
            font-size: 1.3rem;
            font-weight: 800;
            color: var(--coffee-dark);
            letter-spacing: -.3px;
            margin-bottom: .4rem;
        }
        .ve-meta {
            display: flex;
            flex-wrap: wrap;
            gap: .35rem .85rem;
            font-size: .8rem;
            color: var(--coffee-medium);
        }
        .ve-meta-item {
            display: flex;
            align-items: center;
            gap: .3rem;
        }

        /* GPS card */
        .ve-gps {
            display: flex;
            align-items: center;
            gap: .7rem;
            padding: .65rem 1rem;
            border-radius: 10px;
            background: #ecfdf5;
            border: 1.5px solid #6ee7b7;
            margin-top: .75rem;
        }
        .ve-gps-dot {
            width: 9px; height: 9px; border-radius: 50%;
            background: #059669; flex-shrink: 0;
            box-shadow: 0 0 0 3px rgba(5,150,105,.2);
        }
        .ve-gps-label { font-size: .68rem; color: #059669; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
        .ve-gps-coords { font-size: .82rem; font-family: monospace; color: #065f46; font-weight: 600; }
        .ve-no-gps {
            display: flex; align-items: center; gap: .4rem;
            padding: .5rem .85rem; border-radius: 9px;
            background: var(--coffee-surface); border: 1px solid var(--coffee-latte);
            font-size: .78rem; color: var(--coffee-latte); margin-top: .75rem;
        }

        /* ── Section ── */
        .ve-section {
            background: var(--coffee-surface);
            border: 1.5px solid var(--coffee-latte);
            border-radius: 14px;
            overflow: hidden;
        }
        .ve-section-header {
            display: flex;
            align-items: center;
            gap: .7rem;
            padding: .85rem 1.1rem;
            border-bottom: 1px solid var(--coffee-latte);
            background: linear-gradient(90deg, rgba(166,124,82,.07) 0%, transparent 100%);
        }
        .ve-section-icon {
            width: 32px; height: 32px; border-radius: 9px;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ve-section-title {
            font-size: .92rem; font-weight: 700; color: var(--coffee-dark);
        }
        .ve-section-body {
            padding: .9rem 1.1rem 1rem;
            display: flex; flex-direction: column; gap: .6rem;
        }

        /* ── Grid 2 cols ── */
        .ve-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: .55rem .9rem;
        }
        .ve-field { display: flex; flex-direction: column; gap: .1rem; }
        .ve-field-label {
            font-size: .67rem; font-weight: 700;
            color: var(--coffee-medium); text-transform: uppercase; letter-spacing: .07em;
        }
        .ve-field-value { font-size: .88rem; color: var(--coffee-dark); font-weight: 500; }
        .ve-field-value.empty { color: var(--coffee-latte); font-style: italic; font-weight: 400; }

        /* ── Pregunta ── */
        .ve-question { padding-top: .5rem; }
        .ve-q-label {
            font-size: .84rem; font-weight: 700;
            color: var(--coffee-dark); margin-bottom: .45rem; line-height: 1.35;
        }
        .ve-opts { display: flex; flex-wrap: wrap; gap: .35rem; }

        /* opción no seleccionada */
        .ve-opt {
            display: inline-flex; align-items: center; gap: .4rem;
            padding: .3rem .75rem .3rem .5rem;
            border-radius: 999px;
            border: 1.5px solid var(--coffee-latte);
            background: var(--coffee-bg);
            font-size: .8rem; color: var(--coffee-medium);
        }
        /* opción seleccionada */
        .ve-opt.active {
            background: var(--coffee-dark);
            border-color: var(--coffee-dark);
            color: #fff; font-weight: 700;
        }
        /* indicador radio */
        .ve-dot {
            width: 10px; height: 10px; border-radius: 50%;
            border: 2px solid var(--coffee-latte); flex-shrink: 0;
        }
        .ve-opt.active .ve-dot {
            border-color: var(--coffee-accent);
            background: var(--coffee-accent);
            box-shadow: 0 0 0 2px rgba(224,169,109,.35);
        }
        /* indicador checkbox */
        .ve-check {
            width: 14px; height: 14px; border-radius: 4px;
            border: 2px solid var(--coffee-latte);
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ve-opt.active .ve-check {
            border-color: var(--coffee-accent);
            background: var(--coffee-accent);
        }

        .ve-no-answer { font-size: .78rem; color: var(--coffee-latte); font-style: italic; }

        /* texto libre */
        .ve-text-answer {
            font-size: .88rem; color: var(--coffee-dark);
            background: var(--coffee-bg);
            border: 1.5px solid var(--coffee-latte);
            border-radius: 10px; padding: .55rem .8rem; line-height: 1.5;
        }
        .ve-text-answer.empty { color: var(--coffee-latte); font-style: italic; }

        /* comments */
        .ve-comments {
            background: var(--coffee-bg); border: 1.5px solid var(--coffee-latte);
            border-radius: 10px; padding: .8rem 1rem;
            font-size: .88rem; line-height: 1.6;
        }

        /* loading / error */
        .ve-loading, .ve-error {
            text-align: center; padding: 3rem 1rem;
            color: var(--coffee-medium); font-size: .95rem;
        }
        .ve-error { color: #dc2626; }

        @media (max-width: 520px) {
            .ve-grid { grid-template-columns: 1fr; }
            .ve-main { padding: 1rem .8rem 2rem; }
        }
    </style>
</head>
<body>

<!-- Top bar -->
<div class="ve-topbar">
    <button class="ve-back-btn" onclick="window.history.back()">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 3L5 8l5 5"/></svg>
        Volver
    </button>
    <span class="ve-topbar-title" id="topbar-title">Cargando encuesta...</span>
    <span class="ve-status-badge" id="topbar-badge"></span>
</div>

<div class="ve-main" id="ve-main">
    <div class="ve-loading">Cargando encuesta...</div>
</div>

<script>
// ── Helpers ──
function esc(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function normList(val) {
    if (!val || val === 'null') return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    return String(val).split('|').map(s => s.trim()).filter(Boolean);
}

// ── API base URL (ver_encuesta.php vive en /frontend/, API en raíz) ──
function apiUrl(action, params) {
    const q = new URLSearchParams({ action, ...params }).toString();
    return '../api.php?' + q;
}

// ── Render helpers ──
function field(label, value) {
    const empty = !value || value === 'null';
    return `<div class="ve-field">
        <span class="ve-field-label">${label}</span>
        <span class="ve-field-value${empty?' empty':''}">${empty?'—':esc(String(value))}</span>
    </div>`;
}

function radioQ(question, options, selected) {
    const sel = (selected||'').trim().toLowerCase();
    const opts = options.map(opt => {
        const active = sel && sel === opt.toLowerCase();
        return `<span class="ve-opt${active?' active':''}">
            <span class="ve-dot"></span>${esc(opt)}
        </span>`;
    }).join('');
    const none = !sel ? '<span class="ve-no-answer">Sin respuesta</span>' : '';
    return `<div class="ve-question">
        <div class="ve-q-label">${question}</div>
        <div class="ve-opts">${opts}${none}</div>
    </div>`;
}

function checkQ(question, options, selected) {
    const sel = normList(selected).map(s => s.toLowerCase());
    const checkSvg = `<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" stroke-width="2.2"><path d="M2 6l3 3 5-5"/></svg>`;
    const opts = options.map(opt => {
        const active = sel.includes(opt.toLowerCase());
        return `<span class="ve-opt${active?' active':''}">
            <span class="ve-check">${active?checkSvg:''}</span>${esc(opt)}
        </span>`;
    }).join('');
    const none = sel.length===0 ? '<span class="ve-no-answer">Sin respuesta</span>' : '';
    return `<div class="ve-question">
        <div class="ve-q-label">${question}</div>
        <div class="ve-opts">${opts}${none}</div>
    </div>`;
}

function textQ(question, value) {
    const empty = !value || value === 'null';
    return `<div class="ve-question">
        <div class="ve-q-label">${question}</div>
        <div class="ve-text-answer${empty?' empty':''}">${empty?'Sin respuesta':esc(String(value))}</div>
    </div>`;
}

function section(iconBg, iconColor, iconSvg, title, bodyHtml) {
    return `<div class="ve-section">
        <div class="ve-section-header">
            <div class="ve-section-icon" style="background:${iconBg};color:${iconColor}">${iconSvg}</div>
            <span class="ve-section-title">${title}</span>
        </div>
        <div class="ve-section-body">${bodyHtml}</div>
    </div>`;
}

const ICONS = {
    id:     `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><rect x="2" y="3" width="16" height="14" rx="3"/><path d="M6 7h8M6 10h5"/></svg>`,
    person: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg>`,
    social: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>`,
    home:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M3 10L10 3l7 7v7H3z"/><rect x="7" y="13" width="6" height="4"/></svg>`,
    mine:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M5 15l3-6 4 2 3-6"/><circle cx="15" cy="5" r="1.5" fill="currentColor"/></svg>`,
    comment:`<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H7l-4 3V5a1 1 0 011-1z"/></svg>`,
};

// ── Render survey ──
function renderSurvey(s) {
    const st = s.survey_status || 'sincronizada';

    // Topbar
    document.getElementById('topbar-title').textContent = (s.community||'—') + ' — ' + (s.sector||'—');
    const badge = document.getElementById('topbar-badge');
    badge.textContent = st.charAt(0).toUpperCase() + st.slice(1);
    badge.className = 've-status-badge status-' + st;

    // GPS
    const gpsHtml = (s.latitude && s.longitude)
        ? `<div class="ve-gps">
            <div class="ve-gps-dot"></div>
            <div>
                <div class="ve-gps-label">Coordenadas GPS registradas</div>
                <div class="ve-gps-coords">Lat ${esc(String(s.latitude))} &nbsp;&middot;&nbsp; Lon ${esc(String(s.longitude))}</div>
            </div>
           </div>`
        : `<div class="ve-no-gps">Sin coordenadas GPS registradas</div>`;

    const respondentName = [s.respondent_name, s.respondent_last_name].filter(Boolean).join(' ');

    const html = `
    <!-- Header card -->
    <div class="ve-header-card">
        <h1>${esc(s.community||'—')} &mdash; ${esc(s.sector||'—')}</h1>
        <div class="ve-meta">
            <span class="ve-meta-item">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1v4M11 1v4"/></svg>
                ${esc(s.survey_date||'—')}
            </span>
            <span class="ve-meta-item">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="5" r="3"/><path d="M2 15c0-3.314 2.686-6 6-6s6 2.686 6 6"/></svg>
                ${esc(s.surveyor_name||'Sin nombre')}
            </span>
        </div>
        ${gpsHtml}
    </div>

    <!-- 1. Identificación -->
    ${section('rgba(166,124,82,.15)', '#6F4E37', ICONS.id, 'Identificación y Contexto',
        `<div class="ve-grid">
            ${field('Sector', s.sector)}
            ${field('Comunidad / Barrio', s.community)}
            ${field('Fecha', s.survey_date)}
            ${field('Encuestador', s.surveyor_name)}
        </div>`
    )}

    <!-- 2. Datos del encuestado -->
    ${section('rgba(224,169,109,.2)', '#A67C52', ICONS.person, 'Datos del Encuestado',
        `${respondentName ? `<div class="ve-grid">${field('Nombre completo', respondentName)}${s.respondent_id_document ? field('Cédula', s.respondent_id_document) : ''}${s.respondent_phone ? field('Teléfono', s.respondent_phone) : ''}${s.respondent_email ? field('Correo', s.respondent_email) : ''}</div>` : ''}
        ${radioQ('Género del encuestado', ['Mujer','Hombre','Otro'], s.respondent_gender)}
        ${radioQ('Rango de edad', ['18-25','26-35','36-45','46-60','61 o mas'], s.age_range)}
        ${radioQ('Nivel de educación', ['Primaria','Secundaria','Tecnico','Universitario','Ninguno'], s.education_level)}
        ${textQ('Ocupación principal', s.occupation)}
        ${radioQ('Ingreso familiar mensual', ['No cubre la canasta','Cubre apenas','Cubre con algo de holgura'], s.household_income)}`
    )}

    <!-- 3. Problemáticas -->
    ${section('rgba(239,68,68,.1)', '#dc2626', ICONS.social, 'Problemáticas y Dinámica Social',
        `${checkQ('Problemáticas principales actuales (selección múltiple)',
            ['Inseguridad','Falta de empleo','Agua y saneamiento','Vias en mal estado','Salud','Migracion juvenil'],
            s.primary_problem)}
        ${radioQ('¿A qué se dedican los jóvenes al terminar sus estudios?',
            ['Migracion por falta de oportunidades','Agricultura o trabajo informal','Continuan estudios superiores','Empleo local eventual','Otro'],
            s.youth_path)}
        ${checkQ('Limitaciones económicas frecuentes para mujeres del sector (selección múltiple)',
            ['Precios bajos por intermediarios','Sobrecarga de cuidados','Poco acceso a financiamiento','Mercados limitados por seleccion'],
            s.women_roles)}
        ${radioQ('Clima político local',
            ['Desconfianza institucional','Division comunitaria','Estabilidad relativa','Conflicto abierto entre actores'],
            s.political_climate)}
        ${radioQ('Confianza en autoridades', ['Alta','Media','Baja'], s.authority_trust)}
        ${checkQ('Prioridad social (selección múltiple)',
            ['Proteger agua y paramos','Generar empleo rapido','Mejorar vias y servicios','Fortalecer produccion local','Turismo','Viviendas','Mineria?'],
            s.social_priority)}
        ${radioQ('Aceptación de inversión externa',
            ['Rechazo preventivo','Aceptacion condicionada','Aceptacion amplia'],
            s.investment_acceptance)}`
    )}

    <!-- 4. Hogar -->
    ${section('rgba(16,185,129,.1)', '#059669', ICONS.home, 'Condiciones del Hogar',
        `${radioQ('Fuente principal de agua',
            ['Red publica con tratamiento','Vertiente comunal sin purificacion','Rio o acequia','Tanquero u otra compra'],
            s.water_source)}
        ${radioQ('Alcantarillado', ['Si tiene','No tiene'], s.has_sewer)}
        ${radioQ('Fosa séptica', ['Si tiene','No tiene'], s.has_septic)}
        ${radioQ('Internet', ['Si estable','Intermitente','No tiene'], s.has_internet)}
        ${radioQ('Estado de vías', ['Bueno','Regular','Malo'], s.road_status)}
        ${radioQ('¿Quién debería arreglar las vías?', ['GAD Parroquial','GAD Cantonal','GAD Provincial'], s.road_who_fixes)}`
    )}

    <!-- 5. Minería -->
    ${section('rgba(111,78,55,.12)', '#6F4E37', ICONS.mine, 'Percepción Minera',
        `${radioQ('Percepción sobre reapertura minera',
            ['Beneficiaria mucho','Beneficiaria algo','Beneficio dudoso','No beneficiaria'],
            s.mine_reopening_perception)}
        ${checkQ('Beneficios esperados de la minería (selección múltiple)',
            ['Empleo juvenil','Movimiento comercial','Obras comunitarias','Pago de impuestos','Ninguno claro'],
            s.mine_benefits)}
        ${checkQ('Riesgos percibidos de la minería (selección múltiple)',
            ['Contaminacion del agua','Danos al suelo','Conflicto social','Poca transparencia'],
            s.mine_risks)}
        ${radioQ('¿Conoce tipos de minería?', ['Si','No','Primera vez que escucho'], s.knows_mining_types)}
        ${radioQ('¿Conoce beneficios de la minería?', ['Si','No','Primera vez que escucho'], s.knows_mining_benefits)}
        ${radioQ('¿Conoce la minería moderna?', ['Si','No','Primera vez que escucho esto'], s.knows_modern_mining)}
        ${radioQ('¿Conoce las minas locales?', ['Si','No','Hay que investigar'], s.knows_local_mines)}
        ${radioQ('¿Cree que hay garantías ambientales?', ['Si','No','Asi deberia ser'], s.knows_env_guarantees)}`
    )}

    ${s.comments && s.comments.trim() ? section('rgba(99,102,241,.12)', '#4f46e5', ICONS.comment, 'Observaciones',
        `<div class="ve-comments">${esc(s.comments)}</div>`) : ''}
    `;

    document.getElementById('ve-main').innerHTML = html;
}

// ── Load ──
async function load() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        document.getElementById('ve-main').innerHTML = '<div class="ve-error">No se especificó ID de encuesta.</div>';
        return;
    }
    try {
        const res = await fetch(apiUrl('get-survey', { id }), { credentials: 'include' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'Error al cargar');
        renderSurvey(data.survey);
    } catch (e) {
        document.getElementById('ve-main').innerHTML = `<div class="ve-error">Error: ${esc(e.message)}</div>`;
    }
}

load();
</script>
</body>
</html>
