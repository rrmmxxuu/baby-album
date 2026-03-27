package store

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"babyalbum/api/internal/domain"
)

type authSession struct {
	UserID    string
	ExpiresAt time.Time
}

type storageBinding struct {
	FamilyID  string
	NodeID    string
	Mode      string
	Status    string
	CreatedBy string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type mediaPlacement struct {
	MediaID        string
	FamilyID       string
	NodeID         string
	Kind           string
	Status         string
	LocalPath      string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	LastVerifiedAt *time.Time
}

type InMemoryStore struct {
	mu              sync.RWMutex
	users           map[string]domain.User
	credentials     map[string]struct{ Salt, Hash string }
	sessions        map[string]authSession
	families        map[string]domain.Family
	members         map[string][]domain.FamilyMember
	storageNodes    map[string]domain.StorageNode
	storageBindings map[string]storageBinding
	storagePairings map[string]domain.StorageNodePairing
	mediaPlacements map[string]mediaPlacement
	timelineEntries map[string][]domain.TimelineEntry
	media           map[string][]domain.MediaAsset
	babies          map[string][]domain.BabyProfile
	invites         map[string]domain.FamilyInvite
	uploadSessions  map[string]domain.UploadSession
	jobs            map[string]domain.AgentJob
}

func NewInMemoryStore() *InMemoryStore {
	now := time.Now().UTC()
	family := domain.Family{ID: "family-demo", Name: "Ramon Family", Timezone: "Asia/Shanghai"}
	users := map[string]domain.User{
		"user-owner":  {ID: "user-owner", DisplayName: "Ramon", Email: "owner@example.com", CreatedAt: now.Add(-24 * time.Hour)},
		"user-admin":  {ID: "user-admin", DisplayName: "Grandma", Email: "admin@example.com", CreatedAt: now.Add(-23 * time.Hour)},
		"user-member": {ID: "user-member", DisplayName: "Dad", Email: "member@example.com", CreatedAt: now.Add(-22 * time.Hour)},
		"user-viewer": {ID: "user-viewer", DisplayName: "Auntie", Email: "viewer@example.com", CreatedAt: now.Add(-21 * time.Hour)},
	}
	credentials := make(map[string]struct{ Salt, Hash string })
	for _, user := range users {
		salt, hash, _ := passwordSaltAndHash("demo12345")
		credentials[user.ID] = struct{ Salt, Hash string }{Salt: salt, Hash: hash}
	}
	members := []domain.FamilyMember{
		{UserID: "user-owner", FamilyID: family.ID, Role: domain.RoleOwner, DisplayName: "Ramon", Relation: "爸爸"},
		{UserID: "user-admin", FamilyID: family.ID, Role: domain.RoleAdmin, DisplayName: "Grandma", Relation: "奶奶"},
		{UserID: "user-member", FamilyID: family.ID, Role: domain.RoleMember, DisplayName: "Dad", Relation: "妈妈"},
		{UserID: "user-viewer", FamilyID: family.ID, Role: domain.RoleViewer, DisplayName: "Auntie", Relation: "阿姨"},
	}
	node := domain.StorageNode{ID: "node-demo", FamilyID: family.ID, Name: "Living Room NAS", Status: domain.NodeOnline, RegistrationToken: "demo-registration-token", LastSeenAt: now.Add(-10 * time.Second), TotalBytes: 2 << 40, FreeBytes: 1500 << 30, AvailableBytes: 1450 << 30}
	binding := storageBinding{FamilyID: family.ID, NodeID: node.ID, Mode: "primary", Status: "active", CreatedBy: "user-owner", CreatedAt: now.Add(-10 * time.Second), UpdatedAt: now.Add(-10 * time.Second)}
	media := []domain.MediaAsset{
		newSeedMedia("media-001", family.ID, "2025-11-02-first-smile.heic", "image/heic", now.AddDate(0, -4, -13), "camera_roll"),
		newSeedMedia("media-002", family.ID, "2026-01-16-weekend-video.mov", "video/quicktime", now.AddDate(0, -2, -9), "camera_roll"),
		newSeedMedia("media-003", family.ID, "2026-03-20-park.jpg", "image/jpeg", now.AddDate(0, 0, -5), "manual_upload"),
	}
	entries := seedTimelineEntries(media)
	babies := []domain.BabyProfile{{ID: "baby-demo", FamilyID: family.ID, Name: "Little Qin", BirthDate: timePointer(now.AddDate(-1, -3, 0)), CreatedAt: now.Add(-20 * time.Hour)}}
	return &InMemoryStore{
		users:           users,
		credentials:     credentials,
		sessions:        make(map[string]authSession),
		families:        map[string]domain.Family{family.ID: family},
		members:         map[string][]domain.FamilyMember{family.ID: members},
		storageNodes:    map[string]domain.StorageNode{node.ID: node},
		storageBindings: map[string]storageBinding{storageBindingKey(family.ID, node.ID): binding},
		storagePairings: make(map[string]domain.StorageNodePairing),
		mediaPlacements: seedMediaPlacements(media, node.ID),
		timelineEntries: map[string][]domain.TimelineEntry{family.ID: entries},
		media:           map[string][]domain.MediaAsset{family.ID: media},
		babies:          map[string][]domain.BabyProfile{family.ID: babies},
		invites:         make(map[string]domain.FamilyInvite),
		uploadSessions:  make(map[string]domain.UploadSession),
		jobs:            make(map[string]domain.AgentJob),
	}
}

func storageBindingKey(familyID, nodeID string) string {
	return familyID + "::" + nodeID
}

func mediaPlacementKey(mediaID, nodeID string) string {
	return mediaID + "::" + nodeID
}

func seedMediaPlacements(items []domain.MediaAsset, nodeID string) map[string]mediaPlacement {
	placements := make(map[string]mediaPlacement, len(items))
	for _, item := range items {
		var verifiedAt *time.Time
		if item.ProcessedAt != nil {
			ts := *item.ProcessedAt
			verifiedAt = &ts
		}
		placements[mediaPlacementKey(item.ID, nodeID)] = mediaPlacement{
			MediaID:        item.ID,
			FamilyID:       item.FamilyID,
			NodeID:         nodeID,
			Kind:           "primary",
			Status:         "ready",
			LocalPath:      item.OriginalPath,
			CreatedAt:      item.UploadedAt,
			UpdatedAt:      item.UploadedAt,
			LastVerifiedAt: verifiedAt,
		}
	}
	return placements
}

func newSeedMedia(id, familyID, fileName, mediaType string, capturedAt time.Time, source string) domain.MediaAsset {
	capturedAt = capturedAt.UTC()
	processedAt := capturedAt.Add(5 * time.Minute)
	return domain.MediaAsset{
		ID:             id,
		FamilyID:       familyID,
		EntryID:        id,
		UploadBatchID:  id,
		UploadedBy:     "user-owner",
		UploadedByName: "Ramon",
		FileName:       fileName,
		MediaType:      mediaType,
		CapturedAt:     capturedAt,
		UploadedAt:     capturedAt.Add(3 * time.Minute),
		TimelineDay:    capturedAt.Format("2006-01-02"),
		Status:         domain.MediaReady,
		Source:         source,
		PreviewStatus:  domain.PreviewUnavailable,
		ProcessedAt:    &processedAt,
	}
}

func seedTimelineEntries(items []domain.MediaAsset) []domain.TimelineEntry {
	entries := make([]domain.TimelineEntry, 0, len(items))
	for _, item := range items {
		entries = append(entries, domain.TimelineEntry{
			ID:             item.EntryID,
			FamilyID:       item.FamilyID,
			Caption:        "",
			Visibility:     domain.EntryVisibilityMembers,
			TimeMode:       domain.EntryTimeCaptured,
			DisplayAt:      item.CapturedAt,
			TimelineDay:    item.CapturedAt.Format("2006-01-02"),
			UploadedBy:     item.UploadedBy,
			UploadedByName: item.UploadedByName,
			UploadedAt:     item.UploadedAt,
			CreatedAt:      item.UploadedAt,
			Items:          []domain.MediaAsset{item},
		})
	}
	sortTimelineEntries(entries)
	return entries
}

func (s *InMemoryStore) RegisterUser(input RegisterUserInput) (AuthResult, error) {
	displayName := stringsTrim(input.DisplayName)
	email := canonicalEmail(input.Email)
	if displayName == "" || email == "" {
		return AuthResult{}, fmt.Errorf("displayName and email are required")
	}
	salt, hash, err := passwordSaltAndHash(input.Password)
	if err != nil {
		return AuthResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, user := range s.users {
		if canonicalEmail(user.Email) == email {
			return AuthResult{}, ErrConflict
		}
	}
	user := domain.User{ID: newID("user"), DisplayName: displayName, Email: email, CreatedAt: time.Now().UTC()}
	s.users[user.ID] = user
	s.credentials[user.ID] = struct{ Salt, Hash string }{Salt: salt, Hash: hash}
	return s.issueSessionLocked(user), nil
}

func (s *InMemoryStore) Login(input LoginInput) (AuthResult, error) {
	email := canonicalEmail(input.Email)
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, user := range s.users {
		if canonicalEmail(user.Email) != email {
			continue
		}
		credential := s.credentials[user.ID]
		if !verifyPassword(input.Password, credential.Salt, credential.Hash) {
			return AuthResult{}, ErrUnauthorized
		}
		return s.issueSessionLocked(user), nil
	}
	return AuthResult{}, ErrUnauthorized
}

func (s *InMemoryStore) SessionUser(token string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[token]
	if !ok || session.ExpiresAt.Before(time.Now().UTC()) {
		return domain.User{}, ErrUnauthorized
	}
	user, ok := s.users[session.UserID]
	if !ok {
		return domain.User{}, ErrUnauthorized
	}
	return user, nil
}

func (s *InMemoryStore) RevokeSession(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
	return nil
}

func (s *InMemoryStore) AppState(userID, albumID string) (AppState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok {
		return AppState{}, ErrNotFound
	}
	albums := s.albumSummariesLocked(userID)
	state := AppState{CurrentUser: user, Albums: albums}
	if len(albums) == 0 {
		return normalizeAppState(state), nil
	}
	selectedAlbumID := albumID
	if selectedAlbumID == "" || !s.userBelongsToAlbumLocked(userID, selectedAlbumID) {
		selectedAlbumID = albums[0].Album.ID
	}
	workspace, err := s.buildAlbumWorkspaceLocked(selectedAlbumID, userID)
	if err != nil {
		return AppState{}, err
	}
	state.ActiveAlbum = &workspace
	state.ActiveAlbumID = selectedAlbumID
	return normalizeAppState(state), nil
}

func (s *InMemoryStore) AlbumWorkspace(albumID, userID string) (AlbumWorkspace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.buildAlbumWorkspaceLocked(albumID, userID)
}

func (s *InMemoryStore) Timeline(familyID, userID string) ([]domain.TimelineEntry, error) {
	if err := s.Authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	timeline := append([]domain.TimelineEntry(nil), s.timelineEntries[familyID]...)
	sortTimelineEntries(timeline)
	return cloneTimelineEntries(timeline), nil
}

func (s *InMemoryStore) Members(familyID, userID string) ([]domain.AlbumMember, error) {
	if err := s.Authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := append([]domain.FamilyMember(nil), s.members[familyID]...)
	sort.Slice(items, func(i, j int) bool { return items[i].DisplayName < items[j].DisplayName })
	return items, nil
}

func (s *InMemoryStore) MediaByID(familyID, userID, mediaID string) (domain.MediaAsset, error) {
	if err := s.Authorize(familyID, userID, domain.RoleViewer); err != nil {
		return domain.MediaAsset{}, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, item := range s.media[familyID] {
		if item.ID == mediaID {
			return item, nil
		}
	}
	return domain.MediaAsset{}, ErrNotFound
}

func (s *InMemoryStore) CreateTimelineEntry(userID string, input CreateTimelineEntryInput) (domain.TimelineEntry, error) {
	if err := s.Authorize(input.AlbumID, userID, domain.RoleMember); err != nil {
		return domain.TimelineEntry{}, err
	}
	if !validTimelineVisibility(input.Visibility) || !validTimelineTimeMode(input.TimeMode) {
		return domain.TimelineEntry{}, ErrConflict
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	user, ok := s.users[userID]
	if !ok {
		return domain.TimelineEntry{}, ErrNotFound
	}
	now := time.Now().UTC()
	entry := domain.TimelineEntry{
		ID:             newID("entry"),
		FamilyID:       input.AlbumID,
		Caption:        stringsTrim(input.Caption),
		Visibility:     input.Visibility,
		TimeMode:       input.TimeMode,
		DisplayAt:      input.DisplayAt.UTC(),
		TimelineDay:    input.DisplayAt.UTC().Format("2006-01-02"),
		UploadedBy:     user.ID,
		UploadedByName: user.DisplayName,
		UploadedAt:     now,
		CreatedAt:      now,
		Items:          []domain.MediaAsset{},
	}
	s.timelineEntries[input.AlbumID] = append(s.timelineEntries[input.AlbumID], entry)
	sortTimelineEntries(s.timelineEntries[input.AlbumID])
	return entry, nil
}

func (s *InMemoryStore) UpdateTimelineEntry(userID string, input UpdateTimelineEntryInput) (domain.TimelineEntry, error) {
	if !validTimelineVisibility(input.Visibility) || !validTimelineTimeMode(input.TimeMode) {
		return domain.TimelineEntry{}, ErrConflict
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entryIndex, entry, err := s.timelineEntryByIDLocked(input.AlbumID, input.EntryID)
	if err != nil {
		return domain.TimelineEntry{}, err
	}
	if err := s.authorizeTimelineEntryEditLocked(userID, entry); err != nil {
		return domain.TimelineEntry{}, err
	}
	entry.Caption = stringsTrim(input.Caption)
	entry.Visibility = input.Visibility
	entry.TimeMode = input.TimeMode
	entry.DisplayAt = input.DisplayAt.UTC()
	entry.TimelineDay = input.DisplayAt.UTC().Format("2006-01-02")
	s.timelineEntries[input.AlbumID][entryIndex] = entry
	sortTimelineEntries(s.timelineEntries[input.AlbumID])
	return entry, nil
}

func (s *InMemoryStore) DeleteTimelineEntry(userID, albumID, entryID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, entry, err := s.timelineEntryByIDLocked(albumID, entryID)
	if err != nil {
		return err
	}
	if err := s.authorizeTimelineEntryEditLocked(userID, entry); err != nil {
		return err
	}
	entries := s.timelineEntries[albumID][:0]
	for _, item := range s.timelineEntries[albumID] {
		if item.ID != entryID {
			entries = append(entries, item)
		}
	}
	s.timelineEntries[albumID] = entries

	mediaItems := s.media[albumID][:0]
	removedMediaIDs := map[string]struct{}{}
	for _, item := range s.media[albumID] {
		if item.EntryID == entryID {
			removedMediaIDs[item.ID] = struct{}{}
			continue
		}
		mediaItems = append(mediaItems, item)
	}
	s.media[albumID] = mediaItems

	for sessionID, session := range s.uploadSessions {
		if session.FamilyID == albumID && session.EntryID == entryID {
			delete(s.uploadSessions, sessionID)
		}
	}
	for jobID, job := range s.jobs {
		if job.FamilyID != albumID {
			continue
		}
		if _, ok := removedMediaIDs[job.MediaID]; ok {
			delete(s.jobs, jobID)
		}
	}
	return nil
}

func (s *InMemoryStore) DeleteTimelineEntryMedia(userID, albumID, entryID, mediaID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, entry, err := s.timelineEntryByIDLocked(albumID, entryID)
	if err != nil {
		return err
	}
	if err := s.authorizeTimelineEntryEditLocked(userID, entry); err != nil {
		return err
	}
	found := false
	mediaItems := s.media[albumID][:0]
	for _, item := range s.media[albumID] {
		if item.ID == mediaID && item.EntryID == entryID {
			found = true
			continue
		}
		mediaItems = append(mediaItems, item)
	}
	if !found {
		return ErrNotFound
	}
	s.media[albumID] = mediaItems
	s.removeTimelineMediaLocked(albumID, entryID, mediaID)
	for sessionID, session := range s.uploadSessions {
		if session.FamilyID == albumID && session.MediaID == mediaID {
			delete(s.uploadSessions, sessionID)
		}
	}
	for jobID, job := range s.jobs {
		if job.FamilyID == albumID && job.MediaID == mediaID {
			delete(s.jobs, jobID)
		}
	}
	return nil
}

func (s *InMemoryStore) CreateAlbum(userID string, input CreateAlbumInput) (domain.Album, error) {
	name := stringsTrim(input.Name)
	timezone := stringsTrim(input.Timezone)
	babyName := stringsTrim(input.BabyName)
	relation := stringsTrim(input.Relation)
	if name == "" {
		return domain.Family{}, fmt.Errorf("family name is required")
	}
	if babyName == "" {
		return domain.Family{}, fmt.Errorf("baby name is required")
	}
	if relation == "" {
		return domain.Family{}, fmt.Errorf("relation is required")
	}
	if timezone == "" {
		timezone = "Asia/Shanghai"
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	user, ok := s.users[userID]
	if !ok {
		return domain.Family{}, ErrNotFound
	}
	family := domain.Family{ID: newID("family"), Name: name, Timezone: timezone}
	s.families[family.ID] = family
	s.members[family.ID] = []domain.FamilyMember{{UserID: user.ID, FamilyID: family.ID, Role: domain.RoleOwner, DisplayName: user.DisplayName, Relation: relation}}
	s.timelineEntries[family.ID] = []domain.TimelineEntry{}
	s.media[family.ID] = []domain.MediaAsset{}
	baby := domain.BabyProfile{ID: newID("baby"), FamilyID: family.ID, Name: babyName, CreatedAt: time.Now().UTC()}
	if input.BirthDate != nil {
		birthDate := input.BirthDate.UTC()
		baby.BirthDate = &birthDate
	}
	s.babies[family.ID] = []domain.BabyProfile{baby}
	return family, nil
}

func (s *InMemoryStore) CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error) {
	if err := s.Authorize(input.AlbumID, userID, domain.RoleMember); err != nil {
		return domain.BabyProfile{}, err
	}
	name := stringsTrim(input.Name)
	if name == "" {
		return domain.BabyProfile{}, fmt.Errorf("baby name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.babies[input.AlbumID]) > 0 {
		return domain.BabyProfile{}, ErrConflict
	}
	baby := domain.BabyProfile{ID: newID("baby"), FamilyID: input.AlbumID, Name: name, CreatedAt: time.Now().UTC()}
	if input.BirthDate != nil {
		birthDate := input.BirthDate.UTC()
		baby.BirthDate = &birthDate
	}
	s.babies[input.AlbumID] = append(s.babies[input.AlbumID], baby)
	sortBabies(s.babies[input.AlbumID])
	return baby, nil
}

func (s *InMemoryStore) BabyByID(userID, albumID, babyID string) (domain.BabyProfile, error) {
	if err := s.Authorize(albumID, userID, domain.RoleViewer); err != nil {
		return domain.BabyProfile{}, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, baby := range s.babies[albumID] {
		if baby.ID == babyID {
			return baby, nil
		}
	}
	return domain.BabyProfile{}, ErrNotFound
}

func (s *InMemoryStore) UpdateBaby(userID string, input UpdateBabyInput) (domain.BabyProfile, error) {
	if err := s.Authorize(input.AlbumID, userID, domain.RoleAdmin); err != nil {
		return domain.BabyProfile{}, err
	}
	name := stringsTrim(input.Name)
	if name == "" {
		return domain.BabyProfile{}, fmt.Errorf("baby name is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	babies := s.babies[input.AlbumID]
	for index := range babies {
		if babies[index].ID != input.BabyID {
			continue
		}
		babies[index].Name = name
		if input.BirthDate != nil {
			birthDate := input.BirthDate.UTC()
			babies[index].BirthDate = &birthDate
		} else {
			babies[index].BirthDate = nil
		}
		s.babies[input.AlbumID] = babies
		return babies[index], nil
	}
	return domain.BabyProfile{}, ErrNotFound
}

func (s *InMemoryStore) UpdateBabyAvatar(userID string, input UpdateBabyAvatarInput) (domain.BabyProfile, error) {
	if err := s.Authorize(input.AlbumID, userID, domain.RoleAdmin); err != nil {
		return domain.BabyProfile{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	babies := s.babies[input.AlbumID]
	for index := range babies {
		if babies[index].ID != input.BabyID {
			continue
		}
		babies[index].AvatarKey = stringsTrim(input.AvatarKey)
		babies[index].HasAvatar = babies[index].AvatarKey != ""
		now := time.Now().UTC()
		babies[index].AvatarUpdatedAt = &now
		s.babies[input.AlbumID] = babies
		return babies[index], nil
	}
	return domain.BabyProfile{}, ErrNotFound
}

func (s *InMemoryStore) DeleteBaby(userID, familyID, babyID string) error {
	if err := s.Authorize(familyID, userID, domain.RoleAdmin); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	babies := s.babies[familyID]
	if len(babies) <= 1 {
		return ErrConflict
	}
	for i := range babies {
		if babies[i].ID == babyID {
			s.babies[familyID] = append(babies[:i], babies[i+1:]...)
			return nil
		}
	}
	return ErrNotFound
}

func (s *InMemoryStore) LeaveAlbum(userID string, input LeaveAlbumInput) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	members := append([]domain.AlbumMember(nil), s.members[input.AlbumID]...)
	actor, err := findMember(members, userID)
	if err != nil {
		return err
	}
	transferOwnerTo := stringsTrim(input.TransferOwnerTo)
	if actor.Role == domain.RoleOwner {
		if transferOwnerTo == "" || transferOwnerTo == userID {
			return fmt.Errorf("owner must transfer ownership before leaving")
		}
		targetIndex := -1
		for i := range members {
			if members[i].UserID == transferOwnerTo {
				targetIndex = i
				break
			}
		}
		if targetIndex < 0 {
			return ErrNotFound
		}
		members[targetIndex].Role = domain.RoleOwner
	} else if transferOwnerTo != "" {
		return ErrForbidden
	}
	remaining := make([]domain.AlbumMember, 0, len(members)-1)
	for _, member := range members {
		if member.UserID != userID {
			remaining = append(remaining, member)
		}
	}
	if len(remaining) == len(members) {
		return ErrNotFound
	}
	s.members[input.AlbumID] = remaining
	return nil
}

func (s *InMemoryStore) UpdateMemberRole(userID string, input UpdateAlbumMemberRoleInput) (domain.AlbumMember, error) {
	if !validRole(input.Role) || input.Role == domain.RoleOwner {
		return domain.FamilyMember{}, ErrForbidden
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	actor, err := findMember(s.members[input.AlbumID], userID)
	if err != nil {
		return domain.FamilyMember{}, err
	}
	if actor.Role != domain.RoleOwner || input.MemberUserID == userID {
		return domain.FamilyMember{}, ErrForbidden
	}
	members := s.members[input.AlbumID]
	for i := range members {
		if members[i].UserID == input.MemberUserID {
			if members[i].Role == domain.RoleOwner {
				return domain.FamilyMember{}, ErrForbidden
			}
			members[i].Role = input.Role
			s.members[input.AlbumID] = members
			return members[i], nil
		}
	}
	return domain.FamilyMember{}, ErrNotFound
}

func (s *InMemoryStore) UpdateMemberRelation(userID string, input UpdateAlbumMemberRelationInput) (domain.AlbumMember, error) {
	relation := stringsTrim(input.Relation)
	if relation == "" {
		return domain.FamilyMember{}, fmt.Errorf("relation is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	actor, err := findMember(s.members[input.AlbumID], userID)
	if err != nil {
		return domain.FamilyMember{}, err
	}
	if userID != input.MemberUserID && actor.Role != domain.RoleOwner && actor.Role != domain.RoleAdmin {
		return domain.FamilyMember{}, ErrForbidden
	}
	members := s.members[input.AlbumID]
	for i := range members {
		if members[i].UserID == input.MemberUserID {
			members[i].Relation = relation
			s.members[input.AlbumID] = members
			return members[i], nil
		}
	}
	return domain.FamilyMember{}, ErrNotFound
}

func (s *InMemoryStore) CreateInvite(userID string, input CreateAlbumInviteInput) (domain.AlbumInvite, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	actor, err := findMember(s.members[input.AlbumID], userID)
	if err != nil {
		return domain.FamilyInvite{}, err
	}
	if actor.Role != domain.RoleOwner && actor.Role != domain.RoleAdmin {
		return domain.FamilyInvite{}, ErrForbidden
	}
	invite := domain.AlbumInvite{ID: newID("invite"), FamilyID: input.AlbumID, Code: newInviteCode(), Role: domain.RoleViewer, Status: domain.InvitePending, CreatedBy: userID, CreatedAt: time.Now().UTC()}
	s.invites[invite.Code] = s.hydrateInviteLocked(invite)
	return s.invites[invite.Code], nil
}

func (s *InMemoryStore) Invites(familyID, userID string) ([]domain.AlbumInvite, error) {
	if err := s.Authorize(familyID, userID, domain.RoleAdmin); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var items []domain.AlbumInvite
	for _, invite := range s.invites {
		if invite.FamilyID == familyID {
			items = append(items, s.hydrateInviteLocked(invite))
		}
	}
	sortInvites(items)
	return items, nil
}

func (s *InMemoryStore) InviteByCode(code string) (domain.AlbumInvite, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	invite, ok := s.invites[code]
	if !ok {
		return domain.FamilyInvite{}, ErrNotFound
	}
	return s.hydrateInviteLocked(invite), nil
}

func (s *InMemoryStore) AcceptInvite(userID string, input AcceptInviteInput) (domain.AlbumInvite, error) {
	relation := stringsTrim(input.Relation)
	if relation == "" {
		return domain.FamilyInvite{}, fmt.Errorf("relation is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	invite, ok := s.invites[input.Code]
	if !ok {
		return domain.FamilyInvite{}, ErrNotFound
	}
	if invite.Status != domain.InvitePending {
		return domain.FamilyInvite{}, ErrConflict
	}
	user, ok := s.users[userID]
	if !ok {
		return domain.FamilyInvite{}, ErrNotFound
	}
	if s.userBelongsToAlbumLocked(userID, invite.FamilyID) {
		return domain.FamilyInvite{}, ErrConflict
	}
	s.members[invite.FamilyID] = append(s.members[invite.FamilyID], domain.FamilyMember{UserID: user.ID, FamilyID: invite.FamilyID, Role: invite.Role, DisplayName: user.DisplayName, Relation: relation})
	acceptedAt := time.Now().UTC()
	invite.Status = domain.InviteAccepted
	invite.AcceptedAt = &acceptedAt
	invite.AcceptedBy = user.ID
	s.invites[input.Code] = s.hydrateInviteLocked(invite)
	return s.invites[input.Code], nil
}

func (s *InMemoryStore) CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error) {
	if err := s.Authorize(input.AlbumID, userID, domain.RoleMember); err != nil {
		return domain.UploadSession{}, err
	}
	if input.FileName == "" || input.MediaType == "" {
		return domain.UploadSession{}, fmt.Errorf("fileName and mediaType are required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	node, err := s.findAlbumNodeLocked(input.AlbumID)
	if err != nil {
		return domain.UploadSession{}, err
	}
	user, ok := s.users[userID]
	if !ok {
		return domain.UploadSession{}, ErrNotFound
	}
	if !s.timelineEntryExistsLocked(input.AlbumID, input.EntryID) {
		return domain.UploadSession{}, ErrNotFound
	}
	now := time.Now().UTC()
	mediaID := newID("media")
	uploadBatchID := stringsTrim(input.UploadBatchID)
	if uploadBatchID == "" {
		uploadBatchID = newID("batch")
	}
	sessionID := newID("upload")
	capturedAt := NormalizeCapturedAt(input.CapturedAt, nil, now)
	asset := domain.MediaAsset{
		ID:              mediaID,
		FamilyID:        input.AlbumID,
		EntryID:         input.EntryID,
		UploadBatchID:   uploadBatchID,
		UploadedBy:      user.ID,
		UploadedByName:  user.DisplayName,
		FileName:        input.FileName,
		MediaType:       input.MediaType,
		CapturedAt:      capturedAt,
		UploadedAt:      now,
		TimelineDay:     capturedAt.Format("2006-01-02"),
		Status:          domain.MediaPending,
		Source:          "manual_upload",
		PreviewStatus:   domain.PreviewPending,
		OriginalBlobKey: "",
	}
	s.media[input.AlbumID] = append(s.media[input.AlbumID], asset)
	sortMedia(s.media[input.AlbumID])
	session := domain.UploadSession{
		ID:             sessionID,
		FamilyID:       input.AlbumID,
		EntryID:        input.EntryID,
		UploadBatchID:  uploadBatchID,
		UploadedBy:     user.ID,
		UploadedByName: user.DisplayName,
		MediaID:        mediaID,
		FileName:       input.FileName,
		MediaType:      input.MediaType,
		Status:         "created",
		CreatedAt:      now,
		AssignedTo:     node.ID,
		ByteSize:       0,
		BlobKey:        "",
	}
	s.uploadSessions[session.ID] = session
	s.mediaPlacements[mediaPlacementKey(mediaID, node.ID)] = mediaPlacement{
		MediaID:   mediaID,
		FamilyID:  input.AlbumID,
		NodeID:    node.ID,
		Kind:      "primary",
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.attachMediaToTimelineEntryLocked(input.AlbumID, input.EntryID, asset)
	return session, nil
}

func (s *InMemoryStore) AttachUploadContent(userID, sessionID string, input UploadContentInput) (domain.UploadSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.uploadSessions[sessionID]
	if !ok {
		return domain.UploadSession{}, ErrNotFound
	}
	member, err := findMember(s.members[session.FamilyID], userID)
	if err != nil || roleRank(member.Role) < roleRank(domain.RoleMember) {
		return domain.UploadSession{}, ErrForbidden
	}
	if session.Status != "created" {
		return domain.UploadSession{}, ErrConflict
	}
	session.Status = "uploaded"
	session.ByteSize = input.ByteSize
	session.BlobKey = input.BlobKey
	s.uploadSessions[sessionID] = session
	now := time.Now().UTC()
	for i := range s.media[session.FamilyID] {
		if s.media[session.FamilyID][i].ID == session.MediaID {
			s.media[session.FamilyID][i].OriginalBlobKey = input.BlobKey
			s.replaceTimelineMediaLocked(session.FamilyID, s.media[session.FamilyID][i])
			break
		}
	}
	job := domain.AgentJob{ID: newID("job"), NodeID: session.AssignedTo, FamilyID: session.FamilyID, MediaID: session.MediaID, Type: "ingest_media", Status: domain.JobPending, CreatedAt: now, UpdatedAt: now, FileName: session.FileName, MediaType: session.MediaType, ByteSize: session.ByteSize, BlobKey: session.BlobKey}
	s.jobs[job.ID] = job
	return session, nil
}

func (s *InMemoryStore) CreateStorageNodePairing(userID string, input CreateStorageNodePairingInput) (domain.StorageNodePairing, error) {
	if err := s.Authorize(input.AlbumID, userID, domain.RoleOwner); err != nil {
		return domain.StorageNodePairing{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.families[input.AlbumID]; !ok {
		return domain.StorageNodePairing{}, ErrNotFound
	}
	pairing := domain.StorageNodePairing{
		Code:      newPairingCode(),
		FamilyID:  input.AlbumID,
		CreatedBy: userID,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	s.storagePairings[pairing.Code] = pairing
	return pairing, nil
}

func (s *InMemoryStore) RegisterStorageNode(input StorageNodeRegisterInput) (StorageNodeRegisterResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if input.Token != "" && input.NodeID != "" {
		node, ok := s.storageNodes[input.NodeID]
		if !ok {
			return StorageNodeRegisterResult{}, ErrNotFound
		}
		if input.Token != node.RegistrationToken {
			return StorageNodeRegisterResult{}, ErrNodeUnauthorized
		}
		if stringsTrim(input.NodeName) != "" {
			node.Name = stringsTrim(input.NodeName)
		}
		node.Status = domain.NodeOnline
		node.LastSeenAt = now
		node.TotalBytes = input.Capacity.TotalBytes
		node.FreeBytes = input.Capacity.FreeBytes
		node.AvailableBytes = input.Capacity.AvailableBytes
		s.storageNodes[node.ID] = node
		if pairingCode := stringsTrim(input.PairingCode); pairingCode != "" {
			pairing, ok := s.storagePairings[pairingCode]
			if !ok {
				return StorageNodeRegisterResult{}, ErrPairingNotFound
			}
			if pairing.UsedAt != nil {
				return StorageNodeRegisterResult{}, ErrPairingUsed
			}
			if pairing.ExpiresAt.Before(now) {
				return StorageNodeRegisterResult{}, ErrPairingExpired
			}
			s.bindNodeToFamilyLocked(pairing.FamilyID, node.ID, pairing.CreatedBy, now)
			pairing.UsedAt = &now
			s.storagePairings[pairing.Code] = pairing
			node.FamilyID = pairing.FamilyID
		}
		return StorageNodeRegisterResult{Node: node, NodeID: node.ID, NodeToken: node.RegistrationToken}, nil
	}

	pairing, ok := s.storagePairings[input.PairingCode]
	if !ok {
		return StorageNodeRegisterResult{}, ErrPairingNotFound
	}
	if pairing.UsedAt != nil {
		return StorageNodeRegisterResult{}, ErrPairingUsed
	}
	if pairing.ExpiresAt.Before(now) {
		return StorageNodeRegisterResult{}, ErrPairingExpired
	}
	nodeID := stringsTrim(input.NodeID)
	if nodeID == "" {
		nodeID = newID("node")
	}
	nodeToken := newSessionToken()
	node := domain.StorageNode{
		ID:                nodeID,
		FamilyID:          pairing.FamilyID,
		Name:              fallbackNodeName(input.NodeName, nodeID),
		Status:            domain.NodeOnline,
		RegistrationToken: nodeToken,
		LastSeenAt:        now,
		TotalBytes:        input.Capacity.TotalBytes,
		FreeBytes:         input.Capacity.FreeBytes,
		AvailableBytes:    input.Capacity.AvailableBytes,
	}
	s.storageNodes[node.ID] = node
	s.bindNodeToFamilyLocked(pairing.FamilyID, node.ID, pairing.CreatedBy, now)
	pairing.UsedAt = &now
	s.storagePairings[pairing.Code] = pairing
	return StorageNodeRegisterResult{Node: node, NodeID: node.ID, NodeToken: node.RegistrationToken}, nil
}

func (s *InMemoryStore) HeartbeatStorageNode(nodeID, token string, capacity StorageCapacityReport) (domain.StorageNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	node, ok := s.storageNodes[nodeID]
	if !ok {
		return domain.StorageNode{}, ErrNotFound
	}
	if token != node.RegistrationToken {
		return domain.StorageNode{}, ErrNodeUnauthorized
	}
	node.Status = domain.NodeOnline
	node.LastSeenAt = time.Now().UTC()
	node.TotalBytes = capacity.TotalBytes
	node.FreeBytes = capacity.FreeBytes
	node.AvailableBytes = capacity.AvailableBytes
	s.storageNodes[nodeID] = node
	return node, nil
}

func (s *InMemoryStore) PendingJobs(nodeID, token string) ([]domain.AgentJob, error) {
	s.mu.RLock()
	node, ok := s.storageNodes[nodeID]
	s.mu.RUnlock()
	if !ok {
		return nil, ErrNotFound
	}
	if token != node.RegistrationToken {
		return nil, ErrNodeUnauthorized
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var jobs []domain.AgentJob
	for _, job := range s.jobs {
		if job.NodeID == nodeID && job.Status == domain.JobPending {
			jobs = append(jobs, job)
		}
	}
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].CreatedAt.Before(jobs[j].CreatedAt) })
	return jobs, nil
}

func (s *InMemoryStore) AgentJob(nodeID, token, jobID string) (domain.AgentJob, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	node, ok := s.storageNodes[nodeID]
	if !ok {
		return domain.AgentJob{}, ErrNotFound
	}
	if token != node.RegistrationToken {
		return domain.AgentJob{}, ErrNodeUnauthorized
	}
	job, ok := s.jobs[jobID]
	if !ok {
		return domain.AgentJob{}, ErrNotFound
	}
	if job.NodeID != nodeID {
		return domain.AgentJob{}, ErrForbidden
	}
	return job, nil
}

func (s *InMemoryStore) CompleteJob(nodeID, token, jobID string, input JobCompletionInput) (domain.AgentJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	node, ok := s.storageNodes[nodeID]
	if !ok {
		return domain.AgentJob{}, ErrNotFound
	}
	if token != node.RegistrationToken {
		return domain.AgentJob{}, ErrNodeUnauthorized
	}
	job, ok := s.jobs[jobID]
	if !ok {
		return domain.AgentJob{}, ErrNotFound
	}
	if job.NodeID != nodeID {
		return domain.AgentJob{}, ErrForbidden
	}
	job.Status = domain.JobCompleted
	job.UpdatedAt = time.Now().UTC()
	s.jobs[jobID] = job
	processedAt := input.ProcessedAt
	if processedAt.IsZero() {
		processedAt = time.Now().UTC()
	}
	assets := s.media[job.FamilyID]
	for i := range assets {
		if assets[i].ID == job.MediaID {
			assets[i].Status = domain.MediaReady
			assets[i].Width = input.Width
			assets[i].Height = input.Height
			assets[i].PreviewStatus = input.PreviewStatus
			assets[i].PreviewBlobKey = input.PreviewBlobKey
			assets[i].ProcessedAt = &processedAt
			assets[i].OriginalPath = input.OriginalPath
			s.media[job.FamilyID] = assets
			s.replaceTimelineMediaLocked(job.FamilyID, assets[i])
			break
		}
	}
	currentPrimaryNodeID := s.primaryNodeIDForFamilyLocked(job.FamilyID)
	placementKey := mediaPlacementKey(job.MediaID, nodeID)
	placement := s.mediaPlacements[placementKey]
	placement.MediaID = job.MediaID
	placement.FamilyID = job.FamilyID
	placement.NodeID = nodeID
	if currentPrimaryNodeID == nodeID {
		placement.Kind = "primary"
		placement.LocalPath = input.OriginalPath
	} else if placement.Kind == "" {
		placement.Kind = "replica"
	}
	placement.Status = "ready"
	placement.UpdatedAt = processedAt
	placement.LastVerifiedAt = &processedAt
	if placement.CreatedAt.IsZero() {
		placement.CreatedAt = job.CreatedAt
	}
	s.mediaPlacements[placementKey] = placement
	for id, session := range s.uploadSessions {
		if session.MediaID == job.MediaID {
			session.Status = "ready"
			s.uploadSessions[id] = session
		}
	}
	return job, nil
}

func (s *InMemoryStore) Authorize(familyID, userID string, minRole domain.Role) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	member, err := findMember(s.members[familyID], userID)
	if err != nil {
		return ErrForbidden
	}
	if roleRank(member.Role) < roleRank(minRole) {
		return ErrForbidden
	}
	return nil
}

func (s *InMemoryStore) issueSessionLocked(user domain.User) AuthResult {
	token := newSessionToken()
	expiresAt := time.Now().UTC().Add(30 * 24 * time.Hour)
	s.sessions[token] = authSession{UserID: user.ID, ExpiresAt: expiresAt}
	return AuthResult{User: user, Token: token, ExpiresAt: expiresAt}
}

func (s *InMemoryStore) buildAlbumWorkspaceLocked(familyID, userID string) (AlbumWorkspace, error) {
	family, ok := s.families[familyID]
	if !ok {
		return AlbumWorkspace{}, ErrNotFound
	}
	user, ok := s.users[userID]
	if !ok {
		return AlbumWorkspace{}, ErrNotFound
	}
	member, err := findMember(s.members[familyID], userID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	members := append([]domain.FamilyMember(nil), s.members[familyID]...)
	sort.Slice(members, func(i, j int) bool { return members[i].DisplayName < members[j].DisplayName })
	timeline := cloneTimelineEntries(s.timelineEntries[familyID])
	sortTimelineEntries(timeline)
	babies := append([]domain.BabyProfile(nil), s.babies[familyID]...)
	sortBabies(babies)
	var node *domain.StorageNode
	if currentNode, err := s.findAlbumNodeLocked(familyID); err == nil {
		copyNode := currentNode
		node = &copyNode
	}
	invites := []domain.AlbumInvite{}
	if roleRank(member.Role) >= roleRank(domain.RoleAdmin) {
		for _, invite := range s.invites {
			if invite.FamilyID == familyID {
				invites = append(invites, s.hydrateInviteLocked(invite))
			}
		}
		sortInvites(invites)
	}
	return normalizeAlbumWorkspace(AlbumWorkspace{Album: family, Baby: primaryBaby(babies), CurrentUser: user, Membership: member, StorageNode: node, Timeline: timeline, Members: members, Babies: babies, Invites: invites}), nil
}

func (s *InMemoryStore) albumSummariesLocked(userID string) []AlbumSummary {
	var items []AlbumSummary
	for familyID, members := range s.members {
		member, err := findMember(members, userID)
		if err != nil {
			continue
		}
		family, ok := s.families[familyID]
		if !ok {
			continue
		}
		items = append(items, AlbumSummary{Album: family, Baby: primaryBaby(s.babies[familyID]), Membership: member})
	}
	sortAlbums(items)
	return items
}

func (s *InMemoryStore) userBelongsToAlbumLocked(userID, familyID string) bool {
	_, err := findMember(s.members[familyID], userID)
	return err == nil
}

func (s *InMemoryStore) hydrateInviteLocked(invite domain.FamilyInvite) domain.FamilyInvite {
	if family, ok := s.families[invite.FamilyID]; ok {
		invite.FamilyName = family.Name
	}
	if user, ok := s.users[invite.CreatedBy]; ok {
		invite.CreatedByName = user.DisplayName
	}
	return invite
}

func (s *InMemoryStore) findAlbumNodeLocked(familyID string) (domain.StorageNode, error) {
	for _, binding := range s.storageBindings {
		if binding.FamilyID == familyID && binding.Mode == "primary" && binding.Status == "active" {
			node, ok := s.storageNodes[binding.NodeID]
			if !ok {
				continue
			}
			node.FamilyID = familyID
			return node, nil
		}
	}
	return domain.StorageNode{}, ErrNotFound
}

func (s *InMemoryStore) bindNodeToFamilyLocked(familyID, nodeID, createdBy string, now time.Time) {
	currentPrimaryNodeID := s.primaryNodeIDForFamilyLocked(familyID)
	for key, binding := range s.storageBindings {
		if binding.FamilyID == familyID && binding.Mode == "primary" && binding.Status == "active" && binding.NodeID != nodeID {
			binding.Status = "draining"
			binding.UpdatedAt = now
			s.storageBindings[key] = binding
			for sessionID, session := range s.uploadSessions {
				if session.FamilyID == familyID && session.AssignedTo == binding.NodeID && session.Status == "created" {
					session.AssignedTo = nodeID
					s.uploadSessions[sessionID] = session
				}
			}
			for jobID, job := range s.jobs {
				if job.FamilyID == familyID && job.NodeID == binding.NodeID && job.Status == domain.JobPending {
					job.NodeID = nodeID
					job.UpdatedAt = now
					s.jobs[jobID] = job
				}
			}
		}
	}

	key := storageBindingKey(familyID, nodeID)
	binding, ok := s.storageBindings[key]
	if !ok {
		binding = storageBinding{
			FamilyID:  familyID,
			NodeID:    nodeID,
			Mode:      "primary",
			Status:    "active",
			CreatedBy: createdBy,
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		binding.Mode = "primary"
		binding.Status = "active"
		binding.UpdatedAt = now
		if binding.CreatedBy == "" {
			binding.CreatedBy = createdBy
		}
		if binding.CreatedAt.IsZero() {
			binding.CreatedAt = now
		}
	}
	s.storageBindings[key] = binding

	if currentPrimaryNodeID != "" && currentPrimaryNodeID != nodeID {
		for placementKey, placement := range s.mediaPlacements {
			if placement.FamilyID == familyID && placement.NodeID == currentPrimaryNodeID && placement.Kind == "primary" {
				placement.Kind = "replica"
				placement.UpdatedAt = now
				s.mediaPlacements[placementKey] = placement
			}
		}
	}

	for _, asset := range s.media[familyID] {
		if asset.OriginalBlobKey == "" {
			continue
		}
		targetKey := mediaPlacementKey(asset.ID, nodeID)
		if placement, ok := s.mediaPlacements[targetKey]; ok {
			needsRehydrate := asset.Status == domain.MediaReady && placement.Status != "ready"
			if placement.Kind != "primary" || needsRehydrate {
				placement.Kind = "primary"
				if needsRehydrate {
					placement.Status = "pending"
				}
				placement.UpdatedAt = now
				s.mediaPlacements[targetKey] = placement
			}
			if needsRehydrate && !s.hasPendingJobForMediaOnNodeLocked(asset.ID, nodeID) {
				jobID := newID("job")
				s.jobs[jobID] = domain.AgentJob{
					ID:        jobID,
					NodeID:    nodeID,
					FamilyID:  familyID,
					MediaID:   asset.ID,
					Type:      "rehydrate_media",
					Status:    domain.JobPending,
					CreatedAt: now,
					UpdatedAt: now,
					FileName:  asset.FileName,
					MediaType: asset.MediaType,
					BlobKey:   asset.OriginalBlobKey,
				}
			}
			continue
		}
		status := "pending"
		if asset.Status != domain.MediaReady {
			continue
		}
		s.mediaPlacements[targetKey] = mediaPlacement{
			MediaID:   asset.ID,
			FamilyID:  familyID,
			NodeID:    nodeID,
			Kind:      "primary",
			Status:    status,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if !s.hasPendingJobForMediaOnNodeLocked(asset.ID, nodeID) {
			jobID := newID("job")
			s.jobs[jobID] = domain.AgentJob{
				ID:        jobID,
				NodeID:    nodeID,
				FamilyID:  familyID,
				MediaID:   asset.ID,
				Type:      "rehydrate_media",
				Status:    domain.JobPending,
				CreatedAt: now,
				UpdatedAt: now,
				FileName:  asset.FileName,
				MediaType: asset.MediaType,
				BlobKey:   asset.OriginalBlobKey,
			}
		}
	}
}

func (s *InMemoryStore) primaryNodeIDForFamilyLocked(familyID string) string {
	for _, binding := range s.storageBindings {
		if binding.FamilyID == familyID && binding.Mode == "primary" && binding.Status == "active" {
			return binding.NodeID
		}
	}
	return ""
}

func (s *InMemoryStore) hasPendingJobForMediaOnNodeLocked(mediaID, nodeID string) bool {
	for _, job := range s.jobs {
		if job.MediaID == mediaID && job.NodeID == nodeID && job.Status == domain.JobPending {
			return true
		}
	}
	return false
}

func (s *InMemoryStore) timelineEntryExistsLocked(albumID, entryID string) bool {
	for _, entry := range s.timelineEntries[albumID] {
		if entry.ID == entryID {
			return true
		}
	}
	return false
}

func (s *InMemoryStore) timelineEntryByIDLocked(albumID, entryID string) (int, domain.TimelineEntry, error) {
	for index, entry := range s.timelineEntries[albumID] {
		if entry.ID == entryID {
			return index, entry, nil
		}
	}
	return -1, domain.TimelineEntry{}, ErrNotFound
}

func (s *InMemoryStore) authorizeTimelineEntryEditLocked(userID string, entry domain.TimelineEntry) error {
	member, err := findMember(s.members[entry.FamilyID], userID)
	if err != nil {
		return err
	}
	if member.Role == domain.RoleOwner || member.Role == domain.RoleAdmin || entry.UploadedBy == userID {
		return nil
	}
	return ErrForbidden
}

func (s *InMemoryStore) attachMediaToTimelineEntryLocked(albumID, entryID string, asset domain.MediaAsset) {
	entries := s.timelineEntries[albumID]
	for i := range entries {
		if entries[i].ID != entryID {
			continue
		}
		entries[i].Items = append(entries[i].Items, asset)
		s.timelineEntries[albumID] = entries
		return
	}
}

func (s *InMemoryStore) removeTimelineMediaLocked(albumID, entryID, mediaID string) {
	entries := s.timelineEntries[albumID]
	for i := range entries {
		if entries[i].ID != entryID {
			continue
		}
		filtered := entries[i].Items[:0]
		for _, item := range entries[i].Items {
			if item.ID != mediaID {
				filtered = append(filtered, item)
			}
		}
		entries[i].Items = filtered
		s.timelineEntries[albumID] = entries
		return
	}
}

func (s *InMemoryStore) replaceTimelineMediaLocked(albumID string, asset domain.MediaAsset) {
	entries := s.timelineEntries[albumID]
	for i := range entries {
		if entries[i].ID != asset.EntryID {
			continue
		}
		for itemIndex := range entries[i].Items {
			if entries[i].Items[itemIndex].ID == asset.ID {
				entries[i].Items[itemIndex] = asset
				s.timelineEntries[albumID] = entries
				return
			}
		}
	}
}

func cloneTimelineEntries(items []domain.TimelineEntry) []domain.TimelineEntry {
	cloned := make([]domain.TimelineEntry, len(items))
	for i, entry := range items {
		entry.Items = append([]domain.MediaAsset(nil), entry.Items...)
		cloned[i] = entry
	}
	return cloned
}

func findMember(members []domain.FamilyMember, userID string) (domain.FamilyMember, error) {
	for _, member := range members {
		if member.UserID == userID {
			return member, nil
		}
	}
	return domain.FamilyMember{}, ErrForbidden
}

func timePointer(value time.Time) *time.Time {
	copyValue := value.UTC()
	return &copyValue
}

func stringsTrim(value string) string {
	return strings.TrimSpace(value)
}

func fallbackNodeName(name, nodeID string) string {
	if trimmed := stringsTrim(name); trimmed != "" {
		return trimmed
	}
	return "NAS " + nodeID
}

func primaryBaby(items []domain.BabyProfile) *domain.BabyProfile {
	if len(items) == 0 {
		return nil
	}
	baby := items[0]
	return &baby
}
