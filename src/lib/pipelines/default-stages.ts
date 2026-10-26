export const DEFAULT_PIPELINE_NAME = "Negociações";

export const SPEC_DEFAULT_STAGES = [
  { name: "Prospecção", color: "#64748b", position: 0 },
  { name: "Qualificação", color: "#0ea5e9", position: 1 },
  { name: "Levantamento de oportunidades", color: "#8b5cf6", position: 2 },
  { name: "Envio do orçamento", color: "#f97316", position: 3 },
  { name: "Negociação", color: "#eab308", position: 4 },
  { name: "Fechamento", color: "#22c55e", position: 5 },
] as const;
