"""Tiny Gemma 4 client (standard library only).

Providers
  ollama  -> local Gemma 4 via Ollama (default, works offline)   GEMMA_MODEL default: gemma4:e4b
  google  -> Gemma 4 on Google AI Studio (needs GOOGLE_API_KEY)  GEMMA_MODEL default: gemma-4-31b-it
  none    -> Gemma switched off, every feature uses its rule-based fallback

Every caller MUST handle GemmaError and fall back to deterministic logic,
so the app keeps working when the model is slow, offline or returns junk.
"""
import json
import os
import re
import urllib.request

PROVIDER = os.environ.get("GEMMA_PROVIDER", "ollama").lower()
MODEL = os.environ.get("GEMMA_MODEL", "gemma4:e4b" if PROVIDER == "ollama" else "gemma-4-31b-it")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
GOOGLE_KEY = os.environ.get("GOOGLE_API_KEY", "")
TIMEOUT = float(os.environ.get("GEMMA_TIMEOUT", "30"))


class GemmaError(Exception):
    pass


def enabled():
    return PROVIDER in ("ollama", "google")


def label():
    return f"gemma ({MODEL})" if enabled() else "rules (Gemma off)"


def _post(url, payload, headers=None):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode())


def generate(prompt, want_json=True, temperature=0.2):
    """Send one prompt to Gemma 4 and return the text."""
    try:
        if PROVIDER == "ollama":
            body = {"model": MODEL, "stream": False,
                    "messages": [{"role": "user", "content": prompt}],
                    "options": {"temperature": temperature}}
            if want_json:
                body["format"] = "json"
            return _post(f"{OLLAMA_URL}/api/chat", body)["message"]["content"]
        if PROVIDER == "google":
            if not GOOGLE_KEY:
                raise GemmaError("GOOGLE_API_KEY not set")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
            body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": temperature}}
            res = _post(url, body, {"x-goog-api-key": GOOGLE_KEY})
            return res["candidates"][0]["content"]["parts"][0]["text"]
    except GemmaError:
        raise
    except Exception as e:  # network, HTTP error, unexpected shape
        raise GemmaError(f"{type(e).__name__}: {e}") from e
    raise GemmaError("Gemma disabled (GEMMA_PROVIDER=none)")


def generate_json(prompt, temperature=0.2):
    text = generate(prompt, want_json=True, temperature=temperature)
    m = re.search(r"[\{\[].*[\}\]]", text, re.S)
    if not m:
        raise GemmaError("no JSON in model output")
    try:
        return json.loads(m.group(0))
    except ValueError as e:
        raise GemmaError(f"bad JSON from model: {e}") from e


def ping():
    """Quick health check used by /api/ai/status."""
    if not enabled():
        return {"provider": PROVIDER, "model": None, "reachable": False}
    try:
        if PROVIDER == "ollama":
            with urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=3) as r:
                tags = [m["name"] for m in json.loads(r.read().decode()).get("models", [])]
            return {"provider": PROVIDER, "model": MODEL, "reachable": True,
                    "model_installed": any(t == MODEL or t.startswith(MODEL + ":") or MODEL.startswith(t) for t in tags)}
        return {"provider": PROVIDER, "model": MODEL, "reachable": bool(GOOGLE_KEY)}
    except Exception as e:
        return {"provider": PROVIDER, "model": MODEL, "reachable": False, "error": str(e)}
