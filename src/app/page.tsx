import { AdminApp } from "@/components/admin/admin-app";
import { StageView } from "@/components/stage/stage-view";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if (view === "stage") return <StageView />;
  return <AdminApp />;
}
