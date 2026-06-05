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

    # ── PLAN ESTRATÉGICO ──────────────────────────────────────
    nivel = "bajo" if pa < 40 else ("medio" if pa < 60 else "alto")
    plan = {
        "titulo": "Plan de Gestión Social — Parroquia San Bartolomé",
        "diagnostico_contextual": (
            f"La parroquia registra nivel de aceptación {nivel} ({pa}%) con índice de "
            f"conocimiento minero del {idx_k}%. La estrategia debe priorizar socialización, "
            f"fortalecimiento institucional y mecanismos de participación antes de avanzar en procesos formales."
        ),
        "fases": [
            {"fase": "Fase 0 — Diagnóstico y Preparación", "periodo": "Mes 1",
             "acciones": ["Mapeo de actores clave y grupos de interés por zona",
                          "Validación de hallazgos con líderes comunitarios y autoridades parroquiales",
                          "Diseño de materiales informativos adaptados al contexto local"]},
            {"fase": "Fase 1 — Socialización y Conocimiento", "periodo": "Meses 1–3",
             "acciones": ["Talleres informativos sobre minería responsable en todas las comunidades",
                          "Visitas a proyectos mineros modelo en Ecuador para líderes comunitarios",
                          "Campaña de comunicación dirigida a las zonas con mayor rechazo"]},
            {"fase": "Fase 2 — Diálogo y Acuerdos", "periodo": "Meses 3–6",
             "acciones": ["Constitución de comité comunitario de seguimiento con representación zonal",
                          "Negociación de compromisos sociales: empleo, infraestructura, desarrollo parroquial",
                          "Proceso de consulta previa conforme a normativa ecuatoriana vigente"]},
            {"fase": "Fase 3 — Monitoreo y Sostenibilidad", "periodo": "Meses 6–12+",
             "acciones": ["Sistema de monitoreo socioambiental con participación comunitaria",
                          "Rendición de cuentas semestral sobre cumplimiento de compromisos",
                          "Re-encuesta de percepción para medir evolución del índice de aceptación"]},
        ],
        "indicadores": [
            {"nombre": "Índice de aceptación comunitaria", "meta": f">={min(pa+20, 65)}%",     "plazo": "6 meses"},
            {"nombre": "Índice de conocimiento minero",    "meta": "≥70%",                     "plazo": "3 meses"},
            {"nombre": "Confianza institucional",          "meta": "Favorable en ≥60%",         "plazo": "4 meses"},
            {"nombre": "Zonas con acuerdos firmados",      "meta": f"≥{max(1,len(zonas)//2)}", "plazo": "6 meses"},
        ],
        "recomendaciones_finales": [
            f"Iniciar proceso formal solo cuando aceptación supere 50% en al menos el 60% de las zonas (actual: {pa}%).",
            "Mantener comunicación proactiva y transparente como eje transversal de todas las fases.",
            "Documentar y publicar todos los acuerdos adquiridos con la comunidad para garantizar su cumplimiento.",
        ],
    }

    # ── CONCLUSIÓN ────────────────────────────────────────────
    if pred == "Rechazo":
        conclusion = (
            f"El análisis proyecta rechazo en San Bartolomé ({pr}%). Sin una estrategia de "
            f"gestión social que eleve el conocimiento ({idx_k}%) y la confianza comunitaria, "
            f"el riesgo de conflicto social es alto. No se recomienda avanzar sin completar las fases de socialización."
        )
    else:
        conclusion = (
            f"Con {pa}% de aceptación en {n} encuestas, San Bartolomé muestra viabilidad social para la minería. "
            f"La clave es sostener este consenso mediante compromisos verificables, empleo local "
            f"y mecanismos de participación efectiva en los beneficios del proyecto."
        )

    return {
        "resumen_ejecutivo":     resumen,
        "importancia_factores":  factores[:5],
        "interpretaciones_dim":  interpretaciones_dim,
        "hallazgos_zona":        hallazgos_zona,
        "recomendaciones_ia":    recs[:5],
        "plan_estrategico":      plan,
        "conclusion":            conclusion,
    }

