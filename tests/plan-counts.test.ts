import assert from "node:assert/strict";
import { test } from "node:test";
import { canReconcilePlanCounts, InvalidPlanCounts, planCountIssue, reconcilePlanCounts } from "../lib/detail-runs/plan-counts";

function sections(heroes: number, details: number) {
  return Array.from({ length: heroes + details }, (_, index) => ({ kind: index < heroes ? "HERO" as const : "DETAIL" as const, title: `Image ${index}`, copy: `Copy ${index}: 500 mL`, objective: `Purpose ${index}`, buyerQuestion: `Question ${index}`, evidence: [`source-${index}`], factIds: [`fact-${index}`], referenceAssetIds: [`image-${index}`], variantOverview: false }));
}

for (const heroes of [6, 8]) test(`Ozon ${heroes}+7 planning fits ${heroes}+6 slots without losing copy or provenance`, () => {
  const original = sections(heroes, 7), snapshot = structuredClone(original);
  const repaired = reconcilePlanCounts(original, heroes, 6);
  assert.equal(repaired.sections.length, heroes + 6);
  assert.equal(repaired.sections.filter(section => section.kind === "DETAIL").length, 6);
  assert.deepEqual(original, snapshot);
  const last = repaired.sections.at(-1)!;
  assert.ok(last.copy.includes(original.at(-1)!.copy));
  assert.ok(last.copy.includes(original.at(-2)!.copy));
  assert.deepEqual(last.factIds, [original.at(-2)!.factIds[0], original.at(-1)!.factIds[0]]);
  assert.deepEqual(last.evidence, [original.at(-2)!.evidence[0], original.at(-1)!.evidence[0]]);
  assert.deepEqual(last.referenceAssetIds, [original.at(-2)!.referenceAssetIds[0], original.at(-1)!.referenceAssetIds[0]]);
  assert.deepEqual(repaired.sourceIndexes.at(-1), [heroes + 5, heroes + 6]);
  assert.equal(reconcilePlanCounts(repaired.sections, heroes, 6).changed, false);
  assert.equal(planCountIssue(repaired.sections, heroes, 6), undefined);
});

test("plan counts do not invent missing images, cross image roles, or allow an empty task", () => {
  assert.equal(canReconcilePlanCounts(sections(6, 5), 6, 6), false);
  assert.throws(() => reconcilePlanCounts(sections(6, 5), 6, 6), InvalidPlanCounts);
  assert.equal(canReconcilePlanCounts(sections(6, 1), 6, 0), false);
  assert.equal(canReconcilePlanCounts([], 0, 0), false);
  assert.equal(planCountIssue(sections(6, 7), 6, 6, true), "富文本详情图要求 6 张，规划实际返回 7 张。尚未开始生图，已保存规划草稿。");
});

test("exact plans and interleaved roles preserve requested order and visible content", () => {
  assert.equal(reconcilePlanCounts(sections(0, 1), 0, 1).changed, false);
  const original = sections(2, 2);
  const repaired = reconcilePlanCounts([original[0], original[2], original[1], original[3]], 2, 2);
  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.sections, original);
});
