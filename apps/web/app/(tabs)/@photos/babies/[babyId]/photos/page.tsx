import { BabyRouteShell } from "../../../../../../components/app-shell/routes/baby-route-shell";
import { BabyPhotosRoute } from "../../../../../../components/app-shell/routes/baby-photos-route";

interface BabyPhotosPageProps {
  params: Promise<{ babyId: string }>;
}

export default async function BabyPhotosPage({ params }: BabyPhotosPageProps) {
  const { babyId } = await params;
  return (
    <BabyRouteShell activeTab="photos" babyId={babyId}>
      <BabyPhotosRoute />
    </BabyRouteShell>
  );
}
