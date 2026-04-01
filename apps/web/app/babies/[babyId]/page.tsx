import { redirect } from "next/navigation";

interface BabyIndexPageProps {
  params: Promise<{ babyId: string }>;
}

export default async function BabyIndexPage({ params }: BabyIndexPageProps) {
  const { babyId } = await params;
  redirect(`/babies/${encodeURIComponent(babyId)}/photos`);
}
