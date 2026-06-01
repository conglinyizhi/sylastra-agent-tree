package activate

import (
	"os"
	"path/filepath"
)

func Switch(root string, currentVersion string, nextVersion string) error {
	currentLink := filepath.Join(root, "current")
	previousLink := filepath.Join(root, "previous")
	releasesDir := filepath.Join(root, "releases")

	if currentVersion != "" {
		_ = os.Remove(previousLink)
		if err := os.Symlink(filepath.Join(releasesDir, currentVersion), previousLink); err != nil {
			return err
		}
	}

	_ = os.Remove(currentLink)
	return os.Symlink(filepath.Join(releasesDir, nextVersion), currentLink)
}
