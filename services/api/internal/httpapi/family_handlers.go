package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

func (s *Server) handleAlbums(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var input struct {
		Name      string  `json:"name"`
		Timezone  string  `json:"timezone"`
		BabyName  string  `json:"babyName"`
		BirthDate *string `json:"birthDate"`
		Relation  string  `json:"relation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	birthDate, err := parseOptionalRFC3339(input.BirthDate, "birthDate")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	album, err := s.store.CreateAlbum(userID, store.CreateAlbumInput{
		Name:      input.Name,
		Timezone:  input.Timezone,
		BabyName:  input.BabyName,
		BirthDate: birthDate,
		Relation:  input.Relation,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, album)
}

func (s *Server) handleAlbumActions(w http.ResponseWriter, r *http.Request) {
	path := trimAPIPrefix(r.URL.Path, "/api/v1/albums/")
	s.handleCollectionActions(w, r, path)
}

func (s *Server) handleFamilyActions(w http.ResponseWriter, r *http.Request) {
	path := trimAPIPrefix(r.URL.Path, "/api/v1/families/")
	s.handleCollectionActions(w, r, path)
}

func (s *Server) handleCollectionActions(w http.ResponseWriter, r *http.Request, path string) {
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	parts := splitPath(path)
	if len(parts) < 2 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	familyID := parts[0]
	switch {
	case len(parts) == 2 && parts[1] == "babies":
		s.handleCreateBaby(w, r, userID, familyID)
	case len(parts) == 3 && parts[1] == "babies":
		s.handleBabyActions(w, r, userID, familyID, parts[2])
	case len(parts) == 4 && parts[1] == "babies" && parts[3] == "avatar":
		s.handleBabyAvatarUpload(w, r, userID, familyID, parts[2])
	case len(parts) == 2 && parts[1] == "leave":
		s.handleLeaveFamily(w, r, userID, familyID)
	case len(parts) == 2 && parts[1] == "storage-pairing":
		s.handleStoragePairing(w, r, userID, familyID)
	case len(parts) == 2 && parts[1] == "invites":
		s.handleFamilyInvites(w, r, userID, familyID)
	case len(parts) == 3 && parts[1] == "duplicate-media" && parts[2] == "probe":
		s.handleDuplicateMediaProbe(w, r, userID, familyID)
	case len(parts) == 3 && parts[1] == "duplicate-media" && parts[2] == "resolve":
		s.handleDuplicateMediaResolve(w, r, userID, familyID)
	case len(parts) == 4 && parts[1] == "members" && parts[3] == "role":
		s.handleMemberRoleUpdate(w, r, userID, familyID, parts[2])
	case len(parts) == 4 && parts[1] == "members" && parts[3] == "relation":
		s.handleMemberRelationUpdate(w, r, userID, familyID, parts[2])
	case len(parts) == 3 && parts[1] == "members":
		s.handleMemberRemoval(w, r, userID, familyID, parts[2])
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleCreateBaby(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Name      string  `json:"name"`
		BirthDate *string `json:"birthDate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	birthDate, err := parseOptionalRFC3339(input.BirthDate, "birthDate")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	baby, err := s.store.CreateBaby(userID, store.CreateBabyInput{
		AlbumID:   familyID,
		Name:      input.Name,
		BirthDate: birthDate,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, s.decorateBaby(baby))
}

func (s *Server) handleBabyActions(w http.ResponseWriter, r *http.Request, userID, familyID, babyID string) {
	switch r.Method {
	case http.MethodDelete:
		if err := s.store.DeleteBaby(userID, familyID, babyID); err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	case http.MethodPost:
		var input struct {
			Name      string  `json:"name"`
			BirthDate *string `json:"birthDate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		birthDate, err := parseOptionalRFC3339(input.BirthDate, "birthDate")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		baby, err := s.store.UpdateBaby(userID, store.UpdateBabyInput{
			AlbumID:   familyID,
			BabyID:    babyID,
			Name:      input.Name,
			BirthDate: birthDate,
		})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, s.decorateBaby(baby))
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *Server) handleBabyAvatarUpload(w http.ResponseWriter, r *http.Request, userID, familyID, babyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	file, header, ok := parseMultipartFile(w, r, s.maxUploadBytes)
	if !ok {
		return
	}
	defer file.Close()
	if s.cacheController != nil {
		if err := s.cacheController.EnsureSpace(header.Size); err != nil {
			status := http.StatusInsufficientStorage
			if !errors.Is(err, errInsufficientLocalStorage) {
				status = http.StatusInternalServerError
			}
			writeLoggedError(r, w, status, err.Error(), "avatar upload rejected", err, map[string]any{
				"baby_id":      babyID,
				"file_name":    header.Filename,
				"file_size":    header.Size,
				"content_type": header.Header.Get("Content-Type"),
			})
			return
		}
	}

	saved, err := s.saveAvatar(babyID, header.Filename, file)
	if err != nil {
		writeLoggedError(r, w, http.StatusInternalServerError, err.Error(), "avatar upload save failed", err, map[string]any{
			"baby_id":   babyID,
			"file_name": header.Filename,
		})
		return
	}
	baby, err := s.store.UpdateBabyAvatar(userID, store.UpdateBabyAvatarInput{
		AlbumID:   familyID,
		BabyID:    babyID,
		AvatarKey: saved.Key,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if s.cacheController != nil {
		s.cacheController.RunNow()
	}
	writeJSON(w, http.StatusOK, s.decorateBaby(baby))
}

func (s *Server) handleLeaveFamily(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		TransferOwnerTo string `json:"transferOwnerTo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if err := s.store.LeaveAlbum(userID, store.LeaveAlbumInput{
		AlbumID:         familyID,
		TransferOwnerTo: input.TransferOwnerTo,
	}); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
}

