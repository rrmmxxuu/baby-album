package store

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"babyalbum/api/internal/domain"
)

var (
	ErrUnauthorized     = errors.New("unauthorized")
	ErrForbidden        = errors.New("forbidden")
	ErrNodeUnauthorized = errors.New("storage node unauthorized")
	ErrNotFound         = errors.New("not found")
	ErrConflict         = errors.New("conflict")
	ErrPairingNotFound  = errors.New("pairing code not found")
	ErrPairingExpired   = errors.New("pairing code expired")
	ErrPairingUsed      = errors.New("pairing code already used")
)

const (
	DefaultTimelinePageSize    = 10
	MaxDuplicateMediaBatchSize = 500
)

type TimelinePageInput struct {
	Cursor string
	Limit  int
}

type TimelinePage struct {
	Items      []domain.TimelineEntry `json:"items"`
	NextCursor string                 `json:"nextCursor,omitempty"`
	HasMore    bool                   `json:"hasMore"`
}

type FeedingCountSummary struct {
	Count     int `json:"count"`
	ItemCount int `json:"itemCount,omitempty"`
}

type FeedingMilkSummary struct {
	Count         int `json:"count"`
	BreastCount   int `json:"breastCount"`
	BottleCount   int `json:"bottleCount"`
	FormulaCount  int `json:"formulaCount"`
	TotalML       int `json:"totalMl"`
	BreastMinutes int `json:"breastMinutes"`
}

type FeedingDiaperSummary struct {
	Count      int `json:"count"`
	StoolCount int `json:"stoolCount"`
}

type FeedingSleepSummary struct {
	Count        int `json:"count"`
	TotalMinutes int `json:"totalMinutes"`
}

type FeedingSummary struct {
	Milk       FeedingMilkSummary   `json:"milk"`
	Diaper     FeedingDiaperSummary `json:"diaper"`
	Solid      FeedingCountSummary  `json:"solid"`
	Supplement FeedingCountSummary  `json:"supplement"`
	Medicine   FeedingCountSummary  `json:"medicine"`
	Sleep      FeedingSleepSummary  `json:"sleep"`
}

type FeedingDayInput struct {
	BabyID string
	Day    string
}

type FeedingDay struct {
	Day               string                            `json:"day"`
	Summary           FeedingSummary                    `json:"summary"`
	Entries           []domain.FeedingEntry             `json:"entries"`
	ActiveBreastTimer *domain.BreastFeedingTimerSession `json:"activeBreastTimer,omitempty"`
}

type FeedingEntryItemInput struct {
	Name string
	Dose string
}

type CreateFeedingEntryInput struct {
	BabyID             string
	Category           domain.FeedingCategory
	OccurredAt         time.Time
	EndedAt            *time.Time
	Note               string
	MilkMode           domain.FeedingMilkMode
	AmountML           *int
	BreastLeftSeconds  *int
	BreastRightSeconds *int
	FoodName           string
	HasStool           *bool
	Items              []FeedingEntryItemInput
}

type UpdateFeedingEntryInput struct {
	BabyID             string
	EntryID            string
	Category           domain.FeedingCategory
	OccurredAt         time.Time
	EndedAt            *time.Time
	Note               string
	MilkMode           domain.FeedingMilkMode
	AmountML           *int
	BreastLeftSeconds  *int
	BreastRightSeconds *int
	FoodName           string
	HasStool           *bool
	Items              []FeedingEntryItemInput
}

type FeedingTimerAction string

const (
	FeedingTimerActionStart  FeedingTimerAction = "start"
	FeedingTimerActionPause  FeedingTimerAction = "pause"
	FeedingTimerActionSwitch FeedingTimerAction = "switch"
	FeedingTimerActionResume FeedingTimerAction = "resume"
	FeedingTimerActionCancel FeedingTimerAction = "cancel"
)

type FeedingTimerActionInput struct {
	BabyID          string
	Action          FeedingTimerAction
	Side            domain.FeedingTimerSide
	ExpectedVersion int
}

