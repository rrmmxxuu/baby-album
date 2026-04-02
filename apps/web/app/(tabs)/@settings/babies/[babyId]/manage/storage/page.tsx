import { BabyRouteShell } from "../../../../../../../components/app-shell/routes/baby-route-shell";
import { BabyStorageRoute } from "../../../../../../../components/app-shell/routes/baby-storage-route";

interface BabyStoragePageProps {
  params: Promise<{ babyId: string }>;
}

export default async function BabyStoragePage({ params }: BabyStoragePageProps) {
  const { babyId } = await params;
  return (
    <BabyRouteShell activeTab="settings" babyId={babyId}>
      <BabyStorageRoute />
    </BabyRouteShell>
  );
}
