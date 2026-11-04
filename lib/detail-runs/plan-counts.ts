type Kind = "HERO" | "DETAIL";
type Section = { kind: Kind; copy: string; objective: string; buyerQuestion: string; evidence: string[]; factIds?: string[]; referenceAssetIds?: string[]; variantOverview?: boolean };

export class InvalidPlanCounts extends Error {
  readonly code = "PLAN_COUNT_INVALID";
}

export function planCountIssue(sections: Array<{ kind: Kind }>, heroes: number, details: number, ozon = false) {
  const actualHeroes = sections.filter(section => section.kind === "HERO").length;
  const actualDetails = sections.filter(section => section.kind === "DETAIL").length;
  const issues = [
    actualHeroes !== heroes ? `${ozon ? "商品卡图片" : "主图"}要求 ${heroes} 张，规划实际返回 ${actualHeroes} 张` : "",
    actualDetails !== details ? `${ozon ? "富文本详情图" : "详情图"}要求 ${details} 张，规划实际返回 ${actualDetails} 张` : "",
  ].filter(Boolean);
  return issues.length ? `${issues.join("；")}。尚未开始生图，已保存规划草稿。` : undefined;
}

export function canReconcilePlanCounts(sections: Array<{ kind: Kind }>, heroes: number, details: number) {
  if (!Number.isInteger(heroes) || !Number.isInteger(details) || heroes < 0 || details < 0 || heroes + details < 1) return false;
  return ([["HERO", heroes], ["DETAIL", details]] as const).every(([kind, requested]) => {
    const actual = sections.filter(section => section.kind === kind).length;
    return requested ? actual >= requested : actual === 0;
  });
}

const join = (left: string, right: string) => [...new Set([left, right].filter(Boolean))].join("\n\n");
const union = (left: string[] = [], right: string[] = []) => [...new Set([...left, ...right])];

/** Before storyboarding only: retain all supplied content and references while fitting surplus sections into the requested slots. */
export function reconcilePlanCounts<T extends Section>(sections: T[], heroes: number, details: number) {
  if (!canReconcilePlanCounts(sections, heroes, details)) throw new InvalidPlanCounts(planCountIssue(sections, heroes, details, true) || "图片规划数量无效。");
  const result: T[] = [];
  const sourceIndexes: number[][] = [];
  for (const [kind, requested] of [["HERO", heroes], ["DETAIL", details]] as const) {
    const group = sections.map((section, index) => ({ section, index })).filter(item => item.section.kind === kind);
    const offset = result.length;
    for (const entry of group.slice(0, requested)) { result.push({ ...entry.section }); sourceIndexes.push([entry.index]); }
    for (let index = requested; index < group.length; index++) {
      const target = offset + requested - 1 - (index - requested) % requested;
      const left = result[target], right = group[index].section;
      result[target] = { ...left, copy: join(left.copy, right.copy), objective: join(left.objective, right.objective), buyerQuestion: join(left.buyerQuestion, right.buyerQuestion), evidence: union(left.evidence, right.evidence),
        ...(left.factIds || right.factIds ? { factIds: union(left.factIds, right.factIds) } : {}),
        ...(left.referenceAssetIds || right.referenceAssetIds ? { referenceAssetIds: union(left.referenceAssetIds, right.referenceAssetIds) } : {}),
        ...(left.variantOverview || right.variantOverview ? { variantOverview: true } : {}),
      };
      sourceIndexes[target].push(group[index].index);
    }
  }
  return { sections: result, sourceIndexes, changed: result.length !== sections.length || sourceIndexes.some((sources, index) => sources.length !== 1 || sources[0] !== index) };
}