# ──────────────────────────────────────────────────────────────
#  COMBINAR STATS + TEXTO
# ──────────────────────────────────────────────────────────────

def merge_all(stats, texto):
    probs = stats.get("probabilidades_globales", {})
    pa    = probs.get('Aceptacion', 0)
    pn    = probs.get('Neutral',    0)
    pr    = probs.get('Rechazo',    0)
    pred  = "Aceptacion" if pa >= pr else "Rechazo"

    local_dims  = stats.get("sentimientos_dimensiones", [])
    llm_interp  = {d['titulo']: d['interpretacion'] for d in texto.get("interpretaciones_dim", []) if 'titulo' in d}
    dimensiones = []
    for ld in local_dims:
        titulo = ld['titulo']
        dimensiones.append({
            "titulo":        titulo,
            "sentimiento":   ld['sentimiento'],
            "distribucion":  ld['distribucion'],
            "interpretacion": llm_interp.get(titulo, ""),
        })

    llm_hallazgos = {h['zona']: h['hallazgo'] for h in texto.get("hallazgos_zona", []) if 'zona' in h}
    analisis_zona = [
        {"zona": s['sector'], "n": s['n'],
         "prediccion":     "Aceptacion" if s['aceptacion_pct'] >= s['rechazo_pct'] else "Rechazo",
         "aceptacion_pct": s['aceptacion_pct'], "neutral_pct": s['neutral_pct'], "rechazo_pct": s['rechazo_pct'],
         "hallazgo_clave": llm_hallazgos.get(s['sector'], "")}
        for s in stats.get("sectores_detalle", [])
    ]

    return {
        "ok": True,
        "motor":                   "NVIDIA Análisis IA",
        "total_encuestas":         stats.get("total_encuestas", 0),
        "prediccion_global":       pred,
        "probabilidades_globales": {"Aceptacion": pa, "Neutral": pn, "Rechazo": pr},
        "sentimiento_global":      {"positivo_pct": pa, "neutro_pct": pn, "negativo_pct": pr},
        "resumen_ejecutivo":       texto.get("resumen_ejecutivo", ""),
        "importancia_factores":    texto.get("importancia_factores", []),
        "dimensiones":             dimensiones,
        "analisis_por_zona":       analisis_zona,
        "recomendaciones_ia":      texto.get("recomendaciones_ia", []),
        "plan_estrategico":        texto.get("plan_estrategico", {}),
        "conclusion":              texto.get("conclusion", ""),
        "stats_locales":           stats,
    }

# ──────────────────────────────────────────────────────────────
#  ENRIQUECIMIENTO LLM  (prompt mínimo, solo texto narrativo)
# ──────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────
#  NUEVAS FUNCIONES DE ANÁLISIS  (cruces y carencias para el LLM)
# ──────────────────────────────────────────────────────────────

def _clase_de(row):
    """Clasifica la percepción minera de una fila en Aceptacion/Neutral/Rechazo."""
    return CLASE_MAP.get((row.get('mine_reopening_perception') or '').strip())


def cruce_percepcion(rows, field, label='valor', top=None):
    """Cruza cualquier campo con la percepción minera. Devuelve % acepta/neutral/rechaza por categoría."""
    grupos = {}
    for r in rows:
        key = (r.get(field) or 'No especificado').strip() or 'No especificado'
        clase = _clase_de(r)
        if key not in grupos:
            grupos[key] = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0, 'total': 0}
        if clase:
            grupos[key][clase] += 1
        grupos[key]['total'] += 1
    items = []
    for k, c in grupos.items():
        t = c['total'] or 1
        items.append({
            label: k, "n": c['total'],
            "aceptacion_pct": pct(c['Aceptacion'], t),
            "neutral_pct":    pct(c['Neutral'],    t),
            "rechazo_pct":    pct(c['Rechazo'],    t),
            "tendencia": "Aceptacion" if c['Aceptacion'] >= c['Rechazo'] else "Rechazo",
        })
    items.sort(key=lambda x: x['n'], reverse=True)
    return items[:top] if top else items


