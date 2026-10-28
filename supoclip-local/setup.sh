#!/usr/bin/env bash
# Sobe o SupoClip 100% local (Whisper + Ollama, sem APIs pagas) com Docker.
#
#   ./setup.sh                 # macOS ou Linux com internet normal
#   SANDBOX=1 ./setup.sh       # rede restrita (sessão cloud do Claude Code)
#
# Variáveis opcionais:
#   SUPOCLIP_DIR         onde clonar (padrão: ~/supoclip)
#   OLLAMA_MODE          native (Ollama do host) ou docker (container). Padrão: native
#                        quando há um Ollama respondendo em localhost:11434 (no Mac,
#                        o app é aberto se estiver instalado), senão docker.
#   SUPOCLIP_MODELS_DIR  modelos pré-baixados no modo SANDBOX (padrão: ~/supoclip-models)
#   REBUILD=1            no modo SANDBOX, reconstrói a imagem do backend mesmo se já existir
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPOCLIP_DIR="${SUPOCLIP_DIR:-$HOME/supoclip}"
SANDBOX="${SANDBOX:-0}"
OLLAMA_MODEL="qwen3:4b-instruct-2507-q4_K_M"
# No modo nativo, um apelido do modelo com contexto de 16k, sem depender da
# configuração de contexto do app do Ollama (o padrão de 4096 corta transcrições).
NATIVE_MODEL_ALIAS="supoclip-qwen3"
OS="$(uname -s)"
ARCH="$(uname -m)"

# Troca ou acrescenta KEY=VALUE no .env (awk, sem "sed -i", que difere no macOS).
set_env() {
  if grep -q "^$1=" .env; then
    awk -v k="$1" -v l="$1=$2" 'index($0, k"=")==1 {print l; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "$1=$2" >> .env
  fi
}

ollama_native_up() { curl -sf -m 3 http://localhost:11434/api/version >/dev/null; }

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
  OLLAMA_MODE=docker
fi

# Ollama nativo quando disponível: no Mac é o único jeito de usar a GPU (Metal);
# dentro do Docker Desktop ele roda só em CPU.
if [ -z "${OLLAMA_MODE:-}" ]; then
  if [ "$OS" = "Darwin" ] && ! ollama_native_up && [ -d /Applications/Ollama.app ]; then
    open -a Ollama
    for _ in $(seq 1 30); do ollama_native_up && break; sleep 2; done
  fi
  if ollama_native_up; then OLLAMA_MODE=native; else OLLAMA_MODE=docker; fi
fi
if [ "$OS" = "Darwin" ] && [ "$OLLAMA_MODE" = "docker" ]; then
  echo "Aviso: Ollama em container no Mac roda só em CPU e a análise fica muito lenta." >&2
  echo "       Instale o app (https://ollama.com/download) e rode este script de novo." >&2
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
  if ! grep -q "^${key}=" .env || [ "$FRESH_ENV" = "1" ]; then
    set_env "$key" "${line#*=}"
  fi
done < "$KIT_DIR/env.local"
if [ "$FRESH_ENV" = "1" ]; then
  for key in BETTER_AUTH_SECRET BACKEND_AUTH_SECRET APP_SETTINGS_ENCRYPTION_KEY; do
    # Atribuição separada: com "set -e", uma falha aqui aborta em vez de gravar vazio.
    secret="$(LC_ALL=C od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    [ "${#secret}" -eq 64 ] || { echo "Falha ao gerar segredo aleatório" >&2; exit 1; }
    set_env "$key" "$secret"
  done
fi

# Chaves que dependem da máquina e do modo: reaplicadas a cada execução.
if [ "$SANDBOX" = "1" ]; then
  # O torch vem do PyPI (o índice CPU do PyTorch é bloqueado).
  set_env BACKEND_CPU_ONLY false
  set_env SUPOCLIP_MODELS_DIR "$SUPOCLIP_MODELS_DIR"
else
  case "$ARCH" in
    arm64|aarch64) set_env BACKEND_PLATFORM linux/arm64 ;;  # Apple Silicon: sem emulação
    *) set_env BACKEND_PLATFORM linux/amd64 ;;
  esac
  set_env BACKEND_CPU_ONLY true
fi
if [ "$OLLAMA_MODE" = "native" ]; then
  set_env COMPOSE_PROFILES ""
  set_env OLLAMA_BASE_URL "http://host.docker.internal:11434/v1"
  set_env LLM "ollama:$NATIVE_MODEL_ALIAS"
else
  set_env COMPOSE_PROFILES ollama
  set_env OLLAMA_BASE_URL "http://ollama:11434/v1"
  set_env LLM "ollama:$OLLAMA_MODEL"
fi

# Modelo antes do backend.
if [ "$OLLAMA_MODE" = "native" ]; then
  # Pela API HTTP: o app do Ollama nem sempre deixa o comando "ollama" no PATH.
  echo "Baixando $OLLAMA_MODEL no Ollama nativo (~2,5 GB na primeira vez)..."
  curl -sf http://localhost:11434/api/pull \
    -d "{\"model\": \"$OLLAMA_MODEL\", \"stream\": false}" | grep -q success
  curl -sf http://localhost:11434/api/create \
    -d "{\"model\": \"$NATIVE_MODEL_ALIAS\", \"from\": \"$OLLAMA_MODEL\", \"parameters\": {\"num_ctx\": 16384}, \"stream\": false}" \
    | grep -q success
else
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
fi

if [ "$SANDBOX" = "1" ] && { [ "${REBUILD:-0}" = "1" ] || [ -z "$(docker images -q supoclip-backend-sandbox)" ]; }; then
  docker buildx build --allow network.host --network host \
    --build-context ccr="${PROXY_CA_DIR:-/root/.ccr}" \
    --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" \
    -f local-sandbox/backend.Dockerfile -t supoclip-backend-sandbox --load backend
  # O cache do build duplica o venv (~7 GB); a cota de disco não comporta os dois.
  docker builder prune -af >/dev/null
fi
if [ "$SANDBOX" = "1" ]; then
  # Sem --build: ele refaria também a imagem do Ollama (baixando a base de ~8 GB)
  # e o frontend do zero, o que estoura a cota de disco. Imagens ausentes são
  # construídas mesmo assim; REBUILD=1 força o frontend.
  if [ "${REBUILD:-0}" = "1" ]; then "${COMPOSE[@]}" build frontend; fi
  "${COMPOSE[@]}" up -d frontend backend worker
  docker builder prune -af >/dev/null
else
  "${COMPOSE[@]}" up -d --build frontend backend worker
fi

echo "Aguardando http://localhost:3107 ..."
until curl -sf -o /dev/null http://localhost:3107; do sleep 5; done
echo "SupoClip no ar: http://localhost:3107  (API: http://localhost:8000/docs)"
echo "Ollama: $OLLAMA_MODE. Para conferir tudo: $KIT_DIR/check.sh"
