import { redirect } from "next/navigation";

interface AlbumIndexPageProps {
  params: Promise<{ albumId: string }>;
}

export default async function AlbumIndexPage({ params }: AlbumIndexPageProps) {
  const { albumId } = await params;
  redirect(`/album/${encodeURIComponent(albumId)}/photos`);
}
