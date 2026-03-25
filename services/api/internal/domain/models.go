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

type FamilyMember struct {
	UserID      string `json:"userId"`
	FamilyID    string `json:"familyId"`
	Role        Role   `json:"role"`
	DisplayName string `json:"displayName"`
}

type BabyProfile struct {
	ID        string     `json:"id"`
	FamilyID  string     `json:"familyId"`
	Name      string     `json:"name"`
	BirthDate *time.Time `json:"birthDate,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

type InviteStatus string

const (
	InvitePending  InviteStatus = "pending"
	InviteAccepted InviteStatus = "accepted"
	InviteRevoked  InviteStatus = "revoked"
)

type FamilyInvite struct {
	ID            string       `json:"id"`
	FamilyID      string       `json:"familyId"`
	Code          string       `json:"code"`
	Role          Role         `json:"role"`
	Status        InviteStatus `json:"status"`
	CreatedBy     string       `json:"createdBy"`
	CreatedByName string       `json:"createdByName,omitempty"`
	FamilyName    string       `json:"familyName,omitempty"`
	CreatedAt     time.Time    `json:"createdAt"`
	AcceptedAt    *time.Time   `json:"acceptedAt,omitempty"`
	AcceptedBy    string       `json:"acceptedBy,omitempty"`
}

type StorageNodeStatus string

const (
	NodeOffline StorageNodeStatus = "offline"
	NodeOnline  StorageNodeStatus = "online"
)

type StorageNode struct {
	ID                string            `json:"id"`
	FamilyID          string            `json:"familyId"`
	Name              string            `json:"name"`
	Status            StorageNodeStatus `json:"status"`
	RegistrationToken string            `json:"-"`
	LastSeenAt        time.Time         `json:"lastSeenAt"`
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

type MediaAsset struct {
	ID             string        `json:"id"`
	FamilyID       string        `json:"familyId"`
	FileName       string        `json:"fileName"`
	MediaType      string        `json:"mediaType"`
	CapturedAt     time.Time     `json:"capturedAt"`
	UploadedAt     time.Time     `json:"uploadedAt"`
	TimelineDay    string        `json:"timelineDay"`
	Status         MediaStatus   `json:"status"`
	Source         string        `json:"source"`
	Width          int           `json:"width"`
	Height         int           `json:"height"`
	PreviewStatus  PreviewStatus `json:"previewStatus"`
	PreviewBlobKey string        `json:"previewBlobKey,omitempty"`
	ProcessedAt    *time.Time    `json:"processedAt,omitempty"`
	OriginalPath   string        `json:"-"`
}

type UploadSession struct {
	ID         string    `json:"id"`
	FamilyID   string    `json:"familyId"`
	MediaID    string    `json:"mediaId"`
	FileName   string    `json:"fileName"`
	MediaType  string    `json:"mediaType"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
	AssignedTo string    `json:"assignedTo"`
	ByteSize   int64     `json:"byteSize"`
	BlobKey    string    `json:"-"`
}

type AgentJobStatus string

const (
	JobPending   AgentJobStatus = "pending"
	JobCompleted AgentJobStatus = "completed"
)

type AgentJob struct {
	ID        string         `json:"id"`
	NodeID    string         `json:"nodeId"`
	FamilyID  string         `json:"familyId"`
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
