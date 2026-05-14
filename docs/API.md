# API Backend (v2)

Base URL: `http://localhost:3333/api`

## Autenticação

- Público:
  - `GET /health`
  - `POST /auth/login`
  - `POST /auth/register` (apenas quando ainda não existe usuário)
- Protegido por JWT (`Authorization: Bearer <token>`):
  - todos os demais endpoints

## Endpoints de autenticação

- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/me`
- `POST /auth/users` (admin)

## Saúde

- `GET /health`

## Estado e mocks

- `GET /state`
- `POST /reset-mocks`

## Formulários

- `GET /forms/company`
- `PUT /forms/company`
- `GET /forms/margin-targets`
- `PUT /forms/margin-targets`
- `GET /forms/rules`
- `PUT /forms/rules`

## Parâmetros

- `GET /parameters/tax-rules`
- `POST /parameters/tax-rules`
- `GET /parameters/marketing-costs`
- `POST /parameters/marketing-costs`
- `GET /parameters/sku-cost-history`
- `POST /parameters/sku-cost-history`
- `GET /parameters/sku-additional-costs`
- `POST /parameters/sku-additional-costs`

## Catálogo e kits

- `GET /catalog/skus`
- `POST /catalog/skus`
- `GET /kits`
- `POST /kits`

## Importação

- `POST /imports/financial` (multipart file)
- `POST /imports/financial/raw` (JSON com conteúdo CSV)
- `POST /imports/commercial/raw` (JSON com conteúdo CSV para prévia normalizada)
- `POST /imports/catalog/raw` (JSON com conteúdo CSV para prévia normalizada)
- `POST /imports/shopee/documents` (multipart com vários arquivos XLSX no campo `files`)
  - parâmetros opcionais no `multipart/form-data`:
    - `month` (`YYYY-MM`)
    - `competence_mode` (`order_created` | `payment_completed`)
    - `tax_rate` (decimal)
    - `cost_serum_lavanda`
    - `cost_hortela_pimenta`
    - `cost_lavanda`
    - `cost_melaleuca`
    - `cost_laranja_doce`
    - `cost_soninho_bom`
  - retorna:
    - `consolidated` (arquivos/processamento)
    - `documents` (extração bruta por arquivo)
    - `report` (relatório mensal consolidado operacional + financeiro + precificação)

## Análise

- `POST /analysis/run`
- `POST /analysis/simulate-price`

## Exemplo: login

```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@avah.local","password":"admin12345"}'
```

## Exemplo: Rodar análise com token

```bash
TOKEN="<seu_jwt>"

curl -X POST http://localhost:3333/api/analysis/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period_config": {
      "range": {"start": "2026-01-01", "end": "2026-12-31"},
      "competence_mode": "payment_approved",
      "channel": "shopee",
      "include_returns": true,
      "include_cancellations": true,
      "include_logistic_adjustments": true,
      "include_marketplace_ads": true,
      "include_external_marketing": true
    },
    "rules": {
      "marketing_allocation_mode": "proportional_revenue",
      "margin_healthy_threshold": 0.20,
      "margin_attention_threshold": 0.10
    },
    "margin_targets": {
      "minimum_margin": 0.10,
      "ideal_margin": 0.20,
      "minimum_roas": 2.0,
      "minimum_safety_price": 35
    }
  }'
```
