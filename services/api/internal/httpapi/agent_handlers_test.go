package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

type stubRepository struct {
	unbindStorageNode      func(nodeID, token string) error
	attachUploadContent    func(userID, sessionID string, input store.UploadContentInput) (domain.UploadSession, error)
	pendingJobs            func(nodeID, token string) ([]domain.AgentJob, error)
	agentJob               func(nodeID, token, jobID string) (domain.AgentJob, error)
	mediaByID              func(albumID, userID, mediaID string) (domain.MediaAsset, error)
	babyByID               func(userID, albumID, babyID string) (domain.BabyProfile, error)
	mediaByPublicID        func(mediaID string) (domain.MediaAsset, error)
	babyByPublicID         func(babyID string) (domain.BabyProfile, error)
	resolveOriginal        func(userID, albumID, mediaID string, triggerRestore bool) (domain.MediaAsset, error)
	recordOriginalAccess   func(mediaID string, accessedAt time.Time) error
	referencedBlobKeys     func() ([]string, error)
	previewBlobAssets      func(limit int) ([]domain.MediaAsset, error)
	localOriginalAssets    func(limit int) ([]domain.MediaAsset, error)
	avatarBabies           func(limit int) ([]domain.BabyProfile, error)
	markPreviewMissing     func(mediaID string) error
	attachPreviewBlob      func(mediaID string, input store.PreviewBlobAttachmentInput) error
	markOriginalMissing    func(mediaID string) error
	clearBabyAvatar        func(babyID string) error
	localEviction          func(limit int, processedBefore time.Time) ([]domain.MediaAsset, error)
	markOriginalEvicted    func(mediaID string, evictedAt time.Time) error
	attachLocalOriginal    func(mediaID, blobKey string, accessedAt time.Time) error
	markOriginalR2Uploaded func(mediaID, r2Key string) error
	markOriginalR2Missing  func(mediaID string) error
	currentMonthR2Usage    func(monthKey string) (int64, int64, error)
	addR2Usage             func(monthKey string, classA, classB int64) error
	r2Footprint            func() (int64, error)
	r2Eviction             func(limit int) ([]domain.MediaAsset, error)
	failUploadByMedia      func(mediaID, reason string) error
	failAgentJob           func(jobID, reason string) error
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

func (s *stubRepository) FeedingDay(userID string, input store.FeedingDayInput) (store.FeedingDay, error) {
	return store.FeedingDay{}, nil
}

func (s *stubRepository) FeedingTimer(userID, babyID string) (*domain.BreastFeedingTimerSession, error) {
	return nil, nil
}

func (s *stubRepository) TimelinePage(albumID, userID string, input store.TimelinePageInput) (store.TimelinePage, error) {
	return store.TimelinePage{}, nil
}

func (s *stubRepository) Members(albumID, userID string) ([]domain.AlbumMember, error) {
	return nil, nil
}

func (s *stubRepository) MediaByID(albumID, userID, mediaID string) (domain.MediaAsset, error) {
	if s.mediaByID != nil {
		return s.mediaByID(albumID, userID, mediaID)
	}
	return domain.MediaAsset{}, nil
}

func (s *stubRepository) ProbeDuplicateMedia(userID string, input store.DuplicateMediaProbeInput) (store.DuplicateMediaProbeResult, error) {
	return store.DuplicateMediaProbeResult{}, nil
}

func (s *stubRepository) ResolveDuplicateMedia(userID string, input store.DuplicateMediaResolveInput) (store.DuplicateMediaResolveResult, error) {
	return store.DuplicateMediaResolveResult{}, nil
}

func (s *stubRepository) CreateFeedingEntry(userID string, input store.CreateFeedingEntryInput) (domain.FeedingEntry, error) {
	return domain.FeedingEntry{}, nil
}

func (s *stubRepository) ApplyFeedingTimerAction(userID string, input store.FeedingTimerActionInput) (*domain.BreastFeedingTimerSession, error) {
	return nil, nil
}

func (s *stubRepository) FinishFeedingTimer(userID string, input store.FinishFeedingTimerInput) (domain.FeedingEntry, error) {
	return domain.FeedingEntry{}, nil
}

func (s *stubRepository) CreateTimelineEntry(userID string, input store.CreateTimelineEntryInput) (domain.TimelineEntry, error) {
	return domain.TimelineEntry{}, nil
}

func (s *stubRepository) CreateTimelineComment(userID string, input store.CreateTimelineCommentInput) (domain.TimelineComment, error) {
	return domain.TimelineComment{}, nil
}

func (s *stubRepository) UpdateFeedingEntry(userID string, input store.UpdateFeedingEntryInput) (domain.FeedingEntry, error) {
	return domain.FeedingEntry{}, nil
}

func (s *stubRepository) UpdateTimelineEntry(userID string, input store.UpdateTimelineEntryInput) (domain.TimelineEntry, error) {
	return domain.TimelineEntry{}, nil
}

func (s *stubRepository) DeleteFeedingEntry(userID, babyID, entryID string) error {
	return nil
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
	if s.babyByID != nil {
		return s.babyByID(userID, albumID, babyID)
	}
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

func (s *stubRepository) RemoveMember(userID string, input store.RemoveAlbumMemberInput) error {
	return nil
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
	if s.attachUploadContent != nil {
		return s.attachUploadContent(userID, sessionID, input)
	}
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
	if s.pendingJobs != nil {
		return s.pendingJobs(nodeID, token)
	}
	return nil, nil
}

func (s *stubRepository) AgentJob(nodeID, token, jobID string) (domain.AgentJob, error) {
	if s.agentJob != nil {
		return s.agentJob(nodeID, token, jobID)
	}
	return domain.AgentJob{}, nil
}

func (s *stubRepository) CompleteJob(nodeID, token, jobID string, input store.JobCompletionInput) (domain.AgentJob, error) {
	return domain.AgentJob{}, nil
}

func (s *stubRepository) PreviewBlobAssets(limit int) ([]domain.MediaAsset, error) {
	if s.previewBlobAssets != nil {
		return s.previewBlobAssets(limit)
	}
	return nil, nil
}

func (s *stubRepository) LocalOriginalBlobAssets(limit int) ([]domain.MediaAsset, error) {
	if s.localOriginalAssets != nil {
		return s.localOriginalAssets(limit)
	}
	return nil, nil
}

func (s *stubRepository) AvatarBabies(limit int) ([]domain.BabyProfile, error) {
	if s.avatarBabies != nil {
		return s.avatarBabies(limit)
	}
	return nil, nil
}

func (s *stubRepository) MarkPreviewMissing(mediaID string) error {
	if s.markPreviewMissing != nil {
		return s.markPreviewMissing(mediaID)
	}
	return nil
}

func (s *stubRepository) AttachPreviewBlob(mediaID string, input store.PreviewBlobAttachmentInput) error {
	if s.attachPreviewBlob != nil {
		return s.attachPreviewBlob(mediaID, input)
	}
	return nil
}

func (s *stubRepository) MarkOriginalBlobMissing(mediaID string) error {
	if s.markOriginalMissing != nil {
		return s.markOriginalMissing(mediaID)
	}
	return nil
}

func (s *stubRepository) ClearBabyAvatar(babyID string) error {
	if s.clearBabyAvatar != nil {
		return s.clearBabyAvatar(babyID)
	}
	return nil
}

func (s *stubRepository) FailUploadSessionByMedia(mediaID, reason string) error {
	if s.failUploadByMedia != nil {
		return s.failUploadByMedia(mediaID, reason)
	}
	return nil
}

func (s *stubRepository) FailAgentJob(jobID, reason string) error {
	if s.failAgentJob != nil {
		return s.failAgentJob(jobID, reason)
	}
	return nil
}

func (s *stubRepository) MediaByPublicID(mediaID string) (domain.MediaAsset, error) {
	if s.mediaByPublicID != nil {
		return s.mediaByPublicID(mediaID)
	}
	return domain.MediaAsset{}, nil
}

func (s *stubRepository) BabyByPublicID(babyID string) (domain.BabyProfile, error) {
	if s.babyByPublicID != nil {
		return s.babyByPublicID(babyID)
	}
	return domain.BabyProfile{}, nil
}

func (s *stubRepository) ResolveOriginalStatus(userID, albumID, mediaID string, triggerRestore bool) (domain.MediaAsset, error) {
	if s.resolveOriginal != nil {
		return s.resolveOriginal(userID, albumID, mediaID, triggerRestore)
	}
	return domain.MediaAsset{}, nil
}

func (s *stubRepository) RecordOriginalAccess(mediaID string, accessedAt time.Time) error {
	if s.recordOriginalAccess != nil {
		return s.recordOriginalAccess(mediaID, accessedAt)
	}
	return nil
}

func (s *stubRepository) ReferencedBlobKeys() ([]string, error) {
	if s.referencedBlobKeys != nil {
		return s.referencedBlobKeys()
	}
	return nil, nil
}

func (s *stubRepository) LocalOriginalEvictionCandidates(limit int, processedBefore time.Time) ([]domain.MediaAsset, error) {
	if s.localEviction != nil {
		return s.localEviction(limit, processedBefore)
	}
	return nil, nil
}

func (s *stubRepository) MarkOriginalEvicted(mediaID string, evictedAt time.Time) error {
	if s.markOriginalEvicted != nil {
		return s.markOriginalEvicted(mediaID, evictedAt)
	}
	return nil
}

func (s *stubRepository) AttachLocalOriginalBlob(mediaID, blobKey string, accessedAt time.Time) error {
	if s.attachLocalOriginal != nil {
		return s.attachLocalOriginal(mediaID, blobKey, accessedAt)
	}
	return nil
}

func (s *stubRepository) MarkOriginalR2Uploaded(mediaID, r2Key string) error {
	if s.markOriginalR2Uploaded != nil {
		return s.markOriginalR2Uploaded(mediaID, r2Key)
	}
	return nil
}

func (s *stubRepository) MarkOriginalR2Missing(mediaID string) error {
	if s.markOriginalR2Missing != nil {
		return s.markOriginalR2Missing(mediaID)
	}
	return nil
}

func (s *stubRepository) CurrentMonthR2Usage(monthKey string) (int64, int64, error) {
	if s.currentMonthR2Usage != nil {
		return s.currentMonthR2Usage(monthKey)
	}
	return 0, 0, nil
}

func (s *stubRepository) AddR2Usage(monthKey string, classA, classB int64) error {
	if s.addR2Usage != nil {
		return s.addR2Usage(monthKey, classA, classB)
	}
	return nil
}

func (s *stubRepository) R2Footprint() (int64, error) {
	if s.r2Footprint != nil {
		return s.r2Footprint()
	}
	return 0, nil
}

func (s *stubRepository) R2EvictionCandidates(limit int) ([]domain.MediaAsset, error) {
	if s.r2Eviction != nil {
		return s.r2Eviction(limit)
	}
	return nil, nil
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

func TestHandleAgentJobs(t *testing.T) {
	t.Run("returns immediately when jobs are available", func(t *testing.T) {
		server := NewServer(&stubRepository{
			pendingJobs: func(nodeID, token string) ([]domain.AgentJob, error) {
				if nodeID != "node-1" {
					t.Fatalf("unexpected node id %s", nodeID)
				}
				if token != "token-1" {
					t.Fatalf("unexpected token %s", token)
				}
				return []domain.AgentJob{{
					ID:       "job-1",
					NodeID:   "node-1",
					FamilyID: "album-1",
					MediaID:  "media-1",
					Type:     "ingest_media",
					Status:   domain.JobPending,
				}}, nil
			},
		}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/v1/agents/jobs?nodeId=node-1&waitSeconds=25", nil)
		request.Header.Set("X-Node-Token", "token-1")

		server.withMiddleware(server.mux).ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", recorder.Code)
		}
		var payload struct {
			Items []domain.AgentJob `json:"items"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(payload.Items) != 1 || payload.Items[0].ID != "job-1" {
			t.Fatalf("unexpected payload %+v", payload.Items)
		}
	})

	t.Run("waits for a wake-up before returning jobs", func(t *testing.T) {
		var available atomic.Bool
		firstCheck := make(chan struct{})
		server := NewServer(&stubRepository{
			pendingJobs: func(nodeID, token string) ([]domain.AgentJob, error) {
				select {
				case <-firstCheck:
				default:
					close(firstCheck)
				}
				if available.Load() {
					return []domain.AgentJob{{
						ID:       "job-2",
						NodeID:   nodeID,
						FamilyID: "album-1",
						MediaID:  "media-2",
						Type:     "restore_original",
						Status:   domain.JobPending,
					}}, nil
				}
				return nil, nil
			},
		}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/v1/agents/jobs?nodeId=node-1&waitSeconds=1", nil)
		request.Header.Set("X-Node-Token", "token-1")

		done := make(chan struct{})
		go func() {
			server.withMiddleware(server.mux).ServeHTTP(recorder, request)
			close(done)
		}()

		select {
		case <-firstCheck:
		case <-time.After(500 * time.Millisecond):
			t.Fatal("timed out waiting for first job check")
		}
		available.Store(true)
		server.agentJobHub.Publish("node-1")

		select {
		case <-done:
		case <-time.After(500 * time.Millisecond):
			t.Fatal("timed out waiting for long-poll response")
		}

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", recorder.Code)
		}
		var payload struct {
			Items []domain.AgentJob `json:"items"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(payload.Items) != 1 || payload.Items[0].ID != "job-2" {
			t.Fatalf("unexpected payload %+v", payload.Items)
		}
	})

	t.Run("rejects invalid wait seconds", func(t *testing.T) {
		server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 1024, nil)
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/api/v1/agents/jobs?nodeId=node-1&waitSeconds=abc", nil)
		request.Header.Set("X-Node-Token", "token-1")

		server.withMiddleware(server.mux).ServeHTTP(recorder, request)

		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", recorder.Code)
		}
	})
}

func TestHandleAgentJobBlobMarksFailedWhenSourceMissing(t *testing.T) {
	jobFailed := false
	uploadFailed := false
	originalMarkedMissing := false
	server := NewServer(&stubRepository{
		agentJob: func(nodeID, token, jobID string) (domain.AgentJob, error) {
			return domain.AgentJob{
				ID:            jobID,
				NodeID:        nodeID,
				FamilyID:      "album-1",
				MediaID:       "media-1",
				Type:          "ingest_media",
				Status:        domain.JobPending,
				FileName:      "moment.jpg",
				MediaType:     "image/jpeg",
				BlobKey:       "missing-original.jpg",
				OriginalR2Key: "",
			}, nil
		},
		failAgentJob: func(jobID, reason string) error {
			jobFailed = true
			if jobID != "job-1" {
				t.Fatalf("unexpected job id %s", jobID)
			}
			if reason == "" {
				t.Fatal("expected failure reason")
			}
			return nil
		},
		failUploadByMedia: func(mediaID, reason string) error {
			uploadFailed = true
			if mediaID != "media-1" {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			if reason == "" {
				t.Fatal("expected failure reason")
			}
			return nil
		},
		markOriginalMissing: func(mediaID string) error {
			originalMarkedMissing = true
			if mediaID != "media-1" {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			return nil
		},
	}, blob.New(t.TempDir()), 1024, nil)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/agents/jobs/job-1/blob?nodeId=node-1", nil)
	request.Header.Set("X-Node-Token", "token-1")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
	if !jobFailed {
		t.Fatal("expected job to be failed")
	}
	if !uploadFailed {
		t.Fatal("expected upload session to be failed")
	}
	if !originalMarkedMissing {
		t.Fatal("expected original blob to be marked missing")
	}
}

func TestStubRepositorySatisfiesInterface(t *testing.T) {
	t.Parallel()
	var _ store.Repository = (*stubRepository)(nil)
	if time.Now().IsZero() {
		t.Fatal("unreachable")
	}
}
