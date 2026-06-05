# -*- coding: utf-8 -*-
"""
ia_nvidia.py  –  Análisis instantáneo + enriquecimiento NVIDIA en background
Parroquia San Bartolomé

Flujo:
  1. Calcula estadísticas locales          (~0.3 s)  → emite "stats"
  2. Genera análisis completo por reglas   (~0.1 s)  → emite "result"   ← usuario ve TODO ya
  3. Llama a NVIDIA con prompt mínimo      (~10-20 s) → emite "llm_update" (solo texto narrativo)

Protocolo NDJSON (una línea JSON por evento):
  {"type":"progress", "mensaje":"...", "zonas":[...], "total":N}
  {"type":"stats",    "stats":{...}}
  {"type":"result",   ...datos completos...}
  {"type":"llm_update", "resumen_ejecutivo":"...", "conclusion":"...", "interpretaciones_dim":[...]}
  {"type":"error",    "error":"..."}
"""

from asyncio import exceptions
import os
import sys
import json
from collections import Counter

# Forzar UTF-8 en stdin y stdout para evitar UnicodeEncodeError/UnicodeDecodeError en Windows
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stdin, 'reconfigure'):
        sys.stdin.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    import urllib.request

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
# La clave se toma de la variable de entorno NVIDIA_API_KEY si existe (recomendado).
# IMPORTANTE: rota esta clave en build.nvidia.com -> quedó expuesta y debe reemplazarse.
NVIDIA_API_KEY  = os.environ.get(
    "NVIDIA_API_KEY",
    "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"
)
NVIDIA_MODEL       = "nvidia/nemotron-3-super-120b-a12b"   # Nemotron-3-Super-120B (con razonamiento)
NVIDIA_MODEL_LABEL = "NVIDIA Nemotron-3-Super-120B"
# Para volver al modelo rápido sin razonamiento: NVIDIA_MODEL = "meta/llama-3.1-8b-instruct"

CLASE_MAP = {
    'Beneficiaria mucho': 'Aceptacion',
    'Beneficiaria algo':  'Aceptacion',
    'Beneficio dudoso':   'Neutral',
    'No beneficiaria':    'Rechazo',
}

# ──────────────────────────────────────────────────────────────
#  UTILIDADES
# ──────────────────────────────────────────────────────────────

def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)

def pct(n, total):
    return round(n / total * 100, 1) if total > 0 else 0.0

def dist_field(rows, field, top=None):
    counts = Counter((r.get(field) or 'No especificado').strip() for r in rows)
    total  = sum(counts.values()) or 1
    items  = sorted(
        [{"label": k, "n": v, "pct": pct(v, total)} for k, v in counts.items()],
        key=lambda x: x["n"], reverse=True
    )
    return items[:top] if top else items

# ──────────────────────────────────────────────────────────────
#  ESTADÍSTICAS LOCALES (rápidas, sin LLM)
# ──────────────────────────────────────────────────────────────

