package store

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
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

type UploadContentInput struct {
	ByteSize int64
	BlobKey  string
}

type JobCompletionInput struct {
	OriginalPath   string
	PreviewBlobKey string
	Width          int
	Height         int
	PreviewStatus  domain.PreviewStatus
	ProcessedAt    time.Time
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

type Repository interface {
	RegisterUser(input RegisterUserInput) (AuthResult, error)
	Login(input LoginInput) (AuthResult, error)
	SessionUser(token string) (domain.User, error)
	RevokeSession(token string) error
	AppState(userID, albumID string) (AppState, error)
	AlbumWorkspace(albumID, userID string) (AlbumWorkspace, error)
	Timeline(albumID, userID string) ([]domain.TimelineEntry, error)
	Members(albumID, userID string) ([]domain.AlbumMember, error)
	MediaByID(albumID, userID, mediaID string) (domain.MediaAsset, error)
	CreateTimelineEntry(userID string, input CreateTimelineEntryInput) (domain.TimelineEntry, error)
	UpdateTimelineEntry(userID string, input UpdateTimelineEntryInput) (domain.TimelineEntry, error)
	DeleteTimelineEntry(userID, albumID, entryID string) error
	DeleteTimelineEntryMedia(userID, albumID, entryID, mediaID string) error
	CreateAlbum(userID string, input CreateAlbumInput) (domain.Album, error)
	CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error)
	BabyByID(userID, albumID, babyID string) (domain.BabyProfile, error)
	UpdateBaby(userID string, input UpdateBabyInput) (domain.BabyProfile, error)
	UpdateBabyAvatar(userID string, input UpdateBabyAvatarInput) (domain.BabyProfile, error)
	DeleteBaby(userID, albumID, babyID string) error
	LeaveAlbum(userID string, input LeaveAlbumInput) error
	UpdateMemberRole(userID string, input UpdateAlbumMemberRoleInput) (domain.AlbumMember, error)
	UpdateMemberRelation(userID string, input UpdateAlbumMemberRelationInput) (domain.AlbumMember, error)
	CreateInvite(userID string, input CreateAlbumInviteInput) (domain.AlbumInvite, error)
	Invites(albumID, userID string) ([]domain.AlbumInvite, error)
	InviteByCode(code string) (domain.AlbumInvite, error)
	AcceptInvite(userID string, input AcceptInviteInput) (domain.AlbumInvite, error)
	CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error)
	AttachUploadContent(userID, sessionID string, input UploadContentInput) (domain.UploadSession, error)
	CreateStorageNodePairing(userID string, input CreateStorageNodePairingInput) (domain.StorageNodePairing, error)
	RegisterStorageNode(input StorageNodeRegisterInput) (StorageNodeRegisterResult, error)
	HeartbeatStorageNode(nodeID, token string, capacity StorageCapacityReport) (domain.StorageNode, error)
	PendingJobs(nodeID, token string) ([]domain.AgentJob, error)
	AgentJob(nodeID, token, jobID string) (domain.AgentJob, error)
	CompleteJob(nodeID, token, jobID string, input JobCompletionInput) (domain.AgentJob, error)
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
