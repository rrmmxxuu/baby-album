import { BabyMemberRoute } from "../../../../../../components/app-shell/routes/baby-member-route";

interface BabyMemberPageProps {
  params: Promise<{ memberId: string }>;
}

export default async function BabyMemberPage({ params }: BabyMemberPageProps) {
  const { memberId } = await params;
  return <BabyMemberRoute memberId={memberId} />;
}
