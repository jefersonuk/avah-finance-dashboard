# syntax=docker/dockerfile:1.7
#
# Variante do backend/Dockerfile do SupoClip para redes com egress restrito
# (ex.: sessão cloud do Claude Code), onde deb.debian.org, deno.land e
# download.pytorch.org são bloqueados e o TLS passa por um proxy com CA própria.
#
# Diferenças em relação ao original:
#   - base Ubuntu 24.04 (archive.ubuntu.com acessível) com Python 3.11 via uv
#   - deno copiado da imagem oficial denoland/deno em vez do install.sh
#   - torch do PyPI (extra "cuda"; roda em CPU) em vez do índice CPU do PyTorch
#   - CA do proxy confiada no build e em runtime
# Numa máquina com internet normal, use o backend/Dockerfile original.

FROM astral/uv:0.13.6 AS uv
FROM denoland/deno:bin-2.9.8 AS deno

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    unzip \
    ca-certificates \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# O build passa pelo proxy do host (HTTPS_PROXY + rede host), que usa esta CA.
# Em runtime o compose monta o bundle completo por cima de ca-certificates.crt.
COPY --from=ccr agent-proxy-ca.crt /usr/local/share/ca-certificates/agent-proxy-ca.crt
RUN update-ca-certificates
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    DENO_CERT=/etc/ssl/certs/ca-certificates.crt \
    UV_NATIVE_TLS=1

COPY --from=deno /deno /usr/local/bin/deno
COPY --from=uv /uv /uvx /usr/local/bin/
ENV DENO_DIR=/root/.deno \
    UV_PYTHON_INSTALL_DIR=/opt/uv-python \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1

WORKDIR /app

RUN uv python install 3.11

COPY pyproject.toml uv.lock* ./
# Bibliotecas estáticas (.a) dos pacotes nvidia-* não são usadas em runtime.
RUN uv venv .venv --python 3.11 && uv sync --frozen --extra cuda \
    && find .venv -name '*.a' -delete

COPY src/ ./src/
COPY fonts/ ./fonts/
COPY transitions/ ./transitions/

RUN mkdir -p /app/uploads /app/clips /app/logs /tmp

EXPOSE 8000

CMD [".venv/bin/uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
