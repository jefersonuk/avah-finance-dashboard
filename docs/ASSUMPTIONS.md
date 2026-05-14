# Assumptions and Explicit Choices (v1)

## Regras assumidas para esta entrega

1. **Base de persistência**: JSON local (`backend/data/store.json`) para acelerar validação funcional.
2. **Canal default**: Shopee na primeira execução.
3. **Payout por item**:
   - usa lançamento financeiro por SKU quando existir;
   - caso não exista, faz rateio proporcional à receita do item no pedido.
4. **Imposto**: aplicado sobre `payout_real` da linha.
5. **Marketing**:
   - resolve total do mês por investimento/ROAS/híbrido;
   - aloca por receita/quantidade/manual conforme regra.
6. **Custos adicionais não preenchidos**: tratados como zero e explicitados na metodologia.
7. **Análise parcial**: qualquer ausência de custo vigente, imposto vigente, família ou marketing obrigatório marca a linha como incompleta.
8. **Autenticação local**: usuário seed inicial (`admin@avah.local`) criado automaticamente em ambiente local quando não há usuários.

## Ambiguidades para confirmação futura

1. Base tributável final do Simples (payout, receita bruta, ou outra base específica).
2. Regras de devolução/cancelamento por canal (ordem de impacto financeiro).
3. Modelo definitivo de conciliação para pedidos multi-SKU com lançamentos agregados.
4. Lógica de classificação SKU por escala em operação com curva de demanda.
5. Critério de “preço ideal para escala” (atualmente usa margem de segurança + buffer fixo).
