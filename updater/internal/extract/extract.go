package extract

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func TarGz(archive string, destination string) error {
	if err := os.MkdirAll(destination, 0o755); err != nil {
		return err
	}

	cmd := exec.Command("tar", "-xzf", archive, "-C", destination)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("extract failed: %w: %s", err, string(output))
	}
	return nil
}

func FindSingleTopLevelDir(destination string) (string, error) {
	entries, err := os.ReadDir(destination)
	if err != nil {
		return "", err
	}

	var dirs []string
	for _, entry := range entries {
		if entry.IsDir() {
			dirs = append(dirs, filepath.Join(destination, entry.Name()))
		}
	}
	if len(dirs) != 1 {
		return "", fmt.Errorf("expected exactly one top-level dir, got %d", len(dirs))
	}
	return dirs[0], nil
}
