# -*- coding: utf-8 -*-
"""
ia_nvidia.py - Motor LLM NVIDIA Nemotron-3-Super-120B
Parroquia San Bartolome - Analisis de Encuestas con IA

Protocolo de salida: NDJSON (una linea JSON por evento)
  {"type":"progress","mensaje":"...","zonas":[...],"total":N}
  {"type":"stats","stats":{...datos estadisticos locales...}}
  {"type":"thinking","text":"...razonamiento parcial..."}
  {"type":"result",...datos completos del LLM...}
  {"type":"error","error":"..."}
"""

import sys
import json
import re
from collections import Counter

# Intentar importar openai
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    import urllib.request
    import urllib.error

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_API_KEY  = "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"
NVIDIA_MODEL    = "nvidia/nemotron-3-super-120b-a12b"

CLASE_MAP = {
    'Beneficiaria mucho': 'Aceptacion',
    'Beneficiaria algo':  'Aceptacion',
    'Beneficio dudoso':   'Neutral',
    'No beneficiaria':    'Rechazo',
}

def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)

def pct(n, total):
    return round(n / total * 100, 1) if total > 0 else 0.0

def dist_field(rows, field, top=None):
    counts = Counter((r.get(field) or 'No especificado').strip() for r in rows)
    total = sum(counts.values()) or 1
    items = sorted(
        [{"label": k, "n": v, "pct": pct(v, total)} for k, v in counts.items()],
        key=lambda x: x["n"], reverse=True
    )
    return items[:top] if top else items


