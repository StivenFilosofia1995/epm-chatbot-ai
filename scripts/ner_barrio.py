import sys, json
from difflib import get_close_matches


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        print(json.dumps({"found": False}))
        return

    texto = payload.get("text", "").lower().strip()
    import unicodedata

    def norm(s):
        return unicodedata.normalize("NFD", s) \
            .encode("ascii", "ignore").decode("ascii").lower().strip()

    texto_norm = norm(texto)
    barrios = payload.get("barrios", {})

    if not barrios:
        print(json.dumps({"found": False}))
        return

    for barrio, uva in barrios.items():
        if norm(barrio) in texto_norm:
            print(json.dumps({
                "found": True,
                "barrio": barrio,
                "uva": uva,
                "score": 1.0,
                "method": "exact"
            }))
            return

    palabras_texto = texto_norm.split()
    claves_norm = {norm(k): (k, v) for k, v in barrios.items()}

    mejor_score = 0.0
    mejor_barrio = None
    mejor_uva = None

    for palabra in palabras_texto:
        matches = get_close_matches(palabra, claves_norm.keys(), n=1, cutoff=0.80)
        if matches:
            clave_norm = matches[0]
            k_orig, uva_orig = claves_norm[clave_norm]
            from difflib import SequenceMatcher
            score = SequenceMatcher(None, palabra, clave_norm).ratio()
            if score > mejor_score:
                mejor_score = score
                mejor_barrio = k_orig
                mejor_uva = uva_orig

    if mejor_score >= 0.80:
        print(json.dumps({
            "found": True,
            "barrio": mejor_barrio,
            "uva": mejor_uva,
            "score": round(mejor_score, 3),
            "method": "fuzzy"
        }))
    else:
        print(json.dumps({"found": False}))


if __name__ == "__main__":
    main()