func (s *Server) handleStoragePairing(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	pairing, err := s.store.CreateStorageNodePairing(userID, store.CreateStorageNodePairingInput{AlbumID: familyID})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, pairing)
}

func (s *Server) handleFamilyInvites(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	switch r.Method {
	case http.MethodGet:
		items, err := s.store.Invites(familyID, userID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		var input map[string]any
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil && !errors.Is(err, io.EOF) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		invite, err := s.store.CreateInvite(userID, store.CreateAlbumInviteInput{AlbumID: familyID})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, invite)
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *Server) handleDuplicateMediaProbe(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Items []struct {
			ClientID string `json:"clientId"`
			ByteSize int64  `json:"byteSize"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	items := make([]store.DuplicateMediaProbeItemInput, 0, len(input.Items))
	for _, item := range input.Items {
		items = append(items, store.DuplicateMediaProbeItemInput{
			ClientID: item.ClientID,
			ByteSize: item.ByteSize,
		})
	}
	result, err := s.store.ProbeDuplicateMedia(userID, store.DuplicateMediaProbeInput{
		AlbumID: familyID,
		Items:   items,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDuplicateMediaResolve(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Items []struct {
			ClientID string `json:"clientId"`
			SHA256   string `json:"sha256"`
		} `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	items := make([]store.DuplicateMediaResolveItemInput, 0, len(input.Items))
	for _, item := range input.Items {
		items = append(items, store.DuplicateMediaResolveItemInput{
			ClientID: item.ClientID,
			SHA256:   item.SHA256,
		})
	}
	result, err := s.store.ResolveDuplicateMedia(userID, store.DuplicateMediaResolveInput{
		AlbumID: familyID,
		Items:   items,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleInviteActions(w http.ResponseWriter, r *http.Request) {
	parts := splitPath(trimAPIPrefix(r.URL.Path, "/api/v1/invites/"))
	if len(parts) < 1 || parts[0] == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	code := parts[0]
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w)
			return
		}
		invite, err := s.store.InviteByCode(code)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, invite)
		return
	}
	if len(parts) == 2 && parts[1] == "accept" {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		userID, err := s.actorID(r)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		var input struct {
			Relation string `json:"relation"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil && !errors.Is(err, io.EOF) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		invite, err := s.store.AcceptInvite(userID, store.AcceptInviteInput{Code: code, Relation: input.Relation})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, invite)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.AlbumWorkspace(albumID(r), userID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) handleMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.Members(albumID(r), userID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": payload})
}

func (s *Server) handleMemberRoleUpdate(w http.ResponseWriter, r *http.Request, userID, familyID, memberUserID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	member, err := s.store.UpdateMemberRole(userID, store.UpdateAlbumMemberRoleInput{
		AlbumID:      familyID,
		MemberUserID: memberUserID,
		Role:         domain.Role(input.Role),
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (s *Server) handleMemberRelationUpdate(w http.ResponseWriter, r *http.Request, userID, familyID, memberUserID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Relation string `json:"relation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	member, err := s.store.UpdateMemberRelation(userID, store.UpdateAlbumMemberRelationInput{
		AlbumID:      familyID,
		MemberUserID: memberUserID,
		Relation:     input.Relation,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (s *Server) handleMemberRemoval(w http.ResponseWriter, r *http.Request, userID, familyID, memberUserID string) {
	if r.Method != http.MethodDelete {
		writeMethodNotAllowed(w)
		return
	}
	if err := s.store.RemoveMember(userID, store.RemoveAlbumMemberInput{
		AlbumID:      familyID,
		MemberUserID: memberUserID,
	}); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"removed": true})
}

func parseMultipartFile(w http.ResponseWriter, r *http.Request, maxUploadBytes int64) (multipartFile, *multipartHeader, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid multipart upload: %v", err)})
		return nil, nil, false
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file field is required"})
		return nil, nil, false
	}
	return file, header, true
}
