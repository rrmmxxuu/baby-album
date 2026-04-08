package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	panelSessionCookieName = "agent_panel_session"
	panelSessionTTL        = 24 * time.Hour
	recentJobLimit         = 20
	logTailLineCount       = 200
	migrationMarkerName    = ".agent-library-migration.json"
	logFileMaxBytes        = 10 * 1024 * 1024
	logFileCount           = 5
)

type panelAuthState struct {
	PasswordSalt      string     `json:"passwordSalt,omitempty"`
	PasswordHash      string     `json:"passwordHash,omitempty"`
	BootstrapSalt     string     `json:"bootstrapSalt,omitempty"`
	BootstrapHash     string     `json:"bootstrapHash,omitempty"`
	BootstrapIssuedAt *time.Time `json:"bootstrapIssuedAt,omitempty"`
	PasswordSetAt     *time.Time `json:"passwordSetAt,omitempty"`
}

type panelSession struct {
	Token      string
	ExpiresAt  time.Time
	Bootstrap  bool
	LastSeenAt time.Time
}

type runtimeJob struct {
	ID         string     `json:"id"`
	MediaID    string     `json:"mediaId"`
	FileName   string     `json:"fileName"`
	MediaType  string     `json:"mediaType"`
	Stage      string     `json:"stage"`
	Status     string     `json:"status"`
	Error      string     `json:"error,omitempty"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

type migrationState struct {
	ID             string     `json:"id,omitempty"`
	Phase          string     `json:"phase,omitempty"`
	SourceRoot     string     `json:"sourceRoot,omitempty"`
	TargetRoot     string     `json:"targetRoot,omitempty"`
	CurrentPath    string     `json:"currentPath,omitempty"`
	Error          string     `json:"error,omitempty"`
	StartedAt      *time.Time `json:"startedAt,omitempty"`
	CompletedAt    *time.Time `json:"completedAt,omitempty"`
	TotalFiles     int        `json:"totalFiles,omitempty"`
	CopiedFiles    int        `json:"copiedFiles,omitempty"`
	TotalBytes     int64      `json:"totalBytes,omitempty"`
	CopiedBytes    int64      `json:"copiedBytes,omitempty"`
	VerifiedFiles  int        `json:"verifiedFiles,omitempty"`
	VerifiedBytes  int64      `json:"verifiedBytes,omitempty"`
	MaintenanceSet bool       `json:"maintenanceSet,omitempty"`
}

type runtimeState struct {
	Mode             string          `json:"mode"`
	LastError        string          `json:"lastError,omitempty"`
	LastHeartbeatAt  *time.Time      `json:"lastHeartbeatAt,omitempty"`
	LastHeartbeatErr string          `json:"lastHeartbeatErr,omitempty"`
	Capacity         storageCapacity `json:"capacity"`
	Maintenance      bool            `json:"maintenance"`
	CurrentJob       *runtimeJob     `json:"currentJob,omitempty"`
	PendingJobs      []runtimeJob    `json:"pendingJobs,omitempty"`
	RecentJobs       []runtimeJob    `json:"recentJobs,omitempty"`
	Migration        migrationState  `json:"migration"`
}

type migrationMarker struct {
	ID          string    `json:"id"`
	CompletedAt time.Time `json:"completedAt"`
}

type fileLogSink struct {
	mu   sync.Mutex
	path string
	file *os.File
	size int64
}

func newFileLogSink(path string) (*fileLogSink, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	return &fileLogSink{path: path, file: file, size: info.Size()}, nil
}

func (s *fileLogSink) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.size+int64(len(p)) > logFileMaxBytes {
		if err := s.rotateLocked(); err != nil {
			return 0, err
		}
	}
	n, err := s.file.Write(p)
	s.size += int64(n)
	return n, err
}

func (s *fileLogSink) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.file.Close()
}

func (s *fileLogSink) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.file.Close(); err != nil {
		return err
	}
	for index := 1; index < logFileCount; index += 1 {
		_ = os.Remove(fmt.Sprintf("%s.%d", s.path, index))
	}
	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	s.file = file
	s.size = 0
	return nil
}

func (s *fileLogSink) ReadLastLines(limit int) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var lines []string
	for _, path := range s.logPathsLocked() {
		data, err := os.ReadFile(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, err
		}
		chunk := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
		if len(chunk) == 1 && chunk[0] == "" {
			continue
		}
		lines = append(lines, chunk...)
		if len(lines) > limit {
			lines = lines[len(lines)-limit:]
		}
	}
	return lines, nil
}

func (s *fileLogSink) rotateLocked() error {
	if err := s.file.Close(); err != nil {
		return err
	}
	lastBackup := fmt.Sprintf("%s.%d", s.path, logFileCount-1)
	_ = os.Remove(lastBackup)
	for index := logFileCount - 2; index >= 1; index -= 1 {
		olderPath := fmt.Sprintf("%s.%d", s.path, index)
		newerPath := fmt.Sprintf("%s.%d", s.path, index+1)
		if err := os.Rename(olderPath, newerPath); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	if err := os.Rename(s.path, fmt.Sprintf("%s.1", s.path)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	s.file = file
	s.size = 0
	return nil
}

func (s *fileLogSink) logPathsLocked() []string {
	paths := make([]string, 0, logFileCount)
	for index := logFileCount - 1; index >= 1; index -= 1 {
		paths = append(paths, fmt.Sprintf("%s.%d", s.path, index))
	}
	paths = append(paths, s.path)
	return paths
}

type agentController struct {
	mu                sync.RWMutex
	cfg               config
	auth              panelAuthState
	runtime           runtimeState
	sessions          map[string]panelSession
	controlClient     *http.Client
	transferClient    *http.Client
	logSink           *fileLogSink
	httpServer        *http.Server
	jobLoopActive     bool
	resumeMigrationID string
}

func newAgentController(cfg config) (*agentController, error) {
	logSink, err := newFileLogSink(cfg.logFile)
	if err != nil {
		return nil, err
	}
	log.SetOutput(io.MultiWriter(os.Stdout, logSink))
	log.SetFlags(log.LstdFlags)

	controller := &agentController{
		cfg:            cfg,
		sessions:       make(map[string]panelSession),
		controlClient:  &http.Client{Timeout: 60 * time.Second},
		transferClient: &http.Client{},
		logSink:        logSink,
		runtime: runtimeState{
			Mode:        "setup-required",
			PendingJobs: []runtimeJob{},
			RecentJobs:  []runtimeJob{},
		},
	}
	if err := loadJSONFile(cfg.authFile, &controller.auth); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := loadJSONFile(cfg.runtimeFile, &controller.runtime); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	controller.cleanupExpiredSessionsLocked(time.Now().UTC())
	if controller.runtime.PendingJobs == nil {
		controller.runtime.PendingJobs = []runtimeJob{}
	}
	if controller.runtime.RecentJobs == nil {
		controller.runtime.RecentJobs = []runtimeJob{}
	}
	if controller.passwordConfiguredLocked() {
		controller.auth.BootstrapHash = ""
		controller.auth.BootstrapSalt = ""
		controller.auth.BootstrapIssuedAt = nil
	} else {
		secret, secretErr := controller.issueBootstrapSecretLocked()
		if secretErr != nil {
			return nil, secretErr
		}
		log.Printf("panel bootstrap secret=%s", secret)
	}
	controller.reconcileMigrationLocked()
	if controller.runtime.Migration.Phase == "waiting_for_idle" || controller.runtime.Migration.Phase == "copying" {
		controller.resumeMigrationID = controller.runtime.Migration.ID
	}
	controller.refreshModeLocked()
	if err := controller.persistAuthLocked(); err != nil {
		return nil, err
	}
	if err := controller.persistRuntimeLocked(); err != nil {
		return nil, err
	}
	return controller, nil
}

func (c *agentController) Close() error {
	if c.logSink != nil {
		return c.logSink.Close()
	}
	return nil
}

func (c *agentController) Run(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", c.handleRoot)
	mux.HandleFunc("/auth/bootstrap", c.handleBootstrapLogin)
	mux.HandleFunc("/auth/set-password", c.handleSetPassword)
	mux.HandleFunc("/auth/login", c.handlePasswordLogin)
	mux.HandleFunc("/auth/logout", c.handleLogout)
	mux.HandleFunc("/setup", c.handleSetupSubmit)
	mux.HandleFunc("/actions/maintenance", c.handleMaintenanceToggle)
	mux.HandleFunc("/actions/unbind", c.handleUnbind)
	mux.HandleFunc("/actions/clear", c.handleClearLocalData)
	mux.HandleFunc("/actions/migration/start", c.handleStartMigration)

	server := &http.Server{
		Addr:    c.cfg.panelAddr,
		Handler: mux,
	}
	c.httpServer = server

	errCh := make(chan error, 1)
	go func() {
		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	go c.workerLoop(ctx)
	if c.resumeMigrationID != "" {
		go c.runMigration(c.resumeMigrationID)
	}

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

func (c *agentController) workerLoop(ctx context.Context) {
	heartbeatTicker := time.NewTicker(c.cfg.heartbeatInterval)
	jobRetryTicker := time.NewTicker(time.Second)
	jobResults := make(chan error, 1)
	defer heartbeatTicker.Stop()
	defer jobRetryTicker.Stop()
	c.maybeStartJobRun(ctx, jobResults)

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-jobResults:
			c.finishJobRun(err)
			if err == nil {
				c.maybeStartJobRun(ctx, jobResults)
			}
		case <-heartbeatTicker.C:
			cfg, should := c.snapshotConfigForHeartbeat()
			if !should {
				continue
			}
			if err := heartbeat(ctx, c.controlClient, cfg); err != nil {
				c.recordHeartbeat(storageCapacity{}, err)
				log.Printf("heartbeat failed: %v", err)
				continue
			}
			capacity, capErr := detectStorageCapacity(cfg.libraryRoot)
			c.recordHeartbeat(capacity, capErr)
		case <-jobRetryTicker.C:
			c.maybeStartJobRun(ctx, jobResults)
		}
	}
}

func (c *agentController) maybeStartJobRun(ctx context.Context, jobResults chan<- error) {
	cfg, should := c.snapshotConfigForJobs()
	if !should {
		return
	}
	go func(snapshot config) {
		jobResults <- processJobs(ctx, c.controlClient, c.transferClient, snapshot, c)
	}(cfg)
}

func (c *agentController) snapshotConfigForHeartbeat() (config, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cleanupExpiredSessionsLocked(time.Now().UTC())
	if c.cfg.apiBaseURL == "" || c.cfg.nodeID == "" || c.cfg.nodeToken == "" {
		c.refreshModeLocked()
		return config{}, false
	}
	return c.cfg, true
}

func (c *agentController) snapshotConfigForJobs() (config, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cfg.apiBaseURL == "" || c.cfg.nodeID == "" || c.cfg.nodeToken == "" {
		c.refreshModeLocked()
		return config{}, false
	}
	if c.runtime.Maintenance || c.runtime.Migration.Phase == "waiting_for_idle" || c.runtime.Migration.Phase == "copying" || c.runtime.Migration.Phase == "awaiting_cutover" {
		c.refreshModeLocked()
		return config{}, false
	}
	if c.runtime.CurrentJob != nil {
		return config{}, false
	}
	if c.jobLoopActive {
		return config{}, false
	}
	c.jobLoopActive = true
	return c.cfg, true
}

func (c *agentController) onPendingJobs(items []job) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.runtime.PendingJobs = make([]runtimeJob, 0, len(items))
	for _, item := range items {
		c.runtime.PendingJobs = append(c.runtime.PendingJobs, runtimeJob{
			ID:        item.ID,
			MediaID:   item.MediaID,
			FileName:  item.FileName,
			MediaType: item.MediaType,
			Status:    "pending",
		})
	}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
}

func (c *agentController) onJobStart(item job, remaining []job) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().UTC()
	c.runtime.CurrentJob = &runtimeJob{
		ID:        item.ID,
		MediaID:   item.MediaID,
		FileName:  item.FileName,
		MediaType: item.MediaType,
		Status:    "running",
		Stage:     "starting",
		StartedAt: &now,
	}
	c.runtime.PendingJobs = make([]runtimeJob, 0, len(remaining))
	for _, pending := range remaining {
		c.runtime.PendingJobs = append(c.runtime.PendingJobs, runtimeJob{
			ID:        pending.ID,
			MediaID:   pending.MediaID,
			FileName:  pending.FileName,
			MediaType: pending.MediaType,
			Status:    "pending",
		})
	}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
}

func (c *agentController) onJobStage(stage string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.runtime.CurrentJob != nil {
		c.runtime.CurrentJob.Stage = stage
	}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
}

func (c *agentController) finishJobRun(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.jobLoopActive = false
	if err != nil {
		c.runtime.LastError = err.Error()
		if c.runtime.CurrentJob != nil {
			now := time.Now().UTC()
			c.runtime.CurrentJob.Status = "failed"
			c.runtime.CurrentJob.Error = err.Error()
			c.runtime.CurrentJob.FinishedAt = &now
			c.prependRecentJobLocked(*c.runtime.CurrentJob)
			c.runtime.CurrentJob = nil
		}
	} else {
		c.runtime.LastError = ""
	}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
}

func (c *agentController) allowJobStart() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.cfg.apiBaseURL == "" || c.cfg.nodeID == "" || c.cfg.nodeToken == "" {
		return false
	}
	if c.runtime.Maintenance {
		return false
	}
	switch c.runtime.Migration.Phase {
	case "waiting_for_idle", "copying", "awaiting_cutover":
		return false
	default:
		return true
	}
}

func (c *agentController) onJobCompleted(report processingReport) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().UTC()
	if c.runtime.CurrentJob != nil {
		c.runtime.CurrentJob.Status = "completed"
		c.runtime.CurrentJob.Stage = "done"
		c.runtime.CurrentJob.FinishedAt = &now
		c.prependRecentJobLocked(*c.runtime.CurrentJob)
		c.runtime.CurrentJob = nil
	}
	c.runtime.LastError = ""
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
}

func (c *agentController) prependRecentJobLocked(item runtimeJob) {
	c.runtime.RecentJobs = append([]runtimeJob{item}, c.runtime.RecentJobs...)
	if len(c.runtime.RecentJobs) > recentJobLimit {
		c.runtime.RecentJobs = c.runtime.RecentJobs[:recentJobLimit]
	}
}

func (c *agentController) recordHeartbeat(capacity storageCapacity, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().UTC()
	if err != nil {
		c.runtime.LastHeartbeatErr = err.Error()
	} else {
		c.runtime.LastHeartbeatAt = &now
		c.runtime.LastHeartbeatErr = ""
		c.runtime.Capacity = capacity
	}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
}

func (c *agentController) refreshModeLocked() {
	switch {
	case c.runtime.Migration.Phase == "copying" || c.runtime.Migration.Phase == "waiting_for_idle" || c.runtime.Migration.Phase == "awaiting_cutover":
		c.runtime.Mode = "maintenance"
	case c.runtime.Maintenance:
		c.runtime.Mode = "maintenance"
	case c.cfg.nodeID == "" || c.cfg.nodeToken == "":
		if c.setupRequiredLocked() {
			c.runtime.Mode = "setup-required"
		} else {
			c.runtime.Mode = "unbound"
		}
	case c.runtime.CurrentJob != nil || len(c.runtime.PendingJobs) > 0:
		c.runtime.Mode = "running"
	default:
		c.runtime.Mode = "running"
	}
}

func (c *agentController) setupRequiredLocked() bool {
	return strings.TrimSpace(c.cfg.apiBaseURL) == "" || strings.TrimSpace(c.cfg.nodeName) == "" || strings.TrimSpace(c.cfg.libraryRoot) == "" || (c.cfg.nodeID == "" && c.cfg.nodeToken == "")
}

func (c *agentController) passwordConfiguredLocked() bool {
	return strings.TrimSpace(c.auth.PasswordHash) != "" && strings.TrimSpace(c.auth.PasswordSalt) != ""
}

func (c *agentController) issueBootstrapSecretLocked() (string, error) {
	secret, err := randomSecret(24)
	if err != nil {
		return "", err
	}
	salt, err := randomSecret(16)
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	c.auth.BootstrapSalt = salt
	c.auth.BootstrapHash = hashSecret(salt, secret)
	c.auth.BootstrapIssuedAt = &now
	if err := c.persistAuthLocked(); err != nil {
		return "", err
	}
	return secret, nil
}

func (c *agentController) persistAuthLocked() error {
	return saveJSONFile(c.cfg.authFile, c.auth)
}

func (c *agentController) persistRuntimeLocked() error {
	return saveJSONFile(c.cfg.runtimeFile, c.runtime)
}

func loadJSONFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return json.NewDecoder(file).Decode(target)
}

func saveJSONFile(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmpPath := path + ".tmp"
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmpPath, append(body, '\n'), 0o644); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func (c *agentController) cleanupExpiredSessionsLocked(now time.Time) {
	for token, session := range c.sessions {
		if now.After(session.ExpiresAt) {
			delete(c.sessions, token)
		}
	}
}

func (c *agentController) createSession(bootstrap bool) (string, error) {
	token, err := randomSecret(32)
	if err != nil {
		return "", err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now().UTC()
	c.sessions[token] = panelSession{
		Token:      token,
		Bootstrap:  bootstrap,
		LastSeenAt: now,
		ExpiresAt:  now.Add(panelSessionTTL),
	}
	return token, nil
}

func (c *agentController) currentSession(r *http.Request) (panelSession, bool) {
	cookie, err := r.Cookie(panelSessionCookieName)
	if err != nil {
		return panelSession{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	session, ok := c.sessions[cookie.Value]
	if !ok {
		return panelSession{}, false
	}
	now := time.Now().UTC()
	if now.After(session.ExpiresAt) {
		delete(c.sessions, cookie.Value)
		return panelSession{}, false
	}
	session.LastSeenAt = now
	session.ExpiresAt = now.Add(panelSessionTTL)
	c.sessions[cookie.Value] = session
	return session, true
}

func (c *agentController) destroySession(r *http.Request) {
	cookie, err := r.Cookie(panelSessionCookieName)
	if err != nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.sessions, cookie.Value)
}

func (c *agentController) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     panelSessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().UTC().Add(panelSessionTTL),
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     panelSessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func randomSecret(byteLength int) (string, error) {
	buffer := make([]byte, byteLength)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func hashSecret(salt, secret string) string {
	sum := sha256.Sum256([]byte(salt + ":" + secret))
	return base64.RawStdEncoding.EncodeToString(sum[:])
}

func verifySecret(salt, hashValue, raw string) bool {
	if salt == "" || hashValue == "" || raw == "" {
		return false
	}
	computed := hashSecret(salt, raw)
	return subtle.ConstantTimeCompare([]byte(computed), []byte(hashValue)) == 1
}

func (c *agentController) renderPage(w http.ResponseWriter, r *http.Request) {
	session, authenticated := c.currentSession(r)
	c.mu.RLock()
	defer c.mu.RUnlock()

	passwordConfigured := c.passwordConfiguredLocked()
	setupRequired := c.setupRequiredLocked()
	bound := c.cfg.nodeID != "" && c.cfg.nodeToken != ""
	authenticatedPasswordSession := authenticated && !session.Bootstrap
	lines, _ := c.logSink.ReadLastLines(logTailLineCount)
	data := panelPageData{
		Authenticated:      authenticatedPasswordSession,
		BootstrapSession:   authenticated && session.Bootstrap,
		PasswordConfigured: passwordConfigured,
		SetupRequired:      setupRequired,
		ShowSetupOnly:      authenticatedPasswordSession && !bound,
		Bound:              bound,
		AutoRefresh:        authenticatedPasswordSession && bound,
		Notice:             strings.TrimSpace(r.URL.Query().Get("notice")),
		NoticeKind:         strings.TrimSpace(r.URL.Query().Get("kind")),
		Config: panelConfigData{
			APIBaseURL:        c.cfg.apiBaseURL,
			NodeName:          c.cfg.nodeName,
			PairingCode:       c.cfg.pairingCode,
			HeartbeatInterval: c.cfg.heartbeatInterval.String(),
			JobTimeout:        c.cfg.jobTimeout.String(),
			LibraryRoot:       c.cfg.libraryRoot,
			PanelAddr:         c.cfg.panelAddr,
			MigrationTarget:   c.cfg.migrationTarget,
			NodeID:            c.cfg.nodeID,
		},
		Runtime:       c.runtime,
		LogLines:      lines,
		TargetMounted: isMountedPath(c.cfg.migrationTarget),
	}
	if data.NoticeKind == "" && data.Notice != "" {
		data.NoticeKind = "info"
	}
	if err := panelTemplate.Execute(w, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (c *agentController) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c.renderPage(w, r)
}

func (c *agentController) handleBootstrapLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		redirectWithNotice(w, r, "error", "表单解析失败。")
		return
	}
	secret := strings.TrimSpace(r.FormValue("secret"))
	c.mu.RLock()
	valid := !c.passwordConfiguredLocked() && verifySecret(c.auth.BootstrapSalt, c.auth.BootstrapHash, secret)
	c.mu.RUnlock()
	if !valid {
		redirectWithNotice(w, r, "error", "临时密钥不正确。")
		return
	}
	token, err := c.createSession(true)
	if err != nil {
		redirectWithNotice(w, r, "error", "创建登录会话失败。")
		return
	}
	c.setSessionCookie(w, token)
	redirectWithNotice(w, r, "success", "验证成功，请先设置本地管理密码。")
}

func (c *agentController) handleSetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	session, ok := c.currentSession(r)
	if !ok || !session.Bootstrap {
		redirectWithNotice(w, r, "error", "请先使用日志中的临时密钥登录。")
		return
	}
	if err := r.ParseForm(); err != nil {
		redirectWithNotice(w, r, "error", "表单解析失败。")
		return
	}
	password := strings.TrimSpace(r.FormValue("password"))
	if len(password) < 8 {
		redirectWithNotice(w, r, "error", "管理密码至少 8 位。")
		return
	}
	salt, err := randomSecret(16)
	if err != nil {
		redirectWithNotice(w, r, "error", "生成密码摘要失败。")
		return
	}
	now := time.Now().UTC()
	c.mu.Lock()
	c.auth.PasswordSalt = salt
	c.auth.PasswordHash = hashSecret(salt, password)
	c.auth.PasswordSetAt = &now
	c.auth.BootstrapSalt = ""
	c.auth.BootstrapHash = ""
	c.auth.BootstrapIssuedAt = nil
	if err := c.persistAuthLocked(); err != nil {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "保存密码失败。")
		return
	}
	c.mu.Unlock()
	token, err := c.createSession(false)
	if err != nil {
		redirectWithNotice(w, r, "error", "创建登录会话失败。")
		return
	}
	c.setSessionCookie(w, token)
	redirectWithNotice(w, r, "success", "本地管理密码已设置。")
}

func (c *agentController) handlePasswordLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		redirectWithNotice(w, r, "error", "表单解析失败。")
		return
	}
	password := strings.TrimSpace(r.FormValue("password"))
	c.mu.RLock()
	valid := c.passwordConfiguredLocked() && verifySecret(c.auth.PasswordSalt, c.auth.PasswordHash, password)
	c.mu.RUnlock()
	if !valid {
		redirectWithNotice(w, r, "error", "管理密码不正确。")
		return
	}
	token, err := c.createSession(false)
	if err != nil {
		redirectWithNotice(w, r, "error", "创建登录会话失败。")
		return
	}
	c.setSessionCookie(w, token)
	redirectWithNotice(w, r, "success", "已登录本地控制台。")
}

func (c *agentController) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c.destroySession(r)
	clearSessionCookie(w)
	redirectWithNotice(w, r, "success", "已退出登录。")
}

func (c *agentController) requirePasswordSession(w http.ResponseWriter, r *http.Request) bool {
	session, ok := c.currentSession(r)
	if !ok || session.Bootstrap {
		redirectWithNotice(w, r, "error", "请先登录本地控制台。")
		return false
	}
	return true
}

func (c *agentController) handleSetupSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !c.requirePasswordSession(w, r) {
		return
	}
	if err := r.ParseForm(); err != nil {
		redirectWithNotice(w, r, "error", "表单解析失败。")
		return
	}
	apiBaseURL := strings.TrimRight(strings.TrimSpace(r.FormValue("apiBaseURL")), "/")
	nodeName := strings.TrimSpace(r.FormValue("nodeName"))
	pairingCode := strings.TrimSpace(r.FormValue("pairingCode"))
	heartbeatValue := strings.TrimSpace(r.FormValue("heartbeatInterval"))
	jobTimeoutValue := strings.TrimSpace(r.FormValue("jobTimeout"))
	if apiBaseURL == "" || nodeName == "" || pairingCode == "" {
		redirectWithNotice(w, r, "error", "API 地址、节点名称和配对码都必填。")
		return
	}
	c.mu.RLock()
	heartbeatInterval := c.cfg.heartbeatInterval
	jobTimeout := c.cfg.jobTimeout
	c.mu.RUnlock()
	if heartbeatValue != "" {
		parsed, err := time.ParseDuration(heartbeatValue)
		if err != nil {
			redirectWithNotice(w, r, "error", "心跳间隔格式不正确。")
			return
		}
		heartbeatInterval = parsed
	}
	if jobTimeoutValue != "" {
		parsed, err := time.ParseDuration(jobTimeoutValue)
		if err != nil {
			redirectWithNotice(w, r, "error", "任务超时格式不正确。")
			return
		}
		jobTimeout = parsed
	}

	c.mu.Lock()
	if c.cfg.nodeID != "" || c.cfg.nodeToken != "" {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "当前节点已经绑定，如需重新接入请先解绑。")
		return
	}
	c.cfg.apiBaseURL = apiBaseURL
	c.cfg.nodeName = nodeName
	c.cfg.pairingCode = pairingCode
	c.cfg.heartbeatInterval = heartbeatInterval
	c.cfg.jobTimeout = jobTimeout
	if err := savePersistentConfig(c.cfg.configFile, persistentConfig{
		APIBaseURL:        c.cfg.apiBaseURL,
		NodeName:          c.cfg.nodeName,
		PairingCode:       c.cfg.pairingCode,
		HeartbeatInterval: c.cfg.heartbeatInterval.String(),
		JobTimeout:        c.cfg.jobTimeout.String(),
		LibraryRoot:       c.cfg.libraryRoot,
	}); err != nil {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "保存配置失败。")
		return
	}
	cfgSnapshot := c.cfg
	c.mu.Unlock()

	nextCfg, err := registerNode(r.Context(), c.controlClient, cfgSnapshot)
	if err != nil {
		log.Printf("bind failed: %v", err)
		redirectWithNotice(w, r, "error", fmt.Sprintf("绑定失败：%v", err))
		return
	}
	c.mu.Lock()
	c.cfg = nextCfg
	c.cfg.configDir = filepath.Dir(c.cfg.configFile)
	c.cfg.stateFile = filepath.Join(c.cfg.configDir, "node-state.json")
	c.cfg.authFile = filepath.Join(c.cfg.configDir, "panel-auth.json")
	c.cfg.runtimeFile = filepath.Join(c.cfg.configDir, "runtime.json")
	c.cfg.logFile = filepath.Join(c.cfg.configDir, "agent.log")
	c.runtime.LastError = ""
	c.runtime.PendingJobs = []runtimeJob{}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()
	redirectWithNotice(w, r, "success", "绑定成功，worker 已恢复运行。")
}

func (c *agentController) handleMaintenanceToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !c.requirePasswordSession(w, r) {
		return
	}
	if err := r.ParseForm(); err != nil {
		redirectWithNotice(w, r, "error", "表单解析失败。")
		return
	}
	enabled := r.FormValue("enabled") == "true"
	c.mu.Lock()
	c.runtime.Maintenance = enabled
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()
	if enabled {
		redirectWithNotice(w, r, "success", "已进入维护模式，暂停领取新任务。")
		return
	}
	redirectWithNotice(w, r, "success", "已退出维护模式。")
}

func (c *agentController) handleUnbind(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !c.requirePasswordSession(w, r) {
		return
	}
	c.mu.Lock()
	if c.cfg.nodeID == "" || c.cfg.nodeToken == "" {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "当前没有已绑定的主节点。")
		return
	}
	if c.runtime.CurrentJob != nil || len(c.runtime.PendingJobs) > 0 {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "当前还有任务正在处理或排队，请先等待队列清空。")
		return
	}
	wasMaintenance := c.runtime.Maintenance
	c.runtime.Maintenance = true
	cfgSnapshot := c.cfg
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()

	err := postJSON(r.Context(), c.controlClient, cfgSnapshot.apiBaseURL+"/api/v1/storage-nodes/unbind", cfgSnapshot.nodeToken, map[string]string{
		"nodeId": cfgSnapshot.nodeID,
	}, nil)
	if err != nil {
		c.mu.Lock()
		c.runtime.Maintenance = wasMaintenance
		c.runtime.LastError = err.Error()
		c.refreshModeLocked()
		_ = c.persistRuntimeLocked()
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", fmt.Sprintf("解绑失败：%v", err))
		return
	}

	c.mu.Lock()
	c.cfg.nodeID = ""
	c.cfg.nodeToken = ""
	c.cfg.pairingCode = ""
	c.runtime.Maintenance = false
	c.runtime.PendingJobs = []runtimeJob{}
	c.runtime.CurrentJob = nil
	c.runtime.LastError = ""
	c.refreshModeLocked()
	_ = os.Remove(c.cfg.stateFile)
	_ = savePersistentConfig(c.cfg.configFile, persistentConfig{
		APIBaseURL:        c.cfg.apiBaseURL,
		NodeName:          c.cfg.nodeName,
		PairingCode:       "",
		HeartbeatInterval: c.cfg.heartbeatInterval.String(),
		JobTimeout:        c.cfg.jobTimeout.String(),
		LibraryRoot:       c.cfg.libraryRoot,
	})
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()
	redirectWithNotice(w, r, "success", "当前 NAS 已从云端解绑，本地媒体仍然保留。")
}

func (c *agentController) handleClearLocalData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !c.requirePasswordSession(w, r) {
		return
	}
	c.mu.Lock()
	if c.cfg.nodeID != "" || c.cfg.nodeToken != "" {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "请先解绑当前主节点，再清空本地资料。")
		return
	}
	if c.runtime.CurrentJob != nil {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "当前仍有任务在运行。")
		return
	}
	c.mu.Unlock()

	if err := clearDirectoryContents(c.cfg.libraryRoot); err != nil {
		redirectWithNotice(w, r, "error", fmt.Sprintf("清空媒体库失败：%v", err))
		return
	}
	if err := c.logSink.Reset(); err != nil {
		redirectWithNotice(w, r, "error", fmt.Sprintf("重置日志失败：%v", err))
		return
	}

	c.mu.Lock()
	c.runtime = runtimeState{
		Mode:        "unbound",
		PendingJobs: []runtimeJob{},
		RecentJobs:  []runtimeJob{},
	}
	c.refreshModeLocked()
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()
	redirectWithNotice(w, r, "success", "本地媒体、运行记录和日志已清空。")
}

func (c *agentController) handleStartMigration(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !c.requirePasswordSession(w, r) {
		return
	}
	c.mu.Lock()
	if c.runtime.Migration.Phase == "waiting_for_idle" || c.runtime.Migration.Phase == "copying" || c.runtime.Migration.Phase == "awaiting_cutover" {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "当前已经有未完成的迁移流程。")
		return
	}
	if !isMountedPath(c.cfg.migrationTarget) {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "目标挂载路径未检测到独立挂载，请先用 migration compose 挂载新盘。")
		return
	}
	if samePath(c.cfg.libraryRoot, c.cfg.migrationTarget) {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "目标路径不能和当前媒体库相同。")
		return
	}
	id, err := randomSecret(12)
	if err != nil {
		c.mu.Unlock()
		redirectWithNotice(w, r, "error", "生成迁移任务失败。")
		return
	}
	now := time.Now().UTC()
	c.runtime.Maintenance = true
	c.runtime.Migration = migrationState{
		ID:             id,
		Phase:          "waiting_for_idle",
		SourceRoot:     c.cfg.libraryRoot,
		TargetRoot:     c.cfg.migrationTarget,
		StartedAt:      &now,
		MaintenanceSet: true,
	}
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()

	go c.runMigration(id)
	redirectWithNotice(w, r, "success", "迁移已开始，agent 已进入维护模式并等待当前任务结束。")
}

func (c *agentController) runMigration(id string) {
	var sourceRoot string
	var targetRoot string
	for {
		time.Sleep(800 * time.Millisecond)
		c.mu.RLock()
		current := c.runtime.CurrentJob
		phase := c.runtime.Migration.Phase
		sourceRoot = c.runtime.Migration.SourceRoot
		targetRoot = c.runtime.Migration.TargetRoot
		c.mu.RUnlock()
		if phase != "waiting_for_idle" && phase != "copying" {
			return
		}
		if current != nil {
			continue
		}
		break
	}

	c.mu.Lock()
	if c.runtime.Migration.ID != id {
		c.mu.Unlock()
		return
	}
	c.runtime.Migration.Phase = "copying"
	c.runtime.Migration.Error = ""
	_ = c.persistRuntimeLocked()
	c.mu.Unlock()

	stats, err := scanDirectory(sourceRoot)
	if err == nil {
		c.mu.Lock()
		if c.runtime.Migration.ID == id {
			c.runtime.Migration.TotalFiles = stats.FileCount
			c.runtime.Migration.TotalBytes = stats.TotalBytes
			_ = c.persistRuntimeLocked()
		}
		c.mu.Unlock()
	}

	copyErr := filepath.WalkDir(sourceRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		if relative == "." {
			return nil
		}
		targetPath := filepath.Join(targetRoot, relative)
		if entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			return os.MkdirAll(targetPath, info.Mode())
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if skip, err := shouldSkipCopy(path, targetPath, info); err == nil && skip {
			c.mu.Lock()
			if c.runtime.Migration.ID == id {
				c.runtime.Migration.CopiedFiles += 1
				c.runtime.Migration.CopiedBytes += info.Size()
				c.runtime.Migration.CurrentPath = relative
				_ = c.persistRuntimeLocked()
			}
			c.mu.Unlock()
			return nil
		}
		if err := copyFileWithTemp(path, targetPath, info); err != nil {
			return err
		}
		c.mu.Lock()
		if c.runtime.Migration.ID == id {
			c.runtime.Migration.CopiedFiles += 1
			c.runtime.Migration.CopiedBytes += info.Size()
			c.runtime.Migration.CurrentPath = relative
			_ = c.persistRuntimeLocked()
		}
		c.mu.Unlock()
		return nil
	})
	if copyErr != nil {
		c.mu.Lock()
		if c.runtime.Migration.ID == id {
			c.runtime.Migration.Error = copyErr.Error()
			c.runtime.Migration.Phase = "failed"
			c.runtime.LastError = copyErr.Error()
			_ = c.persistRuntimeLocked()
		}
		c.mu.Unlock()
		log.Printf("migration failed: %v", copyErr)
		return
	}

	targetStats, err := scanDirectory(targetRoot)
	if err != nil {
		c.mu.Lock()
		if c.runtime.Migration.ID == id {
			c.runtime.Migration.Error = err.Error()
			c.runtime.Migration.Phase = "failed"
			c.runtime.LastError = err.Error()
			_ = c.persistRuntimeLocked()
		}
		c.mu.Unlock()
		log.Printf("migration verification failed: %v", err)
		return
	}

	c.mu.Lock()
	if c.runtime.Migration.ID == id {
		c.runtime.Migration.VerifiedFiles = targetStats.FileCount
		c.runtime.Migration.VerifiedBytes = targetStats.TotalBytes
	}
	c.mu.Unlock()

	if stats.FileCount != targetStats.FileCount || stats.TotalBytes != targetStats.TotalBytes {
		err = fmt.Errorf("target verification mismatch: source=%d files/%d bytes target=%d files/%d bytes", stats.FileCount, stats.TotalBytes, targetStats.FileCount, targetStats.TotalBytes)
		c.mu.Lock()
		if c.runtime.Migration.ID == id {
			c.runtime.Migration.Error = err.Error()
			c.runtime.Migration.Phase = "failed"
			c.runtime.LastError = err.Error()
			_ = c.persistRuntimeLocked()
		}
		c.mu.Unlock()
		log.Printf("migration verification failed: %v", err)
		return
	}

	completedAt := time.Now().UTC()
	if err := saveJSONFile(filepath.Join(targetRoot, migrationMarkerName), migrationMarker{ID: id, CompletedAt: completedAt}); err != nil {
		c.mu.Lock()
		if c.runtime.Migration.ID == id {
			c.runtime.Migration.Error = err.Error()
			c.runtime.Migration.Phase = "failed"
			c.runtime.LastError = err.Error()
			_ = c.persistRuntimeLocked()
		}
		c.mu.Unlock()
		log.Printf("migration marker write failed: %v", err)
		return
	}

	c.mu.Lock()
	if c.runtime.Migration.ID == id {
		c.runtime.Migration.Phase = "awaiting_cutover"
		c.runtime.Migration.CompletedAt = &completedAt
		c.runtime.Migration.Error = ""
		c.runtime.LastError = ""
		_ = c.persistRuntimeLocked()
	}
	c.mu.Unlock()
	log.Printf("migration completed id=%s source=%s target=%s awaiting_cutover=true", id, sourceRoot, targetRoot)
}

func (c *agentController) reconcileMigrationLocked() {
	if c.runtime.Migration.Phase == "awaiting_cutover" {
		var marker migrationMarker
		if err := loadJSONFile(filepath.Join(c.cfg.libraryRoot, migrationMarkerName), &marker); err == nil && marker.ID == c.runtime.Migration.ID {
			c.runtime.Migration = migrationState{}
			c.runtime.Maintenance = false
			c.runtime.LastError = ""
			_ = os.Remove(filepath.Join(c.cfg.libraryRoot, migrationMarkerName))
		}
	}
	if c.runtime.Migration.Phase == "waiting_for_idle" || c.runtime.Migration.Phase == "copying" {
		c.runtime.Maintenance = true
	}
}

type directoryStats struct {
	FileCount  int
	TotalBytes int64
}

func scanDirectory(root string) (directoryStats, error) {
	stats := directoryStats{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			if errors.Is(walkErr, os.ErrNotExist) {
				return nil
			}
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if filepath.Base(path) == migrationMarkerName {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		stats.FileCount += 1
		stats.TotalBytes += info.Size()
		return nil
	})
	return stats, err
}

func shouldSkipCopy(sourcePath, targetPath string, sourceInfo os.FileInfo) (bool, error) {
	targetInfo, err := os.Stat(targetPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if targetInfo.IsDir() {
		return false, nil
	}
	return targetInfo.Size() == sourceInfo.Size() && targetInfo.ModTime().UTC().Equal(sourceInfo.ModTime().UTC()), nil
}

func copyFileWithTemp(sourcePath, targetPath string, sourceInfo os.FileInfo) error {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	tmpPath := targetPath + ".part"
	in, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(tmpPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, sourceInfo.Mode()); err != nil {
		return err
	}
	if err := os.Chtimes(tmpPath, sourceInfo.ModTime(), sourceInfo.ModTime()); err != nil {
		return err
	}
	return os.Rename(tmpPath, targetPath)
}

func clearDirectoryContents(root string) error {
	entries, err := os.ReadDir(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if err := os.RemoveAll(filepath.Join(root, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func samePath(left, right string) bool {
	if left == "" || right == "" {
		return false
	}
	leftClean, leftErr := filepath.Abs(left)
	rightClean, rightErr := filepath.Abs(right)
	if leftErr != nil || rightErr != nil {
		return left == right
	}
	return leftClean == rightClean
}

func isMountedPath(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	data, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		return false
	}
	cleanPath := filepath.Clean(path)
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 5 && fields[4] == cleanPath {
			return true
		}
	}
	return false
}

func redirectWithNotice(w http.ResponseWriter, r *http.Request, kind, notice string) {
	values := url.Values{}
	values.Set("kind", kind)
	values.Set("notice", notice)
	http.Redirect(w, r, "/?"+values.Encode(), http.StatusSeeOther)
}

type panelConfigData struct {
	APIBaseURL        string
	NodeName          string
	PairingCode       string
	HeartbeatInterval string
	JobTimeout        string
	LibraryRoot       string
	PanelAddr         string
	MigrationTarget   string
	NodeID            string
}

type panelPageData struct {
	Authenticated      bool
	BootstrapSession   bool
	PasswordConfigured bool
	SetupRequired      bool
	ShowSetupOnly      bool
	Bound              bool
	AutoRefresh        bool
	Notice             string
	NoticeKind         string
	Config             panelConfigData
	Runtime            runtimeState
	LogLines           []string
	TargetMounted      bool
}

var panelTemplate = template.Must(template.New("panel").Funcs(template.FuncMap{
	"fmtBytes": func(value int64) string {
		const unit = 1024
		if value < unit {
			return fmt.Sprintf("%d B", value)
		}
		div, exp := int64(unit), 0
		for n := value / unit; n >= unit; n /= unit {
			div *= unit
			exp++
		}
		return fmt.Sprintf("%.1f %ciB", float64(value)/float64(div), "KMGTPE"[exp])
	},
	"fmtTime": func(value *time.Time) string {
		if value == nil || value.IsZero() {
			return "-"
		}
		return value.Local().Format("2006-01-02 15:04:05")
	},
	"joinLines": func(lines []string) string {
		if len(lines) == 0 {
			return "暂无日志。"
		}
		return strings.Join(lines, "\n")
	},
}).Parse(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  {{if .AutoRefresh}}<meta http-equiv="refresh" content="5" />{{end}}
  <title>Baby Album Agent</title>
  <style>
    body { margin: 0; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background: #f4f6f8; color: #14202b; }
    main { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 16px; }
    .card { background: white; border-radius: 18px; padding: 18px; box-shadow: 0 12px 30px rgba(20,32,43,0.08); }
    h1, h2, h3, p { margin: 0; }
    .stack { display: grid; gap: 12px; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .grid { display: grid; gap: 12px; }
    .grid.two { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .muted { color: #5d6b79; font-size: 0.95rem; }
    .notice { padding: 12px 14px; border-radius: 14px; font-weight: 600; }
    .notice.info { background: #eef4ff; color: #1850a8; }
    .notice.success { background: #ebf9ef; color: #0c7a37; }
    .notice.error { background: #fff0ef; color: #b4382b; }
    input, button { font: inherit; }
    input { width: 100%; padding: 11px 12px; border-radius: 12px; border: 1px solid #cfd8df; box-sizing: border-box; }
    button { border: 0; border-radius: 12px; padding: 11px 14px; background: #0a84ff; color: white; cursor: pointer; }
    button.secondary { background: #eef3f7; color: #1b2b3a; }
    button.warn { background: #d35745; }
    form { display: grid; gap: 10px; }
    code, pre { font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
    pre { margin: 0; background: #0d1520; color: #d7e2ed; border-radius: 14px; padding: 14px; overflow: auto; max-height: 320px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 0; border-bottom: 1px solid #edf1f4; text-align: left; vertical-align: top; }
    .chip { display: inline-flex; padding: 5px 9px; border-radius: 999px; background: #eef4ff; color: #1850a8; font-size: 0.84rem; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <section class="card stack">
      <div class="stack">
        <h1>Baby Album Agent</h1>
        <p class="muted">局域网本地控制面。这个页面用于首次接入、查看队列、日志、解绑以及本地迁移。</p>
      </div>
      {{if .Notice}}<div class="notice {{.NoticeKind}}">{{.Notice}}</div>{{end}}
    </section>

    {{if not .PasswordConfigured}}
      {{if .BootstrapSession}}
        <section class="card stack">
          <h2>设置本地管理密码</h2>
          <p class="muted">首次登录后请先设置一个本地管理密码。以后访问这个局域网页面都使用这个密码登录。</p>
          <form action="/auth/set-password" method="post">
            <label class="stack">
              <span>新密码</span>
              <input name="password" type="password" minlength="8" placeholder="至少 8 位" required />
            </label>
            <button type="submit">保存密码</button>
          </form>
        </section>
      {{else}}
        <section class="card stack">
          <h2>首次登录</h2>
          <p class="muted">请打开容器日志，找到启动时打印的 bootstrap secret，然后输入到下面完成首次验证。</p>
          <form action="/auth/bootstrap" method="post">
            <label class="stack">
              <span>临时密钥</span>
              <input name="secret" type="password" placeholder="从 docker logs 中复制" required />
            </label>
            <button type="submit">验证临时密钥</button>
          </form>
        </section>
      {{end}}
    {{else if not .Authenticated}}
      <section class="card stack">
        <h2>登录本地控制台</h2>
        <form action="/auth/login" method="post">
          <label class="stack">
            <span>管理密码</span>
            <input name="password" type="password" placeholder="输入本地管理密码" required />
          </label>
          <button type="submit">登录</button>
        </form>
      </section>
    {{else if .ShowSetupOnly}}
      <section class="card stack">
        <div class="row" style="justify-content: space-between;">
          <div class="stack">
            <h2>{{if .SetupRequired}}首次 Setup{{else}}重新绑定主控{{end}}</h2>
            <p class="muted">先完成本地控制面的首次配置。这个页面不会自动刷新，填完后再进入主界面。</p>
          </div>
          <form action="/auth/logout" method="post">
            <button class="secondary" type="submit">退出登录</button>
          </form>
        </div>
        <form action="/setup" method="post">
          <label class="stack"><span>API Base URL</span><input name="apiBaseURL" value="{{.Config.APIBaseURL}}" placeholder="https://album-api.example.com" required /></label>
          <label class="stack"><span>Node Name</span><input name="nodeName" value="{{.Config.NodeName}}" placeholder="Living Room NAS" required /></label>
          <label class="stack"><span>Pairing Code</span><input name="pairingCode" value="{{.Config.PairingCode}}" placeholder="12 位配对码" required /></label>
          <details class="stack" style="border:1px solid #edf1f4; border-radius:14px; padding:12px 14px;">
            <summary style="cursor:pointer; font-weight:600;">高级设置（可选）</summary>
            <div class="grid two" style="margin-top:12px;">
              <label class="stack"><span>Heartbeat Interval</span><input name="heartbeatInterval" value="{{.Config.HeartbeatInterval}}" placeholder="15s" /></label>
              <label class="stack"><span>Job Timeout</span><input name="jobTimeout" value="{{.Config.JobTimeout}}" placeholder="30m" /></label>
            </div>
          </details>
          <button type="submit">绑定并启动 Worker</button>
        </form>
      </section>
    {{else}}
      <section class="card stack">
        <div class="row" style="justify-content: space-between;">
          <div class="stack">
            <h2>节点状态</h2>
            <p class="muted">模式：<strong>{{.Runtime.Mode}}</strong>{{if .Config.NodeName}} · 节点名称：<strong>{{.Config.NodeName}}</strong>{{end}}{{if .Bound}} · 当前 nodeId：<code>{{.Config.NodeID}}</code>{{end}}</p>
          </div>
          <form action="/auth/logout" method="post">
            <button class="secondary" type="submit">退出登录</button>
          </form>
        </div>
        <div class="grid two">
          <div class="card stack" style="box-shadow:none; border:1px solid #edf1f4;">
            <h3>运行状态</h3>
            <p class="muted">最近心跳：{{fmtTime .Runtime.LastHeartbeatAt}}</p>
            <p class="muted">心跳错误：{{if .Runtime.LastHeartbeatErr}}{{.Runtime.LastHeartbeatErr}}{{else}}-{{end}}</p>
            <p class="muted">可用空间：{{fmtBytes .Runtime.Capacity.AvailableBytes}} / {{fmtBytes .Runtime.Capacity.TotalBytes}}</p>
            <p class="muted">媒体库路径：<code>{{.Config.LibraryRoot}}</code></p>
            <p class="muted">迁移目标路径：<code>{{.Config.MigrationTarget}}</code> {{if .TargetMounted}}<span class="chip">已挂载</span>{{else}}<span class="chip" style="background:#fff0ef;color:#b4382b;">未挂载</span>{{end}}</p>
          </div>
          <div class="card stack" style="box-shadow:none; border:1px solid #edf1f4;">
            <h3>当前任务</h3>
            {{if .Runtime.CurrentJob}}
              <p><strong>{{.Runtime.CurrentJob.FileName}}</strong></p>
              <p class="muted">类型：{{.Runtime.CurrentJob.MediaType}}</p>
              <p class="muted">阶段：{{.Runtime.CurrentJob.Stage}}</p>
              <p class="muted">开始：{{fmtTime .Runtime.CurrentJob.StartedAt}}</p>
            {{else}}
              <p class="muted">当前没有正在执行的任务。</p>
            {{end}}
            <p class="muted">排队任务：{{len .Runtime.PendingJobs}}</p>
          </div>
        </div>
      </section>

      <section class="card stack">
        <h2>任务队列</h2>
        {{if .Runtime.PendingJobs}}
          <table>
            <thead><tr><th>文件</th><th>类型</th><th>状态</th></tr></thead>
            <tbody>
              {{range .Runtime.PendingJobs}}
                <tr><td>{{.FileName}}</td><td>{{.MediaType}}</td><td>{{.Status}}</td></tr>
              {{end}}
            </tbody>
          </table>
        {{else}}
          <p class="muted">当前没有排队任务。</p>
        {{end}}
      </section>

      <section class="card stack">
        <h2>最近任务</h2>
        {{if .Runtime.RecentJobs}}
          <table>
            <thead><tr><th>文件</th><th>结果</th><th>结束时间</th></tr></thead>
            <tbody>
              {{range .Runtime.RecentJobs}}
                <tr>
                  <td>{{.FileName}}</td>
                  <td>{{.Status}}{{if .Error}} · {{.Error}}{{end}}</td>
                  <td>{{fmtTime .FinishedAt}}</td>
                </tr>
              {{end}}
            </tbody>
          </table>
        {{else}}
          <p class="muted">还没有最近任务记录。</p>
        {{end}}
      </section>

      <section class="card stack">
        <h2>日志</h2>
        <pre>{{joinLines .LogLines}}</pre>
      </section>

      <section class="card stack">
        <h2>危险操作</h2>
        <div class="row">
          <form action="/actions/maintenance" method="post">
            <input type="hidden" name="enabled" value="{{if .Runtime.Maintenance}}false{{else}}true{{end}}" />
            <button class="secondary" type="submit">{{if .Runtime.Maintenance}}退出维护模式{{else}}进入维护模式{{end}}</button>
          </form>
          <form action="/actions/unbind" method="post">
            <button class="warn" type="submit">解绑主控</button>
          </form>
          <form action="/actions/clear" method="post">
            <button class="warn" type="submit">一键清空本地资料</button>
          </form>
        </div>
        <p class="muted">解绑主控会从云端移除当前主节点绑定，但保留本地媒体文件。清空资料只会删除本地媒体、日志和运行历史。</p>
      </section>

      <section class="card stack">
        <h2>迁移到新盘</h2>
        <p class="muted">请先用 migration compose 把目标盘临时挂到 <code>{{.Config.MigrationTarget}}</code>，确认页面显示“已挂载”后再开始迁移。迁移会自动进入维护模式，等待当前任务结束后复制媒体文件并做校验。完成后请把正式 library 挂载改到新盘，再重启容器完成切换。</p>
        <form action="/actions/migration/start" method="post">
          <button type="submit">开始迁移到新盘</button>
        </form>
        {{if .Runtime.Migration.Phase}}
          <div class="stack">
            <p class="muted">迁移阶段：<strong>{{.Runtime.Migration.Phase}}</strong></p>
            <p class="muted">源路径：<code>{{.Runtime.Migration.SourceRoot}}</code></p>
            <p class="muted">目标路径：<code>{{.Runtime.Migration.TargetRoot}}</code></p>
            <p class="muted">当前文件：{{if .Runtime.Migration.CurrentPath}}<code>{{.Runtime.Migration.CurrentPath}}</code>{{else}}-{{end}}</p>
            <p class="muted">进度：{{.Runtime.Migration.CopiedFiles}} / {{.Runtime.Migration.TotalFiles}} 个文件，{{fmtBytes .Runtime.Migration.CopiedBytes}} / {{fmtBytes .Runtime.Migration.TotalBytes}}</p>
            <p class="muted">校验：{{.Runtime.Migration.VerifiedFiles}} 个文件，{{fmtBytes .Runtime.Migration.VerifiedBytes}}</p>
            <p class="muted">错误：{{if .Runtime.Migration.Error}}{{.Runtime.Migration.Error}}{{else}}-{{end}}</p>
          </div>
        {{end}}
      </section>
    {{end}}
  </main>
</body>
</html>`))
