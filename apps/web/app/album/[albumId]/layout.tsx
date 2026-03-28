import { AlbumRouteShell } from "../../../components/app-shell/routes/album-route-shell";

interface AlbumLayoutProps {
  children: React.ReactNode;
  params: Promise<{ albumId: string }>;
}

export default async function AlbumLayout({ children, params }: AlbumLayoutProps) {
  const { albumId } = await params;
  return <AlbumRouteShell albumId={albumId}>{children}</AlbumRouteShell>;
}
