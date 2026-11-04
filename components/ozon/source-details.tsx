import { ozonImageRoleLabels } from "@/lib/ozon/contract";

export function OzonSourceDetails({ section, assets }: { section: any; assets: Array<{ id: string; fileName?: string; url?: string }> }) {
  const data = section?.currentImageAsset?.metadata?.ozon || section?.editableData?.ozon;
  if (!data) return null;
  const sources: Record<string, string> = { "input:title": "原始标题", "input:attributes": "规格资料", "input:saleQuantity": "售卖数量输入" };
  const label = (id: string) => sources[id] || (id.startsWith("input:answer_") ? "用户补充资料" : assets.find(asset => asset.id === id)?.fileName || id);
  return <details className="space-y-3 border-t pt-4 text-sm"><summary className="cursor-pointer">图片资料与实际提示词</summary><p className="mt-3 text-xs text-muted-foreground">{ozonImageRoleLabels[data.imageRole as keyof typeof ozonImageRoleLabels]} · 3:4 · 规则版本 {data.ruleVersion}</p>
    {data.delivery && <p className={`text-xs ${data.delivery.ratioValid ? "text-muted-foreground" : "text-amber-700"}`}>实际尺寸 {data.delivery.width} × {data.delivery.height}{!data.delivery.ratioValid && " · 比例不符合3:4，原图已保留"}</p>}
    <p className="text-xs">售卖数量：{data.quantity?.text || "未知，未默认1件"}</p>
    <p className="text-xs text-muted-foreground">像素参考：{data.referenceAssetIds?.map(label).join("、") || "无"}</p>
    {data.facts?.length > 0 && <ul className="list-disc space-y-2 pl-4 text-xs leading-5">{data.facts.map((fact: any) => <li key={fact.id}>{fact.claim}<span className="text-muted-foreground"> · 来源：{label(fact.sourceId)}</span></li>)}</ul>}
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs leading-6">{section.currentImageAsset?.metadata?.prompt || section.visualPrompt}</pre>
  </details>;
}
