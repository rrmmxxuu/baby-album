package store

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"babyalbum/api/internal/domain"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(databaseURL string) (*PostgresStore, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	store := &PostgresStore{db: db}
	if err := store.db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := store.seed(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *PostgresStore) Close() error { return s.db.Close() }

func (s *PostgresStore) migrate() error {
	statements := []string{
		`create table if not exists users (id text primary key, display_name text not null, email text not null, created_at timestamptz not null)`,
		`create unique index if not exists idx_users_email on users (lower(email))`,
		`create table if not exists auth_credentials (user_id text primary key references users(id), salt text not null, password_hash text not null)`,
		`create table if not exists auth_sessions (token text primary key, user_id text not null references users(id), created_at timestamptz not null, expires_at timestamptz not null)`,
		`create index if not exists idx_auth_sessions_user on auth_sessions (user_id)`,
		`create table if not exists families (id text primary key, name text not null, timezone text not null)`,
		`create table if not exists family_members (user_id text not null references users(id), family_id text not null references families(id), role text not null, display_name text not null, relation text not null default '', primary key (family_id, user_id))`,
		`create table if not exists babies (id text primary key, family_id text not null references families(id), name text not null, birth_date date, avatar_blob_key text not null default '', avatar_updated_at timestamptz, created_at timestamptz not null)`,
		`alter table babies add column if not exists avatar_blob_key text not null default ''`,
		`alter table babies add column if not exists avatar_updated_at timestamptz`,
		`create table if not exists family_invites (id text primary key, family_id text not null references families(id), code text not null unique, role text not null, status text not null, created_by text not null references users(id), created_at timestamptz not null, accepted_at timestamptz, accepted_by text references users(id))`,
		`create table if not exists storage_nodes (id text primary key, family_id text not null references families(id), name text not null, status text not null, registration_token text not null, last_seen_at timestamptz not null)`,
		`alter table storage_nodes add column if not exists total_bytes bigint not null default 0`,
		`alter table storage_nodes add column if not exists free_bytes bigint not null default 0`,
		`alter table storage_nodes add column if not exists available_bytes bigint not null default 0`,
		`create table if not exists storage_node_pairings (code text primary key, family_id text not null references families(id), created_by text not null references users(id), created_at timestamptz not null, expires_at timestamptz not null, used_at timestamptz)`,
		`create table if not exists timeline_entries (id text primary key, family_id text not null references families(id), caption text not null default '', visibility text not null default 'members', time_mode text not null default 'captured_at', display_at timestamptz not null, timeline_day text not null, uploaded_by text not null default '', uploaded_by_name text not null default '', uploaded_at timestamptz not null, created_at timestamptz not null)`,
		`create table if not exists media_assets (id text primary key, family_id text not null references families(id), entry_id text not null default '', upload_batch_id text not null default '', uploaded_by text not null default '', uploaded_by_name text not null default '', file_name text not null, media_type text not null, captured_at timestamptz not null, uploaded_at timestamptz not null, timeline_day text not null, status text not null, source text not null, width integer not null default 0, height integer not null default 0, preview_status text not null default 'pending', preview_blob_key text not null default '', original_blob_key text not null default '', processed_at timestamptz, original_path text not null default '')`,
		`alter table media_assets add column if not exists entry_id text not null default ''`,
		`alter table media_assets add column if not exists upload_batch_id text not null default ''`,
		`alter table media_assets add column if not exists uploaded_by text not null default ''`,
		`alter table media_assets add column if not exists uploaded_by_name text not null default ''`,
		`alter table media_assets add column if not exists original_blob_key text not null default ''`,
		`update media_assets set upload_batch_id = id where upload_batch_id = ''`,
		`update media_assets set uploaded_by_name = '家人' where uploaded_by_name = ''`,
		`update media_assets set entry_id = upload_batch_id where entry_id = ''`,
		`insert into timeline_entries (id, family_id, caption, visibility, time_mode, display_at, timeline_day, uploaded_by, uploaded_by_name, uploaded_at, created_at) select distinct m.entry_id, m.family_id, '', 'members', 'captured_at', m.captured_at, m.timeline_day, m.uploaded_by, case when m.uploaded_by_name = '' then '家人' else m.uploaded_by_name end, m.uploaded_at, m.uploaded_at from media_assets m where m.entry_id <> '' on conflict (id) do nothing`,
		`create table if not exists upload_sessions (id text primary key, family_id text not null references families(id), entry_id text not null default '', upload_batch_id text not null default '', uploaded_by text not null default '', uploaded_by_name text not null default '', media_id text not null references media_assets(id), file_name text not null, media_type text not null, status text not null, created_at timestamptz not null, assigned_to text not null references storage_nodes(id), byte_size bigint not null default 0, blob_key text not null default '')`,
		`alter table upload_sessions add column if not exists entry_id text not null default ''`,
		`alter table upload_sessions add column if not exists upload_batch_id text not null default ''`,
		`alter table upload_sessions add column if not exists uploaded_by text not null default ''`,
		`alter table upload_sessions add column if not exists uploaded_by_name text not null default ''`,
		`update upload_sessions set upload_batch_id = id where upload_batch_id = ''`,
		`update upload_sessions set uploaded_by_name = '家人' where uploaded_by_name = ''`,
		`update upload_sessions set entry_id = upload_batch_id where entry_id = ''`,
		`create table if not exists agent_jobs (id text primary key, node_id text not null references storage_nodes(id), family_id text not null references families(id), media_id text not null references media_assets(id), type text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
		`create index if not exists idx_family_members_user on family_members (user_id)`,
		`alter table family_members add column if not exists relation text not null default ''`,
		`create index if not exists idx_babies_family on babies (family_id, created_at asc)`,
		`create index if not exists idx_family_invites_family on family_invites (family_id, created_at desc)`,
		`create index if not exists idx_timeline_entries_family_display on timeline_entries (family_id, display_at desc, uploaded_at desc)`,
		`create index if not exists idx_media_assets_family_captured on media_assets (family_id, captured_at desc)`,
		`create index if not exists idx_media_assets_entry on media_assets (entry_id, captured_at asc)`,
		`create index if not exists idx_agent_jobs_node_status_created on agent_jobs (node_id, status, created_at asc)`,
	}
	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) seed() error {
	var familyCount int
	if err := s.db.QueryRow(`select count(*) from families`).Scan(&familyCount); err != nil {
		return err
	}
	if familyCount > 0 {
		return nil
	}

	now := time.Now().UTC()
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	users := []domain.User{
		{ID: "user-owner", DisplayName: "Ramon", Email: "owner@example.com", CreatedAt: now.Add(-24 * time.Hour)},
		{ID: "user-admin", DisplayName: "Grandma", Email: "admin@example.com", CreatedAt: now.Add(-23 * time.Hour)},
		{ID: "user-member", DisplayName: "Dad", Email: "member@example.com", CreatedAt: now.Add(-22 * time.Hour)},
		{ID: "user-viewer", DisplayName: "Auntie", Email: "viewer@example.com", CreatedAt: now.Add(-21 * time.Hour)},
	}
	for _, user := range users {
		if _, err := tx.Exec(`insert into users (id, display_name, email, created_at) values ($1, $2, $3, $4)`, user.ID, user.DisplayName, user.Email, user.CreatedAt); err != nil {
			return err
		}
		salt, hash, err := passwordSaltAndHash("demo12345")
		if err != nil {
			return err
		}
		if _, err := tx.Exec(`insert into auth_credentials (user_id, salt, password_hash) values ($1, $2, $3)`, user.ID, salt, hash); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`insert into families (id, name, timezone) values ($1, $2, $3)`, "family-demo", "Ramon Family", "Asia/Shanghai"); err != nil {
		return err
	}
	members := []domain.FamilyMember{
		{UserID: "user-owner", FamilyID: "family-demo", Role: domain.RoleOwner, DisplayName: "Ramon", Relation: "爸爸"},
		{UserID: "user-admin", FamilyID: "family-demo", Role: domain.RoleAdmin, DisplayName: "Grandma", Relation: "奶奶"},
		{UserID: "user-member", FamilyID: "family-demo", Role: domain.RoleMember, DisplayName: "Dad", Relation: "妈妈"},
		{UserID: "user-viewer", FamilyID: "family-demo", Role: domain.RoleViewer, DisplayName: "Auntie", Relation: "阿姨"},
	}
	for _, member := range members {
		if _, err := tx.Exec(`insert into family_members (user_id, family_id, role, display_name, relation) values ($1, $2, $3, $4, $5)`, member.UserID, member.FamilyID, member.Role, member.DisplayName, member.Relation); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`insert into babies (id, family_id, name, birth_date, avatar_blob_key, avatar_updated_at, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, "baby-demo", "family-demo", "Little Qin", now.AddDate(-1, -3, 0), "", nil, now.Add(-20*time.Hour)); err != nil {
		return err
	}
	if _, err := tx.Exec(`insert into storage_nodes (id, family_id, name, status, registration_token, last_seen_at, total_bytes, free_bytes, available_bytes) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, "node-demo", "family-demo", "Living Room NAS", domain.NodeOnline, "demo-registration-token", now.Add(-10*time.Second), int64(2<<40), int64(1500<<30), int64(1450<<30)); err != nil {
		return err
	}
	seedMedia := []domain.MediaAsset{
		newSeedMedia("media-001", "family-demo", "2025-11-02-first-smile.heic", "image/heic", now.AddDate(0, -4, -13), "camera_roll"),
		newSeedMedia("media-002", "family-demo", "2026-01-16-weekend-video.mov", "video/quicktime", now.AddDate(0, -2, -9), "camera_roll"),
		newSeedMedia("media-003", "family-demo", "2026-03-20-park.jpg", "image/jpeg", now.AddDate(0, 0, -5), "manual_upload"),
	}
	for _, entry := range seedTimelineEntries(seedMedia) {
		if _, err := tx.Exec(`insert into timeline_entries (id, family_id, caption, visibility, time_mode, display_at, timeline_day, uploaded_by, uploaded_by_name, uploaded_at, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, entry.ID, entry.FamilyID, entry.Caption, entry.Visibility, entry.TimeMode, entry.DisplayAt, entry.TimelineDay, entry.UploadedBy, entry.UploadedByName, entry.UploadedAt, entry.CreatedAt); err != nil {
			return err
		}
	}
	for _, item := range seedMedia {
		if _, err := tx.Exec(`insert into media_assets (id, family_id, entry_id, upload_batch_id, uploaded_by, uploaded_by_name, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, width, height, preview_status, preview_blob_key, original_blob_key, processed_at, original_path) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, item.ID, item.FamilyID, item.EntryID, item.UploadBatchID, item.UploadedBy, item.UploadedByName, item.FileName, item.MediaType, item.CapturedAt, item.UploadedAt, item.TimelineDay, item.Status, item.Source, item.Width, item.Height, item.PreviewStatus, item.PreviewBlobKey, item.OriginalBlobKey, item.ProcessedAt, item.OriginalPath); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *PostgresStore) RegisterUser(input RegisterUserInput) (AuthResult, error) {
	displayName := strings.TrimSpace(input.DisplayName)
	email := canonicalEmail(input.Email)
	if displayName == "" || email == "" {
		return AuthResult{}, fmt.Errorf("displayName and email are required")
	}
	salt, hash, err := passwordSaltAndHash(input.Password)
	if err != nil {
		return AuthResult{}, err
	}
	user := domain.User{ID: newID("user"), DisplayName: displayName, Email: email, CreatedAt: time.Now().UTC()}
	tx, err := s.db.Begin()
	if err != nil {
		return AuthResult{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`insert into users (id, display_name, email, created_at) values ($1, $2, $3, $4)`, user.ID, user.DisplayName, user.Email, user.CreatedAt); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return AuthResult{}, ErrConflict
		}
		return AuthResult{}, err
	}
	if _, err := tx.Exec(`insert into auth_credentials (user_id, salt, password_hash) values ($1, $2, $3)`, user.ID, salt, hash); err != nil {
		return AuthResult{}, err
	}
	result, err := s.issueSessionTx(tx, user)
	if err != nil {
		return AuthResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return AuthResult{}, err
	}
	return result, nil
}

func (s *PostgresStore) Login(input LoginInput) (AuthResult, error) {
	email := canonicalEmail(input.Email)
	var user domain.User
	var salt string
	var passwordHash string
	err := s.db.QueryRow(`select u.id, u.display_name, u.email, u.created_at, c.salt, c.password_hash from users u join auth_credentials c on c.user_id = u.id where lower(u.email) = $1`, email).Scan(&user.ID, &user.DisplayName, &user.Email, &user.CreatedAt, &salt, &passwordHash)
	if err == sql.ErrNoRows {
		return AuthResult{}, ErrUnauthorized
	}
	if err != nil {
		return AuthResult{}, err
	}
	if !verifyPassword(input.Password, salt, passwordHash) {
		return AuthResult{}, ErrUnauthorized
	}
	tx, err := s.db.Begin()
	if err != nil {
		return AuthResult{}, err
	}
	defer tx.Rollback()
	result, err := s.issueSessionTx(tx, user)
	if err != nil {
		return AuthResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return AuthResult{}, err
	}
	return result, nil
}

func (s *PostgresStore) SessionUser(token string) (domain.User, error) {
	var user domain.User
	var expiresAt time.Time
	err := s.db.QueryRow(`select u.id, u.display_name, u.email, u.created_at, s.expires_at from auth_sessions s join users u on u.id = s.user_id where s.token = $1`, token).Scan(&user.ID, &user.DisplayName, &user.Email, &user.CreatedAt, &expiresAt)
	if err == sql.ErrNoRows {
		return domain.User{}, ErrUnauthorized
	}
	if err != nil {
		return domain.User{}, err
	}
	if expiresAt.Before(time.Now().UTC()) {
		_, _ = s.db.Exec(`delete from auth_sessions where token = $1`, token)
		return domain.User{}, ErrUnauthorized
	}
	return user, nil
}

func (s *PostgresStore) RevokeSession(token string) error {
	_, err := s.db.Exec(`delete from auth_sessions where token = $1`, token)
	return err
}

func (s *PostgresStore) AppState(userID, albumID string) (AppState, error) {
	user, err := s.userByID(userID)
	if err != nil {
		return AppState{}, err
	}
	albums, err := s.albumsForUser(userID)
	if err != nil {
		return AppState{}, err
	}
	state := AppState{CurrentUser: user, Albums: albums}
	if len(albums) == 0 {
		return normalizeAppState(state), nil
	}
	selectedAlbumID := albumID
	if selectedAlbumID == "" || !albumSummaryContains(albums, selectedAlbumID) {
		selectedAlbumID = albums[0].Album.ID
	}
	workspace, err := s.AlbumWorkspace(selectedAlbumID, userID)
	if err != nil {
		return AppState{}, err
	}
	state.ActiveAlbum = &workspace
	state.ActiveAlbumID = selectedAlbumID
	return normalizeAppState(state), nil
}

func (s *PostgresStore) AlbumWorkspace(familyID, userID string) (AlbumWorkspace, error) {
	membership, err := s.memberForUser(familyID, userID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	family, err := s.familyByID(familyID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	user, err := s.userByID(userID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	node, err := s.albumNodeMaybe(familyID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	timeline, err := s.Timeline(familyID, userID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	members, err := s.Members(familyID, userID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	babies, err := s.babiesForFamily(familyID, userID)
	if err != nil {
		return AlbumWorkspace{}, err
	}
	invites := []domain.AlbumInvite{}
	if roleRank(membership.Role) >= roleRank(domain.RoleAdmin) {
		invites, err = s.Invites(familyID, userID)
		if err != nil {
			return AlbumWorkspace{}, err
		}
	}
	return normalizeAlbumWorkspace(AlbumWorkspace{Album: family, Baby: primaryBaby(babies), CurrentUser: user, Membership: membership, StorageNode: node, Timeline: timeline, Members: members, Babies: babies, Invites: invites}), nil
}

func (s *PostgresStore) Timeline(familyID, userID string) ([]domain.TimelineEntry, error) {
	if err := s.authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	entryRows, err := s.db.Query(`select id, family_id, caption, visibility, time_mode, display_at, timeline_day, uploaded_by, uploaded_by_name, uploaded_at, created_at from timeline_entries where family_id = $1 order by display_at desc, uploaded_at desc, id desc`, familyID)
	if err != nil {
		return nil, err
	}
	defer entryRows.Close()
	entryIndexes := make(map[string]int)
	var items []domain.TimelineEntry
	for entryRows.Next() {
		entry, err := scanTimelineEntry(entryRows)
		if err != nil {
			return nil, err
		}
		entry.Items = []domain.MediaAsset{}
		items = append(items, entry)
		entryIndexes[entry.ID] = len(items) - 1
	}
	if err := entryRows.Err(); err != nil {
		return nil, err
	}
	mediaRows, err := s.db.Query(`select id, family_id, entry_id, upload_batch_id, uploaded_by, uploaded_by_name, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, width, height, preview_status, preview_blob_key, original_blob_key, processed_at, original_path from media_assets where family_id = $1 order by captured_at asc, uploaded_at asc, id asc`, familyID)
	if err != nil {
		return nil, err
	}
	defer mediaRows.Close()
	for mediaRows.Next() {
		item, err := scanMediaAsset(mediaRows)
		if err != nil {
			return nil, err
		}
		index, ok := entryIndexes[item.EntryID]
		if !ok {
			continue
		}
		items[index].Items = append(items[index].Items, item)
	}
	return items, mediaRows.Err()
}

func (s *PostgresStore) Members(familyID, userID string) ([]domain.AlbumMember, error) {
	if err := s.authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select user_id, family_id, role, display_name, relation from family_members where family_id = $1 order by display_name asc`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.AlbumMember
	for rows.Next() {
		var item domain.AlbumMember
		var role string
		if err := rows.Scan(&item.UserID, &item.FamilyID, &role, &item.DisplayName, &item.Relation); err != nil {
			return nil, err
		}
		item.Role = domain.Role(role)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) MediaByID(familyID, userID, mediaID string) (domain.MediaAsset, error) {
	if err := s.authorize(familyID, userID, domain.RoleViewer); err != nil {
		return domain.MediaAsset{}, err
	}
	row := s.db.QueryRow(`select id, family_id, entry_id, upload_batch_id, uploaded_by, uploaded_by_name, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, width, height, preview_status, preview_blob_key, original_blob_key, processed_at, original_path from media_assets where family_id = $1 and id = $2`, familyID, mediaID)
	item, err := scanMediaAsset(row)
	if err == sql.ErrNoRows {
		return domain.MediaAsset{}, ErrNotFound
	}
	if err != nil {
		return domain.MediaAsset{}, err
	}
	return item, nil
}

func (s *PostgresStore) CreateTimelineEntry(userID string, input CreateTimelineEntryInput) (domain.TimelineEntry, error) {
	if err := s.authorize(input.AlbumID, userID, domain.RoleMember); err != nil {
		return domain.TimelineEntry{}, err
	}
	if !validTimelineVisibility(input.Visibility) || !validTimelineTimeMode(input.TimeMode) {
		return domain.TimelineEntry{}, ErrConflict
	}
	user, err := s.userByID(userID)
	if err != nil {
		return domain.TimelineEntry{}, err
	}
	now := time.Now().UTC()
	entry := domain.TimelineEntry{
		ID:             newID("entry"),
		FamilyID:       input.AlbumID,
		Caption:        strings.TrimSpace(input.Caption),
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
	if _, err := s.db.Exec(`insert into timeline_entries (id, family_id, caption, visibility, time_mode, display_at, timeline_day, uploaded_by, uploaded_by_name, uploaded_at, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, entry.ID, entry.FamilyID, entry.Caption, entry.Visibility, entry.TimeMode, entry.DisplayAt, entry.TimelineDay, entry.UploadedBy, entry.UploadedByName, entry.UploadedAt, entry.CreatedAt); err != nil {
		return domain.TimelineEntry{}, err
	}
	return entry, nil
}

func (s *PostgresStore) UpdateTimelineEntry(userID string, input UpdateTimelineEntryInput) (domain.TimelineEntry, error) {
	if !validTimelineVisibility(input.Visibility) || !validTimelineTimeMode(input.TimeMode) {
		return domain.TimelineEntry{}, ErrConflict
	}
	entry, err := s.timelineEntryByID(input.AlbumID, input.EntryID)
	if err != nil {
		return domain.TimelineEntry{}, err
	}
	if err := s.authorizeTimelineEntryEdit(userID, entry); err != nil {
		return domain.TimelineEntry{}, err
	}
	entry.Caption = strings.TrimSpace(input.Caption)
	entry.Visibility = input.Visibility
	entry.TimeMode = input.TimeMode
	entry.DisplayAt = input.DisplayAt.UTC()
	entry.TimelineDay = input.DisplayAt.UTC().Format("2006-01-02")
	if _, err := s.db.Exec(`update timeline_entries set caption = $1, visibility = $2, time_mode = $3, display_at = $4, timeline_day = $5 where id = $6 and family_id = $7`, entry.Caption, entry.Visibility, entry.TimeMode, entry.DisplayAt, entry.TimelineDay, entry.ID, entry.FamilyID); err != nil {
		return domain.TimelineEntry{}, err
	}
	return entry, nil
}

func (s *PostgresStore) DeleteTimelineEntry(userID, albumID, entryID string) error {
	entry, err := s.timelineEntryByID(albumID, entryID)
	if err != nil {
		return err
	}
	if err := s.authorizeTimelineEntryEdit(userID, entry); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`delete from agent_jobs where family_id = $1 and media_id in (select id from media_assets where family_id = $1 and entry_id = $2)`, albumID, entryID); err != nil {
		return err
	}
	if _, err := tx.Exec(`delete from upload_sessions where family_id = $1 and entry_id = $2`, albumID, entryID); err != nil {
		return err
	}
	if _, err := tx.Exec(`delete from media_assets where family_id = $1 and entry_id = $2`, albumID, entryID); err != nil {
		return err
	}
	if _, err := tx.Exec(`delete from timeline_entries where family_id = $1 and id = $2`, albumID, entryID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *PostgresStore) DeleteTimelineEntryMedia(userID, albumID, entryID, mediaID string) error {
	entry, err := s.timelineEntryByID(albumID, entryID)
	if err != nil {
		return err
	}
	if err := s.authorizeTimelineEntryEdit(userID, entry); err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`delete from agent_jobs where family_id = $1 and media_id = $2`, albumID, mediaID)
	if err != nil {
		return err
	}
	_ = result
	if _, err := tx.Exec(`delete from upload_sessions where family_id = $1 and media_id = $2`, albumID, mediaID); err != nil {
		return err
	}
	deleteResult, err := tx.Exec(`delete from media_assets where family_id = $1 and entry_id = $2 and id = $3`, albumID, entryID, mediaID)
	if err != nil {
		return err
	}
	affected, err := deleteResult.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

func (s *PostgresStore) CreateAlbum(userID string, input CreateAlbumInput) (domain.Album, error) {
	name := strings.TrimSpace(input.Name)
	timezone := strings.TrimSpace(input.Timezone)
	babyName := strings.TrimSpace(input.BabyName)
	relation := strings.TrimSpace(input.Relation)
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
	user, err := s.userByID(userID)
	if err != nil {
		return domain.Family{}, err
	}
	family := domain.Family{ID: newID("family"), Name: name, Timezone: timezone}
	tx, err := s.db.Begin()
	if err != nil {
		return domain.Family{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`insert into families (id, name, timezone) values ($1, $2, $3)`, family.ID, family.Name, family.Timezone); err != nil {
		return domain.Family{}, err
	}
	if _, err := tx.Exec(`insert into family_members (user_id, family_id, role, display_name, relation) values ($1, $2, $3, $4, $5)`, user.ID, family.ID, domain.RoleOwner, user.DisplayName, relation); err != nil {
		return domain.Family{}, err
	}
	baby := domain.BabyProfile{ID: newID("baby"), FamilyID: family.ID, Name: babyName, CreatedAt: time.Now().UTC()}
	if input.BirthDate != nil {
		birthDate := input.BirthDate.UTC()
		baby.BirthDate = &birthDate
	}
	baby.HasAvatar = baby.AvatarKey != ""
	if _, err := tx.Exec(`insert into babies (id, family_id, name, birth_date, avatar_blob_key, avatar_updated_at, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, baby.ID, baby.FamilyID, baby.Name, baby.BirthDate, baby.AvatarKey, baby.AvatarUpdatedAt, baby.CreatedAt); err != nil {
		return domain.Family{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Family{}, err
	}
	return family, nil
}

func (s *PostgresStore) CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error) {
	if err := s.authorize(input.AlbumID, userID, domain.RoleMember); err != nil {
		return domain.BabyProfile{}, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return domain.BabyProfile{}, fmt.Errorf("baby name is required")
	}
	var existingCount int
	if err := s.db.QueryRow(`select count(*) from babies where family_id = $1`, input.AlbumID).Scan(&existingCount); err != nil {
		return domain.BabyProfile{}, err
	}
	if existingCount > 0 {
		return domain.BabyProfile{}, ErrConflict
	}
	baby := domain.BabyProfile{ID: newID("baby"), FamilyID: input.AlbumID, Name: name, CreatedAt: time.Now().UTC()}
	if input.BirthDate != nil {
		birthDate := input.BirthDate.UTC()
		baby.BirthDate = &birthDate
	}
	baby.HasAvatar = baby.AvatarKey != ""
	if _, err := s.db.Exec(`insert into babies (id, family_id, name, birth_date, avatar_blob_key, avatar_updated_at, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, baby.ID, baby.FamilyID, baby.Name, baby.BirthDate, baby.AvatarKey, baby.AvatarUpdatedAt, baby.CreatedAt); err != nil {
		return domain.BabyProfile{}, err
	}
	return baby, nil
}

func (s *PostgresStore) BabyByID(userID, albumID, babyID string) (domain.BabyProfile, error) {
	if err := s.authorize(albumID, userID, domain.RoleViewer); err != nil {
		return domain.BabyProfile{}, err
	}
	return s.babyByID(albumID, babyID)
}

func (s *PostgresStore) UpdateBaby(userID string, input UpdateBabyInput) (domain.BabyProfile, error) {
	if err := s.authorize(input.AlbumID, userID, domain.RoleAdmin); err != nil {
		return domain.BabyProfile{}, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return domain.BabyProfile{}, fmt.Errorf("baby name is required")
	}
	result, err := s.db.Exec(`update babies set name = $1, birth_date = $2 where family_id = $3 and id = $4`, name, input.BirthDate, input.AlbumID, input.BabyID)
	if err != nil {
		return domain.BabyProfile{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return domain.BabyProfile{}, err
	}
	if affected == 0 {
		return domain.BabyProfile{}, ErrNotFound
	}
	return s.babyByID(input.AlbumID, input.BabyID)
}

func (s *PostgresStore) UpdateBabyAvatar(userID string, input UpdateBabyAvatarInput) (domain.BabyProfile, error) {
	if err := s.authorize(input.AlbumID, userID, domain.RoleAdmin); err != nil {
		return domain.BabyProfile{}, err
	}
	now := time.Now().UTC()
	result, err := s.db.Exec(`update babies set avatar_blob_key = $1, avatar_updated_at = $2 where family_id = $3 and id = $4`, strings.TrimSpace(input.AvatarKey), now, input.AlbumID, input.BabyID)
	if err != nil {
		return domain.BabyProfile{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return domain.BabyProfile{}, err
	}
	if affected == 0 {
		return domain.BabyProfile{}, ErrNotFound
	}
	return s.babyByID(input.AlbumID, input.BabyID)
}

func (s *PostgresStore) DeleteBaby(userID, albumID, babyID string) error {
	if err := s.authorize(albumID, userID, domain.RoleAdmin); err != nil {
		return err
	}
	var existingCount int
	if err := s.db.QueryRow(`select count(*) from babies where family_id = $1`, albumID).Scan(&existingCount); err != nil {
		return err
	}
	if existingCount <= 1 {
		return ErrConflict
	}
	result, err := s.db.Exec(`delete from babies where family_id = $1 and id = $2`, albumID, babyID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) LeaveAlbum(userID string, input LeaveAlbumInput) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var actor domain.AlbumMember
	var role string
	err = tx.QueryRow(`select user_id, family_id, role, display_name, relation from family_members where family_id = $1 and user_id = $2 for update`, input.AlbumID, userID).Scan(&actor.UserID, &actor.FamilyID, &role, &actor.DisplayName, &actor.Relation)
	if err == sql.ErrNoRows {
		return ErrForbidden
	}
	if err != nil {
		return err
	}
	actor.Role = domain.Role(role)
	transferOwnerTo := strings.TrimSpace(input.TransferOwnerTo)
	if actor.Role == domain.RoleOwner {
		if transferOwnerTo == "" || transferOwnerTo == userID {
			return fmt.Errorf("owner must transfer ownership before leaving")
		}
		result, err := tx.Exec(`update family_members set role = $1 where family_id = $2 and user_id = $3`, domain.RoleOwner, input.AlbumID, transferOwnerTo)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return ErrNotFound
		}
	} else if transferOwnerTo != "" {
		return ErrForbidden
	}
	result, err := tx.Exec(`delete from family_members where family_id = $1 and user_id = $2`, input.AlbumID, userID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}

func (s *PostgresStore) UpdateMemberRole(userID string, input UpdateAlbumMemberRoleInput) (domain.AlbumMember, error) {
	if !validRole(input.Role) || input.Role == domain.RoleOwner || input.MemberUserID == userID {
		return domain.AlbumMember{}, ErrForbidden
	}
	actor, err := s.memberForUser(input.AlbumID, userID)
	if err != nil {
		return domain.AlbumMember{}, err
	}
	if actor.Role != domain.RoleOwner {
		return domain.AlbumMember{}, ErrForbidden
	}
	member, err := s.memberForUser(input.AlbumID, input.MemberUserID)
	if err != nil {
		return domain.AlbumMember{}, err
	}
	if member.Role == domain.RoleOwner {
		return domain.AlbumMember{}, ErrForbidden
	}
	if _, err := s.db.Exec(`update family_members set role = $1 where family_id = $2 and user_id = $3`, input.Role, input.AlbumID, input.MemberUserID); err != nil {
		return domain.AlbumMember{}, err
	}
	member.Role = input.Role
	return member, nil
}

func (s *PostgresStore) UpdateMemberRelation(userID string, input UpdateAlbumMemberRelationInput) (domain.AlbumMember, error) {
	relation := strings.TrimSpace(input.Relation)
	if relation == "" {
		return domain.AlbumMember{}, fmt.Errorf("relation is required")
	}
	actor, err := s.memberForUser(input.AlbumID, userID)
	if err != nil {
		return domain.AlbumMember{}, err
	}
	if userID != input.MemberUserID && actor.Role != domain.RoleOwner && actor.Role != domain.RoleAdmin {
		return domain.AlbumMember{}, ErrForbidden
	}
	member, err := s.memberForUser(input.AlbumID, input.MemberUserID)
	if err != nil {
		return domain.AlbumMember{}, err
	}
	if _, err := s.db.Exec(`update family_members set relation = $1 where family_id = $2 and user_id = $3`, relation, input.AlbumID, input.MemberUserID); err != nil {
		return domain.AlbumMember{}, err
	}
	member.Relation = relation
	return member, nil
}

func (s *PostgresStore) CreateInvite(userID string, input CreateAlbumInviteInput) (domain.AlbumInvite, error) {
	actor, err := s.memberForUser(input.AlbumID, userID)
	if err != nil {
		return domain.AlbumInvite{}, err
	}
	if actor.Role != domain.RoleOwner && actor.Role != domain.RoleAdmin {
		return domain.AlbumInvite{}, ErrForbidden
	}
	invite := domain.AlbumInvite{ID: newID("invite"), FamilyID: input.AlbumID, Code: newInviteCode(), Role: domain.RoleViewer, Status: domain.InvitePending, CreatedBy: userID, CreatedAt: time.Now().UTC()}
	if _, err := s.db.Exec(`insert into family_invites (id, family_id, code, role, status, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, invite.ID, invite.FamilyID, invite.Code, invite.Role, invite.Status, invite.CreatedBy, invite.CreatedAt); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return domain.AlbumInvite{}, ErrConflict
		}
		return domain.AlbumInvite{}, err
	}
	return s.InviteByCode(invite.Code)
}

func (s *PostgresStore) Invites(albumID, userID string) ([]domain.AlbumInvite, error) {
	if err := s.authorize(albumID, userID, domain.RoleAdmin); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select fi.id, fi.family_id, fi.code, fi.role, fi.status, fi.created_by, u.display_name, f.name, fi.created_at, fi.accepted_at, coalesce(fi.accepted_by, '') from family_invites fi join families f on f.id = fi.family_id join users u on u.id = fi.created_by where fi.family_id = $1 order by fi.created_at desc`, albumID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.AlbumInvite
	for rows.Next() {
		item, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) InviteByCode(code string) (domain.AlbumInvite, error) {
	row := s.db.QueryRow(`select fi.id, fi.family_id, fi.code, fi.role, fi.status, fi.created_by, u.display_name, f.name, fi.created_at, fi.accepted_at, coalesce(fi.accepted_by, '') from family_invites fi join families f on f.id = fi.family_id join users u on u.id = fi.created_by where fi.code = $1`, code)
	item, err := scanInvite(row)
	if err == sql.ErrNoRows {
		return domain.AlbumInvite{}, ErrNotFound
	}
	if err != nil {
		return domain.AlbumInvite{}, err
	}
	return item, nil
}

func (s *PostgresStore) AcceptInvite(userID string, input AcceptInviteInput) (domain.AlbumInvite, error) {
	relation := strings.TrimSpace(input.Relation)
	if relation == "" {
		return domain.AlbumInvite{}, fmt.Errorf("relation is required")
	}
	tx, err := s.db.Begin()
	if err != nil {
		return domain.AlbumInvite{}, err
	}
	defer tx.Rollback()
	var invite domain.AlbumInvite
	var role string
	var status string
	var acceptedAt sql.NullTime
	var acceptedBy sql.NullString
	err = tx.QueryRow(`select id, family_id, code, role, status, created_by, created_at, accepted_at, accepted_by from family_invites where code = $1 for update`, input.Code).Scan(&invite.ID, &invite.FamilyID, &invite.Code, &role, &status, &invite.CreatedBy, &invite.CreatedAt, &acceptedAt, &acceptedBy)
	if err == sql.ErrNoRows {
		return domain.AlbumInvite{}, ErrNotFound
	}
	if err != nil {
		return domain.AlbumInvite{}, err
	}
	invite.Role = domain.Role(role)
	invite.Status = domain.InviteStatus(status)
	if invite.Status != domain.InvitePending {
		return domain.AlbumInvite{}, ErrConflict
	}
	user, err := s.userByID(userID)
	if err != nil {
		return domain.AlbumInvite{}, err
	}
	var memberCount int
	if err := tx.QueryRow(`select count(*) from family_members where family_id = $1 and user_id = $2`, invite.FamilyID, user.ID).Scan(&memberCount); err != nil {
		return domain.AlbumInvite{}, err
	}
	if memberCount > 0 {
		return domain.AlbumInvite{}, ErrConflict
	}
	if _, err := tx.Exec(`insert into family_members (user_id, family_id, role, display_name, relation) values ($1, $2, $3, $4, $5)`, user.ID, invite.FamilyID, invite.Role, user.DisplayName, relation); err != nil {
		return domain.AlbumInvite{}, err
	}
	now := time.Now().UTC()
	if _, err := tx.Exec(`update family_invites set status = $1, accepted_at = $2, accepted_by = $3 where code = $4`, domain.InviteAccepted, now, user.ID, input.Code); err != nil {
		return domain.AlbumInvite{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.AlbumInvite{}, err
	}
	return s.InviteByCode(input.Code)
}

func (s *PostgresStore) CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error) {
	if err := s.authorize(input.AlbumID, userID, domain.RoleMember); err != nil {
		return domain.UploadSession{}, err
	}
	if input.FileName == "" || input.MediaType == "" {
		return domain.UploadSession{}, fmt.Errorf("fileName and mediaType are required")
	}
	node, err := s.albumNode(input.AlbumID)
	if err != nil {
		return domain.UploadSession{}, err
	}
	user, err := s.userByID(userID)
	if err != nil {
		return domain.UploadSession{}, err
	}
	if err := s.ensureTimelineEntry(input.AlbumID, input.EntryID); err != nil {
		return domain.UploadSession{}, err
	}
	now := time.Now().UTC()
	mediaID := newID("media")
	uploadID := newID("upload")
	uploadBatchID := strings.TrimSpace(input.UploadBatchID)
	if uploadBatchID == "" {
		uploadBatchID = newID("batch")
	}
	capturedAt := NormalizeCapturedAt(input.CapturedAt, nil, now)
	tx, err := s.db.Begin()
	if err != nil {
		return domain.UploadSession{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`insert into media_assets (id, family_id, entry_id, upload_batch_id, uploaded_by, uploaded_by_name, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, preview_status, original_blob_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, mediaID, input.AlbumID, input.EntryID, uploadBatchID, user.ID, user.DisplayName, input.FileName, input.MediaType, capturedAt, now, capturedAt.Format("2006-01-02"), domain.MediaPending, "manual_upload", domain.PreviewPending, ""); err != nil {
		return domain.UploadSession{}, err
	}
	if _, err := tx.Exec(`insert into upload_sessions (id, family_id, entry_id, upload_batch_id, uploaded_by, uploaded_by_name, media_id, file_name, media_type, status, created_at, assigned_to, byte_size, blob_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, uploadID, input.AlbumID, input.EntryID, uploadBatchID, user.ID, user.DisplayName, mediaID, input.FileName, input.MediaType, "created", now, node.ID, 0, ""); err != nil {
		return domain.UploadSession{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.UploadSession{}, err
	}
	return domain.UploadSession{
		ID:             uploadID,
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
	}, nil
}

func (s *PostgresStore) AttachUploadContent(userID, sessionID string, input UploadContentInput) (domain.UploadSession, error) {
	session, err := s.uploadSessionByID(sessionID)
	if err != nil {
		return domain.UploadSession{}, err
	}
	if err := s.authorize(session.FamilyID, userID, domain.RoleMember); err != nil {
		return domain.UploadSession{}, err
	}
	if session.Status != "created" {
		return domain.UploadSession{}, ErrConflict
	}
	now := time.Now().UTC()
	jobID := newID("job")
	tx, err := s.db.Begin()
	if err != nil {
		return domain.UploadSession{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`update upload_sessions set status = $1, byte_size = $2, blob_key = $3 where id = $4`, "uploaded", input.ByteSize, input.BlobKey, sessionID); err != nil {
		return domain.UploadSession{}, err
	}
	if _, err := tx.Exec(`update media_assets set original_blob_key = $1 where id = $2`, input.BlobKey, session.MediaID); err != nil {
		return domain.UploadSession{}, err
	}
	if _, err := tx.Exec(`insert into agent_jobs (id, node_id, family_id, media_id, type, status, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)`, jobID, session.AssignedTo, session.FamilyID, session.MediaID, "ingest_media", domain.JobPending, now, now); err != nil {
		return domain.UploadSession{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.UploadSession{}, err
	}
	session.Status = "uploaded"
	session.ByteSize = input.ByteSize
	session.BlobKey = input.BlobKey
	return session, nil
}

func (s *PostgresStore) CreateStorageNodePairing(userID string, input CreateStorageNodePairingInput) (domain.StorageNodePairing, error) {
	if err := s.authorize(input.AlbumID, userID, domain.RoleOwner); err != nil {
		return domain.StorageNodePairing{}, err
	}
	pairing := domain.StorageNodePairing{
		Code:      newPairingCode(),
		FamilyID:  input.AlbumID,
		CreatedBy: userID,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(24 * time.Hour),
	}
	if _, err := s.db.Exec(`insert into storage_node_pairings (code, family_id, created_by, created_at, expires_at) values ($1, $2, $3, $4, $5)`, pairing.Code, pairing.FamilyID, pairing.CreatedBy, pairing.CreatedAt, pairing.ExpiresAt); err != nil {
		return domain.StorageNodePairing{}, err
	}
	return pairing, nil
}

func (s *PostgresStore) RegisterStorageNode(input StorageNodeRegisterInput) (StorageNodeRegisterResult, error) {
	if input.Token != "" && input.NodeID != "" {
		node, err := s.touchNode(input.NodeID, input.NodeName, input.Token, input.Capacity)
		if err != nil {
			return StorageNodeRegisterResult{}, err
		}
		return StorageNodeRegisterResult{Node: node, NodeID: node.ID, NodeToken: node.RegistrationToken}, nil
	}
	pairing, err := s.storageNodePairingByCode(input.PairingCode)
	if err != nil {
		if err == ErrNotFound {
			return StorageNodeRegisterResult{}, ErrPairingNotFound
		}
		return StorageNodeRegisterResult{}, err
	}
	now := time.Now().UTC()
	if pairing.UsedAt != nil {
		return StorageNodeRegisterResult{}, ErrPairingUsed
	}
	if pairing.ExpiresAt.Before(now) {
		return StorageNodeRegisterResult{}, ErrPairingExpired
	}
	nodeID := strings.TrimSpace(input.NodeID)
	if nodeID == "" {
		nodeID = newID("node")
	}
	nodeToken := newSessionToken()
	nodeName := fallbackNodeName(input.NodeName, nodeID)
	tx, err := s.db.Begin()
	if err != nil {
		return StorageNodeRegisterResult{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`insert into storage_nodes (id, family_id, name, status, registration_token, last_seen_at, total_bytes, free_bytes, available_bytes) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, nodeID, pairing.FamilyID, nodeName, domain.NodeOnline, nodeToken, now, input.Capacity.TotalBytes, input.Capacity.FreeBytes, input.Capacity.AvailableBytes); err != nil {
		return StorageNodeRegisterResult{}, err
	}
	if _, err := tx.Exec(`update storage_node_pairings set used_at = $1 where code = $2`, now, pairing.Code); err != nil {
		return StorageNodeRegisterResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return StorageNodeRegisterResult{}, err
	}
	node := domain.StorageNode{
		ID:                nodeID,
		FamilyID:          pairing.FamilyID,
		Name:              nodeName,
		Status:            domain.NodeOnline,
		RegistrationToken: nodeToken,
		LastSeenAt:        now,
		TotalBytes:        input.Capacity.TotalBytes,
		FreeBytes:         input.Capacity.FreeBytes,
		AvailableBytes:    input.Capacity.AvailableBytes,
	}
	return StorageNodeRegisterResult{Node: node, NodeID: node.ID, NodeToken: node.RegistrationToken}, nil
}

func (s *PostgresStore) HeartbeatStorageNode(nodeID, token string, capacity StorageCapacityReport) (domain.StorageNode, error) {
	return s.touchNode(nodeID, "", token, capacity)
}

func (s *PostgresStore) PendingJobs(nodeID, token string) ([]domain.AgentJob, error) {
	node, err := s.nodeByID(nodeID)
	if err != nil {
		return nil, err
	}
	if node.RegistrationToken != token {
		return nil, ErrNodeUnauthorized
	}
	rows, err := s.db.Query(`select aj.id, aj.node_id, aj.family_id, aj.media_id, aj.type, aj.status, aj.created_at, aj.updated_at, us.file_name, us.media_type, us.byte_size, us.blob_key from agent_jobs aj join upload_sessions us on us.media_id = aj.media_id where aj.node_id = $1 and aj.status = $2 order by aj.created_at asc`, nodeID, domain.JobPending)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var jobs []domain.AgentJob
	for rows.Next() {
		var item domain.AgentJob
		if err := rows.Scan(&item.ID, &item.NodeID, &item.FamilyID, &item.MediaID, &item.Type, &item.Status, &item.CreatedAt, &item.UpdatedAt, &item.FileName, &item.MediaType, &item.ByteSize, &item.BlobKey); err != nil {
			return nil, err
		}
		jobs = append(jobs, item)
	}
	return jobs, rows.Err()
}

func (s *PostgresStore) AgentJob(nodeID, token, jobID string) (domain.AgentJob, error) {
	node, err := s.nodeByID(nodeID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if node.RegistrationToken != token {
		return domain.AgentJob{}, ErrNodeUnauthorized
	}
	var item domain.AgentJob
	err = s.db.QueryRow(`select aj.id, aj.node_id, aj.family_id, aj.media_id, aj.type, aj.status, aj.created_at, aj.updated_at, us.file_name, us.media_type, us.byte_size, us.blob_key from agent_jobs aj join upload_sessions us on us.media_id = aj.media_id where aj.id = $1`, jobID).Scan(&item.ID, &item.NodeID, &item.FamilyID, &item.MediaID, &item.Type, &item.Status, &item.CreatedAt, &item.UpdatedAt, &item.FileName, &item.MediaType, &item.ByteSize, &item.BlobKey)
	if err == sql.ErrNoRows {
		return domain.AgentJob{}, ErrNotFound
	}
	if err != nil {
		return domain.AgentJob{}, err
	}
	if item.NodeID != nodeID {
		return domain.AgentJob{}, ErrForbidden
	}
	return item, nil
}

func (s *PostgresStore) CompleteJob(nodeID, token, jobID string, input JobCompletionInput) (domain.AgentJob, error) {
	node, err := s.nodeByID(nodeID)
	if err != nil {
		return domain.AgentJob{}, err
	}
	if node.RegistrationToken != token {
		return domain.AgentJob{}, ErrNodeUnauthorized
	}
	if input.ProcessedAt.IsZero() {
		input.ProcessedAt = time.Now().UTC()
	}
	tx, err := s.db.Begin()
	if err != nil {
		return domain.AgentJob{}, err
	}
	defer tx.Rollback()
	var job domain.AgentJob
	err = tx.QueryRow(`select id, node_id, family_id, media_id, type, status, created_at, updated_at from agent_jobs where id = $1`, jobID).Scan(&job.ID, &job.NodeID, &job.FamilyID, &job.MediaID, &job.Type, &job.Status, &job.CreatedAt, &job.UpdatedAt)
	if err == sql.ErrNoRows {
		return domain.AgentJob{}, ErrNotFound
	}
	if err != nil {
		return domain.AgentJob{}, err
	}
	if job.NodeID != nodeID {
		return domain.AgentJob{}, ErrForbidden
	}
	job.Status = domain.JobCompleted
	job.UpdatedAt = time.Now().UTC()
	if _, err := tx.Exec(`update agent_jobs set status = $1, updated_at = $2 where id = $3`, job.Status, job.UpdatedAt, job.ID); err != nil {
		return domain.AgentJob{}, err
	}
	if _, err := tx.Exec(`update media_assets set status = $1, width = $2, height = $3, preview_status = $4, preview_blob_key = $5, processed_at = $6, original_path = $7 where id = $8`, domain.MediaReady, input.Width, input.Height, input.PreviewStatus, input.PreviewBlobKey, input.ProcessedAt, input.OriginalPath, job.MediaID); err != nil {
		return domain.AgentJob{}, err
	}
	if _, err := tx.Exec(`update upload_sessions set status = $1 where media_id = $2`, "ready", job.MediaID); err != nil {
		return domain.AgentJob{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.AgentJob{}, err
	}
	return job, nil
}

func (s *PostgresStore) issueSessionTx(tx *sql.Tx, user domain.User) (AuthResult, error) {
	token := newSessionToken()
	now := time.Now().UTC()
	expiresAt := now.Add(30 * 24 * time.Hour)
	if _, err := tx.Exec(`insert into auth_sessions (token, user_id, created_at, expires_at) values ($1, $2, $3, $4)`, token, user.ID, now, expiresAt); err != nil {
		return AuthResult{}, err
	}
	return AuthResult{User: user, Token: token, ExpiresAt: expiresAt}, nil
}

func (s *PostgresStore) babiesForFamily(familyID, userID string) ([]domain.BabyProfile, error) {
	if err := s.authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select id, family_id, name, birth_date, avatar_blob_key, avatar_updated_at, created_at from babies where family_id = $1 order by created_at asc`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.BabyProfile
	for rows.Next() {
		var item domain.BabyProfile
		var birthDate sql.NullTime
		var avatarUpdatedAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Name, &birthDate, &item.AvatarKey, &avatarUpdatedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		if birthDate.Valid {
			birth := birthDate.Time
			item.BirthDate = &birth
		}
		if avatarUpdatedAt.Valid {
			ts := avatarUpdatedAt.Time
			item.AvatarUpdatedAt = &ts
		}
		item.HasAvatar = item.AvatarKey != ""
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) primaryBabyForAlbum(familyID string) (*domain.BabyProfile, error) {
	rows, err := s.db.Query(`select id, family_id, name, birth_date, avatar_blob_key, avatar_updated_at, created_at from babies where family_id = $1 order by created_at asc limit 1`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	var item domain.BabyProfile
	var birthDate sql.NullTime
	var avatarUpdatedAt sql.NullTime
	if err := rows.Scan(&item.ID, &item.FamilyID, &item.Name, &birthDate, &item.AvatarKey, &avatarUpdatedAt, &item.CreatedAt); err != nil {
		return nil, err
	}
	if birthDate.Valid {
		birth := birthDate.Time
		item.BirthDate = &birth
	}
	if avatarUpdatedAt.Valid {
		ts := avatarUpdatedAt.Time
		item.AvatarUpdatedAt = &ts
	}
	item.HasAvatar = item.AvatarKey != ""
	return &item, rows.Err()
}

func (s *PostgresStore) babyByID(familyID, babyID string) (domain.BabyProfile, error) {
	var item domain.BabyProfile
	var birthDate sql.NullTime
	var avatarUpdatedAt sql.NullTime
	err := s.db.QueryRow(`select id, family_id, name, birth_date, avatar_blob_key, avatar_updated_at, created_at from babies where family_id = $1 and id = $2`, familyID, babyID).Scan(&item.ID, &item.FamilyID, &item.Name, &birthDate, &item.AvatarKey, &avatarUpdatedAt, &item.CreatedAt)
	if err == sql.ErrNoRows {
		return domain.BabyProfile{}, ErrNotFound
	}
	if err != nil {
		return domain.BabyProfile{}, err
	}
	if birthDate.Valid {
		birth := birthDate.Time
		item.BirthDate = &birth
	}
	if avatarUpdatedAt.Valid {
		ts := avatarUpdatedAt.Time
		item.AvatarUpdatedAt = &ts
	}
	item.HasAvatar = item.AvatarKey != ""
	return item, nil
}

func (s *PostgresStore) albumsForUser(userID string) ([]AlbumSummary, error) {
	rows, err := s.db.Query(`select f.id, f.name, f.timezone, fm.user_id, fm.family_id, fm.role, fm.display_name, fm.relation from family_members fm join families f on f.id = fm.family_id where fm.user_id = $1 order by f.name asc`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []AlbumSummary
	for rows.Next() {
		var summary AlbumSummary
		var role string
		if err := rows.Scan(&summary.Album.ID, &summary.Album.Name, &summary.Album.Timezone, &summary.Membership.UserID, &summary.Membership.FamilyID, &role, &summary.Membership.DisplayName, &summary.Membership.Relation); err != nil {
			return nil, err
		}
		summary.Membership.Role = domain.Role(role)
		baby, err := s.primaryBabyForAlbum(summary.Album.ID)
		if err != nil {
			return nil, err
		}
		summary.Baby = baby
		items = append(items, summary)
	}
	return items, rows.Err()
}

func (s *PostgresStore) familyByID(familyID string) (domain.Family, error) {
	var family domain.Family
	err := s.db.QueryRow(`select id, name, timezone from families where id = $1`, familyID).Scan(&family.ID, &family.Name, &family.Timezone)
	if err == sql.ErrNoRows {
		return domain.Family{}, ErrNotFound
	}
	if err != nil {
		return domain.Family{}, err
	}
	return family, nil
}

func (s *PostgresStore) userByID(userID string) (domain.User, error) {
	var user domain.User
	err := s.db.QueryRow(`select id, display_name, email, created_at from users where id = $1`, userID).Scan(&user.ID, &user.DisplayName, &user.Email, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return user, nil
}

func (s *PostgresStore) memberForUser(familyID, userID string) (domain.AlbumMember, error) {
	var member domain.AlbumMember
	var role string
	err := s.db.QueryRow(`select user_id, family_id, role, display_name, relation from family_members where family_id = $1 and user_id = $2`, familyID, userID).Scan(&member.UserID, &member.FamilyID, &role, &member.DisplayName, &member.Relation)
	if err == sql.ErrNoRows {
		return domain.AlbumMember{}, ErrForbidden
	}
	if err != nil {
		return domain.AlbumMember{}, err
	}
	member.Role = domain.Role(role)
	return member, nil
}

func (s *PostgresStore) albumNode(familyID string) (domain.StorageNode, error) {
	node, err := s.albumNodeMaybe(familyID)
	if err != nil {
		return domain.StorageNode{}, err
	}
	if node == nil {
		return domain.StorageNode{}, ErrNotFound
	}
	return *node, nil
}

func (s *PostgresStore) albumNodeMaybe(familyID string) (*domain.StorageNode, error) {
	var node domain.StorageNode
	var status string
	err := s.db.QueryRow(`select id, family_id, name, status, registration_token, last_seen_at, total_bytes, free_bytes, available_bytes from storage_nodes where family_id = $1 order by id asc limit 1`, familyID).Scan(&node.ID, &node.FamilyID, &node.Name, &status, &node.RegistrationToken, &node.LastSeenAt, &node.TotalBytes, &node.FreeBytes, &node.AvailableBytes)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	node.Status = domain.StorageNodeStatus(status)
	return &node, nil
}

func (s *PostgresStore) nodeByID(nodeID string) (domain.StorageNode, error) {
	var node domain.StorageNode
	var status string
	err := s.db.QueryRow(`select id, family_id, name, status, registration_token, last_seen_at, total_bytes, free_bytes, available_bytes from storage_nodes where id = $1`, nodeID).Scan(&node.ID, &node.FamilyID, &node.Name, &status, &node.RegistrationToken, &node.LastSeenAt, &node.TotalBytes, &node.FreeBytes, &node.AvailableBytes)
	if err == sql.ErrNoRows {
		return domain.StorageNode{}, ErrNotFound
	}
	if err != nil {
		return domain.StorageNode{}, err
	}
	node.Status = domain.StorageNodeStatus(status)
	return node, nil
}

func (s *PostgresStore) uploadSessionByID(sessionID string) (domain.UploadSession, error) {
	var session domain.UploadSession
	err := s.db.QueryRow(`select id, family_id, entry_id, upload_batch_id, uploaded_by, uploaded_by_name, media_id, file_name, media_type, status, created_at, assigned_to, byte_size, blob_key from upload_sessions where id = $1`, sessionID).Scan(&session.ID, &session.FamilyID, &session.EntryID, &session.UploadBatchID, &session.UploadedBy, &session.UploadedByName, &session.MediaID, &session.FileName, &session.MediaType, &session.Status, &session.CreatedAt, &session.AssignedTo, &session.ByteSize, &session.BlobKey)
	if err == sql.ErrNoRows {
		return domain.UploadSession{}, ErrNotFound
	}
	if err != nil {
		return domain.UploadSession{}, err
	}
	return session, nil
}

func (s *PostgresStore) ensureTimelineEntry(albumID, entryID string) error {
	var count int
	if err := s.db.QueryRow(`select count(*) from timeline_entries where id = $1 and family_id = $2`, entryID, albumID).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) timelineEntryByID(albumID, entryID string) (domain.TimelineEntry, error) {
	row := s.db.QueryRow(`select id, family_id, caption, visibility, time_mode, display_at, timeline_day, uploaded_by, uploaded_by_name, uploaded_at, created_at from timeline_entries where family_id = $1 and id = $2`, albumID, entryID)
	entry, err := scanTimelineEntry(row)
	if err == sql.ErrNoRows {
		return domain.TimelineEntry{}, ErrNotFound
	}
	if err != nil {
		return domain.TimelineEntry{}, err
	}
	entry.Items = []domain.MediaAsset{}
	return entry, nil
}

func (s *PostgresStore) authorize(familyID, userID string, minRole domain.Role) error {
	member, err := s.memberForUser(familyID, userID)
	if err != nil {
		return err
	}
	if roleRank(member.Role) < roleRank(minRole) {
		return ErrForbidden
	}
	return nil
}

func (s *PostgresStore) authorizeTimelineEntryEdit(userID string, entry domain.TimelineEntry) error {
	member, err := s.memberForUser(entry.FamilyID, userID)
	if err != nil {
		return err
	}
	if member.Role == domain.RoleOwner || member.Role == domain.RoleAdmin || entry.UploadedBy == userID {
		return nil
	}
	return ErrForbidden
}

func (s *PostgresStore) storageNodePairingByCode(code string) (domain.StorageNodePairing, error) {
	var pairing domain.StorageNodePairing
	var usedAt sql.NullTime
	err := s.db.QueryRow(`select code, family_id, created_by, created_at, expires_at, used_at from storage_node_pairings where code = $1`, code).Scan(&pairing.Code, &pairing.FamilyID, &pairing.CreatedBy, &pairing.CreatedAt, &pairing.ExpiresAt, &usedAt)
	if err == sql.ErrNoRows {
		return domain.StorageNodePairing{}, ErrNotFound
	}
	if err != nil {
		return domain.StorageNodePairing{}, err
	}
	if usedAt.Valid {
		ts := usedAt.Time
		pairing.UsedAt = &ts
	}
	return pairing, nil
}

func (s *PostgresStore) touchNode(nodeID, nodeName, token string, capacity StorageCapacityReport) (domain.StorageNode, error) {
	node, err := s.nodeByID(nodeID)
	if err != nil {
		return domain.StorageNode{}, err
	}
	if node.RegistrationToken != token {
		return domain.StorageNode{}, ErrNodeUnauthorized
	}
	if nodeName == "" {
		nodeName = node.Name
	}
	lastSeenAt := time.Now().UTC()
	if _, err := s.db.Exec(`update storage_nodes set name = $1, status = $2, last_seen_at = $3, total_bytes = $4, free_bytes = $5, available_bytes = $6 where id = $7`, nodeName, domain.NodeOnline, lastSeenAt, capacity.TotalBytes, capacity.FreeBytes, capacity.AvailableBytes, nodeID); err != nil {
		return domain.StorageNode{}, err
	}
	node.Name = nodeName
	node.Status = domain.NodeOnline
	node.LastSeenAt = lastSeenAt
	node.TotalBytes = capacity.TotalBytes
	node.FreeBytes = capacity.FreeBytes
	node.AvailableBytes = capacity.AvailableBytes
	return node, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanMediaAsset(row scanner) (domain.MediaAsset, error) {
	var item domain.MediaAsset
	var processedAt sql.NullTime
	err := row.Scan(&item.ID, &item.FamilyID, &item.EntryID, &item.UploadBatchID, &item.UploadedBy, &item.UploadedByName, &item.FileName, &item.MediaType, &item.CapturedAt, &item.UploadedAt, &item.TimelineDay, &item.Status, &item.Source, &item.Width, &item.Height, &item.PreviewStatus, &item.PreviewBlobKey, &item.OriginalBlobKey, &processedAt, &item.OriginalPath)
	if err != nil {
		return domain.MediaAsset{}, err
	}
	if processedAt.Valid {
		ts := processedAt.Time
		item.ProcessedAt = &ts
	}
	return item, nil
}

func scanTimelineEntry(row scanner) (domain.TimelineEntry, error) {
	var item domain.TimelineEntry
	var visibility string
	var timeMode string
	if err := row.Scan(&item.ID, &item.FamilyID, &item.Caption, &visibility, &timeMode, &item.DisplayAt, &item.TimelineDay, &item.UploadedBy, &item.UploadedByName, &item.UploadedAt, &item.CreatedAt); err != nil {
		return domain.TimelineEntry{}, err
	}
	item.Visibility = domain.TimelineEntryVisibility(visibility)
	item.TimeMode = domain.TimelineEntryTimeMode(timeMode)
	return item, nil
}

func scanInvite(row scanner) (domain.AlbumInvite, error) {
	var item domain.AlbumInvite
	var role string
	var status string
	var acceptedAt sql.NullTime
	if err := row.Scan(&item.ID, &item.FamilyID, &item.Code, &role, &status, &item.CreatedBy, &item.CreatedByName, &item.FamilyName, &item.CreatedAt, &acceptedAt, &item.AcceptedBy); err != nil {
		return domain.AlbumInvite{}, err
	}
	item.Role = domain.Role(role)
	item.Status = domain.InviteStatus(status)
	if acceptedAt.Valid {
		ts := acceptedAt.Time
		item.AcceptedAt = &ts
	}
	return item, nil
}

func albumSummaryContains(items []AlbumSummary, familyID string) bool {
	for _, item := range items {
		if item.Album.ID == familyID {
			return true
		}
	}
	return false
}