type FinishFeedingTimerInput struct {
	BabyID          string
	ExpectedVersion int
	Note            string
}

type FeedingTimerConflictError struct {
	Session *domain.BreastFeedingTimerSession
}

func (e *FeedingTimerConflictError) Error() string {
	return ErrConflict.Error()
}

func (e *FeedingTimerConflictError) Unwrap() error {
	return ErrConflict
}

type UploadSessionInput struct {
	AlbumID       string
	EntryID       string
	UploadBatchID string
	FileName      string
	MediaType     string
	CapturedAt    *time.Time
}

type CreateTimelineEntryInput struct {
	AlbumID    string
	Caption    string
	Visibility domain.TimelineEntryVisibility
	TimeMode   domain.TimelineEntryTimeMode
	DisplayAt  time.Time
}

type UpdateTimelineEntryInput struct {
	AlbumID    string
	EntryID    string
	Caption    string
	Visibility domain.TimelineEntryVisibility
	TimeMode   domain.TimelineEntryTimeMode
	DisplayAt  time.Time
}

type CreateTimelineCommentInput struct {
	AlbumID string
	EntryID string
	Content string
}

type UploadContentInput struct {
	ByteSize               int64
	BlobKey                string
	ContentSHA256          string
	Width                  int
	Height                 int
	PreviewStatus          domain.PreviewStatus
	PreviewBlobKey         string
	ScreenPreviewStatus    domain.PreviewStatus
	ScreenPreviewObjectKey string
}

type PreviewBlobAttachmentInput struct {
	BlobKey string
	Width   int
	Height  int
}

type ScreenPreviewAttachmentInput struct {
	ObjectKey string
}

type DuplicateMediaProbeItemInput struct {
	ClientID string
	ByteSize int64
}

type DuplicateMediaProbeInput struct {
	AlbumID string
	Items   []DuplicateMediaProbeItemInput
}

type DuplicateMediaProbeItem struct {
	ClientID  string `json:"clientId"`
	NeedsHash bool   `json:"needsHash"`
}

type DuplicateMediaProbeResult struct {
	Items []DuplicateMediaProbeItem `json:"items"`
}

type DuplicateMediaResolveItemInput struct {
	ClientID string
	SHA256   string
}

type DuplicateMediaResolveInput struct {
	AlbumID string
	Items   []DuplicateMediaResolveItemInput
}

type DuplicateMediaResolveItem struct {
	ClientID       string `json:"clientId"`
	Duplicate      bool   `json:"duplicate"`
	DuplicateCount int    `json:"duplicateCount"`
}

type DuplicateMediaResolveResult struct {
	Items []DuplicateMediaResolveItem `json:"items"`
}

type JobCompletionInput struct {
	OriginalPath           string
	PreviewBlobKey         string
	ScreenPreviewStatus    domain.PreviewStatus
	ScreenPreviewObjectKey string
	RestoredBlobKey        string
	Width                  int
	Height                 int
	PreviewStatus          domain.PreviewStatus
	ProcessedAt            time.Time
}

type OriginalStatusInput struct {
	AlbumID        string
	MediaID        string
	TriggerRestore bool
}

type OriginalStatusResult struct {
	Media domain.MediaAsset `json:"media"`
}

type StorageCapacityReport struct {
	TotalBytes     int64
	FreeBytes      int64
	AvailableBytes int64
}

type StorageNodeRegisterInput struct {
	NodeID      string
	NodeName    string
	PairingCode string
	Token       string
	Capacity    StorageCapacityReport
}

type StorageNodeRegisterResult struct {
	Node      domain.StorageNode `json:"node"`
	NodeID    string             `json:"nodeId"`
	NodeToken string             `json:"nodeToken"`
}

type CreateStorageNodePairingInput struct {
	AlbumID string
}

type RegisterUserInput struct {
	DisplayName string
	Email       string
	Password    string
}

type LoginInput struct {
	Email    string
	Password string
}

type AuthResult struct {
	User      domain.User `json:"user"`
	Token     string      `json:"token"`
	ExpiresAt time.Time   `json:"expiresAt"`
}

