import { BabyRouteShell } from "../../../../../../components/app-shell/routes/baby-route-shell";
import { BabyFeedingRoute } from "../../../../../../components/app-shell/routes/baby-feeding-route";

interface BabyFeedingPageProps {
  params: Promise<{ babyId: string }>;
}

export default async function BabyFeedingPage({ params }: BabyFeedingPageProps) {
  const { babyId } = await params;
  return (
    <BabyRouteShell activeTab="feeding" babyId={babyId}>
      <BabyFeedingRoute />
    </BabyRouteShell>
  );
}
