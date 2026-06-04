import sys
import json
import re
from openai import OpenAI

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
    
    prompt = f"""
    Eres un analista experto en sociología y minería. Se han recopilado {n_encuestas} encuestas en una comunidad sobre un proyecto minero.
    A continuación se presentan los datos:
    {json.dumps(encuestas[:150], ensure_ascii=False)}
    
    Realiza un análisis completo y estructurado basado en los datos proporcionados.
    Responde ESTRICTAMENTE con un objeto JSON válido. NO incluyas markdown, explicaciones previas ni texto fuera del JSON.
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

    client = OpenAI(
      base_url = "https://integrate.api.nvidia.com/v1",
      api_key = "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"
    )

    try:
        completion = client.chat.completions.create(
          model="nvidia/nemotron-3-super-120b-a12b",
          messages=[
              {"role": "system", "content": "You are a precise JSON-outputting analytical engine. Your output must parse perfectly with JSON.parse() and contain no other text."},
              {"role": "user", "content": prompt}
          ],
          temperature=0.7,
          top_p=0.95,
          max_tokens=8192,
          extra_body={"chat_template_kwargs":{"enable_thinking":True},"reasoning_budget":4096},
          stream=True
        )

        final_content = ""
        for chunk in completion:
            if not chunk.choices:
                continue
            # Ignoramos el razonamiento interno, solo acumulamos el contenido final
            if chunk.choices[0].delta.content is not None:
                final_content += chunk.choices[0].delta.content

        # Extraer JSON de la respuesta (por si el LLM pone ```json ... ```)
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", final_content, re.DOTALL | re.IGNORECASE)
        if match:
            json_str = match.group(1)
        else:
            json_str = final_content.strip()

        # Parsear para verificar que sea valido
        parsed = json.loads(json_str)
        parsed["motor"] = "NVIDIA Nemotron-3-Super-120B"
        print(json.dumps(parsed, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"ok": False, "error": f"NVIDIA API Error: {str(e)}", "raw": final_content if 'final_content' in locals() else ""}))

if __name__ == "__main__":
    main()
