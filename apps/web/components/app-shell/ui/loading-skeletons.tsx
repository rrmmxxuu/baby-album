import type { ReactNode } from "react";

interface LoadingSkeletonProps {
  ariaLabel: string;
}

interface LoadingStatusProps extends LoadingSkeletonProps {
  children: ReactNode;
  className: string;
}

const PHOTO_DAY_CARD_COUNTS = [2, 1] as const;
const FEEDING_ROW_COUNT = 3;
const FEEDING_DATE_CHIP_COUNT = 7;
const SETTINGS_CARD_COUNT = 3;

function LoadingStatus({ ariaLabel, children, className }: LoadingStatusProps) {
  return (
    <section aria-busy="true" aria-label={ariaLabel} className={className} role="status">
      {children}
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <span aria-hidden="true" className={`loadingSkeletonBlock ${className}`} />;
}

function PhotosTimelineLoadingContent() {
  return (
    <div aria-hidden="true" className="momentsFeed loadingSkeletonFeed">
      {PHOTO_DAY_CARD_COUNTS.map((cardCount, dayIndex) => (
        <article className="momentDay loadingSkeletonDay" key={dayIndex}>
          <header className="momentDayHeader">
            <div className="momentDayHeaderCopy">
              <SkeletonBlock className="loadingSkeletonDayTitle" />
              <SkeletonBlock className="loadingSkeletonDayBadge" />
            </div>
          </header>
          <div className="momentBatchList">
            {Array.from({ length: cardCount }, (_, cardIndex) => (
              <article className="surfaceCard momentCard loadingSkeletonMomentCard" key={cardIndex}>
                <div className="loadingSkeletonMomentHeader">
                  <SkeletonBlock className="loadingSkeletonMomentTitle" />
                  <SkeletonBlock className="loadingSkeletonMomentMeta" />
                </div>
                <div className="loadingSkeletonPhotoGrid">
                  <SkeletonBlock className="loadingSkeletonThumb loadingSkeletonThumbLarge" />
                  <SkeletonBlock className="loadingSkeletonThumb" />
                  <SkeletonBlock className="loadingSkeletonThumb" />
                </div>
                <div className="loadingSkeletonMomentFooter">
                  <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthWide" />
                  <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthShort" />
                </div>
              </article>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function FeedingContentLoadingContent() {
  return (
    <>
      <article aria-hidden="true" className="panel panelStack feedingSummaryPanel loadingSkeletonSummaryPanel">
        <header className="feedingSummaryHeader">
          <SkeletonBlock className="feedingSummaryAvatar loadingSkeletonAvatarSmall" />
          <div className="feedingSummaryIdentity loadingSkeletonStack">
            <SkeletonBlock className="loadingSkeletonTitleCompact loadingSkeletonWidthMedium" />
            <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthWide" />
          </div>
        </header>
        <div className="feedingSummaryGrid">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="feedingSummaryCard" key={index}>
              <SkeletonBlock className="loadingSkeletonSummaryLabel" />
              <SkeletonBlock className="loadingSkeletonSummaryValue" />
              <SkeletonBlock className="loadingSkeletonSummaryDetail" />
            </div>
          ))}
        </div>
      </article>

      <div aria-hidden="true" className="feedingTimeline loadingSkeletonFeedingTimeline">
        {Array.from({ length: FEEDING_ROW_COUNT }, (_, index) => (
          <article className="feedingTimelineRow" key={index}>
            <div className="feedingTimelineTime">
              <SkeletonBlock className="loadingSkeletonFeedTime" />
              <SkeletonBlock className="loadingSkeletonFeedSubtime" />
            </div>
            <div className="feedingEntryCard surfaceCard loadingSkeletonFeedingCard">
              <SkeletonBlock className="loadingSkeletonFeedBadge" />
              <div className="feedingEntryBody">
                <div className="feedingEntryPrimaryRow">
                  <SkeletonBlock className="loadingSkeletonFeedTitle" />
                  <SkeletonBlock className="loadingSkeletonFeedValue" />
                </div>
                <SkeletonBlock className="loadingSkeletonFeedMeta" />
                <SkeletonBlock className="loadingSkeletonFeedNote" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function FeedingDateStripLoadingContent() {
  return (
    <div aria-hidden="true" className="feedingDateStrip surfaceCard loadingSkeletonDateStrip" role="presentation">
      {Array.from({ length: FEEDING_DATE_CHIP_COUNT }, (_, index) => (
        <div
          className={`feedingDateChip loadingSkeletonDateChip${index === 2 ? " loadingSkeletonDateChipActive" : ""}`}
          key={index}
        >
          <SkeletonBlock className="loadingSkeletonDateWeekday" />
          <SkeletonBlock className="loadingSkeletonDateNumber" />
        </div>
      ))}
    </div>
  );
}

export function LoadingStatPill() {
  return <SkeletonBlock className="loadingSkeletonInline loadingSkeletonPill" />;
}

export function AppLoadingSkeleton({ ariaLabel }: LoadingSkeletonProps) {
  return (
    <LoadingStatus ariaLabel={ariaLabel} className="pageStack loadingSkeletonPage">
      <article aria-hidden="true" className="panel panelStack loadingSkeletonPanel loadingSkeletonAppCard">
        <div className="loadingSkeletonStack">
          <SkeletonBlock className="loadingSkeletonBadge" />
          <SkeletonBlock className="loadingSkeletonTitle loadingSkeletonWidthMedium" />
          <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthWide" />
          <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthShort" />
        </div>
      </article>
    </LoadingStatus>
  );
}

export function PhotosRouteSkeleton({ ariaLabel }: LoadingSkeletonProps) {
  return (
    <LoadingStatus ariaLabel={ariaLabel} className="pageStack photosPage loadingSkeletonPage">
      <article aria-hidden="true" className="momentsHero panel loadingSkeletonHero">
        <div className="momentsHeroBackdrop" />
        <div className="momentsHeroBody">
          <SkeletonBlock className="momentsHeroAvatar loadingSkeletonAvatar" />
          <div className="momentsHeroCopy loadingSkeletonStack">
            <SkeletonBlock className="loadingSkeletonHeroTitle" />
            <SkeletonBlock className="loadingSkeletonHeroMeta" />
          </div>
          <div className="momentsHeroAside loadingSkeletonStack">
            <SkeletonBlock className="loadingSkeletonPill" />
            <SkeletonBlock className="loadingSkeletonSelect" />
          </div>
        </div>
      </article>

      <PhotosTimelineLoadingContent />
    </LoadingStatus>
  );
}

export function PhotosTimelineLoadingSkeleton({ ariaLabel }: LoadingSkeletonProps) {
  return (
    <LoadingStatus ariaLabel={ariaLabel} className="loadingSkeletonStatus">
      <PhotosTimelineLoadingContent />
    </LoadingStatus>
  );
}

export function FeedingRouteSkeleton({ ariaLabel }: LoadingSkeletonProps) {
  return (
    <LoadingStatus ariaLabel={ariaLabel} className="pageStack feedingPage tabSection tabSectionActive loadingSkeletonPage">
      <header aria-hidden="true" className="feedingTopBar">
        <SkeletonBlock className="loadingSkeletonTopBarAction" />
        <SkeletonBlock className="loadingSkeletonTopBarTitle" />
        <SkeletonBlock className="loadingSkeletonTopBarAction" />
      </header>

      <FeedingDateStripLoadingContent />
      <FeedingContentLoadingContent />
    </LoadingStatus>
  );
}

export function FeedingContentLoadingSkeleton({ ariaLabel }: LoadingSkeletonProps) {
  return (
    <LoadingStatus ariaLabel={ariaLabel} className="loadingSkeletonStatus">
      <FeedingContentLoadingContent />
    </LoadingStatus>
  );
}

export function SettingsDetailLoadingSkeleton({ ariaLabel }: LoadingSkeletonProps) {
  return (
    <LoadingStatus ariaLabel={ariaLabel} className="pageStack loadingSkeletonPage">
      <article className="panelStack settingsDetailPage settingsScene settingsSceneForward loadingSkeletonSettingsScene">
        <header aria-hidden="true" className="settingsNavBar">
          <SkeletonBlock className="loadingSkeletonTopBarAction" />
          <div className="settingsNavTitle loadingSkeletonStack">
            <SkeletonBlock className="loadingSkeletonSettingsEyebrow" />
            <SkeletonBlock className="loadingSkeletonSettingsTitle" />
          </div>
          <SkeletonBlock className="loadingSkeletonTopBarAction" />
        </header>

        <article aria-hidden="true" className="panel panelStack loadingSkeletonPanel">
          <SkeletonBlock className="loadingSkeletonTitleCompact loadingSkeletonWidthMedium" />
          <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthWide" />
          <SkeletonBlock className="loadingSkeletonLine loadingSkeletonWidthShort" />
        </article>

        <div aria-hidden="true" className="stackList">
          {Array.from({ length: SETTINGS_CARD_COUNT }, (_, index) => (
            <div className="settingsCardButton surfaceCard loadingSkeletonSettingsCard" key={index}>
              <SkeletonBlock className="loadingSkeletonSettingsAvatar" />
              <div className="settingsCardBody loadingSkeletonStack">
                <SkeletonBlock className="loadingSkeletonCardTitle" />
                <SkeletonBlock className="loadingSkeletonCardMeta" />
              </div>
              <SkeletonBlock className="loadingSkeletonSettingsChevron" />
            </div>
          ))}
        </div>
      </article>
    </LoadingStatus>
  );
}
