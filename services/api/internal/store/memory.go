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

type InMemoryStore struct {
	mu             sync.RWMutex
	users          map[string]domain.User
	credentials    map[string]struct{ Salt, Hash string }
	sessions       map[string]authSession
	families       map[string]domain.Family
	members        map[string][]domain.FamilyMember
	storageNodes   map[string]domain.StorageNode
	media          map[string][]domain.MediaAsset
	babies         map[string][]domain.BabyProfile
	invites        map[string]domain.FamilyInvite
	uploadSessions map[string]domain.UploadSession
	jobs           map[string]domain.AgentJob
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
		{UserID: "user-owner", FamilyID: family.ID, Role: domain.RoleOwner, DisplayName: "Ramon"},
		{UserID: "user-admin", FamilyID: family.ID, Role: domain.RoleAdmin, DisplayName: "Grandma"},
		{UserID: "user-member", FamilyID: family.ID, Role: domain.RoleMember, DisplayName: "Dad"},
		{UserID: "user-viewer", FamilyID: family.ID, Role: domain.RoleViewer, DisplayName: "Auntie"},
	}
	node := domain.StorageNode{ID: "node-demo", FamilyID: family.ID, Name: "Living Room NAS", Status: domain.NodeOnline, RegistrationToken: "demo-registration-token", LastSeenAt: now.Add(-10 * time.Second)}
	media := []domain.MediaAsset{
		newSeedMedia("media-001", family.ID, "2025-11-02-first-smile.heic", "image/heic", now.AddDate(0, -4, -13), "camera_roll"),
		newSeedMedia("media-002", family.ID, "2026-01-16-weekend-video.mov", "video/quicktime", now.AddDate(0, -2, -9), "camera_roll"),
		newSeedMedia("media-003", family.ID, "2026-03-20-park.jpg", "image/jpeg", now.AddDate(0, 0, -5), "manual_upload"),
	}
	babies := []domain.BabyProfile{{ID: "baby-demo", FamilyID: family.ID, Name: "Little Qin", BirthDate: timePointer(now.AddDate(-1, -3, 0)), CreatedAt: now.Add(-20 * time.Hour)}}
	return &InMemoryStore{
		users:          users,
		credentials:    credentials,
		sessions:       make(map[string]authSession),
		families:       map[string]domain.Family{family.ID: family},
		members:        map[string][]domain.FamilyMember{family.ID: members},
		storageNodes:   map[string]domain.StorageNode{node.ID: node},
		media:          map[string][]domain.MediaAsset{family.ID: media},
		babies:         map[string][]domain.BabyProfile{family.ID: babies},
		invites:        make(map[string]domain.FamilyInvite),
		uploadSessions: make(map[string]domain.UploadSession),
		jobs:           make(map[string]domain.AgentJob),
	}
}

