import { HomeCreateWorkspace } from "@/components/projects/home-create-workspace";

export const dynamic = "force-dynamic";
export default function OzonPage({ searchParams }: { searchParams: { batch?: string } }) {
  return <div className="space-y-6" data-ozon-workspace><HomeCreateWorkspace key={searchParams.batch || "new"} initialBatch={!!searchParams.batch} ozon/></div>;
}
