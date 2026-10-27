#!/usr/bin/env bash
# Sobe o SupoClip 100% local (Whisper + Ollama, sem APIs pagas) com Docker.
#
#   ./setup.sh                 # máquina com internet normal
#   SANDBOX=1 ./setup.sh       # rede restrita (sessão cloud do Claude Code)
#
# Variáveis opcionais:
#   SUPOCLIP_DIR         onde clonar (padrão: ~/supoclip)
#   SUPOCLIP_MODELS_DIR  modelos pré-baixados no modo SANDBOX (padrão: ~/supoclip-models)
#   REBUILD=1            no modo SANDBOX, reconstrói a imagem do backend mesmo se já existir
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPOCLIP_DIR="${SUPOCLIP_DIR:-$HOME/supoclip}"
SANDBOX="${SANDBOX:-0}"
OLLAMA_MODEL="qwen3:4b-instruct-2507-q4_K_M"

if [ ! -d "$SUPOCLIP_DIR/.git" ]; then
  git clone https://github.com/FujiwaraChoki/supoclip "$SUPOCLIP_DIR"
fi
cd "$SUPOCLIP_DIR"

cp "$KIT_DIR/docker-compose.local.yml" .

# Timeouts de IA configuráveis por variável de ambiente (padrões inalterados).
PATCH="$KIT_DIR/patches/llm-timeouts.patch"
if git apply --check "$PATCH" 2>/dev/null; then
  git apply "$PATCH"
elif ! git apply --reverse --check "$PATCH" 2>/dev/null; then
  echo "Aviso: patches/llm-timeouts.patch não se aplica a esta versão do SupoClip;" >&2
  echo "       análises com LLM em CPU podem estourar o limite de 600 s." >&2
fi
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.local.yml)

if [ "$SANDBOX" = "1" ]; then
  export SUPOCLIP_MODELS_DIR="${SUPOCLIP_MODELS_DIR:-$HOME/supoclip-models}"
  mkdir -p local-sandbox
  cp "$KIT_DIR/docker-compose.sandbox.yml" .
  cp "$KIT_DIR"/sandbox/*.Dockerfile local-sandbox/
  python3 -I "$KIT_DIR/sandbox/fetch-models.py" "$SUPOCLIP_MODELS_DIR" whisper
  COMPOSE+=(-f docker-compose.sandbox.yml)
fi

# .env = .env.example + env.local + segredos aleatórios. Num .env já existente,
# só acrescenta as chaves do env.local que faltarem.
FRESH_ENV=0
if [ ! -f .env ]; then
  cp .env.example .env
  FRESH_ENV=1
fi
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  if ! grep -q "^${key}=" .env; then
    echo "$line" >> .env
  elif [ "$FRESH_ENV" = "1" ]; then
    awk -v k="$key" -v l="$line" 'index($0, k"=")==1 {print l; next} {print}' .env > .env.tmp && mv .env.tmp .env
  fi
done < "$KIT_DIR/env.local"
if [ "$FRESH_ENV" = "1" ]; then
  for key in BETTER_AUTH_SECRET BACKEND_AUTH_SECRET APP_SETTINGS_ENCRYPTION_KEY; do
    value="$(openssl rand -hex 32)"
    awk -v k="$key" -v v="$value" 'index($0, k"=")==1 {print k"="v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  done
  if [ "$SANDBOX" = "1" ]; then
    # No modo sandbox o torch vem do PyPI (o índice CPU do PyTorch é bloqueado).
    sed -i 's/^BACKEND_CPU_ONLY=.*/BACKEND_CPU_ONLY=false/' .env
    echo "SUPOCLIP_MODELS_DIR=$SUPOCLIP_MODELS_DIR" >> .env
  fi
fi

# Ollama primeiro, para preparar o modelo antes do backend.
"${COMPOSE[@]}" up -d ollama
until "${COMPOSE[@]}" exec -T ollama ollama list >/dev/null 2>&1; do sleep 2; done
if ! "${COMPOSE[@]}" exec -T ollama ollama list | grep -q "^${OLLAMA_MODEL}"; then
  if [ "$SANDBOX" = "1" ]; then
    # O GGUF só é necessário até o "ollama create", que copia o arquivo para o volume.
    python3 -I "$KIT_DIR/sandbox/fetch-models.py" "$SUPOCLIP_MODELS_DIR" llm
    "${COMPOSE[@]}" exec -T ollama sh -c \
      "printf 'FROM /models/qwen3-4b-instruct-2507-q4_K_M.gguf\n' > /tmp/Modelfile && ollama create '$OLLAMA_MODEL' -f /tmp/Modelfile"
    rm -f "$SUPOCLIP_MODELS_DIR/ollama/qwen3-4b-instruct-2507-q4_K_M.gguf"
  else
    "${COMPOSE[@]}" exec -T ollama ollama pull "$OLLAMA_MODEL"
  fi
fi

if [ "$SANDBOX" = "1" ] && { [ "${REBUILD:-0}" = "1" ] || [ -z "$(docker images -q supoclip-backend-sandbox)" ]; }; then
  docker buildx build --allow network.host --network host \
    --build-context ccr="${PROXY_CA_DIR:-/root/.ccr}" \
    --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" \
    -f local-sandbox/backend.Dockerfile -t supoclip-backend-sandbox --load backend
  # O cache do build duplica o venv (~7 GB); a cota de disco não comporta os dois.
  docker builder prune -af >/dev/null
fi
"${COMPOSE[@]}" up -d --build frontend backend worker
if [ "$SANDBOX" = "1" ]; then docker builder prune -af >/dev/null; fi

echo "Aguardando http://localhost:3107 ..."
until curl -sf -o /dev/null http://localhost:3107; do sleep 5; done
echo "SupoClip no ar: http://localhost:3107  (API: http://localhost:8000/docs)"
