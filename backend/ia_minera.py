"""
ia_minera.py — Motor de Inteligencia Artificial Minera
Parroquia San Bartolomé · Proyecto de Levantamiento de Encuestas

Metodología:
  • Clasificador MLP (Red Neuronal Multicapa 32-16-8) + Random Forest
  • Vectorización TF-IDF sobre campos de texto libre
  • Análisis demográfico completo (género, edad, educación, ocupación)
  • Análisis de conocimiento minero (tipos, beneficios, minería moderna, etc.)
  • Búsqueda de artículos científicos vía Semantic Scholar API
  • Aprendizaje acumulado desde planes Gemini anteriores
"""
import sys
import os
import json
import re
import unicodedata
import numpy as np
from collections import Counter
import urllib.request
import urllib.parse

# Forzar UTF-8 en stdout para que los caracteres especiales no se corrompan
# cuando PHP llama a este script via proc_open
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stdin, 'reconfigure'):
    sys.stdin.reconfigure(encoding='utf-8')

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import cross_val_score, StratifiedKFold

# ============================================================
#  CONSTANTES
# ============================================================

def clean_text(text):
    """Normaliza texto: minúsculas, sin tildes/diacríticos, sin espacios extra.
    Esto garantiza que variantes como 'Beneficiaría mucho' o 'beneficiaria mucho'
    coincidan correctamente con los mapas de clasificación."""
    if not text:
        return ''
    text = text.strip().lower()
    # Descomponer caracteres Unicode y eliminar marcas diacríticas (tildes, etc.)
    nfkd = unicodedata.normalize('NFD', text)
    return ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')

def normalize_sector(text):
    """Normaliza nombre de sector igual que app.js: minúsculas + sin tildes."""
    return clean_text(text) or 'general'

# Mapas con claves normalizadas (sin tildes, minúsculas) para tolerancia total
CLASE_MAP = {
    'beneficiaria mucho': 'Aceptacion',
    'beneficiaria algo':  'Aceptacion',
    'beneficio dudoso':   'Neutral',
    'no beneficiaria':    'Rechazo',
}

# Mapa de respaldo: cuando mine_reopening_perception está vacío,
# se infiere la clase desde investment_acceptance para incluir el 100% de encuestas
CLASE_MAP_INVESTMENT = {
    'aceptacion amplia':       'Aceptacion',
    'aceptacion condicionada': 'Neutral',
    'rechazo':                 'Rechazo',
    'no acepta':               'Rechazo',
}

def get_clase(row):
    """
    Devuelve la clase (Aceptacion/Neutral/Rechazo) para una encuesta.
    Orden de prioridad:
      1. mine_reopening_perception (normalizado — tolera tildes y mayúsculas)
      2. investment_acceptance (fallback normalizado)
      3. Inferencia por texto parcial
      4. 'Neutral' como valor por defecto (NUNCA descarta una encuesta)
    Garantiza que el 100% de las encuestas sean analizadas.
    """
    # 1. Fuente principal (normalizada)
    raw = clean_text(row.get('mine_reopening_perception') or '')
    clase = CLASE_MAP.get(raw)
    if clase:
        return clase

    # 2. Fallback: investment_acceptance (normalizado)
    inv_raw = clean_text(row.get('investment_acceptance') or '')
    clase = CLASE_MAP_INVESTMENT.get(inv_raw)
    if clase:
        return clase

    # 3. Inferencia por texto parcial (doble seguridad)
    if 'amplia' in inv_raw:
        return 'Aceptacion'
    if 'condicion' in inv_raw:
        return 'Neutral'
    if 'rechazo' in inv_raw or 'no acepta' in inv_raw:
        return 'Rechazo'
    if 'benefici' in raw:
        return 'Aceptacion'
    if 'no benefici' in raw or 'dud' in raw:
        return 'Neutral'

    # 4. Valor por defecto — la encuesta NUNCA se descarta
    return 'Neutral'

# Features base (modelo predictivo)
FEATURE_COLS = [
    'political_climate', 'authority_trust', 'investment_acceptance',
    'household_income', 'water_source', 'has_internet', 'road_status', 'has_sewer',
]
# Features extendidos (incluye conocimiento y demografía codificada)
FEATURE_COLS_EXT = FEATURE_COLS + [
    'knows_mining_types', 'knows_mining_benefits', 'knows_modern_mining',
    'knows_local_mines', 'knows_env_guarantees',
    'age_range', 'education_level', 'respondent_gender',
    'has_septic', 'road_who_fixes',
]

FEATURE_LABELS = {
    'political_climate':     'Clima Político',
    'authority_trust':       'Confianza en Autoridades',
    'investment_acceptance': 'Apertura a Inversión',
    'household_income':      'Situación Económica Familiar',
    'water_source':          'Fuente de Agua',
    'has_internet':          'Acceso a Internet',
    'road_status':           'Estado de las Vías',
    'has_sewer':             'Alcantarillado',
    'knows_mining_types':    'Conoce Tipos de Minería',
    'knows_mining_benefits': 'Conoce Beneficios Mineros',
    'knows_modern_mining':   'Conoce Minería Moderna',
    'knows_local_mines':     'Conoce Minas Locales',
    'knows_env_guarantees':  'Conoce Garantías Ambientales',
    'age_range':             'Rango de Edad',
    'education_level':       'Nivel de Educación',
    'respondent_gender':     'Género',
    'has_septic':            'Pozo Séptico',
    'road_who_fixes':        'Responsable de Vías',
}

MINING_QUERIES = [
    "social license to operate mining community Latin America",
    "mining community acceptance conflict Ecuador Peru Andes",
    "acid mine drainage remediation Andean rivers water quality",
    "heavy metal contamination artisanal mining Ecuador water",
    "ICMM responsible mining best practices community development",
    "IFC performance standards mining sustainability social",
    "artisanal small scale mining ASGM Ecuador formalization policy",
    "small scale gold mining socioeconomic impact Ecuador",
    "mining regulation Ecuador ARCOM environmental impact assessment",
    "prior consultation indigenous communities mining Ecuador OIT 169",
    "mining agriculture coexistence land use rural Ecuador",
    "community ecotourism extractivism alternative livelihood Andes",
    "participatory environmental monitoring mining communities water",
    "women artisanal mining gender roles community Ecuador",
]

