package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"babyalbum/api/internal/store"
)

func (s *Server) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		DisplayName string `json:"displayName"`
		Email       string `json:"email"`
		Password    string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	clientAddr := clientIP(r)
	if allowed, retryAfter := s.requestLimits.allow(rateLimitScope("auth-register-ip", clientAddr), 20, time.Minute); !allowed {
		writeRateLimitExceeded(w, retryAfter)
		return
	}
	if allowed, retryAfter := s.requestLimits.allow(rateLimitScope("auth-register-email", strings.ToLower(strings.TrimSpace(input.Email))), 10, time.Minute); !allowed {
		writeRateLimitExceeded(w, retryAfter)
		return
	}
	result, err := s.store.RegisterUser(store.RegisterUserInput{
		DisplayName: input.DisplayName,
		Email:       input.Email,
		Password:    input.Password,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if allowed, retryAfter := s.requestLimits.allow(rateLimitScope("auth-login", clientIP(r), strings.ToLower(strings.TrimSpace(input.Email))), 30, time.Minute); !allowed {
		writeRateLimitExceeded(w, retryAfter)
		return
	}
	result, err := s.store.Login(store.LoginInput{Email: input.Email, Password: input.Password})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	token := bearerToken(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": store.ErrUnauthorized.Error()})
		return
	}
	if err := s.store.RevokeSession(token); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (s *Server) handleAuthApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.AppState(userID, albumID(r))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.decorateAppState(payload))
}
