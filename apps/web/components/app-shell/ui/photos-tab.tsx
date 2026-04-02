import type { AlbumSummary, AlbumWorkspace, BabyProfile } from "../../../lib/types";
import type { TimelineDayGroup } from "../model/types";
import type { TimelineState } from "../hooks/use-timeline-state";
import { PanelMessage } from "../../ui/panel-message";
import { PhotosTimelineLoadingSkeleton } from "./loading-skeletons";
import { PhotosHero } from "./photos-hero";
import { TimelineDaySection } from "./timeline-day-section";

interface PhotosTabProps {
  activeTab: boolean;
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  albumOptions: AlbumSummary[];
  timeline: TimelineState;
  timelineDays: TimelineDayGroup[];
  currentUserId?: string;
  onAlbumChange: (albumId: string) => void;
  onEditEntry: (entryId: string) => void;
  onOpenLightbox: (entryId: string, mediaId: string) => void;
}

export function PhotosTab({ activeTab, activeAlbum, activeBaby, albumOptions, timeline, timelineDays, currentUserId, onAlbumChange, onEditEntry, onOpenLightbox }: PhotosTabProps) {
  return (
    <section
      aria-hidden={!activeTab}
      hidden={!activeTab}
      className={`pageStack photosPage tabSection ${activeTab ? "tabSectionActive" : "tabSectionInactive"}`}
      onTouchCancel={timeline.resetPullRefresh}
      onTouchEnd={timeline.handlePhotosTouchEnd}
      onTouchMove={timeline.handlePhotosTouchMove}
      onTouchStart={timeline.handlePhotosTouchStart}
    >
      <div className="photosFeedShell">
        <div className={`pullRefreshIndicator${timeline.pullOffset > 0 || timeline.timelineRefreshing ? " pullRefreshIndicatorVisible" : ""}${timeline.pullReady ? " pullRefreshIndicatorReady" : ""}`}>
          <div className={`pullRefreshSpinner${timeline.timelineRefreshing ? " pullRefreshSpinnerSpinning" : ""}`} />
          <span>{timeline.timelineRefreshing ? "正在刷新" : timeline.pullReady ? "松手刷新" : "下拉刷新"}</span>
        </div>

        <div className="momentsPullLayer" style={timeline.pullOffset > 0 ? { transform: `translate3d(0, ${timeline.pullOffset}px, 0)` } : undefined}>
          <PhotosHero activeAlbum={activeAlbum} activeBaby={activeBaby} albumOptions={albumOptions} onAlbumChange={onAlbumChange} timelineCount={timeline.timelineEntries.length} timelineLoading={timeline.timelineLoading} />

          <div className="momentsFeed">
            {timeline.timelineLoading && timelineDays.length === 0 ? <PhotosTimelineLoadingSkeleton ariaLabel="正在加载时间线" /> : null}
            {!timeline.timelineLoading && timelineDays.length === 0 ? <PanelMessage message="还没有媒体内容，先去上传一张照片吧。" /> : null}
            {timelineDays.map((day, index) => (
              <TimelineDaySection activeAlbum={activeAlbum} currentUserId={currentUserId} day={day} key={day.day} onEditEntry={onEditEntry} onOpenLightbox={onOpenLightbox} priority={index < 2} timeline={timeline} />
            ))}
            {timeline.timelineLoadingMore ? <div className="timelineFooterState"><div className="pullRefreshSpinner pullRefreshSpinnerSpinning" /><span>正在加载更多</span></div> : null}
            {!timeline.timelineHasMore && timeline.timelineEntries.length > 0 ? <div className="timelineFooterState timelineFooterStateDone"><span>已经到底了</span></div> : null}
            <div className="timelineLoadMoreSentinel" ref={timeline.loadMoreSentinelRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