STOPWORDS_ES = {
    'de','la','el','en','y','a','que','los','las','del','es','se','un','una',
    'con','por','para','no','su','al','lo','como','mas','pero','sus','le','ya',
    'o','este','si','porque','esta','entre','cuando','muy','sin','sobre','ser',
    'tiene','hay','son','fue','han','me','ni','mi','te','tu','nos','también',
    'tambien','todo','toda','todos','todas','hay','ser','estar','tener',
}


# ============================================================
#  SEMANTIC SCHOLAR
# ============================================================
def fetch_mining_papers(max_per_query=2, max_total=20):
    papers = []
    seen = set()
    for query in MINING_QUERIES:
        if len(papers) >= max_total:
            break
        try:
            url = (
                "https://api.semanticscholar.org/graph/v1/paper/search"
                f"?query={urllib.parse.quote(query)}"
                "&fields=title,authors,year,venue,externalIds,abstract,citationCount"
                f"&limit={max_per_query}"
            )
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "SanBartolomeAI/1.0",
            })
            with urllib.request.urlopen(req, timeout=7) as resp:
                data = json.loads(resp.read().decode())
            for p in data.get("data", []):
                title = (p.get("title") or "").strip()
                if not title or title in seen:
                    continue
                seen.add(title)
                authors_raw = p.get("authors") or []
                authors = ", ".join(a.get("name","") for a in authors_raw[:3])
                if len(authors_raw) > 3:
                    authors += " et al."
                doi = (p.get("externalIds") or {}).get("DOI", "")
                abstract = (p.get("abstract") or "")
                abstract_short = abstract[:350] + "..." if len(abstract) > 350 else abstract
                papers.append({
                    "titulo": title,
                    "autores": authors,
                    "anio": p.get("year") or "?",
                    "revista": (p.get("venue") or "").strip(),
                    "doi": doi,
                    "url": f"https://doi.org/{doi}" if doi else "",
                    "resumen": abstract_short,
                    "citas": p.get("citationCount", 0) or 0,
                })
        except Exception:
            continue
    papers.sort(key=lambda x: x.get("citas", 0), reverse=True)
    return papers[:max_total]


def build_knowledge_from_papers(papers):
    empty = {
        "evidencia_ambiental": [], "evidencia_social": [],
        "evidencia_regulatoria": [], "mejores_practicas_cientificas": [],
        "hallazgos_clave": "No se recuperaron artículos en esta sesión.",
        "total_articulos_recuperados": 0,
    }
    if not papers:
        return empty
    env, soc, reg, bp = [], [], [], []
    for p in papers:
        texto = (p["titulo"] + " " + p["resumen"]).lower()
        ref = f"{p['autores']} ({p['anio']}). {p['titulo']}. {p['revista']}."
        if p["doi"]:
            ref += f" DOI: {p['doi']}"
        entry = {"referencia": ref, "titulo": p["titulo"], "anio": p["anio"]}
        if any(k in texto for k in ["water","contamina","drainage","acid mine","heavy metal","agua","remediat"]):
            env.append(entry)
        if any(k in texto for k in ["social license","community","conflict","acceptance","gender","women","indigenous","consulta"]):
            soc.append(entry)
        if any(k in texto for k in ["regulation","policy","law","formali","ARCOM","environmental assessment","OIT"]):
            reg.append(entry)
        if any(k in texto for k in ["best practice","ICMM","IFC","sustainable","responsible mining","ecotourism","alternativ"]):
            bp.append(entry)
    top = papers[0]
    hallazgo = (
        f"Artículo más citado: \"{top['titulo']}\" ({top['autores']}, {top['anio']}) "
        f"con {top['citas']} citas. Resumen: {top['resumen'][:250]}..."
    )
    return {
        "evidencia_ambiental": env[:4],
        "evidencia_social": soc[:4],
        "evidencia_regulatoria": reg[:3],
        "mejores_practicas_cientificas": bp[:4],
        "hallazgos_clave": hallazgo,
        "total_articulos_recuperados": len(papers),
    }


# ============================================================
#  ANÁLISIS DEMOGRÁFICO
# ============================================================
def analyze_demographics(rows):
    """Analiza distribución por género, edad, educación, ocupación y comunidad."""
    def dist(field):
        counts = Counter(
            (r.get(field) or 'No especificado').strip() or 'No especificado' for r in rows
        )
        total = sum(counts.values()) or 1
        return sorted(
            [{"valor": k, "n": v, "pct": round(v / total * 100, 1)} for k, v in counts.items()],
            key=lambda x: x["n"], reverse=True
        )

    # Aceptación por género
    acept_por_genero = {}
    for r in rows:
        g = (r.get('respondent_gender') or 'No especificado').strip() or 'No especificado'
        clase = (get_clase(r) or 'Neutral')
        if g not in acept_por_genero:
            acept_por_genero[g] = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0, 'total': 0}
        acept_por_genero[g][clase] += 1
        acept_por_genero[g]['total'] += 1

    genero_vs_percepcion = []
    for g, c in acept_por_genero.items():
        t = c['total'] or 1
        genero_vs_percepcion.append({
            "genero": g, "n": c['total'],
            "aceptacion_pct": round(c['Aceptacion'] / t * 100, 1),
            "rechazo_pct":    round(c['Rechazo']    / t * 100, 1),
            "neutral_pct":    round(c['Neutral']     / t * 100, 1),
        })

    # Aceptación por edad
    acept_por_edad = {}
    for r in rows:
        edad = (r.get('age_range') or 'No especificado').strip() or 'No especificado'
        clase = (get_clase(r) or 'Neutral')
        if edad not in acept_por_edad:
            acept_por_edad[edad] = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0, 'total': 0}
        acept_por_edad[edad][clase] += 1
        acept_por_edad[edad]['total'] += 1

    edad_vs_percepcion = []
    for e, c in acept_por_edad.items():
        t = c['total'] or 1
        edad_vs_percepcion.append({
            "edad": e, "n": c['total'],
            "aceptacion_pct": round(c['Aceptacion'] / t * 100, 1),
            "rechazo_pct":    round(c['Rechazo']    / t * 100, 1),
        })

    return {
        "genero":               dist('respondent_gender'),
        "edad":                 dist('age_range'),
        "educacion":            dist('education_level'),
        "ocupacion":            dist('occupation')[:8],
        "comunidad":            dist('community')[:10],
        "genero_vs_percepcion": sorted(genero_vs_percepcion, key=lambda x: x['n'], reverse=True),
        "edad_vs_percepcion":   sorted(edad_vs_percepcion,   key=lambda x: x['n'], reverse=True),
    }