func newSeedMedia(id, familyID, fileName, mediaType string, capturedAt time.Time, source string) domain.MediaAsset {
	capturedAt = capturedAt.UTC()
	processedAt := capturedAt.Add(5 * time.Minute)
	return domain.MediaAsset{ID: id, FamilyID: familyID, FileName: fileName, MediaType: mediaType, CapturedAt: capturedAt, UploadedAt: capturedAt.Add(3 * time.Minute), TimelineDay: capturedAt.Format("2006-01-02"), Status: domain.MediaReady, Source: source, PreviewStatus: domain.PreviewUnavailable, ProcessedAt: &processedAt}
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

func (s *InMemoryStore) AppState(userID, familyID string) (AppState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok {
		return AppState{}, ErrNotFound
	}
	families := s.familySummariesLocked(userID)
	state := AppState{CurrentUser: user, Families: families}
	if len(families) == 0 {
		return normalizeAppState(state), nil
	}
	selectedFamilyID := familyID
	if selectedFamilyID == "" || !s.userBelongsToFamilyLocked(userID, selectedFamilyID) {
		selectedFamilyID = families[0].Family.ID
	}
	bootstrap, err := s.buildBootstrapLocked(selectedFamilyID, userID)
	if err != nil {
		return AppState{}, err
	}
	state.ActiveFamily = &bootstrap
	state.ActiveFamilyID = selectedFamilyID
	return normalizeAppState(state), nil
}

func (s *InMemoryStore) Bootstrap(familyID, userID string) (Bootstrap, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.buildBootstrapLocked(familyID, userID)
}

func (s *InMemoryStore) Timeline(familyID, userID string) ([]domain.MediaAsset, error) {
	if err := s.Authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	timeline := append([]domain.MediaAsset(nil), s.media[familyID]...)
	sortMedia(timeline)
	return timeline, nil
}

func (s *InMemoryStore) Members(familyID, userID string) ([]domain.FamilyMember, error) {
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

func (s *InMemoryStore) CreateFamily(userID string, input CreateFamilyInput) (domain.Family, error) {
	name := stringsTrim(input.Name)
	timezone := stringsTrim(input.Timezone)
	if name == "" {
		return domain.Family{}, fmt.Errorf("family name is required")
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
	s.members[family.ID] = []domain.FamilyMember{{UserID: user.ID, FamilyID: family.ID, Role: domain.RoleOwner, DisplayName: user.DisplayName}}
	s.media[family.ID] = []domain.MediaAsset{}
	s.babies[family.ID] = []domain.BabyProfile{}
	return family, nil
}

func (s *InMemoryStore) CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error) {
	if err := s.Authorize(input.FamilyID, userID, domain.RoleMember); err != nil {
		return domain.BabyProfile{}, err
	}
	name := stringsTrim(input.Name)
	if name == "" {
		return domain.BabyProfile{}, fmt.Errorf("baby name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	baby := domain.BabyProfile{ID: newID("baby"), FamilyID: input.FamilyID, Name: name, CreatedAt: time.Now().UTC()}
	if input.BirthDate != nil {
		birthDate := input.BirthDate.UTC()
		baby.BirthDate = &birthDate
	}
	s.babies[input.FamilyID] = append(s.babies[input.FamilyID], baby)
	sortBabies(s.babies[input.FamilyID])
	return baby, nil
}

func (s *InMemoryStore) UpdateMemberRole(userID string, input UpdateMemberRoleInput) (domain.FamilyMember, error) {
	if !validRole(input.Role) || input.Role == domain.RoleOwner {
		return domain.FamilyMember{}, ErrForbidden
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	actor, err := findMember(s.members[input.FamilyID], userID)
	if err != nil {
		return domain.FamilyMember{}, err
	}
	if actor.Role != domain.RoleOwner || input.MemberUserID == userID {
		return domain.FamilyMember{}, ErrForbidden
	}
	members := s.members[input.FamilyID]
	for i := range members {
		if members[i].UserID == input.MemberUserID {
			if members[i].Role == domain.RoleOwner {
				return domain.FamilyMember{}, ErrForbidden
			}
			members[i].Role = input.Role
			s.members[input.FamilyID] = members
			return members[i], nil
		}
	}
	return domain.FamilyMember{}, ErrNotFound
}

func (s *InMemoryStore) CreateInvite(userID string, input CreateInviteInput) (domain.FamilyInvite, error) {
	if !validRole(input.Role) || input.Role == domain.RoleOwner {
		return domain.FamilyInvite{}, ErrForbidden
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	actor, err := findMember(s.members[input.FamilyID], userID)
	if err != nil {
		return domain.FamilyInvite{}, err
	}
	if actor.Role != domain.RoleOwner && actor.Role != domain.RoleAdmin {
		return domain.FamilyInvite{}, ErrForbidden
	}
	if actor.Role == domain.RoleAdmin && input.Role == domain.RoleAdmin {
		return domain.FamilyInvite{}, ErrForbidden
	}
	invite := domain.FamilyInvite{ID: newID("invite"), FamilyID: input.FamilyID, Code: newInviteCode(), Role: input.Role, Status: domain.InvitePending, CreatedBy: userID, CreatedAt: time.Now().UTC()}
	s.invites[invite.Code] = s.hydrateInviteLocked(invite)
	return s.invites[invite.Code], nil
}

func (s *InMemoryStore) Invites(familyID, userID string) ([]domain.FamilyInvite, error) {
	if err := s.Authorize(familyID, userID, domain.RoleAdmin); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	var items []domain.FamilyInvite
	for _, invite := range s.invites {
		if invite.FamilyID == familyID {
			items = append(items, s.hydrateInviteLocked(invite))
		}
	}
	sortInvites(items)
	return items, nil
}

func (s *InMemoryStore) InviteByCode(code string) (domain.FamilyInvite, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	invite, ok := s.invites[code]
	if !ok {
		return domain.FamilyInvite{}, ErrNotFound
	}
	return s.hydrateInviteLocked(invite), nil
}

func (s *InMemoryStore) AcceptInvite(userID, code string) (domain.FamilyInvite, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	invite, ok := s.invites[code]
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
	if s.userBelongsToFamilyLocked(userID, invite.FamilyID) {
		return domain.FamilyInvite{}, ErrConflict
	}
	s.members[invite.FamilyID] = append(s.members[invite.FamilyID], domain.FamilyMember{UserID: user.ID, FamilyID: invite.FamilyID, Role: invite.Role, DisplayName: user.DisplayName})
	acceptedAt := time.Now().UTC()
	invite.Status = domain.InviteAccepted
	invite.AcceptedAt = &acceptedAt
	invite.AcceptedBy = user.ID
	s.invites[code] = s.hydrateInviteLocked(invite)
	return s.invites[code], nil
}

func (s *InMemoryStore) CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error) {
	if err := s.Authorize(input.FamilyID, userID, domain.RoleMember); err != nil {
		return domain.UploadSession{}, err
	}
	if input.FileName == "" || input.MediaType == "" {
		return domain.UploadSession{}, fmt.Errorf("fileName and mediaType are required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	node, err := s.findFamilyNodeLocked(input.FamilyID)
	if err != nil {
		return domain.UploadSession{}, err
	}
	now := time.Now().UTC()
	mediaID := newID("media")
	capturedAt := NormalizeCapturedAt(input.CapturedAt, nil, now)
	asset := domain.MediaAsset{ID: mediaID, FamilyID: input.FamilyID, FileName: input.FileName, MediaType: input.MediaType, CapturedAt: capturedAt, UploadedAt: now, TimelineDay: capturedAt.Format("2006-01-02"), Status: domain.MediaPending, Source: "manual_upload", PreviewStatus: domain.PreviewPending}
	s.media[input.FamilyID] = append(s.media[input.FamilyID], asset)
	sortMedia(s.media[input.FamilyID])
	session := domain.UploadSession{ID: newID("upload"), FamilyID: input.FamilyID, MediaID: mediaID, FileName: input.FileName, MediaType: input.MediaType, Status: "created", CreatedAt: now, AssignedTo: node.ID, ByteSize: 0, BlobKey: ""}
	s.uploadSessions[session.ID] = session
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
	job := domain.AgentJob{ID: newID("job"), NodeID: session.AssignedTo, FamilyID: session.FamilyID, MediaID: session.MediaID, Type: "ingest_media", Status: domain.JobPending, CreatedAt: now, UpdatedAt: now, FileName: session.FileName, MediaType: session.MediaType, ByteSize: session.ByteSize, BlobKey: session.BlobKey}
	s.jobs[job.ID] = job
	return session, nil
}

func (s *InMemoryStore) RegisterStorageNode(nodeID, nodeName, token string) (domain.StorageNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	node, ok := s.storageNodes[nodeID]
	if !ok {
		return domain.StorageNode{}, ErrNotFound
	}
	if token != node.RegistrationToken {
		return domain.StorageNode{}, ErrNodeUnauthorized
	}
	node.Name = nodeName
	node.Status = domain.NodeOnline
	node.LastSeenAt = time.Now().UTC()
	s.storageNodes[nodeID] = node
	return node, nil
}

func (s *InMemoryStore) HeartbeatStorageNode(nodeID, token string) (domain.StorageNode, error) {
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
			break
		}
	}
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

func (s *InMemoryStore) buildBootstrapLocked(familyID, userID string) (Bootstrap, error) {
	family, ok := s.families[familyID]
	if !ok {
		return Bootstrap{}, ErrNotFound
	}
	user, ok := s.users[userID]
	if !ok {
		return Bootstrap{}, ErrNotFound
	}
	member, err := findMember(s.members[familyID], userID)
	if err != nil {
		return Bootstrap{}, err
	}
	members := append([]domain.FamilyMember(nil), s.members[familyID]...)
	sort.Slice(members, func(i, j int) bool { return members[i].DisplayName < members[j].DisplayName })
	timeline := append([]domain.MediaAsset(nil), s.media[familyID]...)
	sortMedia(timeline)
	babies := append([]domain.BabyProfile(nil), s.babies[familyID]...)
	sortBabies(babies)
	var node *domain.StorageNode
	for _, candidate := range s.storageNodes {
		if candidate.FamilyID == familyID {
			copyNode := candidate
			node = &copyNode
			break
		}
	}
	invites := []domain.FamilyInvite{}
	if roleRank(member.Role) >= roleRank(domain.RoleAdmin) {
		for _, invite := range s.invites {
			if invite.FamilyID == familyID {
				invites = append(invites, s.hydrateInviteLocked(invite))
			}
		}
		sortInvites(invites)
	}
	return normalizeBootstrap(Bootstrap{Family: family, CurrentUser: user, Membership: member, StorageNode: node, Timeline: timeline, Members: members, Babies: babies, Invites: invites}), nil
}

func (s *InMemoryStore) familySummariesLocked(userID string) []FamilySummary {
	var items []FamilySummary
	for familyID, members := range s.members {
		member, err := findMember(members, userID)
		if err != nil {
			continue
		}
		family, ok := s.families[familyID]
		if !ok {
			continue
		}
		items = append(items, FamilySummary{Family: family, Membership: member})
	}
	sortFamilies(items)
	return items
}

func (s *InMemoryStore) userBelongsToFamilyLocked(userID, familyID string) bool {
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

func (s *InMemoryStore) findFamilyNodeLocked(familyID string) (domain.StorageNode, error) {
	for _, node := range s.storageNodes {
		if node.FamilyID == familyID {
			return node, nil
		}
	}
	return domain.StorageNode{}, ErrNotFound
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