def analyze_statistics(rows):
    n = len(rows)
    if n == 0:
        return {}

    sectores       = dist_field(rows, 'sector')
    comunidades    = dist_field(rows, 'community', top=15)
    genero         = dist_field(rows, 'respondent_gender')
    edad           = dist_field(rows, 'age_range')
    educacion      = dist_field(rows, 'education_level')
    ocupacion      = dist_field(rows, 'occupation', top=10)
    problemas      = dist_field(rows, 'primary_problem', top=10)
    prioridad_soc  = dist_field(rows, 'social_priority', top=10)
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
    n_class = sum(clases.values()) or 1
    prob_acept = pct(clases['Aceptacion'], n_class)
    prob_neu   = pct(clases['Neutral'],    n_class)
    prob_rech  = pct(clases['Rechazo'],    n_class)

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
                try:
                    val = json.loads(val)
                except Exception:
                    val = [val]
            if isinstance(val, list):
                dest.extend([str(v).strip() for v in val if v])
    beneficios_dist = sorted(
        [{"label": k, "n": v, "pct": pct(v, len(beneficios_raw) or 1)}
         for k, v in Counter(beneficios_raw).most_common(10)],
        key=lambda x: x['n'], reverse=True
    )
    riesgos_dist = sorted(
        [{"label": k, "n": v, "pct": pct(v, len(riesgos_raw) or 1)}
         for k, v in Counter(riesgos_raw).most_common(10)],
        key=lambda x: x['n'], reverse=True
    )

    know_fields = {
        'knows_mining_types':    'Conoce tipos de mineria',
        'knows_mining_benefits': 'Conoce beneficios mineros',
        'knows_modern_mining':   'Conoce mineria moderna',
        'knows_local_mines':     'Conoce minas locales',
        'knows_env_guarantees':  'Conoce garantias ambientales',
    }
    conocimiento = []
    for campo, pregunta in know_fields.items():
        vals = [(r.get(campo) or '').strip() for r in rows]
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
        p_p  = pct(pos, t); n_p = pct(neu, t); ng_p = pct(neg, t)
        return {"positivo_pct": p_p, "neutro_pct": n_p, "negativo_pct": ng_p,
                "indice": round(p_p - ng_p, 1)}

    def classify_sent(field, pos_vals, neg_vals):
        pos = neg = neu = 0
        for r in rows:
            v = (r.get(field) or '').strip().lower()
            if any(v.startswith(p.lower()) for p in pos_vals):
                pos += 1
            elif any(v.startswith(ng.lower()) for ng in neg_vals):
                neg += 1
            else:
                neu += 1
        return pos, neu, neg

    p, nu, ng = classify_sent('political_climate',
        ('favorable', 'muy favorable', 'tranquilo'),
        ('conflictivo', 'muy conflictivo', 'tensionado', 'polarizado'))
    sent_clima = sentimiento_dim(p, nu, ng)

    p, nu, ng = classify_sent('authority_trust',
        ('alta', 'muy alta', 'mucha'),
        ('baja', 'muy baja', 'poca', 'ninguna'))
    sent_trust = sentimiento_dim(p, nu, ng)

    p, nu, ng = classify_sent('household_income',
        ('suficiente', 'bueno', 'alto'),
        ('insuficiente', 'muy bajo', 'bajo', 'precario'))
    sent_ingresos = sentimiento_dim(p, nu, ng)

    sent_mineria = sentimiento_dim(clases['Aceptacion'], clases['Neutral'], clases['Rechazo'])

    inv_counts = Counter((r.get('investment_acceptance') or '').strip() for r in rows)
    pos_inv = sum(v for k, v in inv_counts.items() if any(
        p in k.lower() for p in ('acepta', 'favor', 'apoya', 'si')))
    neg_inv = sum(v for k, v in inv_counts.items() if any(
        p in k.lower() for p in ('rechaza', 'opone', 'contra', 'no')))
    sent_inversion = sentimiento_dim(pos_inv, n - pos_inv - neg_inv, neg_inv)

    know_si_total = sum(
        sum(1 for r in rows if (r.get(c) or '').strip().lower() in ('si','yes','conoce','sabe','1','true'))
        for c in know_fields
    )
    know_total = len(rows) * len(know_fields) or 1
    sent_conocimiento = sentimiento_dim(know_si_total, 0, know_total - know_si_total)

    idx_conocimiento = round(sum(k['si_pct'] for k in conocimiento) / len(conocimiento), 1) if conocimiento else 0

    def label_sent_mineria(label):
        if label in ("Beneficiaria mucho", "Beneficiaria algo"):
            return "positivo"
        elif label == "No beneficiaria":
            return "negativo"
        return "neutro"

    def label_sent_clima(label):
        if any(p in label.lower() for p in ("favorable", "tranquil")):
            return "positivo"
        elif any(p in label.lower() for p in ("conflicti", "tensionado", "polarizado")):
            return "negativo"
        return "neutro"

    def label_sent_trust(label):
        if any(p in label.lower() for p in ("alta", "mucha")):
            return "positivo"
        elif any(p in label.lower() for p in ("baja", "poca", "ninguna")):
            return "negativo"
        return "neutro"

    def label_sent_inv(label):
        if any(p in label.lower() for p in ("acepta", "favor", "apoya", "si")):
            return "positivo"
        elif any(p in label.lower() for p in ("rechaza", "opone", "contra", "no")):
            return "negativo"
        return "neutro"

    def label_sent_ingresos(label):
        if any(p in label.lower() for p in ("suficiente", "bueno", "alto")):
            return "positivo"
        elif any(p in label.lower() for p in ("insuficiente", "bajo", "precario")):
            return "negativo"
        return "neutro"

    return {
        "total_encuestas": n,
        "encuestas_clasificadas": n_class,
        "probabilidades_globales": {
            "Aceptacion": prob_acept, "Neutral": prob_neu, "Rechazo": prob_rech
        },
        "prediccion_global": "Aceptacion" if clases['Aceptacion'] >= clases['Rechazo'] else "Rechazo",
        "sectores": sectores,
        "sectores_detalle": sectores_detalle,
        "comunidades": comunidades,
        "genero": genero,
        "edad": edad,
        "educacion": educacion,
        "ocupacion": ocupacion,
        "problemas": problemas,
        "prioridad_social": prioridad_soc,
        "aceptacion_inversion": aceptacion_inv,
        "percepcion_mineria": percepcion_min,
        "clima_politico": clima_pol,
        "confianza_autoridades": confianza_aut,
        "fuente_agua": fuente_agua,
        "internet": internet,
        "ingresos": ingresos,
        "vias": vias,
        "beneficios_mineros": beneficios_dist,
        "riesgos_mineros": riesgos_dist,
        "conocimiento_minero": conocimiento,
        "indice_conocimiento": idx_conocimiento,
        "sentimientos_dimensiones": [
            {"titulo": "Percepcion Minera", "sentimiento": sent_mineria,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"],
                "sentimiento": label_sent_mineria(i["label"])} for i in percepcion_min[:6]]},
             "interpretacion": ""},
            {"titulo": "Clima Politico", "sentimiento": sent_clima,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"],
                "sentimiento": label_sent_clima(i["label"])} for i in clima_pol[:6]]},
             "interpretacion": ""},
            {"titulo": "Confianza Institucional", "sentimiento": sent_trust,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"],
                "sentimiento": label_sent_trust(i["label"])} for i in confianza_aut[:6]]},
             "interpretacion": ""},
            {"titulo": "Apertura a Inversion", "sentimiento": sent_inversion,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"],
                "sentimiento": label_sent_inv(i["label"])} for i in aceptacion_inv[:6]]},
             "interpretacion": ""},
            {"titulo": "Situacion Economica", "sentimiento": sent_ingresos,
             "distribucion": {"items": [{"label": i["label"], "pct": i["pct"],
                "sentimiento": label_sent_ingresos(i["label"])} for i in ingresos[:6]]},
             "interpretacion": ""},
            {"titulo": "Conocimiento Minero", "sentimiento": sent_conocimiento,
             "distribucion": {"items": [{"label": k["pregunta"], "pct": k["si_pct"],
                "sentimiento": "positivo" if k["nivel"] == "Alto" else ("neutro" if k["nivel"] == "Medio" else "negativo")}
                for k in conocimiento]},
             "interpretacion": ""},
        ],
        "sentimiento_global": {
            "positivo_pct": prob_acept,
            "neutro_pct":   prob_neu,
            "negativo_pct": prob_rech,
        },
    }


