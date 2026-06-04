import json

def extract_json(text):
    start = text.find('{')
    if start == -1:
        raise ValueError("No se encontro JSON")
    
    end = text.rfind('}')
    while end > start:
        candidate = text[start:end+1]
        try:
            json.loads(candidate)
            return candidate
        except ValueError as e:
            end = text.rfind('}', start, end)
            
    raise ValueError("JSON incompleto o invalido")

text = '{"ok": true}   \n   {"b": 2}'
print("candidate:", repr(extract_json(text)))
