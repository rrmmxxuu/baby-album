import { redirect } from "next/navigation";

interface BabyRouteEntryProps {
  params: Promise<{ babyId: string }>;
}

export default async function BabyRouteEntry({ params }: BabyRouteEntryProps) {
  const { babyId } = await params;
  redirect(`/babies/${encodeURIComponent(babyId)}/photos`);
}

