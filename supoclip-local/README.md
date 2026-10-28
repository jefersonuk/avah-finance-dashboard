# SupoClip 100% local (Whisper + Ollama)

Kit para rodar o [SupoClip](https://github.com/FujiwaraChoki/supoclip) com Docker
sem nenhuma API paga:

- **Transcrição**: openai-whisper rodando no backend/worker (`TRANSCRIPTION_PROVIDER=whisper`)
- **Seleção de clipes**: Ollama com `qwen3:4b-instruct-2507-q4_K_M` (cabe em CPU, suporta tool-calling)
- **Frontend**: http://localhost:3107 · **API**: http://localhost:8000/docs

O kit adiciona um override do compose e um `.env`, e aplica um patch pequeno
(`patches/llm-timeouts.patch`) que deixa os timeouts de IA configuráveis por variável
de ambiente. Sem as variáveis, o comportamento do SupoClip não muda.

## Uso no Mac (ou Linux) com internet normal

Requisitos:

- Docker Desktop aberto, com 8 GB+ de memória em Settings > Resources e ~15 GB livres;
- no Mac, o app do [Ollama](https://ollama.com/download) instalado. Ele roda no macOS e usa a
  GPU (Metal); dentro do Docker Desktop o Ollama só usa CPU e a análise fica muito lenta.

```bash
git clone -b claude/supoclip-local-docker-setup-jim02c https://github.com/jefersonuk/avah-finance-dashboard
cd avah-finance-dashboard/supoclip-local
./setup.sh      # primeira vez: ~15-30 min (build das imagens e downloads)
./check.sh      # confere tudo; ./check.sh --llm também testa o modelo
```

O `setup.sh`:

1. clona o SupoClip em `~/supoclip` (mude com `SUPOCLIP_DIR=...`) e aplica o patch;
2. escolhe o Ollama: o nativo do host se responder em `localhost:11434` (no Mac abre o app se
   estiver instalado), senão um container só-CPU (`COMPOSE_PROFILES=ollama`). Force com
   `OLLAMA_MODE=native` ou `OLLAMA_MODE=docker`;
3. cria o `.env` a partir do `.env.example` + `env.local`, com segredos aleatórios, e ajusta as
   chaves da máquina: no Apple Silicon, `BACKEND_PLATFORM=linux/arm64` (sem emulação);
4. baixa `qwen3:4b-instruct-2507-q4_K_M` e, no modo nativo, cria o apelido `supoclip-qwen3`
   com contexto de 16k (independe da configuração de contexto do app do Ollama);
5. faz build e sobe `frontend`, `backend` e `worker` (Postgres e Redis vêm junto) e espera
   http://localhost:3107 responder.

Os pesos do Whisper são baixados no primeiro vídeo e ficam no volume `whisper_models`.
Whisper roda em CPU dentro do container (o Docker no Mac não expõe a GPU); o `small` dá conta.

O `check.sh` confere Docker e memória, a saúde dos containers, o Ollama (nativo ou container),
se a imagem do backend é nativa da máquina, as respostas HTTP do frontend e do backend, e,
de dentro do worker, a configuração (Whisper, idioma, LLM) e a conexão com o modelo.

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
| `LLM` | `ollama:supoclip-qwen3` (nativo) ou `ollama:qwen3:4b-instruct-2507-q4_K_M` (container) | Com mais RAM/GPU: `ollama:qwen3:8b`, `ollama:gpt-oss:20b` (rode `ollama pull` antes) |
| `OLLAMA_CONTEXT_LENGTH` | `16384` | Contexto do Ollama em container; no nativo, use um apelido com `num_ctx` (como o `supoclip-qwen3`) |
| `TRANSCRIPT_ANALYSIS_TIMEOUT_SECONDS` | `3600` | Limite por análise e por pedido HTTP ao Ollama (o app usa 600) |
| `ANALYSIS_TOTAL_TIMEOUT_SECONDS` / `RERANK_TIMEOUT_SECONDS` | `7200` / `1800` | Vídeos longos (janelas + reranking); o app usa 1800 / 240 |

### Desempenho em CPU

O prompt de análise do SupoClip tem ~4–5 mil tokens (instruções + schema JSON + transcrição)
e a resposta traz vários clipes com texto, justificativas e notas. Resultado medido numa VM
com 4 vCPUs de 2,1 GHz, sem GPU, com um vídeo de teste de 80 s:

- Whisper `small`: transcrição em ~30 s, boa qualidade com `TRANSCRIPTION_LANGUAGE=pt`
  (na detecção automática, a voz sintética do teste foi detectada como latim);
- Qwen3 4B: prompt a ~45–60 tokens/s, geração a ~2 tokens/s nesse contexto. A análise
  **não terminou**: o modelo gerou mais de 4.500 tokens em 43 min sem fechar o JSON.

Nessa classe de máquina, o LLM local não dá conta. Para gerar clipes de verdade, use uma
máquina com GPU (ou CPU bem mais forte) e, se couber, um modelo maior, como
`ollama:qwen3:8b` ou `ollama:gpt-oss:20b` (não testados aqui). Os timeouts maiores do
`env.local` só evitam que análises lentas, mas que terminam, sejam abortadas.
Não ative `OLLAMA_FLASH_ATTENTION` em CPU: no teste, ele deixou o processamento do
prompt ~5× mais lento.

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
