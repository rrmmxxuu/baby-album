"use client";

import { useAlbumRouteContext } from "../album-route-context";
import { PhotosTab } from "../ui/photos-tab";

export function PhotosRoute() {
  const { activeAlbum, activeBaby, activeTab, albumOptions, currentUser, session, timeline, timelineDays, handleAlbumChange, handleOpenEditEntry, handleOpenLightbox } = useAlbumRouteContext();

  return (
    <PhotosTab
      activeAlbum={activeAlbum}
      activeBaby={activeBaby}
      activeTab={activeTab === "photos"}
      albumOptions={albumOptions}
      currentUserId={currentUser?.id}
      onAlbumChange={handleAlbumChange}
      onEditEntry={handleOpenEditEntry}
      onOpenLightbox={handleOpenLightbox}
      timeline={timeline}
      timelineDays={timelineDays}
    />
  );
}
