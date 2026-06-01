package lock

import (
	"fmt"
	"os"
	"path/filepath"
)

type Handle struct {
	path string
}

func Acquire(root string) (*Handle, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	lockPath := filepath.Join(root, ".lock")
	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return nil, fmt.Errorf("lock already held")
		}
		return nil, err
	}
	_ = file.Close()
	return &Handle{path: lockPath}, nil
}

func (h *Handle) Release() error {
	if h == nil || h.path == "" {
		return nil
	}
	return os.Remove(h.path)
}