type CreateAlbumInput struct {
	Name      string
	Timezone  string
	BabyName  string
	BirthDate *time.Time
	Relation  string
}

type CreateBabyInput struct {
	AlbumID   string
	Name      string
	BirthDate *time.Time
}

type UpdateBabyInput struct {
	AlbumID   string
	BabyID    string
	Name      string
	BirthDate *time.Time
}

type UpdateBabyAvatarInput struct {
	AlbumID   string
	BabyID    string
	AvatarKey string
}

type LeaveAlbumInput struct {
	AlbumID         string
	TransferOwnerTo string
}

type UpdateAlbumMemberRoleInput struct {
	AlbumID      string
	MemberUserID string
	Role         domain.Role
}

type UpdateAlbumMemberRelationInput struct {
	AlbumID      string
	MemberUserID string
	Relation     string
}

type RemoveAlbumMemberInput struct {
	AlbumID      string
	MemberUserID string
}

type CreateAlbumInviteInput struct {
	AlbumID string
}

type AcceptInviteInput struct {
	Code     string
	Relation string
}

type AlbumSummary struct {
	Album      domain.Album        `json:"album"`
	Baby       *domain.BabyProfile `json:"baby,omitempty"`
	Membership domain.AlbumMember  `json:"membership"`
}

type AlbumWorkspace struct {
	Album       domain.Album           `json:"album"`
	Baby        *domain.BabyProfile    `json:"baby,omitempty"`
	CurrentUser domain.User            `json:"currentUser"`
	Membership  domain.AlbumMember     `json:"membership"`
	StorageNode *domain.StorageNode    `json:"storageNode,omitempty"`
	Timeline    []domain.TimelineEntry `json:"timeline"`
	Members     []domain.AlbumMember   `json:"members"`
	Babies      []domain.BabyProfile   `json:"babies"`
	Invites     []domain.AlbumInvite   `json:"invites"`
}

type AppState struct {
	CurrentUser   domain.User     `json:"currentUser"`
	Albums        []AlbumSummary  `json:"albums"`
	ActiveAlbum   *AlbumWorkspace `json:"activeAlbum,omitempty"`
	ActiveAlbumID string          `json:"activeAlbumId,omitempty"`
}

type DeleteCleanup struct {
	LocalBlobKeys  []string
	WarmObjectKeys []string
}