def build_prompt(stats):
    n      = stats.get("total_encuestas", 0)
    probs  = stats.get("probabilidades_globales", {})
    sects  = stats.get("sectores_detalle", [])
    probs2 = stats.get("problemas", [])[:5]
    bens   = stats.get("beneficios_mineros", [])[:5]
    risks  = stats.get("riesgos_mineros", [])[:5]
    know   = stats.get("conocimiento_minero", [])
    idx_k  = stats.get("indice_conocimiento", 0)
    s_dims = stats.get("sentimientos_dimensiones", [])

    s_txt = "\n".join(
        "  - " + s['sector'] + ": " + str(s['n']) + " encuestas | Aceptacion " +
        str(s['aceptacion_pct']) + "% | Rechazo " + str(s['rechazo_pct']) + "%"
        for s in sects[:8]
    )
    p_txt  = ", ".join(p['label'] for p in probs2)
    b_txt  = ", ".join(b['label'] for b in bens)
    r_txt  = ", ".join(r['label'] for r in risks)
    k_txt  = " | ".join(k['pregunta'] + ": " + k['nivel'] + " (" + str(k['si_pct']) + "%)" for k in know)
    d_txt  = "\n".join(
        "  - " + d['titulo'] + ": indice=" + str(d['sentimiento']['indice']) +
        ", +" + str(d['sentimiento']['positivo_pct']) + "% / =" +
        str(d['sentimiento']['neutro_pct']) + "% / -" + str(d['sentimiento']['negativo_pct']) + "%"
        for d in s_dims
    )

    pa = str(probs.get('Aceptacion', 0))
    pn = str(probs.get('Neutral', 0))
    pr = str(probs.get('Rechazo', 0))

    prompt = (
        "Eres un analista experto en sociologia, mineria sostenible y desarrollo comunitario para Ecuador.\n"
        "Analiza estos datos estadisticos reales de " + str(n) + " encuestas parroquiales de San Bartolome:\n\n"
        "DISTRIBUCION GLOBAL:\n"
        "- Aceptacion reapertura minera: " + pa + "%\n"
        "- Neutral: " + pn + "%\n"
        "- Rechazo: " + pr + "%\n\n"
        "POR SECTOR/ZONA:\n" + s_txt + "\n\n"
        "INDICE DE CONOCIMIENTO MINERO: " + str(idx_k) + "% (promedio)\n" + k_txt + "\n\n"
        "PROBLEMAS PRINCIPALES: " + p_txt + "\n"
        "BENEFICIOS PERCIBIDOS: " + b_txt + "\n"
        "RIESGOS PERCIBIDOS: " + r_txt + "\n\n"
        "SENTIMIENTOS POR DIMENSION (indice -100 a +100):\n" + d_txt + "\n\n"
        "Responde ESTRICTAMENTE con un objeto JSON valido (sin markdown, sin texto fuera del JSON).\n\n"
        'Estructura exacta requerida:\n'
        '{\n'
        '  "ok": true,\n'
        '  "resumen_ejecutivo": "Resumen analitico de 3-4 lineas con hallazgos clave.",\n'
        '  "prediccion_global": "' + ("Aceptacion" if float(pa) >= float(pr) else "Rechazo") + '",\n'
        '  "probabilidades_globales": {"Aceptacion": ' + pa + ', "Neutral": ' + pn + ', "Rechazo": ' + pr + '},\n'
        '  "sentimiento_global": {"positivo_pct": ' + pa + ', "neutro_pct": ' + pn + ', "negativo_pct": ' + pr + '},\n'
        '  "importancia_factores": [\n'
        '    {"factor": "Factor critico 1 identificado en los datos", "score_pct": 85},\n'
        '    {"factor": "Factor critico 2", "score_pct": 70},\n'
        '    {"factor": "Factor critico 3", "score_pct": 55},\n'
        '    {"factor": "Factor critico 4", "score_pct": 40},\n'
        '    {"factor": "Factor critico 5", "score_pct": 30}\n'
        '  ],\n'
        '  "dimensiones": [\n'
        '    {"titulo": "Percepcion Minera", "sentimiento": {"indice": 0, "positivo_pct": 0, "neutro_pct": 0, "negativo_pct": 0},\n'
        '     "distribucion": {"items": [{"label": "ejemplo", "pct": 50, "sentimiento": "positivo"}]},\n'
        '     "interpretacion": "Interpretacion detallada de esta dimension para San Bartolome."},\n'
        '    {"titulo": "Clima Politico", "sentimiento": {"indice": 0, "positivo_pct": 0, "neutro_pct": 0, "negativo_pct": 0},\n'
        '     "distribucion": {"items": []}, "interpretacion": "..."},\n'
        '    {"titulo": "Confianza Institucional", "sentimiento": {"indice": 0, "positivo_pct": 0, "neutro_pct": 0, "negativo_pct": 0},\n'
        '     "distribucion": {"items": []}, "interpretacion": "..."},\n'
        '    {"titulo": "Apertura a Inversion", "sentimiento": {"indice": 0, "positivo_pct": 0, "neutro_pct": 0, "negativo_pct": 0},\n'
        '     "distribucion": {"items": []}, "interpretacion": "..."},\n'
        '    {"titulo": "Situacion Economica", "sentimiento": {"indice": 0, "positivo_pct": 0, "neutro_pct": 0, "negativo_pct": 0},\n'
        '     "distribucion": {"items": []}, "interpretacion": "..."},\n'
        '    {"titulo": "Conocimiento Minero", "sentimiento": {"indice": 0, "positivo_pct": 0, "neutro_pct": 0, "negativo_pct": 0},\n'
        '     "distribucion": {"items": []}, "interpretacion": "..."}\n'
        '  ],\n'
        '  "analisis_por_zona": [\n'
        '    {"zona": "NombreZona", "n": 0, "prediccion": "Aceptacion",\n'
        '     "aceptacion_pct": 0, "rechazo_pct": 0, "neutral_pct": 0,\n'
        '     "hallazgo_clave": "Hallazgo especifico para esta zona."}\n'
        '  ],\n'
        '  "recomendaciones_ia": [\n'
        '    "Recomendacion concreta 1 con datos especificos.",\n'
        '    "Recomendacion 2.", "Recomendacion 3.", "Recomendacion 4.", "Recomendacion 5."\n'
        '  ],\n'
        '  "plan_estrategico": {\n'
        '    "titulo": "Plan Integral de Gestion Social - San Bartolome",\n'
        '    "diagnostico_contextual": "Diagnostico de 3-4 lineas basado en los datos reales.",\n'
        '    "fases": [\n'
        '      {"fase": "Fase 0 - Preparacion", "periodo": "Mes 1", "acciones": ["Accion 1", "Accion 2"]},\n'
        '      {"fase": "Fase 1 - Corto Plazo", "periodo": "Meses 1-3", "acciones": ["Accion 1", "Accion 2"]},\n'
        '      {"fase": "Fase 2 - Mediano Plazo", "periodo": "Meses 3-6", "acciones": ["Accion 1", "Accion 2"]},\n'
        '      {"fase": "Fase 3 - Largo Plazo", "periodo": "Meses 6-12+", "acciones": ["Accion 1", "Accion 2"]}\n'
        '    ],\n'
        '    "indicadores": [\n'
        '      {"nombre": "Aceptacion comunitaria", "meta": ">=60%", "plazo": "6 meses"},\n'
        '      {"nombre": "Indice conocimiento minero", "meta": ">=70%", "plazo": "3 meses"}\n'
        '    ],\n'
        '    "recomendaciones_finales": [\n'
        '      "Recomendacion estrategica 1.", "Recomendacion 2.", "Recomendacion 3."\n'
        '    ]\n'
        '  },\n'
        '  "conclusion": "Conclusion global de 2-3 lineas con el veredicto final."\n'
        '}'
    )
    return prompt


