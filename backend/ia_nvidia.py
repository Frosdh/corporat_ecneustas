import sys
import json
import re
import urllib.request
import urllib.error

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"ok": False, "error": "No input data"}))
            return
        
        encuestas = json.loads(input_data)
        if not encuestas:
            print(json.dumps({"ok": False, "error": "Data is empty"}))
            return
            
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"Error parsing input: {str(e)}"}))
        return

    n_encuestas = len(encuestas)
    
    # Agregar las encuestas para reducir DRASTICAMENTE el tamaño del prompt
    # Esto permite procesar el 100% de la base de datos sin timeout del servidor.
    problemas_count = {}
    inversion_count = {}
    mineria_count = {}
    sectores_count = {}
    social_count = {}

    for e in encuestas:
        # Sectores
        sec = e.get("sector", "Desconocido")
        sectores_count[sec] = sectores_count.get(sec, 0) + 1
        # Problemas
        p = e.get("primary_problem", "No definido")
        problemas_count[p] = problemas_count.get(p, 0) + 1
        # Inversion
        i = e.get("investment_acceptance", "No definido")
        inversion_count[i] = inversion_count.get(i, 0) + 1
        # Mineria
        m = e.get("mine_reopening_perception", "No definido")
        mineria_count[m] = mineria_count.get(m, 0) + 1
        # Social
        soc = e.get("social_priority", "No definido")
        social_count[soc] = social_count.get(soc, 0) + 1

    datos_agregados = {
        "total_encuestas_analizadas": n_encuestas,
        "zonas_analizadas": sectores_count,
        "distribucion_problemas_principales": problemas_count,
        "distribucion_prioridad_social": social_count,
        "distribucion_aceptacion_inversion": inversion_count,
        "distribucion_percepcion_mineria": mineria_count
    }

    prompt = f"""
    Eres un analista experto en sociología y minería, capaz de aprender y mejorar continuamente tus consejos.
    Se han recopilado y agregado matemáticamente {n_encuestas} encuestas (el 100% de la base de datos solicitada).
    A continuación se presentan las estadísticas consolidadas exactas:
    {json.dumps(datos_agregados, ensure_ascii=False)}
    
    Analiza detalladamente estas estadísticas. Tu objetivo es generar soluciones automáticas de minería, proponer planes estratégicos y generar las dimensiones de sentimiento.
    Responde ESTRICTAMENTE con un objeto JSON válido. NO incluyas markdown.
    El JSON debe tener EXACTAMENTE esta estructura:
    {{
        "ok": true,
        "resumen_ejecutivo": "Un resumen analítico de 2 lineas sobre la aceptación y preocupaciones globales.",
        "prediccion_global": "Aceptacion",
        "probabilidades_globales": {{"Aceptacion": 40.5, "Neutral": 20.0, "Rechazo": 39.5}},
        "sentimiento_global": {{"positivo_pct": 40.5, "neutro_pct": 20.0, "negativo_pct": 39.5}},
        "importancia_factores": [
            {{"factor": "Nombre del factor (ej. Temor Ambiental)", "score_pct": 85}}
        ],
        "dimensiones": [
            {{
                "titulo": "Dimensión Analizada (ej. Impacto Ambiental)",
                "sentimiento": {{"indice": -20, "positivo_pct": 20, "neutro_pct": 30, "negativo_pct": 50}},
                "distribucion": {{"items": [
                    {{"label": "Sub-factor (ej. Contaminación del agua)", "pct": 70, "sentimiento": "negativo"}},
                    {{"label": "Sub-factor (ej. Reforestación)", "pct": 30, "sentimiento": "positivo"}}
                ]}},
                "interpretacion": "Breve interpretación de esta dimensión"
            }}
        ],
        "recomendaciones_ia": [
            "Recomendacion accionable 1", "Recomendacion accionable 2", "Recomendacion 3"
        ],
        "plan_estrategico": {{
            "titulo": "Plan de Gestión Social",
            "diagnostico_contextual": "Diagnóstico inicial basado en los datos...",
            "recomendaciones_finales": ["Acción 1", "Acción 2"]
        }}
    }}
    """

    api_url = "https://integrate.api.nvidia.com/v1/chat/completions"
    api_key = "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"

    req_data = {
        "model": "nvidia/nemotron-3-super-120b-a12b",
        "messages": [
            {"role": "system", "content": "You are a precise JSON-outputting analytical engine. Your output must parse perfectly with JSON.parse() and contain no other text."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.5,
        "top_p": 0.90,
        "max_tokens": 2048
    }

    req = urllib.request.Request(api_url, json.dumps(req_data).encode('utf-8'))
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {api_key}')

    try:
        with urllib.request.urlopen(req) as response:
            result_body = response.read().decode('utf-8')
            
            try:
                result_json = json.loads(result_body)
            except json.JSONDecodeError:
                raise ValueError(f"La API de NVIDIA no devolvio JSON. Raw: {result_body[:200]}")

            # Obtener solo el contenido final
            if "choices" not in result_json or not result_json["choices"]:
                raise ValueError(f"Respuesta inesperada de NVIDIA sin 'choices': {result_body[:200]}")
                
            final_content = result_json["choices"][0]["message"].get("content", "")

            # Extraer JSON buscando el primer '{' y el último '}'
            json_str = final_content.strip()
            start = json_str.find('{')
            end = json_str.rfind('}')
            
            if start != -1 and end != -1:
                json_str = json_str[start:end+1]
            else:
                raise ValueError(f"No se encontro JSON en la respuesta del modelo. Texto crudo: {final_content[:200]}")

            # Parsear para verificar que sea valido
            try:
                parsed = json.loads(json_str)
                parsed["motor"] = "NVIDIA Nemotron-3-Super-120B"
                print(json.dumps(parsed))
            except json.JSONDecodeError as je:
                raise ValueError(f"El modelo genero JSON invalido. Raw JSON: {json_str[:200]}... Error: {str(je)}")

    except Exception as e:
        err_msg = str(e)
        if isinstance(e, urllib.error.HTTPError):
            try:
                err_msg += " - " + e.read().decode('utf-8')
            except:
                pass
        print(json.dumps({"ok": False, "error": f"NVIDIA API Error: {err_msg}"}))

if __name__ == "__main__":
    main()
