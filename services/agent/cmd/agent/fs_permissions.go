package main

import (
	"os"
	"path/filepath"
)

const (
	privateDirMode  = 0o700
	privateFileMode = 0o600
)

func ensurePrivateDir(path string) error {
	if clean := filepath.Clean(path); clean == "." {
		return nil
	}
	if err := os.MkdirAll(path, privateDirMode); err != nil {
		return err
	}
	return os.Chmod(path, privateDirMode)
}

func openPrivateFile(path string) (*os.File, error) {
	if err := ensurePrivateDir(filepath.Dir(path)); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, privateFileMode)
	if err != nil {
		return nil, err
	}
	if err := file.Chmod(privateFileMode); err != nil {
		_ = file.Close()
		return nil, err
	}
	return file, nil
}

func writePrivateFile(path string, body []byte) error {
	if err := ensurePrivateDir(filepath.Dir(path)); err != nil {
		return err
	}
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, body, privateFileMode); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, privateFileMode); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return err
	}
	return os.Chmod(path, privateFileMode)
}

func tightenPrivateFile(path string) error {
	if err := os.Chmod(path, privateFileMode); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
