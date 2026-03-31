package r2cache

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"time"
)

var ErrNotFound = errors.New("r2 object not found")

type Config struct {
	AccountID       string
	Endpoint        string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	Region          string
}

type Client struct {
	cfg        Config
	httpClient *http.Client
}

type GetResult struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	LastModified  time.Time
}

func New(config Config) *Client {
	if strings.TrimSpace(config.Endpoint) == "" && strings.TrimSpace(config.AccountID) != "" {
		config.Endpoint = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", strings.TrimSpace(config.AccountID))
	}
	if strings.TrimSpace(config.Region) == "" {
		config.Region = "auto"
	}
	return &Client{
		cfg:        config,
		httpClient: &http.Client{},
	}
}

func (c *Client) Enabled() bool {
	return strings.TrimSpace(c.cfg.Endpoint) != "" &&
		strings.TrimSpace(c.cfg.Bucket) != "" &&
		strings.TrimSpace(c.cfg.AccessKeyID) != "" &&
		strings.TrimSpace(c.cfg.SecretAccessKey) != ""
}

func (c *Client) PutFile(ctx context.Context, key, filePath, contentType string) (int64, error) {
	if !c.Enabled() {
		return 0, errors.New("r2 is not configured")
	}
	info, err := os.Stat(filePath)
	if err != nil {
		return 0, err
	}
	payloadHash, err := fileSHA256(filePath)
	if err != nil {
		return 0, err
	}
	file, err := os.Open(filePath)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	if strings.TrimSpace(contentType) == "" {
		contentType = "application/octet-stream"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.objectURL(key), file)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	if err := c.sign(req, payloadHash, time.Now().UTC()); err != nil {
		return 0, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return 0, fmt.Errorf("r2 put %s failed: %s %s", key, resp.Status, strings.TrimSpace(string(body)))
	}
	return info.Size(), nil
}

func (c *Client) Get(ctx context.Context, key string) (GetResult, error) {
	if !c.Enabled() {
		return GetResult{}, errors.New("r2 is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.objectURL(key), nil)
	if err != nil {
		return GetResult{}, err
	}
	if err := c.sign(req, emptyPayloadSHA256, time.Now().UTC()); err != nil {
		return GetResult{}, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return GetResult{}, err
	}
	if resp.StatusCode == http.StatusNotFound {
		resp.Body.Close()
		return GetResult{}, ErrNotFound
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		return GetResult{}, fmt.Errorf("r2 get %s failed: %s %s", key, resp.Status, strings.TrimSpace(string(body)))
	}
	lastModified, _ := http.ParseTime(resp.Header.Get("Last-Modified"))
	return GetResult{
		Body:          resp.Body,
		ContentType:   resp.Header.Get("Content-Type"),
		ContentLength: resp.ContentLength,
		LastModified:  lastModified.UTC(),
	}, nil
}

func (c *Client) Delete(ctx context.Context, key string) error {
	if !c.Enabled() {
		return nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.objectURL(key), nil)
	if err != nil {
		return err
	}
	if err := c.sign(req, emptyPayloadSHA256, time.Now().UTC()); err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("r2 delete %s failed: %s %s", key, resp.Status, strings.TrimSpace(string(body)))
	}
	return nil
}

func (c *Client) objectURL(key string) string {
	base := strings.TrimRight(strings.TrimSpace(c.cfg.Endpoint), "/")
	return base + "/" + escapePathSegment(c.cfg.Bucket) + "/" + escapeObjectKey(key)
}

func escapeObjectKey(key string) string {
	trimmed := strings.Trim(strings.TrimSpace(key), "/")
	if trimmed == "" {
		return ""
	}
	parts := strings.Split(trimmed, "/")
	escaped := make([]string, 0, len(parts))
	for _, item := range parts {
		escaped = append(escaped, escapePathSegment(item))
	}
	return strings.Join(escaped, "/")
}

func escapePathSegment(value string) string {
	return strings.ReplaceAll(url.PathEscape(strings.TrimSpace(value)), "+", "%20")
}

func (c *Client) sign(req *http.Request, payloadHash string, now time.Time) error {
	if !c.Enabled() {
		return errors.New("r2 is not configured")
	}
	amzDate := now.UTC().Format("20060102T150405Z")
	shortDate := now.UTC().Format("20060102")
	scope := path.Join(shortDate, c.cfg.Region, "s3", "aws4_request")

	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("X-Amz-Date", amzDate)

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", req.URL.Host, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := strings.Join([]string{
		req.Method,
		req.URL.EscapedPath(),
		req.URL.RawQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")
	requestHash := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hex.EncodeToString(requestHash[:]),
	}, "\n")
	signature := hex.EncodeToString(hmacSHA256(signingKey(c.cfg.SecretAccessKey, shortDate, c.cfg.Region, "s3"), stringToSign))
	req.Header.Set("Authorization", fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", c.cfg.AccessKeyID, scope, signedHeaders, signature))
	return nil
}

var emptyPayloadSHA256 = hex.EncodeToString(sha256.New().Sum(nil))

func fileSHA256(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

func signingKey(secret, shortDate, region, service string) []byte {
	dateKey := hmacSHA256([]byte("AWS4"+secret), shortDate)
	regionKey := hmacSHA256(dateKey, region)
	serviceKey := hmacSHA256(regionKey, service)
	return hmacSHA256(serviceKey, "aws4_request")
}

func hmacSHA256(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(value))
	return mac.Sum(nil)
}
