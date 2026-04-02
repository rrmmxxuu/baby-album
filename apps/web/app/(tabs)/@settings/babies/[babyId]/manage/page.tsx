import { BabyRouteShell } from "../../../../../../components/app-shell/routes/baby-route-shell";
import { BabyManageRoute } from "../../../../../../components/app-shell/routes/baby-manage-route";

interface BabyManagePageProps {
  params: Promise<{ babyId: string }>;
}

export default async function BabyManagePage({ params }: BabyManagePageProps) {
  const { babyId } = await params;
  return (
    <BabyRouteShell activeTab="settings" babyId={babyId}>
      <BabyManageRoute />
    </BabyRouteShell>
  );
}
