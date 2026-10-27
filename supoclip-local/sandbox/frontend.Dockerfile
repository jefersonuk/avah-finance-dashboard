# syntax=docker/dockerfile:1.7
#
# Variante do frontend/Dockerfile (alvo "development") para redes com egress
# restrito: deb.debian.org é bloqueado, então usa node:*-bookworm (não slim),
# que já traz openssl e curl, e confia na CA do proxy TLS.
# Contexto de build: raiz do clone do supoclip (igual ao original).

FROM node:22.23.4-bookworm AS base

# Bundle completo (raízes do sistema + CAs de inspeção do egress): o tráfego dos
# containers é interceptado direto no gateway, não pelo proxy local do host.
COPY --from=ccr ca-bundle.crt /etc/ssl/certs/sandbox-ca-bundle.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/sandbox-ca-bundle.crt \
    SSL_CERT_FILE=/etc/ssl/certs/sandbox-ca-bundle.crt

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@10.27.0

FROM base AS deps
WORKDIR /app

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

FROM base AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/package.json frontend/pnpm-lock.yaml ./

COPY frontend/ .
COPY CHANGELOG.md ./CHANGELOG.md

RUN pnpm exec prisma generate

EXPOSE 3107

ENV PORT=3107
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["sh", "-c", "pnpm exec prisma generate && pnpm run dev"]