type Repository interface {
	RegisterUser(input RegisterUserInput) (AuthResult, error)
	Login(input LoginInput) (AuthResult, error)
	SessionUser(token string) (domain.User, error)
	RevokeSession(token string) error
	AppState(userID, albumID string) (AppState, error)
	AlbumWorkspace(albumID, userID string) (AlbumWorkspace, error)
	FeedingDay(userID string, input FeedingDayInput) (FeedingDay, error)
	FeedingTimer(userID, babyID string) (*domain.BreastFeedingTimerSession, error)
	TimelinePage(albumID, userID string, input TimelinePageInput) (TimelinePage, error)
	Members(albumID, userID string) ([]domain.AlbumMember, error)
	MediaByID(albumID, userID, mediaID string) (domain.MediaAsset, error)
	ProbeDuplicateMedia(userID string, input DuplicateMediaProbeInput) (DuplicateMediaProbeResult, error)
	ResolveDuplicateMedia(userID string, input DuplicateMediaResolveInput) (DuplicateMediaResolveResult, error)
	CreateFeedingEntry(userID string, input CreateFeedingEntryInput) (domain.FeedingEntry, error)
	ApplyFeedingTimerAction(userID string, input FeedingTimerActionInput) (*domain.BreastFeedingTimerSession, error)
	FinishFeedingTimer(userID string, input FinishFeedingTimerInput) (domain.FeedingEntry, error)
	CreateTimelineEntry(userID string, input CreateTimelineEntryInput) (domain.TimelineEntry, error)
	CreateTimelineComment(userID string, input CreateTimelineCommentInput) (domain.TimelineComment, error)
	UpdateFeedingEntry(userID string, input UpdateFeedingEntryInput) (domain.FeedingEntry, error)
	UpdateTimelineEntry(userID string, input UpdateTimelineEntryInput) (domain.TimelineEntry, error)
	DeleteFeedingEntry(userID, babyID, entryID string) error
	DeleteTimelineEntry(userID, albumID, entryID string) (DeleteCleanup, error)
	DeleteTimelineEntryMedia(userID, albumID, entryID, mediaID string) (DeleteCleanup, error)
	CreateAlbum(userID string, input CreateAlbumInput) (domain.Album, error)
	CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error)
	BabyByID(userID, albumID, babyID string) (domain.BabyProfile, error)
	UpdateBaby(userID string, input UpdateBabyInput) (domain.BabyProfile, error)
	UpdateBabyAvatar(userID string, input UpdateBabyAvatarInput) (domain.BabyProfile, error)
	DeleteBaby(userID, albumID, babyID string) error
	LeaveAlbum(userID string, input LeaveAlbumInput) error
	UpdateMemberRole(userID string, input UpdateAlbumMemberRoleInput) (domain.AlbumMember, error)
	UpdateMemberRelation(userID string, input UpdateAlbumMemberRelationInput) (domain.AlbumMember, error)
	RemoveMember(userID string, input RemoveAlbumMemberInput) error
	CreateInvite(userID string, input CreateAlbumInviteInput) (domain.AlbumInvite, error)
	Invites(albumID, userID string) ([]domain.AlbumInvite, error)
	InviteByCode(code string) (domain.AlbumInvite, error)
	AcceptInvite(userID string, input AcceptInviteInput) (domain.AlbumInvite, error)
	CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error)
	AttachUploadContent(userID, sessionID string, input UploadContentInput) (domain.UploadSession, error)
	CreateStorageNodePairing(userID string, input CreateStorageNodePairingInput) (domain.StorageNodePairing, error)
	RegisterStorageNode(input StorageNodeRegisterInput) (StorageNodeRegisterResult, error)
	HeartbeatStorageNode(nodeID, token string, capacity StorageCapacityReport) (domain.StorageNode, error)
	UnbindStorageNode(nodeID, token string) error
	PendingJobs(nodeID, token string) ([]domain.AgentJob, error)
	AgentJob(nodeID, token, jobID string) (domain.AgentJob, error)
	CompleteJob(nodeID, token, jobID string, input JobCompletionInput) (domain.AgentJob, error)
	PreviewBlobAssets(limit int) ([]domain.MediaAsset, error)
	LocalOriginalBlobAssets(limit int) ([]domain.MediaAsset, error)
	AvatarBabies(limit int) ([]domain.BabyProfile, error)
	MarkPreviewMissing(mediaID string) error
	AttachPreviewBlob(mediaID string, input PreviewBlobAttachmentInput) error
	MarkPreviewsPending(mediaID string) error
	MarkScreenPreviewMissing(mediaID string) error
	AttachScreenPreview(mediaID string, input ScreenPreviewAttachmentInput) error
	MarkOriginalBlobMissing(mediaID string) error
	ClearBabyAvatar(babyID string) error
	FailUploadSessionByMedia(mediaID, reason string) error
	FailAgentJob(jobID, reason string) error
}

func NormalizeCapturedAt(metaCapturedAt, modifiedAt *time.Time, uploadedAt time.Time) time.Time {
	switch {
	case metaCapturedAt != nil:
		return metaCapturedAt.UTC()
	case modifiedAt != nil:
		return modifiedAt.UTC()
	default:
		return uploadedAt.UTC()
	}
}

func roleRank(role domain.Role) int {
	switch role {
	case domain.RoleViewer:
		return 1
	case domain.RoleMember:
		return 2
	case domain.RoleAdmin:
		return 3
	case domain.RoleOwner:
		return 4
	default:
		return 0
	}
}

func sortMedia(items []domain.MediaAsset) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].CapturedAt.After(items[j].CapturedAt)
	})
}