def _call_via_openai(prompt):
    client = OpenAI(base_url=NVIDIA_BASE_URL, api_key=NVIDIA_API_KEY)
    completion = client.chat.completions.create(
        model=NVIDIA_MODEL,
        messages=[
            {"role": "system", "content": (
                "You are a precise JSON-outputting analytical engine for community mining surveys in Ecuador. "
                "Output only a single valid JSON object parseable with JSON.parse(). "
                "No markdown, no code blocks, no text outside the JSON."
            )},
            {"role": "user", "content": prompt}
        ],
        temperature=1,
        top_p=0.95,
        max_tokens=16384,
        extra_body={
            "chat_template_kwargs": {"enable_thinking": True},
            "reasoning_budget": 16384,
        },
        stream=True,
    )

    content_buf  = []
    thinking_buf = ""

    for chunk in completion:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        reasoning = getattr(delta, "reasoning_content", None)
        if reasoning:
            thinking_buf += reasoning
            if len(thinking_buf) >= 200:
                emit({"type": "thinking", "text": thinking_buf})
                thinking_buf = ""
        if delta.content is not None:
            content_buf.append(delta.content)

    if thinking_buf:
        emit({"type": "thinking", "text": thinking_buf})

    return "".join(content_buf)


def _call_via_urllib(prompt):
    """Fallback con streaming SSE via urllib (sin paquete openai)."""
    import urllib.request
    emit({"type": "thinking", "text": "Conectando con NVIDIA API via urllib+streaming..."})

    req_data = {
        "model": NVIDIA_MODEL,
        "messages": [
            {"role": "system", "content": "You are a precise JSON-outputting engine. Output only a single valid JSON object. No markdown."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "top_p": 0.95,
        "max_tokens": 16384,
        "extra_body": {
            "chat_template_kwargs": {"enable_thinking": True},
            "reasoning_budget": 8192
        },
        "stream": True,
    }
    api_url = NVIDIA_BASE_URL + "/chat/completions"
    req = urllib.request.Request(
        api_url,
        data=json.dumps(req_data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + NVIDIA_API_KEY,
            'Accept': 'text/event-stream',
        }
    )

    content_parts = []
    thinking_buf  = ""

    with urllib.request.urlopen(req, timeout=180) as resp:
        for raw_line in resp:
            line = raw_line.decode('utf-8').strip()
            if not line or not line.startswith('data: '):
                continue
            data_str = line[6:]
            if data_str == '[DONE]':
                break
            try:
                chunk = json.loads(data_str)
            except Exception:
                continue
            choices = chunk.get('choices', [])
            if not choices:
                continue
            delta = choices[0].get('delta', {})
            # reasoning
            reasoning = delta.get('reasoning_content', '')
            if reasoning:
                thinking_buf += reasoning
                if len(thinking_buf) >= 200:
                    emit({"type": "thinking", "text": thinking_buf})
                    thinking_buf = ""
            # content
            txt = delta.get('content', '')
            if txt:
                content_parts.append(txt)

    if thinking_buf:
        emit({"type": "thinking", "text": thinking_buf})

    return "".join(content_parts)


def call_nvidia(prompt):
    if HAS_OPENAI:
        return _call_via_openai(prompt)
    return _call_via_urllib(prompt)


def extract_json(text):
    start = text.find('{')
    if start == -1:
        raise ValueError("No se encontro JSON en la respuesta. Inicio: " + text[:300])
    
    end = text.rfind('}')
    while end > start:
        candidate = text[start:end+1]
        try:
            import json
            parsed = json.loads(candidate)
            return candidate, parsed
        except Exception as e:
            end = text.rfind('}', start, end)
            
    raise ValueError("JSON incompleto o invalido en la respuesta.")


def main():
    stats_only = '--stats-only' in sys.argv

    try:
        raw = sys.stdin.read()
        if not raw.strip():
            emit({"type": "error", "error": "No se recibieron datos de entrada."})
            return
        rows = json.loads(raw)
    except Exception as e:
        emit({"type": "error", "error": "Error parseando JSON de entrada: " + str(e)})
        return

    if not rows:
        emit({"type": "error", "error": "La base de datos no tiene encuestas para analizar."})
        return

    sectores_list = sorted(list(set((r.get('sector') or 'general').strip() for r in rows)))
    total = len(rows)
    emit({
        "type": "progress",
        "mensaje": "Cargando " + str(total) + " encuestas de " + str(len(sectores_list)) + " zona(s)...",
        "zonas": sectores_list,
        "total": total,
        "procesadas": total,
    })

    emit({"type": "progress", "mensaje": "Calculando estadisticas de todas las zonas...",
          "total": total, "procesadas": total})
    try:
        stats = analyze_statistics(rows)
    except Exception as e:
        emit({"type": "error", "error": "Error en analisis estadistico: " + str(e)})
        return

    emit({"type": "stats", "stats": stats})

    # Si solo se pidieron estadísticas locales, terminar aquí
    if stats_only:
        return

    mode = "(openai+streaming+reasoning)" if HAS_OPENAI else "(urllib)"
    emit({"type": "progress",
          "mensaje": "Enviando datos a NVIDIA Nemotron-3-Super-120B " + mode + "...",
          "total": total, "procesadas": total})

    prompt = build_prompt(stats)
    try:
        content = call_nvidia(prompt)
    except Exception as e:
        emit({"type": "error", "error": "Error en NVIDIA API: " + str(e)})
        return

    try:
        json_str, result = extract_json(content)
    except Exception as e:
        emit({"type": "error",
              "error": "Error parseando respuesta LLM: " + str(e) + ". Raw (500 chars): " + content[:500]})
        return

    result["ok"]              = True
    result["motor"]           = "NVIDIA Nemotron-3-Super-120B"
    result["total_encuestas"] = total
    result["stats_locales"]   = stats

    if not result.get("dimensiones"):
        result["dimensiones"] = stats.get("sentimientos_dimensiones", [])
    else:
        llm_dims   = result["dimensiones"]
        local_dims = stats.get("sentimientos_dimensiones", [])
        for llm_d in llm_dims:
            for loc_d in local_dims:
                if llm_d.get("titulo", "")[:8].lower() == loc_d.get("titulo", "")[:8].lower():
                    if not llm_d.get("distribucion", {}).get("items"):
                        llm_d["distribucion"] = loc_d["distribucion"]
                    s = llm_d.get("sentimiento", {})
                    if s.get("indice", 0) == 0 and s.get("positivo_pct", 0) == 0:
                        llm_d["sentimiento"] = loc_d["sentimiento"]
                    break

    if not result.get("analisis_por_zona"):
        result["analisis_por_zona"] = [
            {"zona": s["sector"], "n": s["n"],
             "prediccion": "Aceptacion" if s["aceptacion_pct"] >= s["rechazo_pct"] else "Rechazo",
             "aceptacion_pct": s["aceptacion_pct"],
             "neutral_pct":    s["neutral_pct"],
             "rechazo_pct":    s["rechazo_pct"],
             "hallazgo_clave": ""}
            for s in stats.get("sectores_detalle", [])
        ]

    emit({"type": "result", **result})


if __name__ == "__main__":
    main()
