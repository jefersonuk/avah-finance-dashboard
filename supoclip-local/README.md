# SupoClip 100% local (Whisper + Ollama)

Kit para rodar o [SupoClip](https://github.com/FujiwaraChoki/supoclip) com Docker
sem nenhuma API paga:

- **Transcrição**: openai-whisper rodando no backend/worker (`TRANSCRIPTION_PROVIDER=whisper`)
- **Seleção de clipes**: Ollama com `qwen3:4b-instruct-2507-q4_K_M` (cabe em CPU, suporta tool-calling)
- **Frontend**: http://localhost:3107 · **API**: http://localhost:8000/docs

O kit adiciona um override do compose e um `.env`, e aplica um patch pequeno
(`patches/llm-timeouts.patch`) que deixa os timeouts de IA configuráveis por variável
de ambiente. Sem as variáveis, o comportamento do SupoClip não muda.

## Uso numa máquina com internet normal

Requisitos: Docker (Desktop ou Engine) com ~20 GB livres e 8 GB+ de RAM.

```bash
./setup.sh
```

O script:

1. clona o SupoClip em `~/supoclip` (mude com `SUPOCLIP_DIR=...`) e aplica o patch;
2. cria o `.env` a partir do `.env.example` + `env.local`, com segredos aleatórios;
3. sobe o Ollama e baixa o modelo (`ollama pull`);
4. faz build e sobe `frontend`, `backend` e `worker` (Postgres e Redis vêm junto);
5. espera http://localhost:3107 responder.

Os pesos do Whisper são baixados no primeiro vídeo e ficam no volume `whisper_models`.

Comandos úteis (dentro de `~/supoclip`):

```bash
C="docker compose -f docker-compose.yml -f docker-compose.local.yml"
$C logs -f worker          # acompanhar o processamento
$C ps
$C down                    # parar (dados ficam nos volumes)
```

## Ajustes

Edite o `.env` do clone e rode `$C up -d` de novo:

| Variável | Padrão | Observação |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `small` | `base` é ~3x mais rápido; `medium`/`large-v3` são melhores com GPU |
| `TRANSCRIPTION_LANGUAGE` | `pt` | Vazio = detectar o idioma (pode errar em trechos curtos ou ruidosos) |
| `LLM` | `ollama:qwen3:4b-instruct-2507-q4_K_M` | Com mais RAM/GPU: `ollama:qwen3:8b`, `ollama:gpt-oss:20b` (rode `ollama pull` antes) |
| `OLLAMA_CONTEXT_LENGTH` | `16384` | Contexto do Ollama; o padrão de 4096 corta transcrições longas |
| `TRANSCRIPT_ANALYSIS_TIMEOUT_SECONDS` | `3600` | Limite por análise e por pedido HTTP ao Ollama (o app usa 600) |
| `ANALYSIS_TOTAL_TIMEOUT_SECONDS` / `RERANK_TIMEOUT_SECONDS` | `7200` / `1800` | Vídeos longos (janelas + reranking); o app usa 1800 / 240 |

### Desempenho em CPU

O prompt de análise do SupoClip tem ~4–5 mil tokens (instruções + schema JSON + transcrição)
e a resposta traz vários clipes com texto, justificativas e notas. Numa VM com 4 vCPUs de
2,1 GHz, o Qwen3 4B processa o prompt a ~45 tokens/s e gera a ~2,5 tokens/s nesse contexto,
então uma análise leva de 10 a 25 minutos: por isso os timeouts maiores. Num PC com CPU
recente ou GPU fica bem mais rápido. Não ative `OLLAMA_FLASH_ATTENTION` em CPU: ali ele
deixou o processamento do prompt ~5× mais lento.

Se o Ollama já roda fora do Docker na sua máquina, pode apontar
`OLLAMA_BASE_URL=http://host.docker.internal:11434/v1` e ignorar o serviço `ollama`.

## Modo `SANDBOX=1` (rede restrita)

Para ambientes onde o egress é filtrado, como a sessão cloud do Claude Code em que
este kit foi testado. Lá ficam bloqueados `deb.debian.org`, `deno.land`,
`download.pytorch.org`, `ollama.com`, `huggingface.co` e `openaipublic.azureedge.net`,
e o TLS passa por um proxy com CA própria. Nesse modo:

- `sandbox/fetch-models.py` baixa os pesos pelo Docker Hub, conferindo o digest de cada camada:
  o GGUF do Qwen3 (`ai/qwen3`) e os pesos oficiais `base.pt`/`small.pt` do Whisper
  (SHA-256 iguais aos publicados pela OpenAI);
- o modelo do Ollama é criado a partir do GGUF (`ollama create`), que é apagado em seguida;
- `sandbox/*.Dockerfile` trocam a base Debian por Ubuntu/`node:bookworm`, pegam o deno da
  imagem oficial, instalam o torch do PyPI e confiam na CA do proxy (`PROXY_CA_DIR`, padrão `/root/.ccr`);
- o Ollama roda numa imagem só-CPU (mesmo binário da oficial, sem CUDA/Vulkan: ~0,2 GB em vez de ~8,4 GB);
- a imagem do backend é construída com `docker buildx build --network host` (o Python do uv vem
  de github.com, alcançável só pelo proxy do host) e o cache de build é limpo logo depois.

Pico de disco: ~20 GB.

```bash
SANDBOX=1 ./setup.sh
```

Numa máquina comum, não use este modo.