def analyze_statistics(rows):
    n = len(rows)
    if n == 0:
        return {}

    sectores       = dist_field(rows, 'sector')
    comunidades    = dist_field(rows, 'community',             top=15)
    genero         = dist_field(rows, 'respondent_gender')
    edad           = dist_field(rows, 'age_range')
    educacion      = dist_field(rows, 'education_level')
    ocupacion      = dist_field(rows, 'occupation',            top=10)
    problemas      = dist_field(rows, 'primary_problem',       top=10)
    prioridad_soc  = dist_field(rows, 'social_priority',       top=10)
    aceptacion_inv = dist_field(rows, 'investment_acceptance')
    percepcion_min = dist_field(rows, 'mine_reopening_perception')
    clima_pol      = dist_field(rows, 'political_climate')
    confianza_aut  = dist_field(rows, 'authority_trust')
    fuente_agua    = dist_field(rows, 'water_source')
    internet       = dist_field(rows, 'has_internet')
    ingresos       = dist_field(rows, 'household_income')
    vias           = dist_field(rows, 'road_status')

    clases = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0}
    for r in rows:
        c = CLASE_MAP.get((r.get('mine_reopening_perception') or '').strip())
        if c:
            clases[c] += 1
    n_class      = sum(clases.values()) or 1
    prob_acept   = pct(clases['Aceptacion'], n_class)
    prob_neu     = pct(clases['Neutral'],    n_class)
    prob_rech    = pct(clases['Rechazo'],    n_class)

    por_sector = {}
    for r in rows:
        sec = (r.get('sector') or 'general').strip()
        c   = CLASE_MAP.get((r.get('mine_reopening_perception') or '').strip())
        if sec not in por_sector:
            por_sector[sec] = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0, 'total': 0}
        if c:
            por_sector[sec][c] += 1
        por_sector[sec]['total'] += 1

    sectores_detalle = []
    for sec, c in por_sector.items():
        t = c['total'] or 1
        sectores_detalle.append({
            "sector": sec, "n": c['total'],
            "aceptacion_pct": pct(c['Aceptacion'], t),
            "neutral_pct":    pct(c['Neutral'],    t),
            "rechazo_pct":    pct(c['Rechazo'],    t),
        })
    sectores_detalle.sort(key=lambda x: x['n'], reverse=True)

    beneficios_raw, riesgos_raw = [], []
    for r in rows:
        for field, dest in [('mine_benefits', beneficios_raw), ('mine_risks', riesgos_raw)]:
            val = r.get(field)
            if isinstance(val, str):
                try:    val = json.loads(val)
                except: val = [val]
            if isinstance(val, list):
                dest.extend([str(v).strip() for v in val if v])

    total_ben = len(beneficios_raw) or 1
    total_ri  = len(riesgos_raw)    or 1
    beneficios_dist = sorted(
        [{"label": k, "n": v, "pct": pct(v, total_ben)}
         for k, v in Counter(beneficios_raw).most_common(10)],
        key=lambda x: x['n'], reverse=True
    )
    riesgos_dist = sorted(
        [{"label": k, "n": v, "pct": pct(v, total_ri)}
         for k, v in Counter(riesgos_raw).most_common(10)],
        key=lambda x: x['n'], reverse=True
    )

    know_fields = {
        'knows_mining_types':    'Conoce tipos de minería',
        'knows_mining_benefits': 'Conoce beneficios mineros',
        'knows_modern_mining':   'Conoce minería moderna',
        'knows_local_mines':     'Conoce minas locales',
        'knows_env_guarantees':  'Conoce garantías ambientales',
    }
    conocimiento = []
    for campo, pregunta in know_fields.items():
        vals       = [(r.get(campo) or '').strip() for r in rows]
        total_resp = len([v for v in vals if v]) or 1
        si = sum(1 for v in vals if v.lower() in ('si','yes','conoce','sabe','1','true'))
        no = total_resp - si
        conocimiento.append({
            "campo": campo, "pregunta": pregunta,
            "si_pct": pct(si, total_resp), "no_pct": pct(no, total_resp),
            "nivel": "Alto" if pct(si, total_resp) >= 60 else ("Medio" if pct(si, total_resp) >= 30 else "Bajo")
        })

    def sentimiento_dim(pos, neu, neg):
        t = pos + neu + neg or 1
        p_p = pct(pos, t); n_p = pct(neu, t); ng_p = pct(neg, t)
        return {"positivo_pct": p_p, "neutro_pct": n_p, "negativo_pct": ng_p,
                "indice": round(p_p - ng_p, 1)}

    def classify_sent(field, pos_vals, neg_vals):
        pos = neg = neu = 0
        for r in rows:
            v = (r.get(field) or '').strip().lower()
            if any(v.startswith(p.lower()) for p in pos_vals):   pos += 1
            elif any(v.startswith(ng.lower()) for ng in neg_vals): neg += 1
            else: neu += 1
        return pos, neu, neg

    p, nu, ng = classify_sent('political_climate',
        ('favorable','muy favorable','tranquilo'),
        ('conflictivo','muy conflictivo','tensionado','polarizado'))
    sent_clima = sentimiento_dim(p, nu, ng)

    p, nu, ng = classify_sent('authority_trust',
        ('alta','muy alta','mucha'),
        ('baja','muy baja','poca','ninguna'))
    sent_trust = sentimiento_dim(p, nu, ng)

    p, nu, ng = classify_sent('household_income',
        ('suficiente','bueno','alto'),
        ('insuficiente','muy bajo','bajo','precario'))
    sent_ingresos = sentimiento_dim(p, nu, ng)

    sent_mineria = sentimiento_dim(clases['Aceptacion'], clases['Neutral'], clases['Rechazo'])

    inv_counts = Counter((r.get('investment_acceptance') or '').strip() for r in rows)
    pos_inv = sum(v for k, v in inv_counts.items() if any(p in k.lower() for p in ('acepta','favor','apoya','si')))
    neg_inv = sum(v for k, v in inv_counts.items() if any(p in k.lower() for p in ('rechaza','opone','contra','no')))
    sent_inversion = sentimiento_dim(pos_inv, n - pos_inv - neg_inv, neg_inv)

    know_si_total = sum(
        sum(1 for r in rows if (r.get(c) or '').strip().lower() in ('si','yes','conoce','sabe','1','true'))
        for c in know_fields
    )
    know_total = len(rows) * len(know_fields) or 1
    sent_conocimiento = sentimiento_dim(know_si_total, 0, know_total - know_si_total)

    idx_conocimiento = round(sum(k['si_pct'] for k in conocimiento) / len(conocimiento), 1) if conocimiento else 0

    def lsm(label):
        if label in ("Beneficiaria mucho","Beneficiaria algo"): return "positivo"
        if label == "No beneficiaria": return "negativo"
        return "neutro"
    def lsc(label):
        if any(p in label.lower() for p in ("favorable","tranquil")): return "positivo"
        if any(p in label.lower() for p in ("conflicti","tensionado","polarizado")): return "negativo"
        return "neutro"
    def lst(label):
        if any(p in label.lower() for p in ("alta","mucha")): return "positivo"
        if any(p in label.lower() for p in ("baja","poca","ninguna")): return "negativo"
        return "neutro"
    def lsi(label):
        if any(p in label.lower() for p in ("acepta","favor","apoya","si")): return "positivo"
        if any(p in label.lower() for p in ("rechaza","opone","contra","no")): return "negativo"
        return "neutro"
    def lse(label):
        if any(p in label.lower() for p in ("suficiente","bueno","alto")): return "positivo"
        if any(p in label.lower() for p in ("insuficiente","bajo","precario")): return "negativo"
        return "neutro"

    return {
        "total_encuestas": n,
        "encuestas_clasificadas": n_class,
        "probabilidades_globales": {"Aceptacion": prob_acept, "Neutral": prob_neu, "Rechazo": prob_rech},
        "prediccion_global": "Aceptacion" if clases['Aceptacion'] >= clases['Rechazo'] else "Rechazo",
        "sectores": sectores, "sectores_detalle": sectores_detalle,
        "comunidades": comunidades, "genero": genero, "edad": edad,
        "educacion": educacion, "ocupacion": ocupacion,
        "problemas": problemas, "prioridad_social": prioridad_soc,
        "aceptacion_inversion": aceptacion_inv, "percepcion_mineria": percepcion_min,
        "clima_politico": clima_pol, "confianza_autoridades": confianza_aut,
        "fuente_agua": fuente_agua, "internet": internet, "ingresos": ingresos, "vias": vias,
        "beneficios_mineros": beneficios_dist, "riesgos_mineros": riesgos_dist,
        "conocimiento_minero": conocimiento, "indice_conocimiento": idx_conocimiento,
        "sentimientos_dimensiones": [
            {"titulo": "Percepcion Minera",    "sentimiento": sent_mineria,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"], "sentimiento": lsm(i["label"])} for i in percepcion_min[:6]]}},
            {"titulo": "Clima Politico",        "sentimiento": sent_clima,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"], "sentimiento": lsc(i["label"])} for i in clima_pol[:6]]}},
            {"titulo": "Confianza Institucional","sentimiento": sent_trust,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"], "sentimiento": lst(i["label"])} for i in confianza_aut[:6]]}},
            {"titulo": "Apertura a Inversion",  "sentimiento": sent_inversion,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"], "sentimiento": lsi(i["label"])} for i in aceptacion_inv[:6]]}},
            {"titulo": "Situacion Economica",   "sentimiento": sent_ingresos,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"], "sentimiento": lse(i["label"])} for i in ingresos[:6]]}},
            {"titulo": "Conocimiento Minero",   "sentimiento": sent_conocimiento,
             "distribucion": {"items": [{"label": k["pregunta"], "pct": k["si_pct"],
                "sentimiento": "positivo" if k["nivel"]=="Alto" else ("neutro" if k["nivel"]=="Medio" else "negativo")}
                for k in conocimiento]}},
        ],
        "sentimiento_global": {"positivo_pct": prob_acept, "neutro_pct": prob_neu, "negativo_pct": prob_rech},
    }

# ──────────────────────────────────────────────────────────────
#  ANÁLISIS INSTANTÁNEO POR REGLAS (sin LLM, <0.1 s)
# ──────────────────────────────────────────────────────────────

def generate_instant_analysis(stats):
    """Genera TODOS los textos del análisis usando reglas sobre los datos. Sin LLM."""
    probs    = stats.get("probabilidades_globales", {})
    pa       = probs.get('Aceptacion', 0)
    pn       = probs.get('Neutral',    0)
    pr       = probs.get('Rechazo',    0)
    n        = stats.get("total_encuestas", 0)
    pred     = "Aceptacion" if pa >= pr else "Rechazo"
    idx_k    = stats.get("indice_conocimiento", 0)
    dims     = stats.get("sentimientos_dimensiones", [])
    zonas    = stats.get("sectores_detalle",  [])
    problemas   = stats.get("problemas",         [])[:3]
    riesgos     = stats.get("riesgos_mineros",   [])[:3]
    beneficios  = stats.get("beneficios_mineros",[])[:3]

    top_prob = problemas[0]['label']   if problemas  else "problemáticas locales"
    top_ri   = riesgos[0]['label']     if riesgos    else "impacto ambiental"
    top_ben  = beneficios[0]['label']  if beneficios else "generación de empleo"

    # ── RESUMEN EJECUTIVO ──────────────────────────────────────
    if pred == "Rechazo":
        resumen = (
            f"El análisis de {n} encuestas en la parroquia San Bartolomé revela rechazo "
            f"predominante ({pr}%) hacia la minería, frente a solo {pa}% de aceptación. "
            f"La {top_prob.lower()} es el problema más sentido, y la preocupación por "
            f"{top_ri.lower()} encabeza los riesgos percibidos. "
            f"Se requiere una estrategia intensiva de diálogo y socialización antes de avanzar en procesos formales."
        )
    else:
        resumen = (
            f"El análisis de {n} encuestas en la parroquia San Bartolomé muestra aceptación "
            f"mayoritaria ({pa}%) hacia la minería, con {pr}% de rechazo. "
            f"El principal beneficio esperado es {top_ben.lower()}, aunque {top_ri.lower()} "
            f"sigue siendo una preocupación clave que debe abordarse en el proceso de licenciamiento social. "
            f"El índice de conocimiento minero ({idx_k}%) sugiere necesidad de mayor socialización."
        )

    # ── IMPORTANCIA DE FACTORES ────────────────────────────────
    factores = []
    for d in dims:
        idx = d['sentimiento']['indice']
        score = min(96, max(22, 50 + abs(idx)))
        factores.append({"factor": d['titulo'], "score_pct": round(score)})
    factores.sort(key=lambda x: x['score_pct'], reverse=True)
    if len(factores) < 5:
        extras = [
            {"factor": "Infraestructura comunitaria", "score_pct": 44},
            {"factor": "Participación ciudadana",     "score_pct": 36},
        ]
        factores.extend(extras[:5 - len(factores)])

    # ── INTERPRETACIONES POR DIMENSIÓN ────────────────────────
    INTERP = {
        "Percepcion Minera": {
            "pos": "La percepción minera es favorable; la comunidad identifica beneficios concretos y muestra apertura al diálogo con operadores.",
            "neg": "La percepción minera es negativa; la comunidad asocia la minería con riesgos ambientales y sociales no mitigados.",
            "neu": "Percepción dividida; existe disposición al diálogo pero con condiciones claras de transparencia y beneficios directos.",
        },
        "Clima Politico": {
            "pos": "Clima político favorable; las condiciones institucionales son propicias para avanzar en procesos de consulta previa.",
            "neg": "Clima político tenso; las divisiones internas aumentan el riesgo de conflictos sociales y dificultan el consenso.",
            "neu": "Clima político moderado; es necesario fortalecer la confianza institucional para facilitar acuerdos comunitarios.",
        },
        "Confianza Institucional": {
            "pos": "Alta confianza en autoridades; facilita la mediación y la legitimidad de los acuerdos comunitarios.",
            "neg": "Baja confianza institucional; es crítico establecer mecanismos transparentes de rendición de cuentas.",
            "neu": "Confianza moderada; se deben fortalecer canales de comunicación y cumplimiento de compromisos.",
        },
        "Apertura a Inversion": {
            "pos": "Alta apertura a la inversión; la comunidad reconoce el potencial económico y está dispuesta a negociar condiciones.",
            "neg": "Resistencia a la inversión extractiva; predomina la preferencia por actividades agropecuarias y turismo sostenible.",
            "neu": "Apertura condicionada; la comunidad acepta inversión solo con garantías de empleo local y protección ambiental.",
        },
        "Situacion Economica": {
            "pos": "Situación económica estable; reduce la urgencia por ingresos mineros pero mantiene interés en diversificación productiva.",
            "neg": "Situación económica precaria; genera presión por fuentes alternativas de ingreso que la minería podría satisfacer.",
            "neu": "Economía en transición; la comunidad busca opciones que complementen la agricultura sin reemplazarla.",
        },
        "Conocimiento Minero": {
            "pos": "Buen nivel de conocimiento minero; la comunidad puede participar informadamente en consultas y negociaciones.",
            "neg": "Desconocimiento significativo; se requiere campaña educativa antes de cualquier proceso de consulta formal.",
            "neu": "Conocimiento parcial; la información debe focalizarse en derechos comunitarios y estándares ambientales.",
        },
    }
    interpretaciones_dim = []
    for d in dims:
        titulo = d['titulo']
        idx    = d['sentimiento']['indice']
        skey   = "pos" if idx >= 15 else ("neg" if idx <= -15 else "neu")
        interp = ""
        for key, tpls in INTERP.items():
            if key.lower() in titulo.lower() or titulo.lower() in key.lower():
                interp = tpls[skey]; break
        if not interp:
            if idx >= 15:   interp = f"Índice favorable (+{idx} pts); dimensión con impacto positivo en la viabilidad del proyecto."
            elif idx <= -15: interp = f"Índice crítico ({idx} pts); dimensión que requiere atención prioritaria."
            else:            interp = f"Índice neutro ({idx} pts); dimensión en equilibrio que puede mejorar con acciones focalizadas."
        interpretaciones_dim.append({"titulo": titulo, "interpretacion": interp})

    # ── HALLAZGOS POR ZONA ────────────────────────────────────
    hallazgos_zona = []
    for z in zonas[:8]:
        sec = z['sector']; za = z['aceptacion_pct']; zr = z['rechazo_pct']; zn = z['n']
        if za >= zr + 10:
            h = f"{sec} muestra aceptación clara ({za}%); zona prioritaria para acuerdos de cooperación."
        elif zr >= za + 10:
            h = f"{sec} exhibe rechazo predominante ({zr}%); requiere socialización intensiva y atención a sus problemáticas."
        else:
            h = f"{sec} presenta opinión dividida ({za}% acepta, {zr}% rechaza) en {zn} encuestados; zona clave de negociación."
        hallazgos_zona.append({"zona": sec, "hallazgo": h})

    # ── RECOMENDACIONES ───────────────────────────────────────
    dims_crit = sorted(dims, key=lambda d: d['sentimiento']['indice'])
    recs = []
    for d in dims_crit[:3]:
        t = d['titulo']
        if 'Conocimiento' in t:
            recs.append("Implementar programa de capacitación minera con énfasis en derechos comunitarios, estándares ambientales y casos de éxito regionales.")
        elif 'Confianza' in t:
            recs.append("Crear comité de seguimiento comunitario con representantes zonales y mecanismos auditables de cumplimiento de compromisos.")
        elif 'Clima' in t:
            recs.append("Promover espacios de diálogo intercultural con facilitadores neutrales para reducir tensiones antes de iniciar la consulta formal.")
        elif 'Inversion' in t or 'Apertura' in t:
            recs.append("Diseñar modelo de participación comunitaria con porcentaje de regalías destinado a proyectos priorizados por las propias comunidades.")
        elif 'Econom' in t:
            recs.append("Articular programa de empleo local con la operación minera, garantizando contratación mínima de mano de obra parroquial.")
        else:
            recs.append(f"Desarrollar estrategia focalizada en '{t}' para elevar el índice de favorabilidad hacia niveles de diálogo constructivo.")
    recs.append("Diseñar plan de comunicación estratégica con beneficios concretos y locales: empleo, vías, servicios básicos y fondo de desarrollo parroquial.")
    recs.append("Priorizar atención a las zonas con mayor rechazo mediante mesas de trabajo sectoriales con agenda definida y compromisos verificables.")

    # ── PLAN ESTRATÉGICO MINERO ──────────────────────────────
    nivel      = "bajo" if pa < 40 else ("medio" if pa < 60 else "alto")
    nivel_k    = "critico" if idx_k < 30 else ("bajo" if idx_k < 50 else "moderado")
    n_zonas    = len(zonas)
    zonas_crit = sum(1 for z in zonas if z["rechazo_pct"] > z["aceptacion_pct"])
    meta_acept = min(pa + 20, 70)

    if pa < 40:
        fase0_extra = "Elaboracion de linea base socioambiental y cartografia de afectaciones percibidas por zona"
        fase1_dur   = "Meses 1-4"
        fase2_dur   = "Meses 4-8"
        fase3_dur   = "Meses 8-18+"
    else:
        fase0_extra = "Identificacion de lideres de opinion y aliados estrategicos dentro de la comunidad"
        fase1_dur   = "Meses 1-3"
        fase2_dur   = "Meses 3-6"
        fase3_dur   = "Meses 6-12+"

    plan = {
        "titulo": "Plan de Viabilidad Social Minera - San Bartolome",
        "diagnostico_contextual": (
            f"Diagnostico IA: aceptacion {nivel} ({pa}%) sobre {n} encuestas; conocimiento minero {nivel_k} ({idx_k}%). "
            f"{zonas_crit} de {n_zonas} zonas con rechazo predominante. "
            f"Principal riesgo percibido: {top_ri}. Principal beneficio esperado: {top_ben}. "
            f"La licencia social depende de reducir percepciones negativas sobre {top_ri.lower()} y elevar el conocimiento tecnico comunitario."
        ),
        "fases": [
            {
                "fase": "Fase 0 - Linea Base y Diagnostico Minero",
                "periodo": "Mes 1",
                "acciones": [
                    "Mapeo georreferenciado de actores clave, grupos de interes y zonas criticas de rechazo",
                    fase0_extra,
                    f"Analisis diferenciado por zona: priorizar las {zonas_crit} zonas con mayor rechazo",
                    "Inventario ambiental participativo: fuentes de agua, suelos agricolas y areas de alta sensibilidad ecologica",
                ],
            },
            {
                "fase": "Fase 1 - Educacion Tecnica y Socializacion Minera",
                "periodo": fase1_dur,
                "acciones": [
                    "Talleres tecnicos sobre mineria responsable: ciclo de vida minero, normativa ARCOM y estandares IFC/Equator Principles",
                    f"Capacitacion focalizada en gestion de {top_ri.lower()}: medidas de prevencion, control y remediacion",
                    "Visitas a proyectos mineros modelo en Ecuador (Mirador, Fruta del Norte) para lideres y autoridades parroquiales",
                    f"Campana de comunicacion multicanal: beneficios concretos en empleo ({top_ben.lower()}), royalties y fondos de desarrollo parroquial",
                ],
            },
            {
                "fase": "Fase 2 - Consulta Previa y Acuerdos Sociales",
                "periodo": fase2_dur,
                "acciones": [
                    "Proceso de Consulta Previa, Libre e Informada (CPLI) segun Convenio 169 OIT y Art. 57 Constitucion Ecuador",
                    "Negociacion de contrato de gestion social: minimo 80% mano de obra local no calificada y 60% semicalificada",
                    f"Creacion de Fondo de Desarrollo Parroquial con 5-10% de utilidades netas del proyecto minero",
                    "Firma de acuerdos de compensacion ambiental: plan de remediacion de suelos, proteccion de cuencas y reforestacion",
                ],
            },
            {
                "fase": "Fase 3 - Operacion, Monitoreo y Sostenibilidad",
                "periodo": fase3_dur,
                "acciones": [
                    "Implementacion de Sistema de Gestion Ambiental y Social (SGAS) con comite comunitario auditor independiente",
                    "Informes semestrales publicos: cumplimiento de empleo local, inversion social, calidad de agua y aire",
                    f"Re-encuesta de percepcion cada 6 meses para monitorear evolucion (meta: >= {meta_acept}% aceptacion)",
                    "Plan de cierre participativo: uso futuro del territorio, garantias financieras de remediacion post-operacion",
                ],
            },
        ],
        "indicadores": [
            {"nombre": "Licencia social (indice de aceptacion)",      "meta": f">={meta_acept}%",              "plazo": "6 meses"},
            {"nombre": "Conocimiento tecnico minero comunitario",      "meta": ">=70%",                        "plazo": "3 meses"},
            {"nombre": "Confianza institucional y empresarial",        "meta": "Favorable en >=65%",           "plazo": "5 meses"},
            {"nombre": "Zonas con acuerdo social firmado",             "meta": f">={max(1, n_zonas*2//3)}",    "plazo": "8 meses"},
            {"nombre": "Reduccion de rechazo en zonas criticas",       "meta": "Rechazo <35% por zona",        "plazo": "6 meses"},
            {"nombre": "Empleo local directo comprometido",            "meta": ">=80% mano obra parroquial",   "plazo": "Inicio operacion"},
        ],
        "recomendaciones_finales": [
            f"No iniciar exploracion avanzada hasta que la aceptacion supere 50% en al menos 70% de zonas (actual: {pa}% global, {zonas_crit} zonas en rechazo).",
            f"Tratar {top_ri} como eje central del plan de comunicacion: presentar estudios de impacto ambiental y planes de mitigacion auditables por la comunidad.",
            f"Disenar Fondo de Desarrollo Parroquial con participacion vinculante en la asignacion de royalties mineros para obras priorizadas por la comunidad.",
            "Establecer protocolo de atencion a quejas y arbitraje de conflictos con mediador neutral antes del inicio de operaciones.",
            "Documentar todos los compromisos empresariales en formatos accesibles (mapas, infografias) y publicarlos en espacios fisicos y digitales parroquiales.",
        ],
    }

    # ── CONCLUSION MINERA TECNICA ─────────────────────────────
    dim_mas_critica = dims_crit[0]["titulo"] if dims_crit else "percepcion general"
    dim_mas_fuerte  = sorted(dims, key=lambda d: d["sentimiento"]["indice"], reverse=True)[0]["titulo"] if dims else "apertura economica"

    if pred == "Rechazo":
        conclusion = (
            f"El analisis de {n} encuestas determina que San Bartolome NO cuenta con licencia social para avanzar en operaciones mineras: "
            f"{pr}% de rechazo frente a {pa}% de aceptacion. "
            f"La dimension mas critica es '{dim_mas_critica}', lo que indica riesgos no mitigados relacionados con {top_ri.lower()}. "
            f"Con un conocimiento tecnico minero del {idx_k}% ({nivel_k}), gran parte del rechazo proviene de desinformacion y desconfianza institucional. "
            f"Recomendacion IA: ejecutar Fase 0 y Fase 1 del plan antes de cualquier tramite ante ARCOM o Ministerio de Energia y Minas. "
            f"Con educacion tecnica focalizada y compromisos verificables, el indice de aceptacion puede alcanzar {meta_acept}% en 6-8 meses."
        )
    elif pa >= 60:
        conclusion = (
            f"San Bartolome presenta condiciones favorables para avanzar en el proceso minero: {pa}% de aceptacion sobre {n} encuestas. "
            f"La dimension '{dim_mas_fuerte}' es el principal activo social del proyecto. "
            f"Sin embargo, el {pr}% de rechazo y el conocimiento tecnico {nivel_k} ({idx_k}%) representan riesgos de conflicto latente. "
            f"Recomendacion IA: iniciar Fase 2 (Consulta Previa y Acuerdos) priorizando compromisos en {top_ben.lower()} "
            f"y el Fondo de Desarrollo Parroquial como mecanismo central de confianza. "
            f"El proyecto tiene viabilidad social condicionada al cumplimiento estricto de los acuerdos de gestion ambiental y empleo local parroquial."
        )
    else:
        conclusion = (
            f"San Bartolome muestra aceptacion parcial ({pa}%) con rechazo significativo ({pr}%) en {n} encuestas. "
            f"La viabilidad social del proyecto minero es condicional: requiere reducir brechas en '{dim_mas_critica}' "
            f"y fortalecer la percepcion positiva en '{dim_mas_fuerte}'. "
            f"Con {idx_k}% de conocimiento tecnico minero ({nivel_k}), gran parte del rechazo es reversible mediante educacion focalizada. "
            f"Recomendacion IA: ejecutar Fase 1 con talleres tecnicos diferenciados por zona y medir impacto a los 3 meses. "
            f"Si la aceptacion supera {meta_acept}% tras la socializacion, iniciar los tramites de licenciamiento ante ARCOM. "
            f"El factor de riesgo principal a gestionar es {top_ri.lower()}."
        )

    # ── RECOMENDACIONES PROYECTO MINERO (datos encuestas) ───────
    todos_beneficios = stats.get("beneficios_mineros", [])[:6]
    todos_riesgos    = stats.get("riesgos_mineros",    [])[:6]
    conocimiento_det = stats.get("conocimiento_minero", [])
    problemas_det    = stats.get("problemas",           [])[:5]
    zonas_rechazo    = sorted(zonas, key=lambda z: z["rechazo_pct"], reverse=True)[:3]
    zonas_acept      = sorted(zonas, key=lambda z: z["aceptacion_pct"], reverse=True)[:2]

    # Conocimiento mas bajo (areas a reforzar)
    know_bajo = sorted(conocimiento_det, key=lambda k: k.get("si_pct",100))[:3]
    know_alto = sorted(conocimiento_det, key=lambda k: k.get("si_pct",0), reverse=True)[:2]

    rec_mineras = {
        "viabilidad_social": {
            "titulo": "Viabilidad Social del Proyecto",
            "nivel": "ALTA" if pa >= 60 else ("MEDIA" if pa >= 40 else "BAJA"),
            "color": "verde" if pa >= 60 else ("naranja" if pa >= 40 else "rojo"),
            "resumen": (
                f"Aceptacion actual {pa}% ({n} encuestas). "
                f"Se requiere minimo 60% para iniciar Consulta Previa. "
                f"Brecha actual: {max(0, 60-pa)} puntos porcentuales."
            ),
        },
        "fortalezas": [
            f"Beneficio mas valorado: {b['label']} ({b['pct']}% lo menciona)"
            for b in todos_beneficios[:3]
        ] + (
            [f"Zonas favorables para piloto: {', '.join(z['sector'] for z in zonas_acept)}"]
            if zonas_acept else []
        ) + (
            [f"Conocimiento minero elevado en: {know_alto[0]['pregunta']} ({know_alto[0].get('si_pct',0)}% conoce)"]
            if know_alto else []
        ),
        "riesgos_criticos": [
            f"Riesgo #1 percibido: {todos_riesgos[0]['label']} ({todos_riesgos[0]['pct']}% lo menciona)" if todos_riesgos else None,
            f"Brecha de conocimiento en: {know_bajo[0]['pregunta']} (solo {know_bajo[0].get('si_pct',0)}% lo conoce)" if know_bajo else None,
            f"Zonas criticas de rechazo: {', '.join(z['sector'] for z in zonas_rechazo)}" if zonas_rechazo else None,
            f"Problema social dominante: {problemas_det[0]['label']} ({problemas_det[0]['pct']}%)" if problemas_det else None,
        ],
        "acciones_inmediatas": [
            f"URGENTE: Campaña de informacion sobre '{know_bajo[0]['pregunta']}' en zonas: {', '.join(z['sector'] for z in zonas_rechazo[:2])}"
            if know_bajo and zonas_rechazo else
            "URGENTE: Disenar campana de informacion minera focalizada en zonas con mayor rechazo",

            f"Presentar plan de mitigacion documentado para '{todos_riesgos[0]['label']}' con auditor ambiental independiente"
            if todos_riesgos else
            "Elaborar Estudio de Impacto Ambiental (EIA) participativo con veedores comunitarios",

            f"Activar negociacion temprana de '{todos_beneficios[0]['label']}' como eje de la propuesta social"
            if todos_beneficios else
            "Disenar propuesta de beneficios locales concretos: empleo, infraestructura, royalties",

            "Conformar Mesa Tecnica Minera con alcalde, GADP, ARCOM y representantes comunitarios por zona",

            f"Documentar situacion actual de '{problemas_det[0]['label']}' y proponer solucion vinculada al proyecto minero"
            if problemas_det else
            "Levantar diagnostico de problemas locales y proponer soluciones vinculadas al proyecto",
        ],
        "pasos_licenciamiento": [
            "Paso 1 (Mes 1-2): Registro en ARCOM + solicitud de area de concesion minera (formulario AM-1)",
            "Paso 2 (Mes 2-3): Elaboracion de Estudio de Impacto Ambiental y Plan de Manejo Ambiental (EIA/PMA) con empresa certificada",
            "Paso 3 (Mes 3-6): Proceso de Consulta Previa, Libre e Informada (CPLI) segun Art.57 CE y Convenio 169 OIT",
            "Paso 4 (Mes 5-7): Negociacion de contrato social: empleos locales, fondo parroquial, compromisos ambientales",
            "Paso 5 (Mes 6-8): Aprobacion de licencia ambiental por Ministerio de Ambiente",
            "Paso 6 (Mes 8-10): Firma de acuerdo comunitario y registro en Ministerio de Energia y Minas",
            "Paso 7 (Operacion): Implementacion de SGAS + comite comunitario de monitoreo",
        ],
        "estrategia_por_zona": [
            {
                "zona": z["sector"],
                "rechazo": z["rechazo_pct"],
                "aceptacion": z["aceptacion_pct"],
                "estrategia": (
                    "Socializar beneficios economicos especificos y plan de empleo local"
                    if z["rechazo_pct"] > 60 else
                    "Talleres tecnicos sobre estandares ambientales y casos de exito regionales"
                    if z["rechazo_pct"] > 40 else
                    "Profundizar acuerdos y formalizar compromisos de cooperacion"
                ),
            }
            for z in (sorted(zonas, key=lambda z: z["rechazo_pct"], reverse=True))[:5]
        ],
        "indicadores_licencia_social": [
            {"indicador": "Indice de aceptacion global",        "actual": f"{pa}%",   "meta": f"{meta_acept}%",  "semaforo": "rojo" if pa < 40 else "naranja" if pa < 60 else "verde"},
            {"indicador": "Conocimiento tecnico minero",        "actual": f"{idx_k}%","meta": ">=70%",           "semaforo": "rojo" if idx_k < 30 else "naranja" if idx_k < 50 else "verde"},
            {"indicador": "Zonas en rechazo predominante",      "actual": str(zonas_crit), "meta": "0",         "semaforo": "rojo" if zonas_crit > n_zonas//2 else "naranja" if zonas_crit > 0 else "verde"},
            {"indicador": "Riesgo ambiental percibido (top)",   "actual": f"{todos_riesgos[0]['pct']}%" if todos_riesgos else "N/A", "meta": "<20%", "semaforo": "rojo"},
        ],
    }
    # Filtrar Nones
    rec_mineras["riesgos_criticos"] = [r for r in rec_mineras["riesgos_criticos"] if r]

    # ── EJES ESTRATEGICOS (basados en dimensiones criticas) ────
    EJE_DEF = {
        "Percepcion Minera": {
            "icono": "mining",
            "titulo": "Eje 1: Transformacion de la Percepcion Minera",
            "descripcion": "Revertir la imagen negativa de la mineria mediante evidencia de proyectos responsables y beneficios documentados.",
            "acciones": [
                "Campana 'Mineria que transforma': casos de exito mineros en Ecuador (Mirador, Fruta del Norte)",
                "Talleres de mineria responsable con metodologia ICMM en todas las zonas de la parroquia",
                "Publicacion trimestral de indicadores ambientales y sociales del proyecto en espacios comunitarios",
            ],
            "normativa": "Ley de Mineria Ecuador Art. 86-88; ICMM 10 Principios",
        },
        "Clima Politico": {
            "icono": "governance",
            "titulo": "Eje 2: Gobernanza y Clima Politico Favorable",
            "descripcion": "Fortalecer la institucionalidad local y reducir tensiones politicas que bloquean el avance del proyecto.",
            "acciones": [
                "Mesa Tecnica Minera Parroquial: alcalde, GADP, ARCOM, empresa y comunidad",
                "Protocolo de resolucion de conflictos con mediador neutral certificado por el Ministerio de Gobierno",
                "Agenda de compromisos publicos verificables firmados ante notario",
            ],
            "normativa": "Codigo Organico de Organizacion Territorial (COOTAD); Acuerdo Ministerial 154",
        },
        "Confianza Institucional": {
            "icono": "trust",
            "titulo": "Eje 3: Fortalecimiento de la Confianza Institucional",
            "descripcion": "Construir confianza en las instituciones publicas y en la empresa operadora mediante transparencia y rendicion de cuentas.",
            "acciones": [
                "Auditoria social semestral independiente con veedores comunitarios capacitados por ARCOM",
                "Portal de transparencia en linea: inversiones, empleos generados y cumplimiento ambiental",
                "Comite de seguimiento de acuerdos con representacion de todas las zonas parroquiales",
            ],
            "normativa": "Convenio 169 OIT Art. 15; IFC Performance Standard 1",
        },
        "Apertura a Inversion": {
            "icono": "investment",
            "titulo": "Eje 4: Modelo de Participacion Economica Comunitaria",
            "descripcion": "Disenar mecanismos de participacion economica que conviertan a la comunidad en socia del proyecto.",
            "acciones": [
                "Fondo de Desarrollo Parroquial: 5-10% de utilidades netas anuales para obras priorizadas por la comunidad",
                "Programa de empleo local: minimo 80% mano de obra parroquial en fase de construccion",
                "Cooperativa de proveedores locales para suministro de bienes y servicios al proyecto",
            ],
            "normativa": "Ley de Mineria Art. 28 (regalias); Reglamento General de Mineria Art. 67",
        },
        "Situacion Economica": {
            "icono": "economy",
            "titulo": "Eje 5: Desarrollo Economico Complementario",
            "descripcion": "Integrar el proyecto minero con la economia agropecuaria local para no generar dependencia ni desplazamiento.",
            "acciones": [
                "Plan de convivencia minero-agricola: delimitar zonas de influencia y proteger areas productivas",
                "Fondo de compensacion por afectaciones productivas con tasacion independiente",
                "Programa de diversificacion economica post-mineria: agroturismo, artesania, agricultura organica",
            ],
            "normativa": "Plan Nacional de Desarrollo 2021-2025; Agenda Minera Ecuador 2022",
        },
        "Conocimiento Minero": {
            "icono": "knowledge",
            "titulo": "Eje 6: Educacion Tecnica y Transferencia de Conocimiento",
            "descripcion": "Elevar el nivel de conocimiento tecnico minero de la comunidad para reducir el rechazo basado en desinformacion.",
            "acciones": [
                f"Escuela de Mineria Comunitaria: modulos de geologia basica, proceso minero, impacto ambiental y derechos",
                "Becas tecnicas en mineria para jovenes de la parroquia en universidades nacionales (ESPOCH, UPS)",
                f"Plataforma digital interactiva con simulador del ciclo minero adaptado al contexto de San Bartolome",
            ],
            "normativa": "Plan Nacional de Ciencia y Tecnologia; SENESCYT convenios mineros",
        },
    }

    ejes = []
    # Priorizar dimensiones criticas primero
    dims_ordenadas = sorted(dims, key=lambda d: d["sentimiento"]["indice"])
    for d in dims_ordenadas:
        t = d["titulo"]
        for key, eje_data in EJE_DEF.items():
            if key.lower() in t.lower() or t.lower() in key.lower():
                idx_val = d["sentimiento"]["indice"]
                eje_data_copy = dict(eje_data)
                eje_data_copy["indice"] = idx_val
                eje_data_copy["prioridad"] = "CRITICA" if idx_val <= -15 else ("MEDIA" if idx_val <= 15 else "BAJA")
                eje_data_copy["dimension"] = t
                if eje_data_copy not in ejes:
                    ejes.append(eje_data_copy)
                break
    # Agregar ejes sin dimension matched (siempre incluir al menos 4)
    for key, eje_data in EJE_DEF.items():
        if not any(e.get("titulo") == eje_data["titulo"] for e in ejes):
            eje_data_copy = dict(eje_data)
            eje_data_copy["indice"] = 0
            eje_data_copy["prioridad"] = "MEDIA"
            eje_data_copy["dimension"] = key
            ejes.append(eje_data_copy)

    # ── MEJORES PRACTICAS MINERAS ─────────────────────────────
    mejores_practicas = {
        "internacionales": [
            {
                "nombre": "ICMM 10 Principios de Mineria Responsable",
                "entidad": "International Council on Mining & Metals",
                "descripcion": "Marco global de sostenibilidad para la industria minera: derechos humanos, biodiversidad, gestion de residuos y participacion comunitaria.",
                "aplicabilidad": f"Aplicar Principio 3 (participacion comunitaria) y Principio 6 (salud y seguridad) como base del contrato social con San Bartolome.",
                "url": "https://www.icmm.com/en-gb/our-principles",
                "nivel": "Internacional",
            },
            {
                "nombre": "IFC Performance Standards (PS1-PS8)",
                "entidad": "International Finance Corporation - Banco Mundial",
                "descripcion": "Estandares de desempeno ambiental y social para proyectos de inversion: evaluacion de impacto, condiciones laborales, salud comunitaria.",
                "aplicabilidad": f"PS1 (evaluacion de impacto) y PS5 (adquisicion de tierras) son criticos dado el nivel de rechazo actual ({pr}%).",
                "url": "https://www.ifc.org/performancestandards",
                "nivel": "Internacional",
            },
            {
                "nombre": "Principios del Ecuador (Equator Principles)",
                "entidad": "Equator Principles Association",
                "descripcion": "Marco de gestion de riesgo ambiental y social para financiamiento de proyectos de infraestructura y mineria.",
                "aplicabilidad": "Requerido por bancos financiadores internacionales. Cumplirlos facilita acceso a creditos y legitima el proyecto ante inversionistas.",
                "url": "https://equator-principles.com",
                "nivel": "Internacional",
            },
            {
                "nombre": "Convenio 169 OIT - Consulta Previa",
                "entidad": "Organizacion Internacional del Trabajo",
                "descripcion": "Establece el derecho de pueblos indigenas y comunidades a ser consultados antes de proyectos que afecten su territorio.",
                "aplicabilidad": "Obligatorio en Ecuador (ratificado 1998). El proceso CPLI debe ejecutarse antes de cualquier tramite de concesion minera.",
                "url": "https://www.ilo.org/indigenous/Conventions/no169/",
                "nivel": "Internacional",
            },
        ],
        "locales": [
            {
                "nombre": "Proyecto Mirador - EcuaCorriente",
                "entidad": "CRCC-Tongguan / ARCOM Ecuador",
                "descripcion": "Primera mina a gran escala en Ecuador (Zamora Chinchipe). Modelo de gestion social con fondo de compensacion comunitaria y monitoreo ambiental.",
                "aplicabilidad": f"Replicar su esquema de mesas de dialogo zonales y fondo de royalties del 5% para financiar obras en San Bartolome.",
                "url": "https://www.arcom.gob.ec",
                "nivel": "Nacional",
            },
            {
                "nombre": "Proyecto Fruta del Norte - Lundin Gold",
                "entidad": "Lundin Gold / Ministerio de Energia",
                "descripcion": "Mina de oro en Zamora Chinchipe con modelo de responsabilidad social: 70% empleo local, fondo de desarrollo y programa ambiental.",
                "aplicabilidad": "Adaptar el programa '70% empleo local' al contexto de San Bartolome para reducir el rechazo basado en preocupaciones economicas.",
                "url": "https://www.lundingold.com",
                "nivel": "Nacional",
            },
            {
                "nombre": "Agenda Minera Ecuador 2022-2025",
                "entidad": "Ministerio de Energia y Recursos Naturales No Renovables",
                "descripcion": "Hoja de ruta nacional para mineria responsable: lineamientos de licenciamiento social, participacion comunitaria y beneficios territoriales.",
                "aplicabilidad": "Alinear el plan de San Bartolome con los estandares de la Agenda Minera para facilitar tramites ante ARCOM y obtener apoyo institucional.",
                "url": "https://www.recursosyenergia.gob.ec",
                "nivel": "Nacional",
            },
            {
                "nombre": "Ley de Mineria Ecuador (Reg. 517/2009 + reformas)",
                "entidad": "Asamblea Nacional del Ecuador / ARCOM",
                "descripcion": "Marco legal minero: concesiones, regalias anticipadas (5% sobre ventas), fondos de compensacion, consulta previa y cierre de minas.",
                "aplicabilidad": f"Art. 93: comunidades reciben el 60% del 12% de regalias. Con {n} encuestas y {n_zonas} zonas, esto representa un argumento economico directo.",
                "url": "https://www.arcom.gob.ec/legislacion",
                "nivel": "Nacional",
            },
        ],
    }

    return {
        "resumen_ejecutivo":        resumen,
        "importancia_factores":     factores,
        "interpretaciones_dim":     interpretaciones_dim,
        "hallazgos_zona":           hallazgos_zona,
        "recomendaciones_ia":       recs[:5],
        "plan_estrategico":         plan,
        "conclusion":               conclusion,
        "recomendaciones_mineras":  rec_mineras,
        "ejes_estrategicos":        ejes,
        "mejores_practicas":        mejores_practicas,
    }