def conocimiento_vs_aceptacion(rows):
    """Para cada pregunta de conocimiento: % de aceptación entre quienes conocen vs. quienes no."""
    campos = {
        'knows_mining_types':    'Conoce tipos de minería',
        'knows_mining_benefits': 'Conoce beneficios mineros',
        'knows_modern_mining':   'Conoce minería moderna',
        'knows_local_mines':     'Conoce minas locales',
        'knows_env_guarantees':  'Conoce garantías ambientales',
    }
    SI = ('si', 'sí', 'yes', 'conoce', 'sabe', '1', 'true')
    out = []
    for campo, preg in campos.items():
        g_si = {'Aceptacion': 0, 'Rechazo': 0, 'Neutral': 0, 'total': 0}
        g_no = {'Aceptacion': 0, 'Rechazo': 0, 'Neutral': 0, 'total': 0}
        for r in rows:
            clase = _clase_de(r)
            if not clase:
                continue
            g = g_si if (r.get(campo) or '').strip().lower() in SI else g_no
            g[clase] += 1
            g['total'] += 1
        a_si = pct(g_si['Aceptacion'], g_si['total'] or 1)
        a_no = pct(g_no['Aceptacion'], g_no['total'] or 1)
        out.append({
            "campo": campo, "pregunta": preg,
            "acept_conoce_pct": a_si, "acept_no_conoce_pct": a_no,
            "n_conoce": g_si['total'], "n_no_conoce": g_no['total'],
            "diferencia_pp": round(a_si - a_no, 1),
        })
    out.sort(key=lambda x: abs(x['diferencia_pp']), reverse=True)
    return out


def carencias_servicios(rows):
    """Ranking de carencias de servicios básicos (% de respuestas negativas)."""
    n = len(rows) or 1

    def share(field, is_neg):
        c = sum(1 for r in rows if is_neg((r.get(field) or '').strip().lower()))
        return round(c / n * 100, 1)

    def es_no(v):
        return v.startswith('no') or v in ('', '0', 'false', 'ninguno', 'ninguna')

    def via_mala(v):
        return any(k in v for k in ('mala', 'malo', 'deficiente', 'pésim', 'pesim',
                                    'intransitab', 'regular', 'tierra', 'lastre'))

    def agua_insegura(v):
        insegura = any(k in v for k in ('rio', 'río', 'pozo', 'acarre', 'lluvia',
                                        'vertiente', 'quebrada', 'entubada'))
        return insegura and 'trat' not in v

    carencias = [
        {"servicio": "Alcantarillado",            "carencia_pct": share('has_sewer',    es_no)},
        {"servicio": "Internet",                  "carencia_pct": share('has_internet', es_no)},
        {"servicio": "Pozo séptico",              "carencia_pct": share('has_septic',   es_no)},
        {"servicio": "Agua segura (red/tratada)", "carencia_pct": share('water_source', agua_insegura)},
        {"servicio": "Vías en buen estado",       "carencia_pct": share('road_status',  via_mala)},
    ]
    carencias.sort(key=lambda x: x['carencia_pct'], reverse=True)
    return carencias


def build_cruces(rows):
    """Empaqueta todos los cruces nuevos en un solo dict para añadir a stats."""
    return {
        "cruce_percepcion_edad":      cruce_percepcion(rows, 'age_range',      'edad'),
        "cruce_percepcion_educacion": cruce_percepcion(rows, 'education_level', 'educacion'),
        "cruce_percepcion_sector":    cruce_percepcion(rows, 'sector',         'sector'),
        "conocimiento_vs_aceptacion": conocimiento_vs_aceptacion(rows),
        "carencias_servicios":        carencias_servicios(rows),
    }