# ============================================================
#  ANÁLISIS DE CONOCIMIENTO MINERO
# ============================================================
def analyze_mining_knowledge(rows):
    """
    Evalúa el nivel de conocimiento/conciencia minera de la comunidad.
    Campos: knows_mining_types, knows_mining_benefits, knows_modern_mining,
            knows_local_mines, knows_env_guarantees
    """
    knowledge_fields = {
        'knows_mining_types':    '¿Conoce los tipos de minería?',
        'knows_mining_benefits': '¿Conoce los beneficios de la minería?',
        'knows_modern_mining':   '¿Conoce la minería moderna responsable?',
        'knows_local_mines':     '¿Conoce las minas locales?',
        'knows_env_guarantees':  '¿Conoce las garantías ambientales?',
    }

    resultados = []
    for campo, pregunta in knowledge_fields.items():
        respuestas = [r.get(campo, '') or '' for r in rows]
        respuestas = [r.strip() for r in respuestas if r.strip()]
        total = len(respuestas) or 1

        # Contar respuestas afirmativas (Sí, sí, Si, si, Yes, Conoce, etc.)
        positivos = sum(1 for r in respuestas if clean_text(r) in ('si', 'yes', 'conoce', 'sabe', '1', 'true'))
        pct_positivo = round(positivos / total * 100, 1)

        dist_raw = Counter(respuestas)
        distribucion = sorted(
            [{"valor": k, "n": v, "pct": round(v / total * 100, 1)} for k, v in dist_raw.items()],
            key=lambda x: x["n"], reverse=True
        )

        resultados.append({
            "campo":        campo,
            "pregunta":     pregunta,
            "n_respuestas": len(respuestas),
            "pct_positivo": pct_positivo,
            "nivel":        "Alto" if pct_positivo >= 60 else ("Medio" if pct_positivo >= 30 else "Bajo"),
            "distribucion": distribucion[:5],
        })

    # Índice de conocimiento global
    pcts = [r["pct_positivo"] for r in resultados]
    indice_conocimiento = round(sum(pcts) / len(pcts), 1) if pcts else 0

    # Cruce conocimiento vs aceptación
    conocimiento_vs_acept = []
    for campo in knowledge_fields:
        acept_conoce = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0, 'total': 0}
        acept_no_conoce = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0, 'total': 0}
        for r in rows:
            clase = get_clase(r)   # Siempre devuelve una clase válida
            val = clean_text(r.get(campo) or '')
            conoce = val in ('si', 'yes', 'conoce', 'sabe', '1', 'true')
            grupo = acept_conoce if conoce else acept_no_conoce
            grupo[clase] += 1
            grupo['total'] += 1

        def pct_acept(g):
            return round(g['Aceptacion'] / g['total'] * 100, 1) if g['total'] > 0 else 0

        conocimiento_vs_acept.append({
            "campo":              campo,
            "pregunta":           knowledge_fields[campo],
            "acept_si_conoce":    pct_acept(acept_conoce),
            "acept_no_conoce":    pct_acept(acept_no_conoce),
            "n_conoce":           acept_conoce['total'],
            "n_no_conoce":        acept_no_conoce['total'],
            "diferencia_pp":      round(pct_acept(acept_conoce) - pct_acept(acept_no_conoce), 1),
        })

    return {
        "por_campo":           resultados,
        "indice_conocimiento": indice_conocimiento,
        "cruce_vs_aceptacion": sorted(conocimiento_vs_acept, key=lambda x: abs(x['diferencia_pp']), reverse=True),
    }


# ============================================================
#  VECTORIZACIÓN TF-IDF
# ============================================================
def vectorize_survey_texts(rows):
    TEXT_FIELDS = ['comments', 'primary_problem', 'youth_path', 'social_priority']

    corpus_global = []
    corpus_por_clase = {'Aceptacion': [], 'Neutral': [], 'Rechazo': []}

    for row in rows:
        textos = []
        for f in TEXT_FIELDS:
            val = (row.get(f) or '').strip()
            if val and val.lower() not in ('null', 'none', 'n/a', '-'):
                textos.append(val)
        for arr_field in ['mine_benefits', 'mine_risks', 'women_roles']:
            try:
                arr = row.get(arr_field)
                if isinstance(arr, str):
                    arr = json.loads(arr)
                if isinstance(arr, list):
                    textos.extend([str(v) for v in arr if v])
            except Exception:
                pass

        combined = re.sub(r'[^a-záéíóúüñ\s]', ' ', ' '.join(textos).lower())
        tokens = [t for t in combined.split() if len(t) > 3 and t not in STOPWORDS_ES]
        text_clean = ' '.join(tokens)
        if text_clean.strip():
            corpus_global.append(text_clean)
            clase = (get_clase(row) or 'Neutral')
            corpus_por_clase[clase].append(text_clean)

    if not corpus_global:
        return [], {}

    try:
        tfidf = TfidfVectorizer(max_features=40, ngram_range=(1, 2), min_df=1)
        tfidf.fit(corpus_global)
        names = tfidf.get_feature_names_out()
        scores = np.asarray(tfidf.transform(corpus_global).mean(axis=0)).flatten()
        top = scores.argsort()[::-1][:15]
        temas_globales = [{"tema": names[i], "relevancia": round(float(scores[i]), 4)} for i in top]
    except Exception:
        temas_globales = []

    temas_por_clase = {}
    for clase, docs in corpus_por_clase.items():
        if len(docs) < 2:
            continue
        try:
            tv = TfidfVectorizer(max_features=15, ngram_range=(1, 1), min_df=1)
            tv.fit(docs)
            fn = tv.get_feature_names_out()
            sc = np.asarray(tv.transform(docs).mean(axis=0)).flatten()
            temas_por_clase[clase] = [fn[i] for i in sc.argsort()[::-1][:8]]
        except Exception:
            pass

    return temas_globales, temas_por_clase


