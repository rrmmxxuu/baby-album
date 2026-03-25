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
		`create table if not exists family_members (user_id text not null references users(id), family_id text not null references families(id), role text not null, display_name text not null, primary key (family_id, user_id))`,
		`create table if not exists babies (id text primary key, family_id text not null references families(id), name text not null, birth_date date, created_at timestamptz not null)`,
		`create table if not exists family_invites (id text primary key, family_id text not null references families(id), code text not null unique, role text not null, status text not null, created_by text not null references users(id), created_at timestamptz not null, accepted_at timestamptz, accepted_by text references users(id))`,
		`create table if not exists storage_nodes (id text primary key, family_id text not null references families(id), name text not null, status text not null, registration_token text not null, last_seen_at timestamptz not null)`,
		`create table if not exists media_assets (id text primary key, family_id text not null references families(id), file_name text not null, media_type text not null, captured_at timestamptz not null, uploaded_at timestamptz not null, timeline_day text not null, status text not null, source text not null, width integer not null default 0, height integer not null default 0, preview_status text not null default 'pending', preview_blob_key text not null default '', processed_at timestamptz, original_path text not null default '')`,
		`create table if not exists upload_sessions (id text primary key, family_id text not null references families(id), media_id text not null references media_assets(id), file_name text not null, media_type text not null, status text not null, created_at timestamptz not null, assigned_to text not null references storage_nodes(id), byte_size bigint not null default 0, blob_key text not null default '')`,
		`create table if not exists agent_jobs (id text primary key, node_id text not null references storage_nodes(id), family_id text not null references families(id), media_id text not null references media_assets(id), type text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
		`create index if not exists idx_family_members_user on family_members (user_id)`,
		`create index if not exists idx_babies_family on babies (family_id, created_at asc)`,
		`create index if not exists idx_family_invites_family on family_invites (family_id, created_at desc)`,
		`create index if not exists idx_media_assets_family_captured on media_assets (family_id, captured_at desc)`,
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
		{UserID: "user-owner", FamilyID: "family-demo", Role: domain.RoleOwner, DisplayName: "Ramon"},
		{UserID: "user-admin", FamilyID: "family-demo", Role: domain.RoleAdmin, DisplayName: "Grandma"},
		{UserID: "user-member", FamilyID: "family-demo", Role: domain.RoleMember, DisplayName: "Dad"},
		{UserID: "user-viewer", FamilyID: "family-demo", Role: domain.RoleViewer, DisplayName: "Auntie"},
	}
	for _, member := range members {
		if _, err := tx.Exec(`insert into family_members (user_id, family_id, role, display_name) values ($1, $2, $3, $4)`, member.UserID, member.FamilyID, member.Role, member.DisplayName); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`insert into babies (id, family_id, name, birth_date, created_at) values ($1, $2, $3, $4, $5)`, "baby-demo", "family-demo", "Little Qin", now.AddDate(-1, -3, 0), now.Add(-20*time.Hour)); err != nil {
		return err
	}
	if _, err := tx.Exec(`insert into storage_nodes (id, family_id, name, status, registration_token, last_seen_at) values ($1, $2, $3, $4, $5, $6)`, "node-demo", "family-demo", "Living Room NAS", domain.NodeOnline, "demo-registration-token", now.Add(-10*time.Second)); err != nil {
		return err
	}
	seedMedia := []domain.MediaAsset{
		newSeedMedia("media-001", "family-demo", "2025-11-02-first-smile.heic", "image/heic", now.AddDate(0, -4, -13), "camera_roll"),
		newSeedMedia("media-002", "family-demo", "2026-01-16-weekend-video.mov", "video/quicktime", now.AddDate(0, -2, -9), "camera_roll"),
		newSeedMedia("media-003", "family-demo", "2026-03-20-park.jpg", "image/jpeg", now.AddDate(0, 0, -5), "manual_upload"),
	}
	for _, item := range seedMedia {
		if _, err := tx.Exec(`insert into media_assets (id, family_id, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, width, height, preview_status, preview_blob_key, processed_at, original_path) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, item.ID, item.FamilyID, item.FileName, item.MediaType, item.CapturedAt, item.UploadedAt, item.TimelineDay, item.Status, item.Source, item.Width, item.Height, item.PreviewStatus, item.PreviewBlobKey, item.ProcessedAt, item.OriginalPath); err != nil {
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

func (s *PostgresStore) AppState(userID, familyID string) (AppState, error) {
	user, err := s.userByID(userID)
	if err != nil {
		return AppState{}, err
	}
	families, err := s.familiesForUser(userID)
	if err != nil {
		return AppState{}, err
	}
	state := AppState{CurrentUser: user, Families: families}
	if len(families) == 0 {
		return normalizeAppState(state), nil
	}
	selectedFamilyID := familyID
	if selectedFamilyID == "" || !familySummaryContains(families, selectedFamilyID) {
		selectedFamilyID = families[0].Family.ID
	}
	bootstrap, err := s.Bootstrap(selectedFamilyID, userID)
	if err != nil {
		return AppState{}, err
	}
	state.ActiveFamily = &bootstrap
	state.ActiveFamilyID = selectedFamilyID
	return normalizeAppState(state), nil
}

func (s *PostgresStore) Bootstrap(familyID, userID string) (Bootstrap, error) {
	membership, err := s.memberForUser(familyID, userID)
	if err != nil {
		return Bootstrap{}, err
	}
	family, err := s.familyByID(familyID)
	if err != nil {
		return Bootstrap{}, err
	}
	user, err := s.userByID(userID)
	if err != nil {
		return Bootstrap{}, err
	}
	node, err := s.familyNodeMaybe(familyID)
	if err != nil {
		return Bootstrap{}, err
	}
	timeline, err := s.Timeline(familyID, userID)
	if err != nil {
		return Bootstrap{}, err
	}
	members, err := s.Members(familyID, userID)
	if err != nil {
		return Bootstrap{}, err
	}
	babies, err := s.babiesForFamily(familyID, userID)
	if err != nil {
		return Bootstrap{}, err
	}
	invites := []domain.FamilyInvite{}
	if roleRank(membership.Role) >= roleRank(domain.RoleAdmin) {
		invites, err = s.Invites(familyID, userID)
		if err != nil {
			return Bootstrap{}, err
		}
	}
	return normalizeBootstrap(Bootstrap{Family: family, CurrentUser: user, Membership: membership, StorageNode: node, Timeline: timeline, Members: members, Babies: babies, Invites: invites}), nil
}

func (s *PostgresStore) Timeline(familyID, userID string) ([]domain.MediaAsset, error) {
	if err := s.authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select id, family_id, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, width, height, preview_status, preview_blob_key, processed_at, original_path from media_assets where family_id = $1 order by captured_at desc`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.MediaAsset
	for rows.Next() {
		item, err := scanMediaAsset(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) Members(familyID, userID string) ([]domain.FamilyMember, error) {
	if err := s.authorize(familyID, userID, domain.RoleViewer); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select user_id, family_id, role, display_name from family_members where family_id = $1 order by display_name asc`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.FamilyMember
	for rows.Next() {
		var item domain.FamilyMember
		var role string
		if err := rows.Scan(&item.UserID, &item.FamilyID, &role, &item.DisplayName); err != nil {
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
	row := s.db.QueryRow(`select id, family_id, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, width, height, preview_status, preview_blob_key, processed_at, original_path from media_assets where family_id = $1 and id = $2`, familyID, mediaID)
	item, err := scanMediaAsset(row)
	if err == sql.ErrNoRows {
		return domain.MediaAsset{}, ErrNotFound
	}
	if err != nil {
		return domain.MediaAsset{}, err
	}
	return item, nil
}

func (s *PostgresStore) CreateFamily(userID string, input CreateFamilyInput) (domain.Family, error) {
	name := strings.TrimSpace(input.Name)
	timezone := strings.TrimSpace(input.Timezone)
	if name == "" {
		return domain.Family{}, fmt.Errorf("family name is required")
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
	if _, err := tx.Exec(`insert into family_members (user_id, family_id, role, display_name) values ($1, $2, $3, $4)`, user.ID, family.ID, domain.RoleOwner, user.DisplayName); err != nil {
		return domain.Family{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Family{}, err
	}
	return family, nil
}

func (s *PostgresStore) CreateBaby(userID string, input CreateBabyInput) (domain.BabyProfile, error) {
	if err := s.authorize(input.FamilyID, userID, domain.RoleMember); err != nil {
		return domain.BabyProfile{}, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return domain.BabyProfile{}, fmt.Errorf("baby name is required")
	}
	baby := domain.BabyProfile{ID: newID("baby"), FamilyID: input.FamilyID, Name: name, CreatedAt: time.Now().UTC()}
	if input.BirthDate != nil {
		birthDate := input.BirthDate.UTC()
		baby.BirthDate = &birthDate
	}
	if _, err := s.db.Exec(`insert into babies (id, family_id, name, birth_date, created_at) values ($1, $2, $3, $4, $5)`, baby.ID, baby.FamilyID, baby.Name, baby.BirthDate, baby.CreatedAt); err != nil {
		return domain.BabyProfile{}, err
	}
	return baby, nil
}

func (s *PostgresStore) DeleteBaby(userID, familyID, babyID string) error {
	if err := s.authorize(familyID, userID, domain.RoleAdmin); err != nil {
		return err
	}
	result, err := s.db.Exec(`delete from babies where family_id = $1 and id = $2`, familyID, babyID)
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

func (s *PostgresStore) LeaveFamily(userID string, input LeaveFamilyInput) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var actor domain.FamilyMember
	var role string
	err = tx.QueryRow(`select user_id, family_id, role, display_name from family_members where family_id = $1 and user_id = $2 for update`, input.FamilyID, userID).Scan(&actor.UserID, &actor.FamilyID, &role, &actor.DisplayName)
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
		result, err := tx.Exec(`update family_members set role = $1 where family_id = $2 and user_id = $3`, domain.RoleOwner, input.FamilyID, transferOwnerTo)
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
	result, err := tx.Exec(`delete from family_members where family_id = $1 and user_id = $2`, input.FamilyID, userID)
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

func (s *PostgresStore) UpdateMemberRole(userID string, input UpdateMemberRoleInput) (domain.FamilyMember, error) {
	if !validRole(input.Role) || input.Role == domain.RoleOwner || input.MemberUserID == userID {
		return domain.FamilyMember{}, ErrForbidden
	}
	actor, err := s.memberForUser(input.FamilyID, userID)
	if err != nil {
		return domain.FamilyMember{}, err
	}
	if actor.Role != domain.RoleOwner {
		return domain.FamilyMember{}, ErrForbidden
	}
	member, err := s.memberForUser(input.FamilyID, input.MemberUserID)
	if err != nil {
		return domain.FamilyMember{}, err
	}
	if member.Role == domain.RoleOwner {
		return domain.FamilyMember{}, ErrForbidden
	}
	if _, err := s.db.Exec(`update family_members set role = $1 where family_id = $2 and user_id = $3`, input.Role, input.FamilyID, input.MemberUserID); err != nil {
		return domain.FamilyMember{}, err
	}
	member.Role = input.Role
	return member, nil
}

func (s *PostgresStore) CreateInvite(userID string, input CreateInviteInput) (domain.FamilyInvite, error) {
	if !validRole(input.Role) || input.Role == domain.RoleOwner {
		return domain.FamilyInvite{}, ErrForbidden
	}
	actor, err := s.memberForUser(input.FamilyID, userID)
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
	if _, err := s.db.Exec(`insert into family_invites (id, family_id, code, role, status, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7)`, invite.ID, invite.FamilyID, invite.Code, invite.Role, invite.Status, invite.CreatedBy, invite.CreatedAt); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			return domain.FamilyInvite{}, ErrConflict
		}
		return domain.FamilyInvite{}, err
	}
	return s.InviteByCode(invite.Code)
}

func (s *PostgresStore) Invites(familyID, userID string) ([]domain.FamilyInvite, error) {
	if err := s.authorize(familyID, userID, domain.RoleAdmin); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`select fi.id, fi.family_id, fi.code, fi.role, fi.status, fi.created_by, u.display_name, f.name, fi.created_at, fi.accepted_at, coalesce(fi.accepted_by, '') from family_invites fi join families f on f.id = fi.family_id join users u on u.id = fi.created_by where fi.family_id = $1 order by fi.created_at desc`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.FamilyInvite
	for rows.Next() {
		item, err := scanInvite(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) InviteByCode(code string) (domain.FamilyInvite, error) {
	row := s.db.QueryRow(`select fi.id, fi.family_id, fi.code, fi.role, fi.status, fi.created_by, u.display_name, f.name, fi.created_at, fi.accepted_at, coalesce(fi.accepted_by, '') from family_invites fi join families f on f.id = fi.family_id join users u on u.id = fi.created_by where fi.code = $1`, code)
	item, err := scanInvite(row)
	if err == sql.ErrNoRows {
		return domain.FamilyInvite{}, ErrNotFound
	}
	if err != nil {
		return domain.FamilyInvite{}, err
	}
	return item, nil
}

func (s *PostgresStore) AcceptInvite(userID, code string) (domain.FamilyInvite, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return domain.FamilyInvite{}, err
	}
	defer tx.Rollback()
	var invite domain.FamilyInvite
	var role string
	var status string
	var acceptedAt sql.NullTime
	var acceptedBy sql.NullString
	err = tx.QueryRow(`select id, family_id, code, role, status, created_by, created_at, accepted_at, accepted_by from family_invites where code = $1 for update`, code).Scan(&invite.ID, &invite.FamilyID, &invite.Code, &role, &status, &invite.CreatedBy, &invite.CreatedAt, &acceptedAt, &acceptedBy)
	if err == sql.ErrNoRows {
		return domain.FamilyInvite{}, ErrNotFound
	}
	if err != nil {
		return domain.FamilyInvite{}, err
	}
	invite.Role = domain.Role(role)
	invite.Status = domain.InviteStatus(status)
	if invite.Status != domain.InvitePending {
		return domain.FamilyInvite{}, ErrConflict
	}
	user, err := s.userByID(userID)
	if err != nil {
		return domain.FamilyInvite{}, err
	}
	var memberCount int
	if err := tx.QueryRow(`select count(*) from family_members where family_id = $1 and user_id = $2`, invite.FamilyID, user.ID).Scan(&memberCount); err != nil {
		return domain.FamilyInvite{}, err
	}
	if memberCount > 0 {
		return domain.FamilyInvite{}, ErrConflict
	}
	if _, err := tx.Exec(`insert into family_members (user_id, family_id, role, display_name) values ($1, $2, $3, $4)`, user.ID, invite.FamilyID, invite.Role, user.DisplayName); err != nil {
		return domain.FamilyInvite{}, err
	}
	now := time.Now().UTC()
	if _, err := tx.Exec(`update family_invites set status = $1, accepted_at = $2, accepted_by = $3 where code = $4`, domain.InviteAccepted, now, user.ID, code); err != nil {
		return domain.FamilyInvite{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.FamilyInvite{}, err
	}
	return s.InviteByCode(code)
}

func (s *PostgresStore) CreateUploadSession(userID string, input UploadSessionInput) (domain.UploadSession, error) {
	if err := s.authorize(input.FamilyID, userID, domain.RoleMember); err != nil {
		return domain.UploadSession{}, err
	}
	if input.FileName == "" || input.MediaType == "" {
		return domain.UploadSession{}, fmt.Errorf("fileName and mediaType are required")
	}
	node, err := s.familyNode(input.FamilyID)
	if err != nil {
		return domain.UploadSession{}, err
	}
	now := time.Now().UTC()
	mediaID := newID("media")
	uploadID := newID("upload")
	capturedAt := NormalizeCapturedAt(input.CapturedAt, nil, now)
	tx, err := s.db.Begin()
	if err != nil {
		return domain.UploadSession{}, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`insert into media_assets (id, family_id, file_name, media_type, captured_at, uploaded_at, timeline_day, status, source, preview_status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, mediaID, input.FamilyID, input.FileName, input.MediaType, capturedAt, now, capturedAt.Format("2006-01-02"), domain.MediaPending, "manual_upload", domain.PreviewPending); err != nil {
		return domain.UploadSession{}, err
	}
	if _, err := tx.Exec(`insert into upload_sessions (id, family_id, media_id, file_name, media_type, status, created_at, assigned_to, byte_size, blob_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, uploadID, input.FamilyID, mediaID, input.FileName, input.MediaType, "created", now, node.ID, 0, ""); err != nil {
		return domain.UploadSession{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.UploadSession{}, err
	}
	return domain.UploadSession{ID: uploadID, FamilyID: input.FamilyID, MediaID: mediaID, FileName: input.FileName, MediaType: input.MediaType, Status: "created", CreatedAt: now, AssignedTo: node.ID, ByteSize: 0, BlobKey: ""}, nil
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

func (s *PostgresStore) RegisterStorageNode(nodeID, nodeName, token string) (domain.StorageNode, error) {
	return s.touchNode(nodeID, nodeName, token)
}

func (s *PostgresStore) HeartbeatStorageNode(nodeID, token string) (domain.StorageNode, error) {
	return s.touchNode(nodeID, "", token)
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
	rows, err := s.db.Query(`select id, family_id, name, birth_date, created_at from babies where family_id = $1 order by created_at asc`, familyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.BabyProfile
	for rows.Next() {
		var item domain.BabyProfile
		var birthDate sql.NullTime
		if err := rows.Scan(&item.ID, &item.FamilyID, &item.Name, &birthDate, &item.CreatedAt); err != nil {
			return nil, err
		}
		if birthDate.Valid {
			birth := birthDate.Time
			item.BirthDate = &birth
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *PostgresStore) familiesForUser(userID string) ([]FamilySummary, error) {
	rows, err := s.db.Query(`select f.id, f.name, f.timezone, fm.user_id, fm.family_id, fm.role, fm.display_name from family_members fm join families f on f.id = fm.family_id where fm.user_id = $1 order by f.name asc`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []FamilySummary
	for rows.Next() {
		var summary FamilySummary
		var role string
		if err := rows.Scan(&summary.Family.ID, &summary.Family.Name, &summary.Family.Timezone, &summary.Membership.UserID, &summary.Membership.FamilyID, &role, &summary.Membership.DisplayName); err != nil {
			return nil, err
		}
		summary.Membership.Role = domain.Role(role)
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

func (s *PostgresStore) memberForUser(familyID, userID string) (domain.FamilyMember, error) {
	var member domain.FamilyMember
	var role string
	err := s.db.QueryRow(`select user_id, family_id, role, display_name from family_members where family_id = $1 and user_id = $2`, familyID, userID).Scan(&member.UserID, &member.FamilyID, &role, &member.DisplayName)
	if err == sql.ErrNoRows {
		return domain.FamilyMember{}, ErrForbidden
	}
	if err != nil {
		return domain.FamilyMember{}, err
	}
	member.Role = domain.Role(role)
	return member, nil
}

func (s *PostgresStore) familyNode(familyID string) (domain.StorageNode, error) {
	node, err := s.familyNodeMaybe(familyID)
	if err != nil {
		return domain.StorageNode{}, err
	}
	if node == nil {
		return domain.StorageNode{}, ErrNotFound
	}
	return *node, nil
}

func (s *PostgresStore) familyNodeMaybe(familyID string) (*domain.StorageNode, error) {
	var node domain.StorageNode
	var status string
	err := s.db.QueryRow(`select id, family_id, name, status, registration_token, last_seen_at from storage_nodes where family_id = $1 order by id asc limit 1`, familyID).Scan(&node.ID, &node.FamilyID, &node.Name, &status, &node.RegistrationToken, &node.LastSeenAt)
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
	err := s.db.QueryRow(`select id, family_id, name, status, registration_token, last_seen_at from storage_nodes where id = $1`, nodeID).Scan(&node.ID, &node.FamilyID, &node.Name, &status, &node.RegistrationToken, &node.LastSeenAt)
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
	err := s.db.QueryRow(`select id, family_id, media_id, file_name, media_type, status, created_at, assigned_to, byte_size, blob_key from upload_sessions where id = $1`, sessionID).Scan(&session.ID, &session.FamilyID, &session.MediaID, &session.FileName, &session.MediaType, &session.Status, &session.CreatedAt, &session.AssignedTo, &session.ByteSize, &session.BlobKey)
	if err == sql.ErrNoRows {
		return domain.UploadSession{}, ErrNotFound
	}
	if err != nil {
		return domain.UploadSession{}, err
	}
	return session, nil
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

func (s *PostgresStore) touchNode(nodeID, nodeName, token string) (domain.StorageNode, error) {
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
	if _, err := s.db.Exec(`update storage_nodes set name = $1, status = $2, last_seen_at = $3 where id = $4`, nodeName, domain.NodeOnline, lastSeenAt, nodeID); err != nil {
		return domain.StorageNode{}, err
	}
	node.Name = nodeName
	node.Status = domain.NodeOnline
	node.LastSeenAt = lastSeenAt
	return node, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanMediaAsset(row scanner) (domain.MediaAsset, error) {
	var item domain.MediaAsset
	var processedAt sql.NullTime
	err := row.Scan(&item.ID, &item.FamilyID, &item.FileName, &item.MediaType, &item.CapturedAt, &item.UploadedAt, &item.TimelineDay, &item.Status, &item.Source, &item.Width, &item.Height, &item.PreviewStatus, &item.PreviewBlobKey, &processedAt, &item.OriginalPath)
	if err != nil {
		return domain.MediaAsset{}, err
	}
	if processedAt.Valid {
		ts := processedAt.Time
		item.ProcessedAt = &ts
	}
	return item, nil
}

func scanInvite(row scanner) (domain.FamilyInvite, error) {
	var item domain.FamilyInvite
	var role string
	var status string
	var acceptedAt sql.NullTime
	if err := row.Scan(&item.ID, &item.FamilyID, &item.Code, &role, &status, &item.CreatedBy, &item.CreatedByName, &item.FamilyName, &item.CreatedAt, &acceptedAt, &item.AcceptedBy); err != nil {
		return domain.FamilyInvite{}, err
	}
	item.Role = domain.Role(role)
	item.Status = domain.InviteStatus(status)
	if acceptedAt.Valid {
		ts := acceptedAt.Time
		item.AcceptedAt = &ts
	}
	return item, nil
}

func familySummaryContains(items []FamilySummary, familyID string) bool {
	for _, item := range items {
		if item.Family.ID == familyID {
			return true
		}
	}
	return false
}
