package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

type stubRepository struct {
	unbindStorageNode func(nodeID, token string) error
}

func (s *stubRepository) RegisterUser(input store.RegisterUserInput) (store.AuthResult, error) {
	return store.AuthResult{}, nil
}

func (s *stubRepository) Login(input store.LoginInput) (store.AuthResult, error) {
	return store.AuthResult{}, nil
}

func (s *stubRepository) SessionUser(token string) (domain.User, error) {
	return domain.User{}, nil
}

func (s *stubRepository) RevokeSession(token string) error { return nil }

func (s *stubRepository) AppState(userID, albumID string) (store.AppState, error) {
	return store.AppState{}, nil
}

func (s *stubRepository) AlbumWorkspace(albumID, userID string) (store.AlbumWorkspace, error) {
	return store.AlbumWorkspace{}, nil
}

func (s *stubRepository) TimelinePage(albumID, userID string, input store.TimelinePageInput) (store.TimelinePage, error) {
	return store.TimelinePage{}, nil
}

func (s *stubRepository) Members(albumID, userID string) ([]domain.AlbumMember, error) {
	return nil, nil
}

func (s *stubRepository) MediaByID(albumID, userID, mediaID string) (domain.MediaAsset, error) {
	return domain.MediaAsset{}, nil
}

func (s *stubRepository) ProbeDuplicateMedia(userID string, input store.DuplicateMediaProbeInput) (store.DuplicateMediaProbeResult, error) {
	return store.DuplicateMediaProbeResult{}, nil
}

func (s *stubRepository) ResolveDuplicateMedia(userID string, input store.DuplicateMediaResolveInput) (store.DuplicateMediaResolveResult, error) {
	return store.DuplicateMediaResolveResult{}, nil
}

func (s *stubRepository) CreateTimelineEntry(userID string, input store.CreateTimelineEntryInput) (domain.TimelineEntry, error) {
	return domain.TimelineEntry{}, nil
}

func (s *stubRepository) CreateTimelineComment(userID string, input store.CreateTimelineCommentInput) (domain.TimelineComment, error) {
	return domain.TimelineComment{}, nil
}

func (s *stubRepository) UpdateTimelineEntry(userID string, input store.UpdateTimelineEntryInput) (domain.TimelineEntry, error) {
	return domain.TimelineEntry{}, nil
}

func (s *stubRepository) DeleteTimelineEntry(userID, albumID, entryID string) (store.DeleteCleanup, error) {
	return store.DeleteCleanup{}, nil
}

func (s *stubRepository) DeleteTimelineEntryMedia(userID, albumID, entryID, mediaID string) (store.DeleteCleanup, error) {
	return store.DeleteCleanup{}, nil
}

func (s *stubRepository) CreateAlbum(userID string, input store.CreateAlbumInput) (domain.Album, error) {
	return domain.Album{}, nil
}

func (s *stubRepository) CreateBaby(userID string, input store.CreateBabyInput) (domain.BabyProfile, error) {
	return domain.BabyProfile{}, nil
}

func (s *stubRepository) BabyByID(userID, albumID, babyID string) (domain.BabyProfile, error) {
	return domain.BabyProfile{}, nil
}

func (s *stubRepository) UpdateBaby(userID string, input store.UpdateBabyInput) (domain.BabyProfile, error) {
	return domain.BabyProfile{}, nil
}

func (s *stubRepository) UpdateBabyAvatar(userID string, input store.UpdateBabyAvatarInput) (domain.BabyProfile, error) {
	return domain.BabyProfile{}, nil
}

func (s *stubRepository) DeleteBaby(userID, albumID, babyID string) error { return nil }

func (s *stubRepository) LeaveAlbum(userID string, input store.LeaveAlbumInput) error { return nil }

func (s *stubRepository) UpdateMemberRole(userID string, input store.UpdateAlbumMemberRoleInput) (domain.AlbumMember, error) {
	return domain.AlbumMember{}, nil
}

func (s *stubRepository) UpdateMemberRelation(userID string, input store.UpdateAlbumMemberRelationInput) (domain.AlbumMember, error) {
	return domain.AlbumMember{}, nil
}

func (s *stubRepository) CreateInvite(userID string, input store.CreateAlbumInviteInput) (domain.AlbumInvite, error) {
	return domain.AlbumInvite{}, nil
}

func (s *stubRepository) Invites(albumID, userID string) ([]domain.AlbumInvite, error) {
	return nil, nil
}

