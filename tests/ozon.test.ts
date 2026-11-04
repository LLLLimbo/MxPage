import assert from "node:assert/strict";
import { test } from "node:test";
import { assertOzonQuantityCopy, isOzonRatio, normalizeOzonPlanReferences, ozonAnalysisSchema, ozonImageRole, ozonPixelReferences, ozonProductSchema, resolveSaleQuantity, validateOzonAnalysis, type OzonContext } from "../lib/ozon/contract";
import { imageFailureCode, ozonImageParameters } from "../lib/ozon/image-policy";
import { requestErrorMessage } from "../lib/utils/request-error";
import { buildCommerceSystemPrompt } from "../lib/ai/prompts/ecommerce-system";
import { zodResponseFormat } from "openai/helpers/zod";
import { assertStrictResponseSchema } from "./helpers/strict-response-schema";
import { hasContentRefusal, contentRefusalError } from "../lib/ai/content-refusal";

test("Ozon analysis has a provider-compatible strict structured output schema", () => {
  const format = zodResponseFormat(ozonAnalysisSchema, "ozon_analysis");
  assertStrictResponseSchema(format.json_schema.schema);
});

test("Ozon quantities use dedicated input, explicit specifications and original title in order", () => {
  const cases = [
    [{ saleQuantity: "12", attributes: "数量：8", title: "44 шт." }, "12 件", "input:saleQuantity"],
    [{ saleQuantity: "2 双", title: "44 шт." }, "2 双", "input:saleQuantity"],
    [{ saleQuantity: "3 套" }, "3 套", "input:saleQuantity"],
    [{ saleQuantity: "1 盒" }, "1 盒", "input:saleQuantity"],
    [{ saleQuantity: "2套，每套5件" }, "2套，每套5件", "input:saleQuantity"],
    [{ attributes: "100% cotton; 8 pcs", title: "44 шт." }, "8 pcs", "input:attributes"],
    [{ attributes: "数量：8", title: "44 шт." }, "8 件", "input:attributes"],
    [{ title: "Набор 44 шт." }, "44 шт.", "input:title"],
    [{ title: "Cup 6 pcs" }, "6 pcs", "input:title"],
    [{ title: "杯子", attributes: "容量 500 mL；高度 12 cm" }, undefined, undefined],
    [{}, undefined, undefined],
    [{ saleQuantity: "不确定", title: "6 pcs" }, undefined, undefined],
    [{ attributes: "2 pcs or 4 pcs", title: "6 pcs" }, undefined, undefined],
  ] as const;
  for (const [raw, text, sourceId] of cases) {
    const quantity = resolveSaleQuantity(ozonProductSchema.parse(raw));
    assert.equal(quantity?.text, text, JSON.stringify(raw));
    assert.equal(quantity?.sourceId, sourceId);
  }
});

test("Ozon copy cannot introduce image counts, default one piece or convert sales units", () => {
  assert.throws(() => assertOzonQuantityCopy("44 шт.", null), /没有有效输入/);
  assert.throws(() => assertOzonQuantityCopy("1 pcs", null), /没有有效输入/);
  const pair = resolveSaleQuantity(ozonProductSchema.parse({ saleQuantity: "2 双" }));
  assert.doesNotThrow(() => assertOzonQuantityCopy("2 пары", pair));
  assert.throws(() => assertOzonQuantityCopy("4 шт.", pair), /没有有效输入/);
  assert.doesNotThrow(() => assertOzonQuantityCopy("100% cotton; 12 cm", null));
});

test("Ozon evidence and pixels are distinct; detail crops survive, OCR quantities and other variants do not", () => {
  const context: OzonContext = { version: 1, product: ozonProductSchema.parse({}), anchorAssetId: "main", identityHash: "hash", variationId: "variant", sourceAssetIds: ["main", "crop", "spec", "other"], quantity: null, referenceOverrides: [], history: [] };
  const raw = { identity: "Brown product set", references: [
    { assetId: "main", role: "same_product" }, { assetId: "crop", role: "detail" }, { assetId: "spec", role: "evidence" }, { assetId: "other", role: "variant" },
  ], facts: [
    { id: "surface", claim: "Brown", sourceId: "main", kind: "appearance" },
    { id: "material", claim: "100% cotton", sourceId: "spec", kind: "material" },
    { id: "ocr_count", claim: "44 pcs", sourceId: "main", kind: "quantity" },
    { id: "other_color", claim: "Blue", sourceId: "other", kind: "appearance" },
  ] };
  context.analysis = validateOzonAnalysis(raw, context);
  assert.deepEqual(context.analysis.facts.map(fact => fact.id), ["surface", "material"]);
  assert.deepEqual(ozonPixelReferences(context, ["crop"]), ["main", "crop"]);
  assert.throws(() => ozonPixelReferences(context, ["spec"]), /仅供信息/);
  assert.throws(() => ozonPixelReferences(context, ["other"], true), /未确认/);
  context.analysis.references[3].variantConfirmed = true;
  assert.deepEqual(ozonPixelReferences(context, ["other"], true), ["main", "other"]);
  assert.throws(() => ozonPixelReferences(context, ["other"]), /未确认/);
  assert.throws(() => validateOzonAnalysis({ ...raw, facts: [{ id: "bad", claim: "Certified", kind: "certification", sourceId: "invented" }] }, context), /不存在的来源/);
});

