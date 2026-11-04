import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ozon 一键详情页 · MxPage", robots: { index: false, follow: false } };
export default function OzonLayout({ children }: { children: React.ReactNode }) { return children; }
