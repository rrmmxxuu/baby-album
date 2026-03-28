"use client";

import { useAlbumRouteContext } from "../album-route-context";
import { PhotosTab } from "../ui/photos-tab";

export function PhotosRoute() {
  const { activeAlbum, activeBaby, albumOptions, currentUser, session, timeline, timelineDays, handleAlbumChange } = useAlbumRouteContext();

  return (
    <PhotosTab
      activeAlbum={activeAlbum}
      activeBaby={activeBaby}
      activeTab
      albumOptions={albumOptions}
      authToken={session.authToken}
      currentUserId={currentUser?.id}
      onAlbumChange={handleAlbumChange}
      timeline={timeline}
      timelineDays={timelineDays}
    />
  );
}
