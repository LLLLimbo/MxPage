import { z } from "zod";

export const OZON_RULE_VERSION = 5;
export const ozonProductSchema = z.object({
  title: z.string().trim().max(2000).default(""),
  attributes: z.string().trim().max(12000).default(""),
  saleQuantity: z.string().trim().max(120).default(""),
});
export type OzonProduct = z.infer<typeof ozonProductSchema>;
export const ozonReferenceRoles = ["same_product", "detail", "angle", "evidence", "variant", "excluded"] as const;
export const ozonReferenceLabels: Record<(typeof ozonReferenceRoles)[number], string> = {
  same_product: "同款整体", detail: "同款细节", angle: "同款其他角度", evidence: "文字参数证据", variant: "其他变体", excluded: "不一致 / 不使用",
};
export const ozonReferenceSchema = z.object({
  assetId: z.string().min(1), role: z.enum(ozonReferenceRoles), reason: z.string().max(500).default(""),
  variantConfirmed: z.boolean().default(false),
});
export type OzonReference = z.infer<typeof ozonReferenceSchema>;
export const ozonReferencesSchema = z.array(ozonReferenceSchema).max(8).refine(rows => new Set(rows.map(row => row.assetId)).size === rows.length, "参考图不能重复");
export const ozonFactSchema = z.object({
  id: z.string().min(1).max(100), claim: z.string().min(1).max(1000), sourceId: z.string().min(1),
  kind: z.enum(["appearance", "specification", "material", "performance", "certification", "quantity", "contents", "usage"]),
  scope: z.enum(["product", "variant"]).default("product"),
});
export const ozonAnalysisSchema = z.object({
  identity: z.string().min(1).max(2000), references: ozonReferencesSchema,
  facts: z.array(ozonFactSchema).max(60),
});
export type OzonAnalysis = z.infer<typeof ozonAnalysisSchema>;
export type SaleQuantity = { text: string; value: number; unit: string; sourceId: string; sourceText: string } | null;

// Only explicit input is considered. Neither OCR, an inferred brief nor a file name enters this parser.
const unitPattern = "(?:pieces?|pcs?\\.?|шт(?:ук(?:и|а)?)?\\.?|pairs?|пары?|пар|sets?|набор(?:а|ов)?|комплект(?:а|ов)?|boxes?|box|короб(?:ка|ки|ок)|件|个|只|双|套|盒|包|组|袋|瓶|罐|卷|对)";
function explicitQuantities(text: string) {
  const matches = [...text.matchAll(new RegExp(`(?<![\\d.,])([1-9]\\d*)\\s*(${unitPattern})(?![\\p{L}\\d])`, "giu"))];
  const values = matches.map(match => ({ text: match[0].trim(), value: Number(match[1]), unit: match[2] }));
  const labeled = text.match(/(?:售卖数量|销售数量|包装数量|件数|数量|количество(?:\s+в\s+упаковке)?|quantity)\s*[:：=]\s*([1-9]\d*)\s*(?=$|[\n;,；])/iu);
  if (!values.length && labeled) values.push({ text: `${labeled[1]} 件`, value: Number(labeled[1]), unit: "件" });
  return values.filter(value => Number.isSafeInteger(value.value));
}
export function resolveSaleQuantity(product: OzonProduct): SaleQuantity {
  if (product.saleQuantity) {
    if (/^[1-9]\d*$/.test(product.saleQuantity) && Number.isSafeInteger(Number(product.saleQuantity))) return { text: `${product.saleQuantity} 件`, value: Number(product.saleQuantity), unit: "件", sourceId: "input:saleQuantity", sourceText: product.saleQuantity };
    const values = explicitQuantities(product.saleQuantity);
    if (values.length) return { ...values[0], text: values.length > 1 ? product.saleQuantity : values[0].text, sourceId: "input:saleQuantity", sourceText: product.saleQuantity };
    return null;
  }
  for (const [sourceId, text] of [["input:attributes", product.attributes], ["input:title", product.title]]) {
    const values = explicitQuantities(text);
    if (values.length) {
      const unique = new Map(values.map(value => [`${value.value}:${value.unit.toLowerCase()}`, value]));
      // Conflicting quantities at a higher priority must be clarified, not replaced with a title guess.
      return unique.size === 1 ? { ...values[0], sourceId, sourceText: text } : null;
    }
  }
  return null;
}

function quantityUnit(unit: string) {
  if (/pairs?|пар|双|对/iu.test(unit)) return "pair";
  if (/sets?|набор|комплект|套|组/iu.test(unit)) return "set";
  if (/box|boxes|короб|盒/iu.test(unit)) return "box";
  if (/pieces?|pcs?|шт|件|个|只/iu.test(unit)) return "piece";
  return unit.toLowerCase();
}
export function assertOzonQuantityCopy(text: string, quantity: SaleQuantity) {
  const quantities = explicitQuantities(text);
  const allowed = quantity ? explicitQuantities(quantity.text) : [];
  if (quantities.some(value => !allowed.some(item => item.value === value.value && quantityUnit(item.unit) === quantityUnit(value.unit)))) throw new Error("Ozon 文案含没有有效输入依据的售卖数量，请核对原始数量资料或删除相应文案；尚未提交生图。");
}

export const ozonImageRole = (index: number, heroCount: number) => index >= heroCount ? "rich_detail" : index === 0 ? "catalog_main" : "catalog_aux";
export const ozonImageRoleLabels = { catalog_main: "商品卡主图", catalog_aux: "商品卡附图", rich_detail: "富文本详情图" };
export const isOzonRatio = (width?: number | null, height?: number | null) => Boolean(width && height && width * 4 === height * 3);

