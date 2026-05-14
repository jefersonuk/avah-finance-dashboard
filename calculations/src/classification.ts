import type {
  AnalysisRuleSettings,
  RecommendationAction,
  SkuClassification,
} from "@avah/shared-types";

export interface ClassificationInput {
  margin: number | null;
  dataComplete: boolean;
  roas: number | null;
  minimumRoas: number;
}

export function classifySku(
  input: ClassificationInput,
  rules: AnalysisRuleSettings,
): SkuClassification {
  if (!input.dataComplete || input.margin === null) {
    return "dados_insuficientes";
  }

  if (input.margin >= rules.margin_healthy_threshold) {
    return input.roas !== null && input.roas < input.minimumRoas ? "escalar_com_atencao" : "escalar";
  }

  if (input.margin >= rules.margin_attention_threshold) {
    return "manter";
  }

  if (input.margin > 0) {
    return "revisar_preco";
  }

  return "pausar_midia";
}

export function recommendationByClassification(
  classification: SkuClassification,
): RecommendationAction[] {
  switch (classification) {
    case "escalar":
      return ["priorizar_midia"];
    case "escalar_com_atencao":
      return ["priorizar_midia", "revisar_cadastro_logistico"];
    case "manter":
      return ["revisar_cadastro_logistico"];
    case "revisar_preco":
      return ["aumentar_preco", "reduzir_desconto"];
    case "revisar_oferta":
      return ["migrar_para_kit"];
    case "kitizar":
      return ["migrar_para_kit"];
    case "pausar_midia":
      return ["retirar_de_campanha", "revisar_custo"];
    case "dados_insuficientes":
      return ["revisar_classificacao_tributaria"];
    default:
      return [];
  }
}