func sortTimelineEntries(items []domain.TimelineEntry) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].DisplayAt.Equal(items[j].DisplayAt) {
			return items[i].UploadedAt.After(items[j].UploadedAt)
		}
		return items[i].DisplayAt.After(items[j].DisplayAt)
	})
}

func sortAlbums(items []AlbumSummary) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].Album.Name < items[j].Album.Name
	})
}

func sortBabies(items []domain.BabyProfile) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
}

func sortInvites(items []domain.AlbumInvite) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
}

func normalizeAlbumWorkspace(value AlbumWorkspace) AlbumWorkspace {
	if value.Timeline == nil {
		value.Timeline = []domain.TimelineEntry{}
	}
	for index := range value.Timeline {
		if value.Timeline[index].Items == nil {
			value.Timeline[index].Items = []domain.MediaAsset{}
		}
		if value.Timeline[index].Comments == nil {
			value.Timeline[index].Comments = []domain.TimelineComment{}
		}
	}
	if value.Members == nil {
		value.Members = []domain.AlbumMember{}
	}
	if value.Babies == nil {
		value.Babies = []domain.BabyProfile{}
	}
	if value.Invites == nil {
		value.Invites = []domain.AlbumInvite{}
	}
	applyMemberLabels(value.Timeline, value.Members)
	return value
}

func normalizeTimelinePage(value TimelinePage) TimelinePage {
	if value.Items == nil {
		value.Items = []domain.TimelineEntry{}
	}
	for index := range value.Items {
		if value.Items[index].Items == nil {
			value.Items[index].Items = []domain.MediaAsset{}
		}
		if value.Items[index].Comments == nil {
			value.Items[index].Comments = []domain.TimelineComment{}
		}
	}
	return value
}

func applyMemberLabels(timeline []domain.TimelineEntry, members []domain.AlbumMember) {
	if len(timeline) == 0 || len(members) == 0 {
		return
	}
	labels := make(map[string]string, len(members))
	for _, member := range members {
		label := strings.TrimSpace(member.Relation)
		if label == "" {
			label = strings.TrimSpace(member.DisplayName)
		}
		if label != "" {
			labels[member.UserID] = label
		}
	}
	for entryIndex := range timeline {
		if label := labels[timeline[entryIndex].UploadedBy]; label != "" {
			timeline[entryIndex].UploadedByName = label
		}
		for itemIndex := range timeline[entryIndex].Items {
			if label := labels[timeline[entryIndex].Items[itemIndex].UploadedBy]; label != "" {
				timeline[entryIndex].Items[itemIndex].UploadedByName = label
			}
		}
		for commentIndex := range timeline[entryIndex].Comments {
			if label := labels[timeline[entryIndex].Comments[commentIndex].UserID]; label != "" {
				timeline[entryIndex].Comments[commentIndex].DisplayName = label
			}
		}
	}
}

func normalizeAppState(value AppState) AppState {
	if value.Albums == nil {
		value.Albums = []AlbumSummary{}
	}
	if value.ActiveAlbum != nil {
		normalized := normalizeAlbumWorkspace(*value.ActiveAlbum)
		value.ActiveAlbum = &normalized
	}
	return value
}

type timelineCursor struct {
	DisplayAt  time.Time
	UploadedAt time.Time
	EntryID    string
}

func normalizeTimelinePageLimit(limit int) int {
	switch {
	case limit <= 0:
		return DefaultTimelinePageSize
	case limit > 50:
		return 50
	default:
		return limit
	}
}

func encodeTimelineCursor(entry domain.TimelineEntry) string {
	raw := strings.Join([]string{
		entry.DisplayAt.UTC().Format(time.RFC3339Nano),
		entry.UploadedAt.UTC().Format(time.RFC3339Nano),
		entry.ID,
	}, "|")
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeTimelineCursor(value string) (timelineCursor, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return timelineCursor{}, ErrConflict
	}
	parts := strings.SplitN(string(decoded), "|", 3)
	if len(parts) != 3 || strings.TrimSpace(parts[2]) == "" {
		return timelineCursor{}, ErrConflict
	}
	displayAt, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return timelineCursor{}, ErrConflict
	}
	uploadedAt, err := time.Parse(time.RFC3339Nano, parts[1])
	if err != nil {
		return timelineCursor{}, ErrConflict
	}
	return timelineCursor{DisplayAt: displayAt.UTC(), UploadedAt: uploadedAt.UTC(), EntryID: strings.TrimSpace(parts[2])}, nil
}

