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
)

type UploadSessionInput struct {
	FamilyID   string
	FileName   string
	MediaType  string
	CapturedAt *time.Time
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

type CreateFamilyInput struct {
	Name     string
	Timezone string
}

type CreateBabyInput struct {
	FamilyID  string
	Name      string
	BirthDate *time.Time
}

type LeaveFamilyInput struct {
	FamilyID        string
	TransferOwnerTo string
}

type UpdateMemberRoleInput struct {
	FamilyID     string
	MemberUserID string
	Role         domain.Role
}

type CreateInviteInput struct {
	FamilyID string
	Role     domain.Role
}

type FamilySummary struct {
	Family     domain.Family       `json:"family"`
	Membership domain.FamilyMember `json:"membership"`
}

type Bootstrap struct {
	Family      domain.Family         `json:"family"`
	CurrentUser domain.User           `json:"currentUser"`
	Membership  domain.FamilyMember   `json:"membership"`
	StorageNode *domain.StorageNode   `json:"storageNode,omitempty"`
	Timeline    []domain.MediaAsset   `json:"timeline"`
	Members     []domain.FamilyMember `json:"members"`
	Babies      []domain.BabyProfile  `json:"babies"`
	Invites     []domain.FamilyInvite `json:"invites"`
}

type AppState struct {
	CurrentUser    domain.User     `json:"currentUser"`
	Families       []FamilySummary `json:"families"`
	ActiveFamily   *Bootstrap      `json:"activeFamily,omitempty"`
	ActiveFamilyID string          `json:"activeFamilyId,omitempty"`
}

type Repository interface {
	RegisterUser(input RegisterUserInput) (AuthResult, error)
	Login(input LoginInput) (AuthResult, error)
	SessionUser(token string) (domain.User, error)
	RevokeSession(token string) error
	AppState(userID, familyID string) (AppState, error)
	Bootstrap(familyID, userID string) (Bootstrap, error)
	Timeline(familyID, userID string) ([]domain.MediaAsset, error)
	Members(familyID, userID string) ([]domain.FamilyMember, error)
	MediaByID(familyID, userID, mediaID string) (domain.MediaAsset, error)
	CreateFamily(userID string, input CreateFamilyInput) (domain.Family, error)
	CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error)
	DeleteBaby(userID, familyID, babyID string) error
	LeaveFamily(userID string, input LeaveFamilyInput) error
	UpdateMemberRole(userID string, input UpdateMemberRoleInput) (domain.FamilyMember, error)
	CreateInvite(userID string, input CreateInviteInput) (domain.FamilyInvite, error)
	Invites(familyID, userID string) ([]domain.FamilyInvite, error)
	InviteByCode(code string) (domain.FamilyInvite, error)
	AcceptInvite(userID, code string) (domain.FamilyInvite, error)
	CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error)
	AttachUploadContent(userID, sessionID string, input UploadContentInput) (domain.UploadSession, error)
	RegisterStorageNode(nodeID, nodeName, token string) (domain.StorageNode, error)
	HeartbeatStorageNode(nodeID, token string) (domain.StorageNode, error)
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

func sortFamilies(items []FamilySummary) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].Family.Name < items[j].Family.Name
	})
}

func sortBabies(items []domain.BabyProfile) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
}

func sortInvites(items []domain.FamilyInvite) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
}

func normalizeBootstrap(value Bootstrap) Bootstrap {
	if value.Timeline == nil {
		value.Timeline = []domain.MediaAsset{}
	}
	if value.Members == nil {
		value.Members = []domain.FamilyMember{}
	}
	if value.Babies == nil {
		value.Babies = []domain.BabyProfile{}
	}
	if value.Invites == nil {
		value.Invites = []domain.FamilyInvite{}
	}
	return value
}

func normalizeAppState(value AppState) AppState {
	if value.Families == nil {
		value.Families = []FamilySummary{}
	}
	if value.ActiveFamily != nil {
		normalized := normalizeBootstrap(*value.ActiveFamily)
		value.ActiveFamily = &normalized
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

func newID(prefix string) string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UTC().UnixNano())
	}
	return fmt.Sprintf("%s-%d-%s", prefix, time.Now().UTC().UnixNano(), strings.ToLower(hex.EncodeToString(buf)))
}

func newInviteCode() string {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("invite-%d", time.Now().UTC().UnixNano())
	}
	return strings.ToLower(hex.EncodeToString(buf))
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
