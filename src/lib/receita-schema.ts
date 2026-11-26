import { z } from "zod";
import { soma } from "./decimal";
import { MAX_ITENS_RECEITA, MAX_QUANTIDADE } from "./limits";

export const receitaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da receita").max(100),
  descricao: z.string().max(255).nullable().optional(),
  rendimentoMl: z.coerce
    .number()
    .positive("Rendimento em ml deve ser > 0")
    .max(MAX_QUANTIDADE, "Rendimento muito alto"),
  margemLucro: z.coerce.number().min(0).max(95).default(65),
  itens: z
    .array(
      z.object({
        insumoId: z.coerce.number().int().positive(),
        quantidade: z.coerce.number().positive().max(MAX_QUANTIDADE, "Quantidade muito alta"),
      }),
    )
    .min(1, "Adicione pelo menos 1 insumo na receita")
    .max(MAX_ITENS_RECEITA, `Uma receita pode ter no máximo ${MAX_ITENS_RECEITA} insumos`),
});

/** Soma insumos repetidos para que cada insumo apareça uma única vez. */
export function consolidarItens(
  itens: Array<{ insumoId: number; quantidade: number }>,
): Array<{ insumoId: number; quantidade: number }> {
  const unicos = new Map<number, number>();
  for (const item of itens) {
    unicos.set(
      item.insumoId,
      soma([unicos.get(item.insumoId) ?? 0, item.quantidade], 3),
    );
  }
  return Array.from(unicos.entries()).map(([insumoId, quantidade]) => ({ insumoId, quantidade }));
}