func timelineEntryPrecedesCursor(entry domain.TimelineEntry, cursor timelineCursor) bool {
	if entry.DisplayAt.Before(cursor.DisplayAt) {
		return true
	}
	if entry.DisplayAt.After(cursor.DisplayAt) {
		return false
	}
	if entry.UploadedAt.Before(cursor.UploadedAt) {
		return true
	}
	if entry.UploadedAt.After(cursor.UploadedAt) {
		return false
	}
	return entry.ID < cursor.EntryID
}

func canonicalEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func validRole(role domain.Role) bool {
	switch role {
	case domain.RoleViewer, domain.RoleMember, domain.RoleAdmin, domain.RoleOwner:
		return true
	default:
		return false
	}
}

func validTimelineVisibility(value domain.TimelineEntryVisibility) bool {
	switch value {
	case domain.EntryVisibilityMembers, domain.EntryVisibilityManagers:
		return true
	default:
		return false
	}
}

func validTimelineTimeMode(value domain.TimelineEntryTimeMode) bool {
	switch value {
	case domain.EntryTimeCaptured, domain.EntryTimeUploaded, domain.EntryTimeManual:
		return true
	default:
		return false
	}
}

func validFeedingCategory(value domain.FeedingCategory) bool {
	switch value {
	case domain.FeedingMilk, domain.FeedingSolid, domain.FeedingDiaper, domain.FeedingSleep, domain.FeedingSupplement, domain.FeedingMedicine:
		return true
	default:
		return false
	}
}

func validFeedingMilkMode(value domain.FeedingMilkMode) bool {
	switch value {
	case domain.FeedingBreast, domain.FeedingBottle, domain.FeedingFormula:
		return true
	default:
		return false
	}
}

func newID(prefix string) string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UTC().UnixNano())
	}
	return fmt.Sprintf("%s-%d-%s", prefix, time.Now().UTC().UnixNano(), strings.ToLower(hex.EncodeToString(buf)))
}

func newInviteCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%06d", time.Now().UTC().UnixNano()%1000000)
	}
	code := make([]byte, 6)
	for index, value := range buf {
		code[index] = alphabet[int(value)%len(alphabet)]
	}
	return string(code)
}

func newPairingCode() string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%08d", time.Now().UTC().UnixNano()%100000000)
	}
	value := binaryUint32(buf) % 100000000
	return fmt.Sprintf("%08d", value)
}

func binaryUint32(buf []byte) uint32 {
	var value uint32
	for _, b := range buf {
		value = (value << 8) | uint32(b)
	}
	return value
}

func newSessionToken() string {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("session-%d", time.Now().UTC().UnixNano())
	}
	return strings.ToLower(hex.EncodeToString(buf))
}

func passwordSaltAndHash(password string) (string, string, error) {
	trimmed := strings.TrimSpace(password)
	if len(trimmed) < 8 {
		return "", "", fmt.Errorf("password must be at least 8 characters")
	}
	saltBytes := make([]byte, 16)
	if _, err := rand.Read(saltBytes); err != nil {
		return "", "", err
	}
	salt := hex.EncodeToString(saltBytes)
	hash := sha256.Sum256([]byte(salt + ":" + trimmed))
	return salt, hex.EncodeToString(hash[:]), nil
}

func verifyPassword(password, salt, expectedHash string) bool {
	hash := sha256.Sum256([]byte(salt + ":" + strings.TrimSpace(password)))
	actual := hex.EncodeToString(hash[:])
	return subtle.ConstantTimeCompare([]byte(actual), []byte(expectedHash)) == 1
}
