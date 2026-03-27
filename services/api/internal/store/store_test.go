package store

import (
	"testing"
	"time"

	"babyalbum/api/internal/domain"
)

func TestNormalizeCapturedAt(t *testing.T) {
	uploadedAt := time.Date(2026, 3, 25, 12, 0, 0, 0, time.UTC)
	modifiedAt := uploadedAt.Add(-time.Hour)
	metaCapturedAt := uploadedAt.Add(-2 * time.Hour)

	if got := NormalizeCapturedAt(&metaCapturedAt, &modifiedAt, uploadedAt); !got.Equal(metaCapturedAt) {
		t.Fatalf("expected metadata time, got %v", got)
	}
	if got := NormalizeCapturedAt(nil, &modifiedAt, uploadedAt); !got.Equal(modifiedAt) {
		t.Fatalf("expected modified time, got %v", got)
	}
	if got := NormalizeCapturedAt(nil, nil, uploadedAt); !got.Equal(uploadedAt) {
		t.Fatalf("expected upload time, got %v", got)
	}
}

func TestInMemoryAuthFlow(t *testing.T) {
	repo := NewInMemoryStore()
	result, err := repo.RegisterUser(RegisterUserInput{DisplayName: "Mia", Email: "mia@example.com", Password: "strongpass1"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	if result.Token == "" {
		t.Fatal("expected auth token")
	}
	user, err := repo.SessionUser(result.Token)
	if err != nil {
		t.Fatalf("SessionUser returned error: %v", err)
	}
	if user.Email != "mia@example.com" {
		t.Fatalf("unexpected user email %s", user.Email)
	}
	login, err := repo.Login(LoginInput{Email: "mia@example.com", Password: "strongpass1"})
	if err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if login.Token == "" {
		t.Fatal("expected login token")
	}
}

func TestInMemoryUploadRequiresContentBeforeJobs(t *testing.T) {
	repo := NewInMemoryStore()
	entry, err := repo.CreateTimelineEntry("user-owner", CreateTimelineEntryInput{
		AlbumID:    "family-demo",
		Caption:    "睡前时刻",
		Visibility: domain.EntryVisibilityMembers,
		TimeMode:   domain.EntryTimeCaptured,
		DisplayAt:  time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("CreateTimelineEntry returned error: %v", err)
	}
	session, err := repo.CreateUploadSession("user-owner", UploadSessionInput{AlbumID: "family-demo", EntryID: entry.ID, FileName: "2026-03-25-bedtime.jpg", MediaType: "image/jpeg"})
	if err != nil {
		t.Fatalf("CreateUploadSession returned error: %v", err)
	}
	if session.Status != "created" {
		t.Fatalf("expected session status created, got %s", session.Status)
	}
	jobs, err := repo.PendingJobs("node-demo", "demo-registration-token")
	if err != nil {
		t.Fatalf("PendingJobs returned error: %v", err)
	}
	if len(jobs) != 0 {
		t.Fatalf("expected no jobs before content upload, got %d", len(jobs))
	}
	session, err = repo.AttachUploadContent("user-owner", session.ID, UploadContentInput{ByteSize: 4096, BlobKey: "upload-1-bedtime.jpg"})
	if err != nil {
		t.Fatalf("AttachUploadContent returned error: %v", err)
	}
	if session.Status != "uploaded" {
		t.Fatalf("expected uploaded status, got %s", session.Status)
	}
	jobs, err = repo.PendingJobs("node-demo", "demo-registration-token")
	if err != nil {
		t.Fatalf("PendingJobs returned error: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("expected one job after content upload, got %d", len(jobs))
	}
	if jobs[0].BlobKey == "" {
		t.Fatal("expected job blob key to be populated")
	}
}

func TestInMemoryStorageNodePairingAndCapacity(t *testing.T) {
	repo := NewInMemoryStore()
	owner, err := repo.RegisterUser(RegisterUserInput{DisplayName: "Mia", Email: "mia@example.com", Password: "strongpass1"})
	if err != nil {
		t.Fatalf("RegisterUser returned error: %v", err)
	}
	album, err := repo.CreateAlbum(owner.User.ID, CreateAlbumInput{Name: "Mia Family", Timezone: "Asia/Shanghai", BabyName: "Peanut", Relation: "妈妈"})
	if err != nil {
		t.Fatalf("CreateFamily returned error: %v", err)
	}
	pairing, err := repo.CreateStorageNodePairing(owner.User.ID, CreateStorageNodePairingInput{AlbumID: album.ID})
	if err != nil {
		t.Fatalf("CreateStorageNodePairing returned error: %v", err)
	}
	registered, err := repo.RegisterStorageNode(StorageNodeRegisterInput{
		NodeName:    "Basement NAS",
		PairingCode: pairing.Code,
		Capacity:    StorageCapacityReport{TotalBytes: 10 << 40, FreeBytes: 4 << 40, AvailableBytes: 3 << 40},
	})
	if err != nil {
		t.Fatalf("RegisterStorageNode returned error: %v", err)
	}
	if registered.Node.FamilyID != album.ID {
		t.Fatalf("expected node album %s, got %s", album.ID, registered.Node.FamilyID)
	}
	if registered.NodeToken == "" || registered.NodeID == "" {
		t.Fatal("expected issued node credentials")
	}
	node, err := repo.HeartbeatStorageNode(registered.NodeID, registered.NodeToken, StorageCapacityReport{TotalBytes: 10 << 40, FreeBytes: 2 << 40, AvailableBytes: 1 << 40})
	if err != nil {
		t.Fatalf("HeartbeatStorageNode returned error: %v", err)
	}
	if node.AvailableBytes != 1<<40 {
		t.Fatalf("expected available bytes to update, got %d", node.AvailableBytes)
	}
	state, err := repo.AppState(owner.User.ID, album.ID)
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if state.ActiveAlbum == nil || state.ActiveAlbum.StorageNode == nil {
		t.Fatal("expected active album storage node")
	}
	if state.ActiveAlbum.StorageNode.AvailableBytes != 1<<40 {
		t.Fatalf("expected app state storage node available bytes to match heartbeat, got %d", state.ActiveAlbum.StorageNode.AvailableBytes)
	}
}

func TestInMemoryStorageNodeRebindingReassignsJobsAndRehydrates(t *testing.T) {
	repo := NewInMemoryStore()
	entry, err := repo.CreateTimelineEntry("user-owner", CreateTimelineEntryInput{
		AlbumID:    "family-demo",
		Caption:    "客厅玩耍",
		Visibility: domain.EntryVisibilityMembers,
		TimeMode:   domain.EntryTimeCaptured,
		DisplayAt:  time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("CreateTimelineEntry returned error: %v", err)
	}
	session, err := repo.CreateUploadSession("user-owner", UploadSessionInput{
		AlbumID:   "family-demo",
		EntryID:   entry.ID,
		FileName:  "living-room.mov",
		MediaType: "video/quicktime",
	})
	if err != nil {
		t.Fatalf("CreateUploadSession returned error: %v", err)
	}
	if _, err := repo.AttachUploadContent("user-owner", session.ID, UploadContentInput{
		ByteSize: 8192,
		BlobKey:  "upload-living-room.mov",
	}); err != nil {
		t.Fatalf("AttachUploadContent returned error: %v", err)
	}

	initialJobs, err := repo.PendingJobs("node-demo", "demo-registration-token")
	if err != nil {
		t.Fatalf("PendingJobs initial returned error: %v", err)
	}
	if len(initialJobs) != 1 {
		t.Fatalf("expected one initial job, got %d", len(initialJobs))
	}

	switchPairing, err := repo.CreateStorageNodePairing("user-owner", CreateStorageNodePairingInput{AlbumID: "family-demo"})
	if err != nil {
		t.Fatalf("CreateStorageNodePairing switch returned error: %v", err)
	}
	registered, err := repo.RegisterStorageNode(StorageNodeRegisterInput{
		NodeID:      "node-migration",
		NodeName:    "Migration NAS",
		PairingCode: switchPairing.Code,
		Capacity:    StorageCapacityReport{TotalBytes: 8 << 40, FreeBytes: 6 << 40, AvailableBytes: 5 << 40},
	})
	if err != nil {
		t.Fatalf("RegisterStorageNode switch returned error: %v", err)
	}

	oldNodeJobs, err := repo.PendingJobs("node-demo", "demo-registration-token")
	if err != nil {
		t.Fatalf("PendingJobs old node returned error: %v", err)
	}
	if len(oldNodeJobs) != 0 {
		t.Fatalf("expected old node to have no pending jobs after switch, got %d", len(oldNodeJobs))
	}
	newNodeJobs, err := repo.PendingJobs(registered.NodeID, registered.NodeToken)
	if err != nil {
		t.Fatalf("PendingJobs new node returned error: %v", err)
	}
	if len(newNodeJobs) != 1 {
		t.Fatalf("expected new node to receive migrated ingest job, got %d", len(newNodeJobs))
	}
	if newNodeJobs[0].Type != "ingest_media" {
		t.Fatalf("expected migrated ingest job, got %s", newNodeJobs[0].Type)
	}

	state, err := repo.AppState("user-owner", "family-demo")
	if err != nil {
		t.Fatalf("AppState after switch returned error: %v", err)
	}
	if state.ActiveAlbum == nil || state.ActiveAlbum.StorageNode == nil {
		t.Fatal("expected active album storage node after switch")
	}
	if state.ActiveAlbum.StorageNode.ID != registered.NodeID {
		t.Fatalf("expected active node %s after switch, got %s", registered.NodeID, state.ActiveAlbum.StorageNode.ID)
	}

	if _, err := repo.CompleteJob(registered.NodeID, registered.NodeToken, newNodeJobs[0].ID, JobCompletionInput{
		Width:          1920,
		Height:         1080,
		PreviewStatus:  domain.PreviewReady,
		PreviewBlobKey: "preview-living-room.jpg",
		ProcessedAt:    time.Now().UTC(),
		OriginalPath:   "/data/albums/family-demo/living-room.mov",
	}); err != nil {
		t.Fatalf("CompleteJob returned error: %v", err)
	}

	returnPairing, err := repo.CreateStorageNodePairing("user-owner", CreateStorageNodePairingInput{AlbumID: "family-demo"})
	if err != nil {
		t.Fatalf("CreateStorageNodePairing return returned error: %v", err)
	}
	if _, err := repo.RegisterStorageNode(StorageNodeRegisterInput{
		NodeID:      "node-demo",
		Token:       "demo-registration-token",
		NodeName:    "Living Room NAS",
		PairingCode: returnPairing.Code,
		Capacity:    StorageCapacityReport{TotalBytes: 2 << 40, FreeBytes: 1400 << 30, AvailableBytes: 1300 << 30},
	}); err != nil {
		t.Fatalf("RegisterStorageNode return returned error: %v", err)
	}

	state, err = repo.AppState("user-owner", "family-demo")
	if err != nil {
		t.Fatalf("AppState after return returned error: %v", err)
	}
	if state.ActiveAlbum == nil || state.ActiveAlbum.StorageNode == nil {
		t.Fatal("expected active album storage node after return")
	}
	if state.ActiveAlbum.StorageNode.ID != "node-demo" {
		t.Fatalf("expected active node node-demo after return, got %s", state.ActiveAlbum.StorageNode.ID)
	}

	returnJobs, err := repo.PendingJobs("node-demo", "demo-registration-token")
	if err != nil {
		t.Fatalf("PendingJobs return node returned error: %v", err)
	}
	if len(returnJobs) != 1 {
		t.Fatalf("expected one rehydrate job on returned primary node, got %d", len(returnJobs))
	}
	if returnJobs[0].Type != "rehydrate_media" {
		t.Fatalf("expected rehydrate job after returning node to primary, got %s", returnJobs[0].Type)
	}
	if returnJobs[0].BlobKey == "" {
		t.Fatal("expected rehydrate job to carry original blob key")
	}
}

func TestInMemoryOnboardingInviteFlow(t *testing.T) {
	repo := NewInMemoryStore()
	owner, err := repo.RegisterUser(RegisterUserInput{DisplayName: "Mia", Email: "mia@example.com", Password: "strongpass1"})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	album, err := repo.CreateAlbum(owner.User.ID, CreateAlbumInput{Name: "Mia Family", Timezone: "Asia/Shanghai", BabyName: "Peanut", Relation: "妈妈"})
	if err != nil {
		t.Fatalf("CreateFamily returned error: %v", err)
	}
	invite, err := repo.CreateInvite(owner.User.ID, CreateAlbumInviteInput{AlbumID: album.ID})
	if err != nil {
		t.Fatalf("CreateInvite returned error: %v", err)
	}
	guest, err := repo.RegisterUser(RegisterUserInput{DisplayName: "Noah", Email: "noah@example.com", Password: "strongpass2"})
	if err != nil {
		t.Fatalf("RegisterUser guest returned error: %v", err)
	}
	accepted, err := repo.AcceptInvite(guest.User.ID, AcceptInviteInput{Code: invite.Code, Relation: "叔叔"})
	if err != nil {
		t.Fatalf("AcceptInvite returned error: %v", err)
	}
	if accepted.Status != domain.InviteAccepted {
		t.Fatalf("expected accepted invite, got %s", accepted.Status)
	}
	member, err := repo.UpdateMemberRole(owner.User.ID, UpdateAlbumMemberRoleInput{AlbumID: album.ID, MemberUserID: guest.User.ID, Role: domain.RoleAdmin})
	if err != nil {
		t.Fatalf("UpdateMemberRole returned error: %v", err)
	}
	if member.Role != domain.RoleAdmin {
		t.Fatalf("expected admin role, got %s", member.Role)
	}
	state, err := repo.AppState(guest.User.ID, album.ID)
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if state.ActiveAlbum == nil {
		t.Fatal("expected active album in app state")
	}
	if len(state.ActiveAlbum.Babies) != 1 {
		t.Fatalf("expected one baby profile, got %d", len(state.ActiveAlbum.Babies))
	}
	if state.ActiveAlbum.Membership.Role != domain.RoleAdmin {
		t.Fatalf("expected active album membership admin, got %s", state.ActiveAlbum.Membership.Role)
	}
}
func TestInMemoryDeleteBabyRequiresAdmin(t *testing.T) {
	repo := NewInMemoryStore()
	if err := repo.DeleteBaby("user-member", "family-demo", "baby-demo"); err == nil {
		t.Fatal("expected member delete to be forbidden")
	}
	if err := repo.DeleteBaby("user-admin", "family-demo", "baby-demo"); err == nil {
		t.Fatal("expected deleting the only baby album profile to fail")
	}
	state, err := repo.AppState("user-owner", "family-demo")
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if len(state.ActiveAlbum.Babies) != 1 {
		t.Fatalf("expected original baby profile to remain, got %d", len(state.ActiveAlbum.Babies))
	}
}

func TestInMemoryOwnerMustTransferBeforeLeaving(t *testing.T) {
	repo := NewInMemoryStore()
	if err := repo.LeaveAlbum("user-owner", LeaveAlbumInput{AlbumID: "family-demo"}); err == nil {
		t.Fatal("expected owner leave without transfer to fail")
	}
	if err := repo.LeaveAlbum("user-owner", LeaveAlbumInput{AlbumID: "family-demo", TransferOwnerTo: "user-admin"}); err != nil {
		t.Fatalf("LeaveAlbum owner returned error: %v", err)
	}
	state, err := repo.AppState("user-admin", "family-demo")
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if state.ActiveAlbum.Membership.Role != domain.RoleOwner {
		t.Fatalf("expected transferred owner role, got %s", state.ActiveAlbum.Membership.Role)
	}
	leftState, err := repo.AppState("user-owner", "family-demo")
	if err != nil {
		t.Fatalf("AppState former owner returned error: %v", err)
	}
	if len(leftState.Albums) != 0 {
		t.Fatalf("expected former owner to have left all albums, got %d", len(leftState.Albums))
	}
}