func (s *stubRepository) InviteByCode(code string) (domain.AlbumInvite, error) {
	return domain.AlbumInvite{}, nil
}

func (s *stubRepository) AcceptInvite(userID string, input store.AcceptInviteInput) (domain.AlbumInvite, error) {
	return domain.AlbumInvite{}, nil
}

func (s *stubRepository) CreateUploadSession(userID string, input store.UploadSessionInput) (domain.UploadSession, error) {
	return domain.UploadSession{}, nil
}

func (s *stubRepository) AttachUploadContent(userID, sessionID string, input store.UploadContentInput) (domain.UploadSession, error) {
	return domain.UploadSession{}, nil
}

func (s *stubRepository) CreateStorageNodePairing(userID string, input store.CreateStorageNodePairingInput) (domain.StorageNodePairing, error) {
	return domain.StorageNodePairing{}, nil
}

func (s *stubRepository) RegisterStorageNode(input store.StorageNodeRegisterInput) (store.StorageNodeRegisterResult, error) {
	return store.StorageNodeRegisterResult{}, nil
}

func (s *stubRepository) HeartbeatStorageNode(nodeID, token string, capacity store.StorageCapacityReport) (domain.StorageNode, error) {
	return domain.StorageNode{}, nil
}

func (s *stubRepository) UnbindStorageNode(nodeID, token string) error {
	if s.unbindStorageNode != nil {
		return s.unbindStorageNode(nodeID, token)
	}
	return nil
}

func (s *stubRepository) PendingJobs(nodeID, token string) ([]domain.AgentJob, error) {
	return nil, nil
}

func (s *stubRepository) AgentJob(nodeID, token, jobID string) (domain.AgentJob, error) {
	return domain.AgentJob{}, nil
}

func (s *stubRepository) CompleteJob(nodeID, token, jobID string, input store.JobCompletionInput) (domain.AgentJob, error) {
	return domain.AgentJob{}, nil
}

func TestHandleNodeUnbind(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		called := false
		server := NewServer(&stubRepository{
			unbindStorageNode: func(nodeID, token string) error {
				called = true
				if nodeID != "node-1" {
					t.Fatalf("unexpected node id %s", nodeID)
				}
				if token != "token-1" {
					t.Fatalf("unexpected token %s", token)
				}
				return nil
			},
		}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/v1/storage-nodes/unbind", bytes.NewBufferString(`{"nodeId":"node-1"}`))
		request.Header.Set("X-Node-Token", "token-1")

		server.withMiddleware(server.mux).ServeHTTP(recorder, request)

		if !called {
			t.Fatal("expected unbind to be called")
		}
		if recorder.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", recorder.Code)
		}
		var payload map[string]string
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if payload["status"] != "unbound" {
			t.Fatalf("unexpected status %q", payload["status"])
		}
	})

	t.Run("busy conflict", func(t *testing.T) {
		server := NewServer(&stubRepository{
			unbindStorageNode: func(nodeID, token string) error {
				return fmt.Errorf("%w: node has pending jobs", store.ErrConflict)
			},
		}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/v1/storage-nodes/unbind", bytes.NewBufferString(`{"nodeId":"node-1"}`))
		request.Header.Set("X-Node-Token", "token-1")

		server.withMiddleware(server.mux).ServeHTTP(recorder, request)

		if recorder.Code != http.StatusConflict {
			t.Fatalf("expected 409, got %d", recorder.Code)
		}
	})

	t.Run("unauthorized", func(t *testing.T) {
		server := NewServer(&stubRepository{
			unbindStorageNode: func(nodeID, token string) error {
				return store.ErrNodeUnauthorized
			},
		}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/v1/storage-nodes/unbind", bytes.NewBufferString(`{"nodeId":"node-1"}`))

		server.withMiddleware(server.mux).ServeHTTP(recorder, request)

		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", recorder.Code)
		}
	})

	t.Run("missing node id", func(t *testing.T) {
		server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/v1/storage-nodes/unbind", bytes.NewBufferString(`{"nodeId":"  "}`))
		request.Header.Set("X-Node-Token", "token-1")

		server.withMiddleware(server.mux).ServeHTTP(recorder, request)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", recorder.Code)
		}
	})
}

func TestStubRepositorySatisfiesInterface(t *testing.T) {
	t.Parallel()
	var _ store.Repository = (*stubRepository)(nil)
	if time.Now().IsZero() {
		t.Fatal("unreachable")
	}
}