def build_enrich_prompt(stats):
    """Prompt que solicita razonamiento previo y luego JSON."""
    probs = stats.get("probabilidades_globales", {})
    pa    = probs.get('Aceptacion', 0)
    pr    = probs.get('Rechazo',    0)
    n     = stats.get("total_encuestas", 0)
    dims  = stats.get("sentimientos_dimensiones", [])
    pred  = "Aceptacion" if pa >= pr else "Rechazo"
    dims_txt  = "; ".join(f"{d['titulo']}={d['sentimiento']['indice']}pts" for d in dims)
    probs_lbl = ", ".join(p['label'] for p in stats.get("problemas", [])[:3])

    edad     = stats.get("cruce_percepcion_edad", [])[:4]
    edad_txt = "; ".join(f"{e.get('edad','?')} acepta {e['aceptacion_pct']}%/rechaza {e['rechazo_pct']}%" for e in edad)
    edu      = stats.get("cruce_percepcion_educacion", [])[:4]
    edu_txt  = "; ".join(f"{e.get('educacion','?')} acepta {e['aceptacion_pct']}%" for e in edu)
    kva      = stats.get("conocimiento_vs_aceptacion", [])[:1]
    kva_txt  = (f"{kva[0]['pregunta']}: conoce acepta {kva[0]['acept_conoce_pct']}% vs "
                f"no-conoce {kva[0]['acept_no_conoce_pct']}% (dif {kva[0]['diferencia_pp']}pp)") if kva else "s/d"
    car      = stats.get("carencias_servicios", [])[:3]
    car_txt  = "; ".join(f"{c['servicio']} {c['carencia_pct']}%" for c in car)

    return (
        f"Eres analista minero y social en Ecuador. Datos de {n} encuestas en la parroquia San Bartolomé.\n"
        f"Predicción global={pred}. Aceptación={pa}%, Rechazo={pr}%.\n"
        f"Dimensiones (índice de sentimiento): {dims_txt}.\n"
        f"Problemas principales: {probs_lbl}.\n"
        f"Percepción por edad: {edad_txt}.\n"
        f"Percepción por educación: {edu_txt}.\n"
        f"Conocimiento vs aceptación: {kva_txt}.\n"
        f"Carencias de servicios: {car_txt}.\n\n"
        f"Por favor, piensa paso a paso analizando estos datos. Tu respuesta debe consistir de tu análisis y razonamiento, seguido de un ÚNICO bloque JSON válido (sin código markdown de preferencia, pero si lo usas que sea solo para el JSON) con esta estructura exacta:\n"
        f'{{"resumen_ejecutivo":"2-3 oraciones que integren la percepción, el grupo etario y educativo más a favor y en contra, y la carencia más crítica.",'
        f'"conclusion":"1-2 oraciones con el veredicto y la acción prioritaria.",'
        f'"interpretaciones_dim":[{",".join(chr(123)+f""""titulo":"{d["titulo"]}","interpretacion":"1 oración basada en los datos."{chr(125)}""" for d in dims)}]}}'
    )

