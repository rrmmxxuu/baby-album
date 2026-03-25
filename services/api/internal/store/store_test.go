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
	session, err := repo.CreateUploadSession("user-owner", UploadSessionInput{FamilyID: "family-demo", FileName: "2026-03-25-bedtime.jpg", MediaType: "image/jpeg"})
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

func TestInMemoryOnboardingInviteFlow(t *testing.T) {
	repo := NewInMemoryStore()
	owner, err := repo.RegisterUser(RegisterUserInput{DisplayName: "Mia", Email: "mia@example.com", Password: "strongpass1"})
	if err != nil {
		t.Fatalf("RegisterUser owner returned error: %v", err)
	}
	family, err := repo.CreateFamily(owner.User.ID, CreateFamilyInput{Name: "Mia Family", Timezone: "Asia/Shanghai"})
	if err != nil {
		t.Fatalf("CreateFamily returned error: %v", err)
	}
	if _, err := repo.CreateBaby(owner.User.ID, CreateBabyInput{FamilyID: family.ID, Name: "Peanut"}); err != nil {
		t.Fatalf("CreateBaby returned error: %v", err)
	}
	invite, err := repo.CreateInvite(owner.User.ID, CreateInviteInput{FamilyID: family.ID, Role: domain.RoleMember})
	if err != nil {
		t.Fatalf("CreateInvite returned error: %v", err)
	}
	guest, err := repo.RegisterUser(RegisterUserInput{DisplayName: "Noah", Email: "noah@example.com", Password: "strongpass2"})
	if err != nil {
		t.Fatalf("RegisterUser guest returned error: %v", err)
	}
	accepted, err := repo.AcceptInvite(guest.User.ID, invite.Code)
	if err != nil {
		t.Fatalf("AcceptInvite returned error: %v", err)
	}
	if accepted.Status != domain.InviteAccepted {
		t.Fatalf("expected accepted invite, got %s", accepted.Status)
	}
	member, err := repo.UpdateMemberRole(owner.User.ID, UpdateMemberRoleInput{FamilyID: family.ID, MemberUserID: guest.User.ID, Role: domain.RoleAdmin})
	if err != nil {
		t.Fatalf("UpdateMemberRole returned error: %v", err)
	}
	if member.Role != domain.RoleAdmin {
		t.Fatalf("expected admin role, got %s", member.Role)
	}
	state, err := repo.AppState(guest.User.ID, family.ID)
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if state.ActiveFamily == nil {
		t.Fatal("expected active family in app state")
	}
	if len(state.ActiveFamily.Babies) != 1 {
		t.Fatalf("expected one baby profile, got %d", len(state.ActiveFamily.Babies))
	}
	if state.ActiveFamily.Membership.Role != domain.RoleAdmin {
		t.Fatalf("expected active family membership admin, got %s", state.ActiveFamily.Membership.Role)
	}
}
func TestInMemoryDeleteBabyRequiresAdmin(t *testing.T) {
	repo := NewInMemoryStore()
	if err := repo.DeleteBaby("user-member", "family-demo", "baby-demo"); err == nil {
		t.Fatal("expected member delete to be forbidden")
	}
	if err := repo.DeleteBaby("user-admin", "family-demo", "baby-demo"); err != nil {
		t.Fatalf("DeleteBaby admin returned error: %v", err)
	}
	state, err := repo.AppState("user-owner", "family-demo")
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if len(state.ActiveFamily.Babies) != 0 {
		t.Fatalf("expected no babies after deletion, got %d", len(state.ActiveFamily.Babies))
	}
}

func TestInMemoryOwnerMustTransferBeforeLeaving(t *testing.T) {
	repo := NewInMemoryStore()
	if err := repo.LeaveFamily("user-owner", LeaveFamilyInput{FamilyID: "family-demo"}); err == nil {
		t.Fatal("expected owner leave without transfer to fail")
	}
	if err := repo.LeaveFamily("user-owner", LeaveFamilyInput{FamilyID: "family-demo", TransferOwnerTo: "user-admin"}); err != nil {
		t.Fatalf("LeaveFamily owner returned error: %v", err)
	}
	state, err := repo.AppState("user-admin", "family-demo")
	if err != nil {
		t.Fatalf("AppState returned error: %v", err)
	}
	if state.ActiveFamily.Membership.Role != domain.RoleOwner {
		t.Fatalf("expected transferred owner role, got %s", state.ActiveFamily.Membership.Role)
	}
	leftState, err := repo.AppState("user-owner", "family-demo")
	if err != nil {
		t.Fatalf("AppState former owner returned error: %v", err)
	}
	if len(leftState.Families) != 0 {
		t.Fatalf("expected former owner to have left all families, got %d", len(leftState.Families))
	}
}