export type OzonContext = {
  version: number; product: OzonProduct; anchorAssetId: string; identityHash: string; variationId: string;
  sourceAssetIds: string[]; quantity: SaleQuantity; referenceOverrides: OzonReference[];
  rules?: { grounding: string; planning: string; direction: string; review: string; image?: string };
  history: Array<{ runId: string; concept: string; sections: Array<{ expression: string; prompt: string }> }>;
  analysis?: OzonAnalysis;
};

export function readOzonProduct(snapshot: unknown): OzonProduct {
  const value = snapshot as { ozonProduct?: unknown } | null;
  return ozonProductSchema.parse(value?.ozonProduct || {});
}

export function validateOzonAnalysis(raw: unknown, context: Pick<OzonContext, "sourceAssetIds" | "anchorAssetId" | "product" | "quantity" | "referenceOverrides">): OzonAnalysis {
  const analysis = ozonAnalysisSchema.parse(raw);
  const ids = new Set(context.sourceAssetIds);
  if (analysis.references.length !== ids.size || analysis.references.some(row => !ids.has(row.assetId))) throw new Error("Ozon 参考图分类不完整或引用了其他商品素材，请检查分析结果。");
  const references = context.sourceAssetIds.map(id => context.referenceOverrides.find(override => override.assetId === id) || { ...analysis.references.find(row => row.assetId === id)!, variantConfirmed: false });
  const anchor = references.find(row => row.assetId === context.anchorAssetId);
  if (!anchor || anchor.role !== "same_product") throw new Error("第一张参考图必须作为商品身份依据。");
  const inputSources = new Set([
    ...(context.product.title ? ["input:title"] : []), ...(context.product.attributes ? ["input:attributes"] : []),
    ...(context.product.saleQuantity ? ["input:saleQuantity"] : []),
  ]);
  const factIds = new Set<string>();
  const facts = analysis.facts.filter(fact => fact.kind !== "quantity" && fact.id !== "sale_quantity").filter(fact => {
    if (!ids.has(fact.sourceId) && !inputSources.has(fact.sourceId)) throw new Error(`Ozon 事实引用不存在的来源：${fact.sourceId}`);
    if (factIds.has(fact.id)) throw new Error("Ozon 事实编号重复。");
    factIds.add(fact.id);
    const source = references.find(row => row.assetId === fact.sourceId);
    return !source || source.role !== "excluded" && (source.role !== "variant" || source.variantConfirmed);
  }).map(fact => ({ ...fact, scope: references.find(row => row.assetId === fact.sourceId)?.role === "variant" ? "variant" as const : "product" as const }));
  if (context.quantity) facts.push({ id: "sale_quantity", claim: context.quantity.text, sourceId: context.quantity.sourceId, kind: "quantity", scope: "product" });
  return { ...analysis, references, facts };
}

export function ozonPixelReferences(context: OzonContext, requested: string[] = [], allowVariants = false): string[] {
  if (!context.analysis) throw new Error("Ozon 商品分析尚未完成。");
  const allowed = new Set(context.analysis.references.filter(row => ["same_product", "detail", "angle"].includes(row.role) || allowVariants && row.role === "variant" && row.variantConfirmed).map(row => row.assetId));
  if (requested.some(id => !allowed.has(id))) throw new Error("Ozon 分镜选择了仅供信息使用、未确认的变体或不一致参考图。");
  return [...new Set([context.anchorAssetId, ...requested])];
}

/** Reference bookkeeping is repaired locally; it must not require another model request. */
export function normalizeOzonPlanReferences<T extends { factIds?: string[]; evidence?: string[]; referenceAssetIds?: string[]; variantOverview?: boolean }>(sections: T[], context: OzonContext, additionalEvidenceIds: string[] = []) {
  const analysis = context.analysis!;
  const facts = new Map(analysis.facts.map(fact => [fact.id, fact]));
  const warnings: string[] = [];
  const normalized = sections.map((section, index) => {
    const sources = new Set([
      ...Object.entries(context.product).filter(([, text]) => Boolean(text)).map(([key]) => `input:${key}`),
      ...additionalEvidenceIds,
      ...analysis.references.filter(row => row.role !== "excluded" && (row.role !== "variant" || section.variantOverview && row.variantConfirmed)).map(row => row.assetId),
    ]);
    const factIds = [...new Set((section.factIds || []).filter(id => {
      const fact = facts.get(id);
      return fact && sources.has(fact.sourceId) && (fact.scope !== "variant" || section.variantOverview);
    }))];
    const evidence = [...new Set([
      ...(section.evidence || []).filter(id => sources.has(id)),
      ...factIds.map(id => facts.get(id)!.sourceId),
    ])];
    if ((section.factIds || []).some(id => !factIds.includes(id)) || (section.evidence || []).some(id => !sources.has(id))) {
      warnings.push(`第 ${index + 1} 张图片的部分文案缺少可关联的事实记录，请在确认提示词时核对商品资料。`);
    }
    const pixels = new Set(analysis.references.filter(row => ["same_product", "detail", "angle"].includes(row.role) || section.variantOverview && row.role === "variant" && row.variantConfirmed).map(row => row.assetId));
    const requested = section.referenceAssetIds || [];
    const referenceAssetIds = ozonPixelReferences(context, requested.filter(id => pixels.has(id)), section.variantOverview);
    if (requested.some(id => !pixels.has(id))) warnings.push(`第 ${index + 1} 张图片仅使用当前商品的有效参考图，请在确认提示词时核对商品外观。`);
    return { ...section, factIds, evidence, referenceAssetIds };
  });
  return { sections: normalized, warnings };
}
