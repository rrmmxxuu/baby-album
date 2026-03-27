package domain

import "time"

type Role string

const (
	RoleViewer Role = "viewer"
	RoleMember Role = "member"
	RoleAdmin  Role = "admin"
	RoleOwner  Role = "owner"
)

type User struct {
	ID          string    `json:"id"`
	DisplayName string    `json:"displayName"`
	Email       string    `json:"email"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Family struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Timezone string `json:"timezone"`
}

type Album = Family

type FamilyMember struct {
	UserID      string `json:"userId"`
	FamilyID    string `json:"albumId"`
	Role        Role   `json:"role"`
	DisplayName string `json:"displayName"`
	Relation    string `json:"relation,omitempty"`
}

type AlbumMember = FamilyMember

type BabyProfile struct {
	ID              string     `json:"id"`
	FamilyID        string     `json:"albumId"`
	Name            string     `json:"name"`
	BirthDate       *time.Time `json:"birthDate,omitempty"`
	HasAvatar       bool       `json:"hasAvatar,omitempty"`
	AvatarUpdatedAt *time.Time `json:"avatarUpdatedAt,omitempty"`
	AvatarKey       string     `json:"-"`
	CreatedAt       time.Time  `json:"createdAt"`
}

type InviteStatus string

const (
	InvitePending  InviteStatus = "pending"
	InviteAccepted InviteStatus = "accepted"
	InviteRevoked  InviteStatus = "revoked"
)

type FamilyInvite struct {
	ID            string       `json:"id"`
	FamilyID      string       `json:"albumId"`
	Code          string       `json:"code"`
	Role          Role         `json:"role"`
	Status        InviteStatus `json:"status"`
	CreatedBy     string       `json:"createdBy"`
	CreatedByName string       `json:"createdByName,omitempty"`
	FamilyName    string       `json:"albumName,omitempty"`
	CreatedAt     time.Time    `json:"createdAt"`
	AcceptedAt    *time.Time   `json:"acceptedAt,omitempty"`
	AcceptedBy    string       `json:"acceptedBy,omitempty"`
}

type AlbumInvite = FamilyInvite

type StorageNodeStatus string

const (
	NodeOffline StorageNodeStatus = "offline"
	NodeOnline  StorageNodeStatus = "online"
)

type StorageNode struct {
	ID                string            `json:"id"`
	FamilyID          string            `json:"albumId"`
	Name              string            `json:"name"`
	Status            StorageNodeStatus `json:"status"`
	RegistrationToken string            `json:"-"`
	LastSeenAt        time.Time         `json:"lastSeenAt"`
	TotalBytes        int64             `json:"totalBytes"`
	FreeBytes         int64             `json:"freeBytes"`
	AvailableBytes    int64             `json:"availableBytes"`
}

type StorageNodePairing struct {
	Code      string     `json:"code"`
	FamilyID  string     `json:"albumId"`
	CreatedBy string     `json:"createdBy"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
	UsedAt    *time.Time `json:"usedAt,omitempty"`
}

type MediaStatus string

const (
	MediaReady   MediaStatus = "ready"
	MediaPending MediaStatus = "pending"
)

type PreviewStatus string

const (
	PreviewPending     PreviewStatus = "pending"
	PreviewReady       PreviewStatus = "ready"
	PreviewUnavailable PreviewStatus = "unavailable"
)

type TimelineEntryVisibility string

const (
	EntryVisibilityMembers  TimelineEntryVisibility = "members"
	EntryVisibilityManagers TimelineEntryVisibility = "managers"
)

type TimelineEntryTimeMode string

const (
	EntryTimeCaptured TimelineEntryTimeMode = "captured_at"
	EntryTimeUploaded TimelineEntryTimeMode = "uploaded_at"
	EntryTimeManual   TimelineEntryTimeMode = "manual"
)

type TimelineComment struct {
	ID          string    `json:"id"`
	FamilyID    string    `json:"albumId"`
	EntryID     string    `json:"entryId"`
	UserID      string    `json:"userId"`
	DisplayName string    `json:"displayName"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"createdAt"`
}

type TimelineEntry struct {
	ID             string                  `json:"id"`
	FamilyID       string                  `json:"albumId"`
	Caption        string                  `json:"caption"`
	Visibility     TimelineEntryVisibility `json:"visibility"`
	TimeMode       TimelineEntryTimeMode   `json:"timeMode"`
	DisplayAt      time.Time               `json:"displayAt"`
	TimelineDay    string                  `json:"timelineDay"`
	UploadedBy     string                  `json:"uploadedBy"`
	UploadedByName string                  `json:"uploadedByName"`
	UploadedAt     time.Time               `json:"uploadedAt"`
	CreatedAt      time.Time               `json:"createdAt"`
	Items          []MediaAsset            `json:"items"`
	Comments       []TimelineComment       `json:"comments"`
}

type MediaAsset struct {
	ID              string        `json:"id"`
	FamilyID        string        `json:"albumId"`
	EntryID         string        `json:"entryId"`
	UploadBatchID   string        `json:"uploadBatchId"`
	UploadedBy      string        `json:"uploadedBy"`
	UploadedByName  string        `json:"uploadedByName"`
	FileName        string        `json:"fileName"`
	MediaType       string        `json:"mediaType"`
	CapturedAt      time.Time     `json:"capturedAt"`
	UploadedAt      time.Time     `json:"uploadedAt"`
	TimelineDay     string        `json:"timelineDay"`
	Status          MediaStatus   `json:"status"`
	Source          string        `json:"source"`
	Width           int           `json:"width"`
	Height          int           `json:"height"`
	PreviewStatus   PreviewStatus `json:"previewStatus"`
	PreviewBlobKey  string        `json:"previewBlobKey,omitempty"`
	OriginalBlobKey string        `json:"-"`
	ProcessedAt     *time.Time    `json:"processedAt,omitempty"`
	OriginalPath    string        `json:"-"`
}

type UploadSession struct {
	ID             string    `json:"id"`
	FamilyID       string    `json:"albumId"`
	EntryID        string    `json:"entryId"`
	UploadBatchID  string    `json:"uploadBatchId"`
	UploadedBy     string    `json:"uploadedBy"`
	UploadedByName string    `json:"uploadedByName"`
	MediaID        string    `json:"mediaId"`
	FileName       string    `json:"fileName"`
	MediaType      string    `json:"mediaType"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"createdAt"`
	AssignedTo     string    `json:"assignedTo"`
	ByteSize       int64     `json:"byteSize"`
	BlobKey        string    `json:"-"`
}

type AgentJobStatus string

const (
	JobPending   AgentJobStatus = "pending"
	JobCompleted AgentJobStatus = "completed"
)

type AgentJob struct {
	ID        string         `json:"id"`
	NodeID    string         `json:"nodeId"`
	FamilyID  string         `json:"albumId"`
	MediaID   string         `json:"mediaId"`
	Type      string         `json:"type"`
	Status    AgentJobStatus `json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	FileName  string         `json:"fileName"`
	MediaType string         `json:"mediaType"`
	ByteSize  int64          `json:"byteSize"`
	BlobKey   string         `json:"blobKey"`
}
