# AVAH - Aplicativo de Análise Financeira, Precificação e Escalabilidade

Projeto web full stack para análise financeira operacional de e-commerce/marketplace com foco em Shopee (v1), com motor determinístico, auditável e extensível.

## Estrutura

- `/frontend` - interface React com formulários, importação e dashboards
- `/backend` - API Express para cadastros, importação e execução de análise
- `/shared-types` - tipagem forte compartilhada
- `/calculations` - motor de cálculo desacoplado
- `/parsers` - parser de CSV com mapeamento e normalização
- `/docs` - documentação técnica e funcional
- `/tests` - reservado para integração end-to-end
- `/uploads` - reservado para arquivos importados
- `/scripts` - utilitários de apoio

## Como executar

1. Instale dependências:

```bash
npm install
```

2. Inicie o backend:

```bash
npm run dev:backend
```

Backend: `http://localhost:3333`

3. Em outro terminal, inicie o frontend:

```bash
npm run dev:frontend
```

Frontend: `http://localhost:5173`

## Autenticação (v2)

- A API agora exige JWT para todos os endpoints, exceto:
  - `GET /api/health`
  - `POST /api/auth/login`
  - `POST /api/auth/register` (aberto apenas quando não existe usuário)
- Credencial seed local:
  - email: `admin@avah.local`
  - senha: `admin12345`
- O frontend já possui tela de login integrada.

## Persistência SQL (v2)

- Persistência principal migrada para SQLite em `backend/data/avah.sqlite`.
- Na primeira inicialização:
  - aplica schema SQL;
  - migra `backend/data/store.json` legado (se existir);
  - se não existir base legada, carrega `defaultState` (mock inicial).

## Funcionalidades implementadas (v1)

- Formulários completos A-E (empresa, período, SKU, kit, meta de margem)
- Cadastros de parâmetros críticos:
  - impostos por vigência
  - marketing mensal com prioridade investimento/ROAS/híbrido
  - custo de produção por SKU com histórico
  - custos adicionais opcionais por SKU
- Importação financeira CSV (Shopee-ready com mapeamento de colunas)
- Upload e leitura de documentos Shopee em XLSX (Income, shop stats, flash sale, parent SKU, product overview, traffic overview)
- Geração automática de relatório mensal (operacional + financeiro + precificação) a partir dos XLSX, com:
  - separação de base comercial x base financeira (Income)
  - imposto configurável
  - custo unitário configurável por categoria
  - marketing real, ROAS real e ads incremental ajustado
  - lucro/margem ajustada por categoria
  - alerta de mês com oferta relâmpago (evitar uso de preço médio como preço-base)
- Endpoints preparados para importação comercial e catálogo (`/imports/commercial/raw`, `/imports/catalog/raw`)
- Normalização de dados (datas, números, cabeçalhos)
- Motor de cálculo com:
  - lucro líquido por linha SKU
  - margem líquida por linha
  - agregação por SKU, família e mês
  - alocação de marketing (receita, quantidade, manual)
  - alertas de incompletude
  - classificação automática por SKU
  - recomendações baseadas em regra
- Simulação de preço (lucro/margem projetada + preço de segurança)
- Dashboards executivo, SKU, família e saúde da operação
- Trilha de auditoria com metodologia, pendências e inconsistências
- Base inicial vazia para preenchimento/importação real

## Regra de completude

A análise é marcada como parcial/incompleta quando faltar qualquer dado crítico, por exemplo:

- SKU sem custo vigente para a data
- mês sem regra de imposto aplicável
- marketing do mês ausente quando habilitado
- produto sem família

Nesses casos, o relatório mantém os cálculos disponíveis e explicita pendências e alertas.

## Testes

```bash
npm test
```

Inclui testes unitários do motor de cálculo e do parser financeiro.

## Roadmap imediato

- importação comercial e catálogo via API dedicada
- conciliação avançada pedido x payout x ajuste
- persistência SQL (schema inicial já documentado em `/backend/src/db/schema.sql`)
- autenticação, multiempresa e trilha de auditoria por usuário
- exportação CSV/PDF
