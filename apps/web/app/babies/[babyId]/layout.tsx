import { BabyRouteShell } from "../../../components/app-shell/routes/baby-route-shell";

interface BabyLayoutProps {
  children: React.ReactNode;
  params: Promise<{ babyId: string }>;
}

export default async function BabyLayout({ children, params }: BabyLayoutProps) {
  const { babyId } = await params;
  return <BabyRouteShell babyId={babyId}>{children}</BabyRouteShell>;
}
