import { BabyRouteShell } from "../../../../../../../../components/app-shell/routes/baby-route-shell";
import { BabyMemberRoute } from "../../../../../../../../components/app-shell/routes/baby-member-route";

interface BabyMemberPageProps {
  params: Promise<{ babyId: string; memberId: string }>;
}

export default async function BabyMemberPage({ params }: BabyMemberPageProps) {
  const { babyId, memberId } = await params;
  return (
    <BabyRouteShell activeTab="settings" babyId={babyId}>
      <BabyMemberRoute memberId={memberId} />
    </BabyRouteShell>
  );
}