def call_nvidia_enrich(prompt):
    """Llama al LLM con streaming. Emite eventos 'thinking' y devuelve el JSON extraído."""
    try:
        if HAS_OPENAI:
            client = OpenAI(base_url=NVIDIA_BASE_URL, api_key=NVIDIA_API_KEY, timeout=60.0)
            completion = client.chat.completions.create(
                model=NVIDIA_MODEL,
                messages=[
                    {"role": "system", "content": "Eres un analista experto. Proporciona tu razonamiento y luego un bloque JSON válido."},
                    {"role": "user",   "content": prompt}
                ],
                temperature=0.3, top_p=0.9, max_tokens=4096, stream=True,
                extra_body={"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":2048}
            )
            raw = ""
            for chunk in completion:
                if not chunk.choices: continue
                delta = chunk.choices[0].delta
                # Alguns modelos envían el reasoning en atributos separados si están soportados, pero Nemotron lo pone en content
                content = getattr(delta, "content", "") or ""
                # Si el modelo soporta reasoning_content (ej. DeepSeek o Nemotron con extra_body)
                reasoning = getattr(delta, "reasoning_content", "") or ""
                
                text_to_emit = reasoning + content
                if text_to_emit:
                    raw += text_to_emit
                    emit({"type": "thinking", "text": text_to_emit})
        else:
            req_data = json.dumps({
                "model": NVIDIA_MODEL,
                "messages": [
                    {"role": "system", "content": "Eres un analista experto. Proporciona tu razonamiento y luego un bloque JSON válido."},
                    {"role": "user",   "content": prompt}
                ],
                "temperature": 0.3, "top_p": 0.9, "max_tokens": 4096, "stream": False,
                "chat_template_kwargs": {"enable_thinking": True},
                "reasoning_budget": 2048
            }).encode('utf-8')
            req = urllib.request.Request(
                NVIDIA_BASE_URL + "/chat/completions",
                data=req_data,
                headers={'Content-Type': 'application/json',
                         'Authorization': 'Bearer ' + NVIDIA_API_KEY}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read().decode('utf-8'))
            raw = body['choices'][0]['message']['content']
            emit({"type": "thinking", "text": raw})

        start = raw.find('{')
        end = raw.rfind('}')
        if start != -1 and end > start:
            return json.loads(raw[start:end+1])
    except Exception as e:
        emit({"type": "thinking", "text": f"\n[Error consultando a NVIDIA: {str(e)}]\n"})
    return None

# ──────────────────────────────────────────────────────────────
#  MAIN
# ──────────────────────────────────────────────────────────────

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            emit({"type": "error", "error": "No se recibieron datos de entrada."}); return
        rows = json.loads(raw)
    except Exception as e:
        emit({"type": "error", "error": "Error parseando JSON: " + str(e)}); return

    if not rows:
        emit({"type": "error", "error": "No hay encuestas para analizar."}); return

    sectores_list = sorted(list(set((r.get('sector') or 'general').strip() for r in rows)))
    total = len(rows)

    # ── FASE 1: Estadísticas instantáneas ──────────────────────
    emit({"type": "progress",
          "mensaje": f"Calculando estadísticas de {total} encuestas...",
          "zonas": sectores_list, "total": total, "procesadas": total})

    try:
        stats = analyze_statistics(rows)
        # Integrar las funciones de análisis faltantes (cruces y carencias)
        stats.update(build_cruces(rows))
    except Exception as e:
        emit({"type": "error", "error": "Error en estadísticas: " + str(e)}); return

    emit({"type": "stats", "stats": stats})

    # ── FASE 2: Enriquecimiento NVIDIA con streaming de razonamiento ──
    emit({"type": "progress", "mensaje": "Razonando con NVIDIA Nemotron...", "total": total, "procesadas": total})
    
    try:
        texto_instant = generate_instant_analysis(stats)
    except Exception as e:
        texto_instant = {}

    prompt   = build_enrich_prompt(stats)
    llm_data = call_nvidia_enrich(prompt)

    # Reemplazar análisis instantáneo con el del LLM si fue exitoso
    if llm_data:
        texto_instant["resumen_ejecutivo"] = llm_data.get("resumen_ejecutivo", texto_instant.get("resumen_ejecutivo", ""))
        texto_instant["conclusion"]        = llm_data.get("conclusion",        texto_instant.get("conclusion", ""))
        
        # Mezclar interpretaciones
        llm_interp = {d['titulo']: d['interpretacion'] for d in llm_data.get("interpretaciones_dim", []) if 'titulo' in d}
        for d in texto_instant.get("interpretaciones_dim", []):
            if d['titulo'] in llm_interp:
                d['interpretacion'] = llm_interp[d['titulo']]

    # ── FASE 3: Emitir el resultado final ──
    result = merge_all(stats, texto_instant)
    emit({"type": "result", **result})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        emit({"type": "error", "error": f"Error fatal en Python: {str(e)}\n{err_msg}"})
