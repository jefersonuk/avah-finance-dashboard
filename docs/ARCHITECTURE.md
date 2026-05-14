# Arquitetura da Solução

## Visão geral

A aplicação foi dividida em camadas desacopladas:

1. `parsers`: ingestão/normalização de arquivos
2. `backend`: persistência e orquestração
3. `calculations`: motor determinístico de cálculo
4. `frontend`: formulários, dashboards e auditoria
5. `shared-types`: contrato tipado comum

## Fluxo macro

1. Usuário importa CSV financeiro no frontend.
2. Backend normaliza e grava linhas brutas + linhas estruturadas.
3. Usuário cadastra parâmetros (imposto, marketing, custos, metas).
4. Frontend chama `POST /api/analysis/run` com período + competência.
5. Backend monta `FinancialAnalysisInput` e chama `runFinancialAnalysis`.
6. Relatório retorna com métricas, agregações, alertas, pendências e inconsistências.
7. Frontend exibe dashboards e trilha de auditoria.

## Persistência e segurança (v2)

- Persistência principal: SQLite (`backend/data/avah.sqlite`).
- Camada de store mantém API de alto nível (`loadState/saveState/reset`) para desacoplar rotas da infraestrutura.
- Migração automática de legado: se `backend/data/store.json` existir, os dados são carregados para SQLite na primeira inicialização.
- Autenticação: JWT com login (`/auth/login`) e middleware de proteção para endpoints de negócio.

## Decisões técnicas

- Motor de cálculo isolado em pacote próprio para facilitar testes e versionamento.
- Regras de incompletude explícitas: sem suposição silenciosa de valores críticos.
- Histórico por vigência para custos e impostos.
- Cálculo orientado por competência configurável.
- API pronta para migração de armazenamento JSON para SQL.

## Módulos atendidos

- Módulo 1: cadastros de parâmetros
- Módulo 2: importação financeira (CSV)
- Módulo 3: normalização + alertas de base incompleta
- Módulo 4: motor financeiro + simulação
- Módulo 5: dashboards executivo/SKU/família/saúde
- Módulo 6: classificação e recomendações por regra
- Módulo 7: formulários A-E
- Módulo 8: estrutura de crescimento
- Módulo 9: entidades mínimas documentadas em SQL
- Módulo 10: auditoria por metodologia + drill-down em linha
- Módulo 11: critérios de sucesso com base mock funcional

## Limites da versão atual

- Sem autenticação (single-tenant local).
- Sem exportação PDF ainda (CSV pode ser adicionado via endpoint dedicado).
- Importação comercial e catálogo estão preparadas no pacote `parsers`, mas ainda não expostas em rotas dedicadas.