test("Ozon exact ratios respect existing parameter contracts without alias substitution or paid probes", () => {
  assert.deepEqual(ozonImageParameters({ baseUrl: "https://images.test/v1" }, "gpt-image-2.5-flare"), { aspectRatio: "3:4", size: "1152x1536" });
  assert.equal(ozonImageParameters({ baseUrl: "https://api.evolink.ai/v1" }, "gpt-image-2.5-flare").aspectRatio, "3:4");
  assert.throws(() => ozonImageParameters({ baseUrl: "https://api.evolink.ai/v1" }, "gpt-image-1.5"), /无法确认/);
  assert.throws(() => ozonImageParameters({ baseUrl: "https://images.test/v1" }, "unknown-image"), /无法确认/);
  assert.throws(() => ozonImageParameters({ baseUrl: "https://images.test/v1" }, "gpt-image-2", "1024x1536"), /精确的 3:4/);
  assert.equal(isOzonRatio(48, 64), true);
  assert.equal(isOzonRatio(32, 48), false);
  assert.deepEqual([0, 1, 2].map(index => ozonImageRole(index, 2)), ["catalog_main", "catalog_aux", "rich_detail"]);
  assert.equal(ozonImageRole(0, 0), "rich_detail");
  assert.doesNotMatch(buildCommerceSystemPrompt("ozon"), /整套详情页内容标准|1\. 需求与痛点/);
});

test("Ozon reference bookkeeping derives sources and filters unsupported references without inventing facts", () => {
  const product = ozonProductSchema.parse({ saleQuantity: "2 双" });
  const context: OzonContext = { version: 1, product, anchorAssetId: "main", identityHash: "hash", variationId: "variation", sourceAssetIds: ["main", "crop", "spec", "other"], quantity: resolveSaleQuantity(product), referenceOverrides: [], history: [], analysis: ozonAnalysisSchema.parse({
    identity: "Brown product", references: [{ assetId: "main", role: "same_product" }, { assetId: "crop", role: "detail" }, { assetId: "spec", role: "evidence" }, { assetId: "other", role: "variant", variantConfirmed: true }], facts: [
      { id: "material", claim: "Cotton", kind: "material", sourceId: "spec" },
      { id: "sale_quantity", claim: "2 双", kind: "quantity", sourceId: "input:saleQuantity" },
      { id: "other_color", claim: "Blue", kind: "appearance", sourceId: "other", scope: "variant" },
    ],
  }) };
  const draft = [{ copy: "Neutral product copy", factIds: ["material", "sale_quantity", "unknown", "other_color"], evidence: ["main", "invented", "other"], referenceAssetIds: ["crop", "spec", "other", "foreign"], variantOverview: false }];
  const result = normalizeOzonPlanReferences(draft, context);
  assert.deepEqual(result.sections[0].factIds, ["material", "sale_quantity"]);
  assert.deepEqual(result.sections[0].evidence, ["main", "spec", "input:saleQuantity"]);
  assert.deepEqual(result.sections[0].referenceAssetIds, ["main", "crop"]);
  assert.equal(result.sections[0].copy, draft[0].copy);
  assert.equal(result.warnings.length, 2);
  assert.deepEqual(draft[0].factIds, ["material", "sale_quantity", "unknown", "other_color"]);
  const confirmed = normalizeOzonPlanReferences([{ factIds: ["other_color"], referenceAssetIds: ["other"], variantOverview: true }], context);
  assert.deepEqual(confirmed.sections[0].evidence, ["other"]);
  assert.deepEqual(confirmed.sections[0].referenceAssetIds, ["main", "other"]);
  assert.deepEqual(confirmed.warnings, []);
  assert.deepEqual(normalizeOzonPlanReferences(result.sections, context).sections, result.sections);
});

test("Ozon moderation, configuration, transport, query and download failures remain distinguishable", () => {
  assert.equal(hasContentRefusal({ candidates: [{ finishReason: "SAFETY" }] }), true);
  assert.equal(hasContentRefusal({ output: [{ content: [{ type: "refusal" }] }] }), true);
  assert.equal(hasContentRefusal({ choices: [{ finish_reason: "content_filter" }] }), true);
  assert.equal(hasContentRefusal({ candidates: [{ content: { parts: [] } }] }), false);
  assert.equal(imageFailureCode(contentRefusalError()), "CONTENT_MODERATION_REFUSAL");
  for (const [error, expected] of [
    [{ status: 400, code: "IMAGE_REQUEST_FAILED", message: 'content_policy_violation' }, "CONTENT_MODERATION_REFUSAL"],
    [{ status: 403 }, "PROVIDER_AUTH_ERROR"], [{ status: 401 }, "PROVIDER_AUTH_ERROR"], [{ status: 429 }, "PROVIDER_RATE_LIMIT"],
    [{ code: "OZON_RATIO_UNSUPPORTED" }, "OZON_RATIO_UNSUPPORTED"], [{ message: "request timeout" }, "PROVIDER_TIMEOUT"],
    [{ code: "ECONNRESET" }, "PROVIDER_NETWORK_ERROR"], [{ code: "IMAGE_RESULT_QUERY_FAILED" }, "IMAGE_RESULT_QUERY_FAILED"],
    [{ code: "IMAGE_DOWNLOAD_FAILED" }, "IMAGE_DOWNLOAD_FAILED"], [{ status: 502 }, "PROVIDER_HTTP_ERROR"],
  ] as const) assert.equal(imageFailureCode(error), expected);
  assert.match(requestErrorMessage({ code: "CONTENT_MODERATION_REFUSAL" }), /内容审核/);
});
