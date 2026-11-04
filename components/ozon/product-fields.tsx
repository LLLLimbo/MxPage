"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { resolveSaleQuantity, type OzonProduct } from "@/lib/ozon/contract";

export function OzonProductFields({ value, onChange }: { value: OzonProduct; onChange: (value: OzonProduct) => void }) {
  const quantity = resolveSaleQuantity(value);
  return <div className="space-y-4">
    <label className="block space-y-2 text-sm">原始商品标题（可选）<Input value={value.title} maxLength={2000} placeholder="保留原始标题，商品颜色与款式以第一张参考图为准" onChange={event => onChange({ ...value, title: event.target.value })}/></label>
    <label className="block space-y-2 text-sm">规格与商品资料（可选）<Textarea value={value.attributes} rows={4} maxLength={12000} placeholder="填写已知尺寸、成分、规格、功能、套装组成等真实资料" onChange={event => onChange({ ...value, attributes: event.target.value })}/></label>
    <label className="block space-y-2 text-sm">售卖数量（可选）<Input value={value.saleQuantity} maxLength={120} placeholder="例如：12、2 双、3 套、1 盒" onChange={event => onChange({ ...value, saleQuantity: event.target.value })}/></label>
    <p className="text-xs leading-6 text-muted-foreground">{quantity ? `本次售卖数量：${quantity.text}（${quantity.sourceId === "input:saleQuantity" ? "专用数量输入" : quantity.sourceId === "input:attributes" ? "规格资料" : "原始标题"}）` : "售卖数量未知，图片中不会默认标注 1 件。"} 数量与生成图片张数分别设置，不从参考图片上的件数或物件摆放推断。</p>
  </div>;
}
