#!/usr/bin/env bash
# Confere se o SupoClip local está no ar e usando Whisper + Ollama.
#
#   ./check.sh          # serviços, HTTP, configuração e conexão worker -> Ollama
#   ./check.sh --llm    # também mede uma chamada curta ao modelo (tool-calling)
#
# SUPOCLIP_DIR aponta para o clone (padrão: ~/supoclip). Sai com 1 se algo falhar.
set -uo pipefail

SUPOCLIP_DIR="${SUPOCLIP_DIR:-$HOME/supoclip}"
FAILS=0
ok()   { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo "❌ $*"; FAILS=$((FAILS + 1)); }
env_value() { grep "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2-; }

cd "$SUPOCLIP_DIR" 2>/dev/null || { fail "clone não encontrado em $SUPOCLIP_DIR"; exit 1; }
[ -f .env ] || { fail "$SUPOCLIP_DIR/.env não existe; rode setup.sh antes"; exit 1; }

# Docker
if ! docker info >/dev/null 2>&1; then
  fail "Docker não está rodando (abra o Docker Desktop)"
  exit 1
fi
mem_gib=$(( $(docker info --format '{{.MemTotal}}') / 1073741824 ))
if [ "$mem_gib" -lt 6 ]; then
  warn "Docker com ${mem_gib} GiB de memória; recomendado 8 GiB+ (Docker Desktop > Settings > Resources)"
else
  ok "Docker rodando (${mem_gib} GiB de memória)"
fi

# Containers
for svc in postgres redis backend worker frontend; do
  status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "supoclip-$svc" 2>/dev/null || echo ausente)
  case "$status" in
    healthy) ok "supoclip-$svc: healthy" ;;
    starting) warn "supoclip-$svc: ainda iniciando; rode de novo em 1 minuto" ;;
    *) fail "supoclip-$svc: $status" ;;
  esac
done

# Ollama: container (COMPOSE_PROFILES=ollama) ou app nativo do host
case ",$(env_value COMPOSE_PROFILES)," in
  *,ollama,*)
    status=$(docker inspect -f '{{.State.Health.Status}}' supoclip-ollama 2>/dev/null || echo ausente)
    if [ "$status" = "healthy" ]; then ok "Ollama em container: healthy (só CPU)"; else fail "supoclip-ollama: $status"; fi
    ;;
  *)
    version=$(curl -sf -m 5 http://localhost:11434/api/version | sed 's/.*"version":"\([^"]*\)".*/\1/')
    if [ -n "$version" ]; then ok "Ollama nativo no host: versão $version"; else fail "Ollama nativo não responde em localhost:11434 (abra o app do Ollama)"; fi
    ;;
esac

# Arquitetura da imagem do backend (no Apple Silicon deve ser arm64, sem emulação)
host_arch=$(uname -m); [ "$host_arch" = "x86_64" ] && host_arch=amd64; [ "$host_arch" = "aarch64" ] && host_arch=arm64
image_arch=$(docker image inspect -f '{{.Architecture}}' "$(docker inspect -f '{{.Image}}' supoclip-backend 2>/dev/null)" 2>/dev/null || echo "?")
if [ "$image_arch" = "$host_arch" ]; then ok "backend nativo ($image_arch)"; else warn "backend em $image_arch num host $host_arch: roda emulado e lento"; fi

# HTTP
code=$(curl -s -o /dev/null -w '%{http_code}' -m 30 http://localhost:3107 || true)
if [ "$code" = "200" ]; then ok "frontend http://localhost:3107 -> 200"; else fail "frontend http://localhost:3107 -> ${code:-sem resposta}"; fi
if curl -sf -m 10 http://localhost:8000/health/db | grep -q connected; then ok "backend http://localhost:8000 -> banco conectado"; else fail "backend http://localhost:8000/health/db sem resposta"; fi

# Configuração vista pelo worker e conexão worker -> Ollama
LLM_TEST=0; [ "${1:-}" = "--llm" ] && LLM_TEST=1
PROBE="$(mktemp)"
cat > "$PROBE" <<'EOF'
import os, time, httpx
from src.config import get_config

def out(level, msg):
    print(f"CHECK|{level}|{msg}", flush=True)

c = get_config()
provider = c.transcription_provider
out("ok" if provider == "whisper" else "fail", f"transcrição: {provider} (modelo {c.whisper_model}, idioma {c.transcription_language or 'auto'})")
weights = os.path.expanduser(f"~/.cache/whisper/{c.whisper_model}.pt")
out("ok" if os.path.exists(weights) else "warn", "pesos do Whisper " + ("já baixados" if os.path.exists(weights) else "serão baixados no primeiro vídeo"))

base = c.resolve_ollama_base_url()
name = c.llm.split(":", 1)[1] if c.llm.startswith("ollama:") else ""
out("ok" if name else "fail", f"LLM: {c.llm} via {base}")
try:
    ids = [m["id"] for m in httpx.get(base + "/models", timeout=10).json()["data"]]
    found = name in ids or f"{name}:latest" in ids
    out("ok" if found else "fail", f"worker alcança o Ollama; modelo {name} " + ("disponível" if found else f"AUSENTE (há: {', '.join(ids) or 'nenhum'})"))
except Exception as e:
    out("fail", f"worker não alcança o Ollama em {base}: {type(e).__name__}")
    raise SystemExit

if os.environ.get("LLM_TEST") == "1":
    body = {
        "model": name,
        "messages": [{"role": "user", "content": "Trecho [00:00 - 00:30]: o segredo para vender mais é responder rápido. Escolha o melhor trecho."}],
        "tools": [{"type": "function", "function": {"name": "final_result", "parameters": {"type": "object", "properties": {"start": {"type": "string"}, "end": {"type": "string"}, "reason": {"type": "string"}}, "required": ["start", "end", "reason"]}}}],
        "tool_choice": "required",
    }
    t = time.time()
    r = httpx.post(base + "/chat/completions", json=body, timeout=900).json()
    secs = time.time() - t
    calls = r["choices"][0]["message"].get("tool_calls") or []
    tokens = r.get("usage", {}).get("completion_tokens", 0)
    out("ok" if calls else "fail", f"tool-calling: {'OK' if calls else 'sem tool_call'} em {secs:.0f}s ({tokens} tokens, inclui carregar o modelo)")
EOF
worker_out=$(docker exec -i -e LLM_TEST="$LLM_TEST" supoclip-worker .venv/bin/python - < "$PROBE" 2>/dev/null | grep '^CHECK|' | cut -d'|' -f2-)
rm -f "$PROBE"
if [ -z "$worker_out" ]; then
  fail "não deu para consultar a configuração dentro do worker"
else
  while IFS='|' read -r level msg; do
    case "$level" in ok) ok "$msg" ;; warn) warn "$msg" ;; *) fail "$msg" ;; esac
  done <<< "$worker_out"
fi

if [ "$FAILS" -eq 0 ]; then echo; echo "Tudo certo: http://localhost:3107"; else echo; echo "$FAILS verificação(ões) falharam."; fi
[ "$FAILS" -eq 0 ]
