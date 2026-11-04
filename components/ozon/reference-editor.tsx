"use client";

import { Select } from "@/components/ui/select";
import { ozonReferenceRoles, ozonReferenceLabels, type OzonReference } from "@/lib/ozon/contract";

export function OzonReferenceEditor({ assets, value, onChange }: { assets: Array<{ id: string; url: string; fileName?: string }>; value: OzonReference[]; onChange: (rows: OzonReference[]) => void }) {
  if (!value.length) return null;
  return <section className="space-y-3" aria-label="Ozon 参考图用途"><h2 className="text-sm font-medium">参考图用途</h2><p className="text-xs leading-5 text-muted-foreground">第一张确定商品身份。参数图只提供文字信息，其他变体默认不参与本款出图；细节图可用于局部展示。</p>{value.map((row, index) => <div key={row.assetId} className="flex items-start gap-3 rounded-xl border p-3">
    <img src={assets.find(asset => asset.id === row.assetId)?.url} alt={`参考图 ${index + 1}`} className="h-16 w-16 shrink-0 rounded-lg bg-muted object-contain"/>
    <div className="min-w-0 flex-1 space-y-2"><Select aria-label={`参考图 ${index + 1} 用途`} value={row.role} disabled={index === 0} onValueChange={role => onChange(value.map(item => item.assetId === row.assetId ? { ...item, role: role as OzonReference["role"], variantConfirmed: false } : item))}>{ozonReferenceRoles.map(role => <option key={role} value={role}>{ozonReferenceLabels[role]}</option>)}</Select>
      <p className="text-xs leading-5 text-muted-foreground">{index === 0 ? "商品身份依据" : row.reason}</p>
      {row.role === "variant" && <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={row.variantConfirmed} onChange={event => onChange(value.map(item => item.assetId === row.assetId ? { ...item, variantConfirmed: event.target.checked } : item))}/>确认此变体属于可展示范围，仅在专门的变体展示图中使用</label>}
    </div>
  </div>)}</section>;
}
