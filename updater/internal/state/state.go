package state

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"
)

type Status string

const (
	StatusIdle              Status = "idle"
	StatusPreparing         Status = "preparing"
	StatusPrepared          Status = "prepared"
	StatusActivating        Status = "activating"
	StatusAwaitingHealth    Status = "awaiting_healthcheck"
	StatusHealthy           Status = "healthy"
	StatusRollbackRequired Status = "rollback_required"
	StatusRollingBack      Status = "rolling_back"
	StatusFailed           Status = "failed"
)

type State struct {
	Status              Status    `json:"status"`
	CurrentVersion      string    `json:"currentVersion,omitempty"`
	PreparedVersion     string    `json:"preparedVersion,omitempty"`
	PreviousVersion     string    `json:"previousVersion,omitempty"`
	ManifestURL         string    `json:"manifestUrl,omitempty"`
	Channel             string    `json:"channel,omitempty"`
	LastUpdatedAt       time.Time `json:"lastUpdatedAt"`
	LastError           string    `json:"lastError,omitempty"`
	QuarantinedVersions []string `json:"quarantinedVersions,omitempty"`
}

func statePath(root string) string {
	return filepath.Join(root, "state.json")
}

func EnsureLayout(root string) error {
	for _, dir := range []string{
		root,
		filepath.Join(root, "downloads"),
		filepath.Join(root, "releases"),
		filepath.Join(root, "logs"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return nil
}

func Load(root string) (State, error) {
	if err := EnsureLayout(root); err != nil {
		return State{}, err
	}

	path := statePath(root)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return State{Status: StatusIdle}, nil
		}
		return State{}, err
	}

	var st State
	if err := json.Unmarshal(data, &st); err != nil {
		return State{}, err
	}
	if st.Status == "" {
		st.Status = StatusIdle
	}
	return st, nil
}

func Save(root string, st State) error {
	if err := EnsureLayout(root); err != nil {
		return err
	}
	st.LastUpdatedAt = time.Now().UTC()
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(statePath(root), data, 0o644)
}

func ReplaceDir(source string, destination string) error {
	if err := os.RemoveAll(destination); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	return copyDir(source, destination)
}

func copyDir(source string, destination string) error {
	return filepath.Walk(source, func(current string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(source, current)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		return copyFile(current, target, info.Mode())
	})
}

func copyFile(source string, destination string, mode os.FileMode) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return os.Chmod(destination, mode)
}
