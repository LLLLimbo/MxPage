import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { readStorageFile, saveUploadAsset } from "@/lib/storage/asset-manager";
import { isStyleReference } from "@/lib/utils/asset-purpose";
import { OZON_RULE_VERSION, readOzonProduct, resolveSaleQuantity, validateOzonAnalysis, ozonReferencesSchema, type OzonContext } from "./contract";
import { ozonGroundingRules, ozonPlanningRules, ozonDirectionRules, ozonReviewRules, ozonImageRules } from "./rules";

type SourceProject = { id: string; modelSnapshot: unknown; assets: Array<{ id: string; type: string; isMain: boolean; filePath: string; metadata: unknown }> };
export async function freezeOzonContext(project: SourceProject): Promise<OzonContext> {
  const assets = project.assets.filter(asset => ["MAIN", "ANGLE", "DETAIL", "REFERENCE"].includes(asset.type) && !isStyleReference(asset));
  const anchor = assets.find(asset => asset.isMain || asset.type === "MAIN") || assets[0];
  if (!anchor) throw new Error("Ozon 模式需要第一张商品身份参考图。");
  const identityHash = createHash("sha256").update(await readStorageFile(anchor.filePath)).digest("hex");
  const product = readOzonProduct(project.modelSnapshot);
  const snapshot = project.modelSnapshot as Record<string, any> | null;
  const context: OzonContext = { version: OZON_RULE_VERSION, product, anchorAssetId: anchor.id, identityHash, variationId: randomUUID(), sourceAssetIds: [anchor.id, ...assets.filter(asset => asset.id !== anchor.id).map(asset => asset.id)], quantity: resolveSaleQuantity(product), referenceOverrides: ozonReferencesSchema.parse(snapshot?.ozonReferences || []), history: [] };
  context.rules = { grounding: ozonGroundingRules, planning: ozonPlanningRules, direction: ozonDirectionRules, review: ozonReviewRules, image: ozonImageRules };
  if (context.referenceOverrides.some(row => !context.sourceAssetIds.includes(row.assetId))) throw new Error("参考图分类包含已移除的素材，请重新确认。");
  const brief = snapshot?.creationBrief;
  // A cached analysis is reusable only for the exact original inputs and ordered assets.
  if (brief?.ozonAnalysis && snapshot?.ozonAnalysisSignature === ozonAnalysisSignature(product, context.sourceAssetIds)) context.analysis = validateOzonAnalysis(snapshot?.creationBriefDraft?.observations?.ozonAnalysis || brief.ozonAnalysis, context);
  const previous = await prisma.detailRun.findMany({ where: { input: { path: "$.ozon.identityHash", equals: identityHash } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, input: true, checkpoint: true, project: { select: { modelSnapshot: true } } } });
  context.history = previous.filter(run => !(run.project.modelSnapshot as { trashedAt?: string } | null)?.trashedAt).flatMap(run => {
    const art = (run.checkpoint as { artDirection?: { concept?: string; sections: Array<{ sectionIndex: number; expression: string; prompt: string }> } } | null)?.artDirection;
    const counts = run.input as { heroCount?: number; detailCount?: number } | null;
    const expected = Number(counts?.heroCount) + Number(counts?.detailCount);
    const complete = art && expected > 0 && art.sections.length === expected && new Set(art.sections.map(section => section.sectionIndex)).size === expected && art.sections.every(section => Number.isInteger(section.sectionIndex) && section.sectionIndex >= 0 && section.sectionIndex < expected);
    return complete ? [{ runId: run.id, concept: (art.concept || "").slice(0, 600), sections: art.sections.slice(0, 12).map(section => ({ expression: section.expression, prompt: section.prompt.slice(0, 300) })) }] : [];
  }).slice(0, 5);
  return context;
}

export const ozonAnalysisSignature = (product: unknown, assetIds: string[]) => createHash("sha256").update(JSON.stringify({ product, assetIds })).digest("hex");

export async function ozonSectionReferences(projectId: string, section: { order: number; editableData: unknown }, explicitIds: string[] = []) {
  const run = await prisma.detailRun.findFirst({ where: { projectId, input: { path: "$.contentProfile", equals: "ozon" } }, orderBy: { createdAt: "desc" } });
  const context = (run?.checkpoint as { ozon?: OzonContext } | null)?.ozon;
  const metadata = (section.editableData as { ozon?: { referenceAssetIds: string[]; variantOverview?: boolean } } | null)?.ozon;
  if (!context?.analysis || !metadata) throw new Error("此 Ozon 图片缺少已确认的商品分析与素材记录，请从原作品重新创建一套。");
  const { ozonPixelReferences } = await import("./contract");
  const referenceAssetIds = ozonPixelReferences(context, explicitIds.length ? explicitIds : metadata.referenceAssetIds, metadata.variantOverview);
  return { context, metadata, referenceAssetIds };
}

export async function cloneOzonProject(projectId: string) {
  const original = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { assets: { where: { type: { in: ["MAIN", "ANGLE", "DETAIL", "REFERENCE"] } }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }] } } });
  const snapshot = original.modelSnapshot as Record<string, any> | null;
  if (original.platform !== "ozon" || snapshot?.trashedAt) throw new Error("只能从有效的 Ozon 作品再生成一套。");
  const project = await prisma.project.create({ data: { name: original.name, platform: "ozon", style: original.style, description: original.description, modelSnapshot: { ozonProduct: readOzonProduct(snapshot), previewConfig: snapshot?.previewConfig || { heroImageCount: 5, detailSectionCount: 0, contentLanguage: "ru-RU", imageAspectRatio: "3:4" }, creativePreferences: snapshot?.creativePreferences || {}, ozonSourceProjectId: projectId } } });
  const remap = new Map<string, string>();
  for (const asset of original.assets) {
    const copy = await saveUploadAsset({ projectId: project.id, type: asset.type, fileName: asset.fileName, mimeType: asset.mimeType, fileBuffer: await readStorageFile(asset.filePath), sortOrder: asset.sortOrder, isMain: asset.isMain, purpose: isStyleReference(asset) ? "style_reference" : "product_identity" });
    remap.set(asset.id, copy.id);
  }
  const references = ozonReferencesSchema.parse(snapshot?.ozonReferences || []).filter(row => remap.has(row.assetId)).map(row => ({ ...row, assetId: remap.get(row.assetId)! }));
  if (references.length) await prisma.project.update({ where: { id: project.id }, data: { modelSnapshot: { ...project.modelSnapshot as object, ozonReferences: references } } });
  return { id: project.id };
}