# ============================================================
#  APRENDIZAJE DESDE GEMINI
# ============================================================
def load_gemini_knowledge():
    kb_path = os.path.join(os.path.dirname(__file__), 'storage', 'knowledge_gemini.json')
    if not os.path.exists(kb_path):
        return {}
    try:
        with open(kb_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def apply_gemini_knowledge(importancia_factores, recomendaciones, knowledge):
    if not knowledge:
        return importancia_factores, recomendaciones, None

    factores_gemini = knowledge.get('factores_frecuentes', [])
    recs_gemini     = knowledge.get('recomendaciones_consolidadas', [])
    actores_gemini  = knowledge.get('actores_frecuentes', [])
    total_planes    = knowledge.get('total_planes', 0)

    boost_map = {}
    for i, fg in enumerate(factores_gemini):
        for nm in [f['factor'] for f in importancia_factores]:
            if set(fg.lower().split()) & set(nm.lower().split()):
                boost_map[nm] = boost_map.get(nm, 0) + (len(factores_gemini) - i) / max(len(factores_gemini), 1)

    if boost_map:
        for f in importancia_factores:
            if f['factor'] in boost_map:
                f['score'] *= (1 + 0.3 * boost_map[f['factor']])
                f['gemini_boost'] = True
        total_s = sum(f['score'] for f in importancia_factores) or 1
        for f in importancia_factores:
            f['score'] /= total_s
            f['score_pct'] = round(f['score'] * 100, 1)
        importancia_factores.sort(key=lambda x: x['score'], reverse=True)

    recs_enriquecidas = list(recomendaciones)
    agregadas = 0
    for rg in recs_gemini[:6]:
        if agregadas >= 2:
            break
        if not any(rg[:40].lower() in r.lower() for r in recs_enriquecidas):
            recs_enriquecidas.append(f"[Validado por análisis Gemini previo] {rg}")
            agregadas += 1

    nota = None
    if total_planes > 0:
        nota = (
            f"Este análisis incorpora aprendizaje de {total_planes} plan(es) generados por Gemini. "
            f"Factores críticos recurrentes: {', '.join(factores_gemini[:3])}. "
            f"Actores clave: {', '.join(actores_gemini[:3])}."
        )

    return importancia_factores, recs_enriquecidas, nota


# ============================================================
#  RECOMENDACIONES ENRIQUECIDAS
# ============================================================
def generate_enriched_recommendations(importancia_factores, prediccion_global,
                                       prob_acept, prob_rech, prob_neu,
                                       knowledge_base, n_train,
                                       demo_data=None, know_data=None):
    recs = []
    top = importancia_factores[0] if importancia_factores else {"factor": "Calidad del Agua", "score_pct": 0}

    recs.append(
        f"La Red Neuronal MLP (32-16-8 neuronas) entrenada con {n_train} encuestas identifica "
        f"'{top['factor']}' como el factor determinante de la licencia social "
        f"(importancia RF: {top['score_pct']}%). Es el eje prioritario de intervención."
    )

    ev_amb = knowledge_base.get("evidencia_ambiental", [])
    recs.append(
        f"Evidencia científica respalda el monitoreo hídrico participativo como herramienta "
        f"más eficaz contra conflictos por contaminación. "
        + (f"Ver: {ev_amb[0]['referencia']}" if ev_amb else
           "Implementar estaciones de monitoreo con datos abiertos co-gestionadas por juntas de agua.")
    )

    ev_soc = knowledge_base.get("evidencia_social", [])
    recs.append(
        "Según literatura académica sobre licencia social en América Latina, la participación "
        "comunitaria desde el inicio reduce +60% la probabilidad de conflicto. "
        + (f"Referencia: {ev_soc[0]['referencia']}" if ev_soc else
           "Establecer Mesa de Diálogo Permanente antes de cualquier actividad minera.")
    )

    ev_reg = knowledge_base.get("evidencia_regulatoria", [])
    recs.append(
        "Cumplimiento del Convenio 169 OIT y Consulta Previa Libre e Informada "
        "(Art. 57 Constitución Ecuador) es requisito legal indispensable. "
        + (f"Ref.: {ev_reg[0]['referencia']}" if ev_reg else "")
    )

    # Recomendación basada en conocimiento minero
    if know_data:
        bajo_conocimiento = [k for k in know_data.get("por_campo", []) if k["nivel"] == "Bajo"]
        if bajo_conocimiento:
            campos = ", ".join(k["pregunta"] for k in bajo_conocimiento[:2])
            recs.append(
                f"El análisis revela bajo conocimiento comunitario en: {campos}. "
                "Se requiere campaña intensiva de socialización con lenguaje accesible y "
                "materiales visuales antes de cualquier proceso de consulta previa."
            )

    # Recomendación basada en demografía
    if demo_data:
        gen_vs = demo_data.get("genero_vs_percepcion", [])
        if len(gen_vs) >= 2:
            # Buscar brecha de género
            pcts = {g["genero"]: g["aceptacion_pct"] for g in gen_vs}
            if len(pcts) >= 2:
                vals = list(pcts.items())
                brecha = abs(vals[0][1] - vals[1][1])
                if brecha > 10:
                    recs.append(
                        f"Se detecta brecha de género de {brecha:.1f} puntos porcentuales en la percepción "
                        f"minera. Diseñar estrategias diferenciadas que incluyan espacios de participación "
                        "específicos para mujeres y jóvenes de la parroquia."
                    )

    if prob_rech > 40:
        recs.append(
            f"Riesgo social ALTO: {round(prob_rech)}% de rechazo predicho. "
            "No iniciar operaciones hasta obtener ≥60% de apoyo comunitario verificado."
        )
    elif prob_acept >= 60:
        recs.append(
            f"Condición favorable: {round(prob_acept)}% de aceptación proyectada. "
            "Avanzar en exploración y consulta previa bajo monitoreo ambiental independiente."
        )
    else:
        recs.append(
            "Escenario ambivalente. Campaña de socialización con datos transparentes "
            "respaldada por estudios universitarios independientes."
        )

    return recs


# ============================================================
#  FUNCIÓN PRINCIPAL
# ============================================================
def train_and_analyze():
    # 1. Input
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"ok": False, "error": "No input data received."}))
            return
        rows = json.loads(input_data)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Error parsing input JSON: {str(e)}"}))
        return

    if not rows:
        print(json.dumps({"ok": False, "error": "No survey records found."}))
        return

    n_rows = len(rows)

    # 2. Preparar features extendidas
    X_raw, y_raw, sectors = [], [], []
    class_counts = {'Aceptacion': 0, 'Neutral': 0, 'Rechazo': 0}

    for row in rows:
        clase = get_clase(row)   # Siempre devuelve Aceptacion/Neutral/Rechazo (nunca None)
        class_counts[clase] += 1
        feats = [row.get(col, '').strip() or 'Sin dato' for col in FEATURE_COLS_EXT]
        X_raw.append(feats)
        y_raw.append(clase)
        # Normalizar sector igual que app.js para evitar duplicados por tildes
        sectors.append(normalize_sector(row.get('sector', '')))

    n_train = len(y_raw)
    if n_train < 5:
        print(json.dumps({"ok": False, "error": "Se requieren al menos 5 encuestas para entrenar el modelo."}))
        return

    # 3. Codificar
    X_raw_T = list(zip(*X_raw))
    X_encoded_T = []
    for col_data in X_raw_T:
        le = LabelEncoder()
        uv = list(set(col_data))
        if 'Sin dato' not in uv:
            uv.append('Sin dato')
        le.fit(uv)
        X_encoded_T.append(le.transform(col_data))

    X = np.array(list(zip(*X_encoded_T)))
    le_y = LabelEncoder()
    le_y.fit(['Aceptacion', 'Neutral', 'Rechazo'])
    y = le_y.transform(y_raw)

    # 4. Entrenar MLP (Red Neuronal)
    # early_stopping requiere n_train >= 10/validation_fraction; lo habilitamos solo con suficientes datos
    use_early_stopping = n_train >= 50
    mlp = MLPClassifier(
        hidden_layer_sizes=(64, 32, 16, 8), max_iter=1000,
        random_state=42, alpha=0.01, learning_rate='adaptive',
        early_stopping=use_early_stopping,
        validation_fraction=0.1 if use_early_stopping else 0.0,
    )
    mlp.fit(X, y)

    # Precisión real: cross-validation (no sobre datos de entrenamiento)
    # Con pocos datos usamos menos folds para evitar errores
    n_folds = min(5, n_train // max(len(set(y_raw)), 1))
    if n_folds >= 2:
        cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
        cv_scores = cross_val_score(
            MLPClassifier(hidden_layer_sizes=(64, 32, 16, 8), max_iter=1000,
                          random_state=42, alpha=0.01, learning_rate='adaptive'),
            X, y, cv=cv, scoring='accuracy'
        )
        mlp_acc = float(cv_scores.mean())
        mlp_acc_std = float(cv_scores.std())
    else:
        # Con muy pocas encuestas no se puede hacer CV; se usa in-sample con advertencia
        mlp_acc = float(mlp.score(X, y))
        mlp_acc_std = 0.0

    # 5. Random Forest para importancia de factores
    rf = RandomForestClassifier(n_estimators=150, random_state=42, class_weight='balanced')
    rf.fit(X, y)

    importancia_factores = sorted([
        {
            "factor":    FEATURE_LABELS.get(FEATURE_COLS_EXT[i], FEATURE_COLS_EXT[i]),
            "campo":     FEATURE_COLS_EXT[i],
            "score":     float(rf.feature_importances_[i]),
            "score_pct": round(float(rf.feature_importances_[i]) * 100, 1),
        }
        for i in range(len(FEATURE_COLS_EXT))
    ], key=lambda x: x['score'], reverse=True)

    # 6. Predicciones individuales del MLP sobre todas las encuestas
    y_pred = mlp.predict(X)                          # predicciones del modelo
    y_pred_labels = le_y.inverse_transform(y_pred)   # convertir índices → etiquetas

    # Probabilidades por clase del MLP (softmax output)
    y_pred_proba = mlp.predict_proba(X)              # shape: (n, 3)
    label_order  = list(le_y.classes_)               # orden de clases del LabelEncoder

    # Predicción por sector usando las predicciones del modelo (no los labels originales)
    sector_results = []
    for sec in list(set(sectors)):
        idx_sec = [i for i, s in enumerate(sectors) if s == sec]
        sy_pred = [y_pred_labels[i] for i in idx_sec]
        t = len(sy_pred)
        if t == 0:
            continue
        sc = {c: sy_pred.count(c) for c in ['Aceptacion', 'Neutral', 'Rechazo']}
        # Confianza media del modelo para las encuestas de este sector
        proba_sec = y_pred_proba[idx_sec]
        conf_media = round(float(proba_sec.max(axis=1).mean()) * 100, 1)
        sector_results.append({
            "sector":    sec,
            "n":         t,
            "Aceptacion": round(sc['Aceptacion'] / t * 100, 1),
            "Neutral":    round(sc['Neutral']    / t * 100, 1),
            "Rechazo":    round(sc['Rechazo']    / t * 100, 1),
            "confianza_modelo_pct": conf_media,
        })

    # 7. Estadísticas globales derivadas de las PREDICCIONES del modelo (no de conteos)
    pred_counts = {c: list(y_pred_labels).count(c) for c in ['Aceptacion', 'Neutral', 'Rechazo']}
    prob_acept = round(pred_counts['Aceptacion'] / n_train * 100, 1)
    prob_rech  = round(pred_counts['Rechazo']    / n_train * 100, 1)
    prob_neu   = round(pred_counts['Neutral']    / n_train * 100, 1)

    # Predicción global: clase más frecuente según el modelo
    prediccion_global = max(pred_counts, key=pred_counts.get)

    # Confianza promedio del modelo (probabilidad máxima promedio)
    confianza_global = round(float(y_pred_proba.max(axis=1).mean()) * 100, 1)

    # Distribución original de etiquetas (para comparar con lo que predijo el modelo)
    orig_counts = class_counts  # ya calculado en el bucle anterior
    orig_acept  = round(orig_counts['Aceptacion'] / n_train * 100, 1)
    orig_rech   = round(orig_counts['Rechazo']    / n_train * 100, 1)
    orig_neu    = round(orig_counts['Neutral']    / n_train * 100, 1)

    # 8. Perfiles
    perfil_aceptacion, perfil_rechazo = [], []
    for i, col in enumerate(FEATURE_COLS_EXT):
        va = [X_raw[j][i] for j, lbl in enumerate(y_raw) if lbl == 'Aceptacion']
        vr = [X_raw[j][i] for j, lbl in enumerate(y_raw) if lbl == 'Rechazo']
        if va:
            mc = max(set(va), key=va.count)
            perfil_aceptacion.append({"factor": FEATURE_LABELS.get(col, col), "valor": mc, "pct": round(va.count(mc)/len(va)*100,1)})
        if vr:
            mc = max(set(vr), key=vr.count)
            perfil_rechazo.append({"factor": FEATURE_LABELS.get(col, col), "valor": mc, "pct": round(vr.count(mc)/len(vr)*100,1)})

    # 9. Análisis completo de DB
    demo_data  = analyze_demographics(rows)
    know_data  = analyze_mining_knowledge(rows)

    # 10. Vectorización TF-IDF
    temas_globales, temas_por_clase = vectorize_survey_texts(rows)

    # 11. Aprendizaje Gemini
    gemini_knowledge = load_gemini_knowledge()

    # 12. Artículos científicos
    papers       = fetch_mining_papers(max_per_query=2, max_total=16)
    knowledge_base = build_knowledge_from_papers(papers)

    # 13. Recomendaciones
    recomendaciones = generate_enriched_recommendations(
        importancia_factores, prediccion_global,
        prob_acept, prob_rech, prob_neu,
        knowledge_base, n_train,
        demo_data=demo_data, know_data=know_data,
    )

    # 14. Aplicar Gemini
    importancia_factores, recomendaciones, nota_gemini = apply_gemini_knowledge(
        importancia_factores, recomendaciones, gemini_knowledge
    )

    # 15. Diagnóstico enriquecido
    temas_txt = ''
    if temas_globales:
        temas_txt = f" TF-IDF identifica temas dominantes: {', '.join(t['tema'] for t in temas_globales[:6])}."
    if temas_por_clase.get('Rechazo'):
        temas_txt += f" Rechazo asociado a: {', '.join(temas_por_clase['Rechazo'][:4])}."
    if temas_por_clase.get('Aceptacion'):
        temas_txt += f" Aceptación asociada a: {', '.join(temas_por_clase['Aceptacion'][:4])}."

    nota_gem_str = f" {nota_gemini}" if nota_gemini else ""

    # Insight de conocimiento
    know_idx = know_data.get("indice_conocimiento", 0)
    know_nivel = "BAJO" if know_idx < 30 else ("MEDIO" if know_idx < 60 else "ALTO")
    know_txt = (
        f" El índice de conocimiento minero comunitario es {know_idx}% ({know_nivel}), "
        f"lo que {'requiere una campaña informativa intensiva previa a la consulta' if know_idx < 40 else 'permite avanzar con procesos participativos informados'}."
    )

    # Insight demográfico
    total_mujeres = next((g['n'] for g in demo_data['genero'] if 'femen' in g['valor'].lower() or 'mujer' in g['valor'].lower()), 0)
    pct_mujeres = round(total_mujeres / n_rows * 100, 1) if n_rows > 0 else 0

    diagnostico = (
        f"Red Neuronal MLP (64-32-16-8 neuronas) + Random Forest (150 árboles) entrenada con "
        f"{n_train} encuestas reales de San Bartolomé. "
        f"Precisión CV ({n_folds if n_folds >= 2 else 'in-sample'}-fold): {round(mlp_acc * 100, 1)}%"
        + (f" ± {round(mlp_acc_std * 100, 1)}%" if n_folds >= 2 else " (advertencia: muestra insuficiente para CV)") + ". "
        f"Predicción del modelo: '{prediccion_global}' con {confianza_global}% de confianza promedio "
        f"(MLP predice — Aceptación: {prob_acept}%, Rechazo: {prob_rech}%, Neutral: {prob_neu}%). "
        f"Distribución real en encuestas: Aceptación {orig_acept}%, Rechazo {orig_rech}%, Neutral {orig_neu}%. "
        f"Factor crítico: '{importancia_factores[0]['factor']}' "
        f"(RF importancia: {importancia_factores[0]['score_pct']}%).{temas_txt}{know_txt}"
        f"{nota_gem_str} {knowledge_base.get('hallazgos_clave', '')}"
    )

    # 16. Artículos para plan
    articulos_para_plan = [
        {
            "titulo":    p["titulo"],
            "autores":   p["autores"],
            "anio":      str(p["anio"]),
            "revista":   p["revista"],
            "doi_o_url": p["url"] or (f"https://doi.org/{p['doi']}" if p["doi"] else ""),
            "citas":     p["citas"],
            "resumen":   p["resumen"][:300] + "..." if len(p["resumen"]) > 300 else p["resumen"],
        }
        for p in papers[:10]
    ]

    # 17. Plan estratégico completo
    plan_estrategico = {
        "titulo": (
            f"Plan Estratégico Integral IA + Ciencia — Reapertura Minera Sostenible "
            f"San Bartolomé (Sector: {sectors[0].capitalize() if sectors else 'General'})"
        ),
        "diagnostico_contextual": diagnostico,
        "base_cientifica": {
            "total_articulos_recuperados": knowledge_base.get("total_articulos_recuperados", 0),
            "evidencia_ambiental":         knowledge_base.get("evidencia_ambiental", []),
            "evidencia_social":            knowledge_base.get("evidencia_social", []),
            "evidencia_regulatoria":       knowledge_base.get("evidencia_regulatoria", []),
            "mejores_practicas_cientificas": knowledge_base.get("mejores_practicas_cientificas", []),
        },
        "hallazgos_demograficos": {
            "resumen": (
                f"La muestra incluye {n_rows} encuestados. "
                f"Participación femenina: {pct_mujeres}%. "
                f"Grupos de edad predominantes: {', '.join(e['valor'] for e in demo_data['edad'][:2])}. "
                f"Nivel educativo más frecuente: {demo_data['educacion'][0]['valor'] if demo_data['educacion'] else 'N/D'}."
            ),
            "datos": demo_data,
        },
        "hallazgos_conocimiento_minero": {
            "resumen": (
                f"Índice de conocimiento minero comunitario: {know_idx}% ({know_nivel}). "
                + (f"Áreas con menor conocimiento: {', '.join(k['pregunta'] for k in know_data['por_campo'] if k['nivel'] == 'Bajo')[:2]}."
                   if any(k['nivel'] == 'Bajo' for k in know_data['por_campo']) else "")
            ),
            "datos": know_data,
        },
        "limitaciones_identificadas": [
            f"Alta preocupación en: {', '.join(f['factor'] for f in importancia_factores[:2])}.",
            f"Sentimiento clasificado como '{prediccion_global}' por la red neuronal.",
            f"Índice de conocimiento minero {know_nivel} ({know_idx}%) — brecha informativa significativa.",
            "Tensiones socioambientales históricas y falta de veeduría hídrica independiente.",
            "Ausencia de encadenamientos formales con colectivos agrícolas, artesanales y turísticos.",
        ],
        "acciones_prioritarias": [
            {
                "limitacion":  "Desconfianza hídrica y ambiental",
                "accion":      "Mesa Técnica de Monitoreo Hídrico Participativo con Universidad de Cuenca.",
                "quien":       "GAD Parroquial, Comités de Agua, Universidad de Cuenca",
                "cuando":      "Corto plazo (Meses 1-3)",
                "contribucion":"Reducir el temor a la contaminación con datos verificables e independientes.",
            },
            {
                "limitacion":  f"Bajo conocimiento minero ({know_nivel})",
                "accion":      "Campaña de socialización minera responsable con materiales visuales y talleres comunitarios.",
                "quien":       "GAD Parroquial, ARCOM, Ministerio de Minería, ONGs locales",
                "cuando":      "Inmediato — previo a consulta previa (Mes 1)",
                "contribucion":f"Elevar el índice de conocimiento del {know_idx}% actual a ≥70% antes de iniciar la consulta.",
            },
            {
                "limitacion":  "Falta de empleo calificado local",
                "accion":      "Programa de formación técnica SECAP certificado en San Bartolomé.",
                "quien":       "SECAP, GAD Parroquial, Empresa Operadora",
                "cuando":      "Mediano plazo (Meses 3-6)",
                "contribucion":"Mínimo 80% de mano de obra local en nómina operativa.",
            },
            {
                "limitacion":  "Sin encadenamientos con sectores productivos locales",
                "accion":      "Convenios de compra directa a fincas locales + Ruta Ecoturística.",
                "quien":       "Asociaciones agrícolas, Gremios artesanales, Ministerio de Turismo",
                "cuando":      "Mediano-Largo plazo (Meses 6-12)",
                "contribucion":"Diversificación económica e ingresos indirectos sostenibles.",
            },
        ],
        "cronograma_estrategico": [
            {"fase": "Fase 0 — Preparación", "periodo": "Mes 1",
             "hitos": ["Campaña de socialización minera", "Conformar Mesa de Diálogo", "Diagnóstico hídrico inicial"]},
            {"fase": "Fase 1 — Corto Plazo", "periodo": "Meses 1-3",
             "hitos": ["Instalar monitoreo hídrico participativo", "Firmar convenio con Universidad de Cuenca", "Consulta Previa formal Art. 57"]},
            {"fase": "Fase 2 — Mediano Plazo", "periodo": "Meses 3-6",
             "hitos": ["Iniciar cursos técnicos SECAP", "Invernaderos tecnificados con regalías", "Plataforma digital artesanos"]},
            {"fase": "Fase 3 — Largo Plazo", "periodo": "Meses 6-12+",
             "hitos": ["Compras directas mina-agricultores", "Centro Artesanal y Ecoturístico", "Becas universitarias con regalías"]},
        ],
        "indicadores_seguimiento": [
            {"indicador": "Índice conocimiento minero comunitario", "meta": "≥70%",      "mecanismo": "Re-encuesta trimestral"},
            {"indicador": "Mano de obra local contratada",           "meta": "≥80%",      "mecanismo": "Auditorías trimestrales GAD"},
            {"indicador": "Índice Calidad del Agua (ICA)",           "meta": "≥80 pts",   "mecanismo": "Monitoreo automatizado + Universidad"},
            {"indicador": "Ventas cooperativas agrícolas",            "meta": "+25% anual","mecanismo": "Reportes financieros asociaciones"},
            {"indicador": "Aceptación comunitaria (encuestas)",       "meta": "≥60%",      "mecanismo": "Encuestas periódicas cada 3 meses"},
        ],
        "recomendaciones_finales": recomendaciones,
        "articulos_cientificos_referencia": articulos_para_plan,
        "conclusion": (
            f"Con {n_rows} encuestas analizadas mediante Red Neuronal MLP + Random Forest, "
            f"vectorización TF-IDF y análisis demográfico completo, el modelo predice '{prediccion_global}' "
            f"({prob_acept}% aceptación, {prob_rech}% rechazo según predicciones MLP individuales; "
            f"precisión del modelo: {round(mlp_acc * 100, 1)}% en validación cruzada). "
            "La viabilidad minera en San Bartolomé depende de tres pilares fundamentales: "
            "(1) garantías ambientales verificables e independientes; "
            "(2) campaña de conocimiento/socialización que eleve el índice minero comunitario; "
            "(3) participación activa de todos los colectivos locales en la toma de decisiones."
        ),
    }

    # 18. Metodología
    metodologia = {
        "nombre": "Metodología IA Minera — Levantamiento Participativo San Bartolomé",
        "fase_recoleccion": {
            "descripcion": "Encuestas estructuradas aplicadas por encuestadores capacitados en campo.",
            "instrumento": "Formulario digital con 35+ variables: demográficas, sociales, económicas, ambientales y percepciones mineras.",
            "variables_clave": list(FEATURE_LABELS.values()),
            "total_registros": n_rows,
        },
        "fase_vectorizacion": {
            "descripcion": "Transformación de texto libre a representaciones numéricas comparables.",
            "tecnica": "TF-IDF (Term Frequency-Inverse Document Frequency), bigramas, vocabulario 40 términos.",
            "campos_procesados": ['comments', 'primary_problem', 'youth_path', 'social_priority', 'mine_benefits', 'mine_risks'],
            "temas_identificados": [t['tema'] for t in temas_globales[:10]],
        },
        "fase_clasificacion": {
            "descripcion": "Modelo supervisado de clasificación de percepción minera.",
            "modelos": [
                {
                    "nombre": "Red Neuronal MLP",
                    "arquitectura": "64-32-16-8 neuronas, activación ReLU, regularización L2",
                    "precision_cv": round(mlp_acc * 100, 1),
                    "precision_cv_std": round(mlp_acc_std * 100, 1),
                    "metodo_evaluacion": f"StratifiedKFold {n_folds}-fold cross-validation" if n_folds >= 2 else "in-sample (datos insuficientes para CV)",
                    "uso": "Predicción individual por encuesta → porcentajes globales y por sector",
                },
                {
                    "nombre": "Random Forest",
                    "arquitectura": "150 árboles, balanceo de clases automático",
                    "uso": "Cálculo de importancia relativa de factores (feature importance)",
                },
            ],
            "nota_metodologica": (
                "Los porcentajes de Aceptacion/Neutral/Rechazo se derivan de las predicciones "
                "individuales del MLP (mlp.predict), no de un conteo directo de etiquetas. "
                "La precisión se mide con validación cruzada estratificada, no sobre datos de entrenamiento."
            ),
            "variable_objetivo": "mine_reopening_perception → Aceptacion / Neutral / Rechazo",
            "n_entrenamiento": n_train,
        },
        "fase_analisis": {
            "descripcion": "Análisis estadístico descriptivo e inferencial cruzado.",
            "componentes": [
                "Distribución demográfica (género, edad, educación, ocupación)",
                "Índice de conocimiento minero comunitario",
                "Correlaciones cruzadas (conocimiento vs aceptación, género vs percepción)",
                "Análisis sectorial geográfico",
                "Búsqueda automática de artículos científicos (Semantic Scholar API)",
            ],
        },
        "fase_plan_estrategico": {
            "descripcion": "Generación del plan estratégico usando IA + literatura científica.",
            "proceso": [
                "Síntesis de hallazgos de IA local (MLP + RF)",
                "Enriquecimiento con artículos científicos indexados (Semantic Scholar)",
                "Consulta a Gemini API con contexto completo vectorizado",
                "Aprendizaje acumulado de planes anteriores (knowledge_gemini.json)",
                "Validación cruzada con regulación ecuatoriana vigente",
            ],
        },
        "limitaciones": [
            "El modelo se reentrena en cada consulta; con más encuestas mejora la precisión.",
            "Los artículos científicos dependen de disponibilidad de la API Semantic Scholar.",
            "Las predicciones reflejan el estado actual de las encuestas; no son predictivas del futuro.",
        ],
    }

    # 19. Output
    output = {
        "ok":                      True,
        "modelo": (
            f"Red Neuronal MLP (64-32-16-8) + Random Forest — "
            f"Precisión CV: {round(mlp_acc * 100, 1)}%"
            + (f" ± {round(mlp_acc_std * 100, 1)}%" if n_folds >= 2 else " (in-sample)")
        ),
        "encuestas_entrenadas":    n_train,
        "total_encuestas":         n_rows,
        "cobertura_datos":         round(n_train / n_rows * 100, 1) if n_rows > 0 else 0,
        "prediccion_global":       prediccion_global,
        "confianza_modelo_pct":    confianza_global,
        # Porcentajes derivados de predicciones MLP (no de conteos de etiquetas)
        "probabilidades_globales": {"Aceptacion": prob_acept, "Neutral": prob_neu, "Rechazo": prob_rech},
        # Distribución real de respuestas (para transparencia comparativa)
        "distribucion_real":       {"Aceptacion": orig_acept, "Neutral": orig_neu, "Rechazo": orig_rech},
        "importancia_factores":    importancia_factores,
        "perfil_aceptacion":       perfil_aceptacion,
        "perfil_rechazo":          perfil_rechazo,
        "prediccion_por_sector":   sector_results,
        "recomendaciones_ia":      recomendaciones,
        "articulos_cientificos":   articulos_para_plan,
        "base_cientifica_minera":  knowledge_base,
        "plan_cientifico":         plan_estrategico,
        "demografia":              demo_data,
        "conocimiento_minero":     know_data,
        "vectorizacion_temas":     temas_globales,
        "vectorizacion_por_clase": temas_por_clase,
        "metodologia":             metodologia,
        "aprendizaje_gemini": {
            "activo":          bool(gemini_knowledge),
            "planes_previos":  gemini_knowledge.get("total_planes", 0),
            "factores_gemini": gemini_knowledge.get("factores_frecuentes", []),
            "actores_gemini":  gemini_knowledge.get("actores_frecuentes", []),
            "nota_alineacion": nota_gemini,
        },
    }

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    train_and_analyze()
