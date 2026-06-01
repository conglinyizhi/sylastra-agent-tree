package health

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func Check(root string) error {
	currentLink := filepath.Join(root, "current")
	currentTarget, err := os.Readlink(currentLink)
	if err != nil {
		return fmt.Errorf("current link missing: %w", err)
	}

	if !filepath.IsAbs(currentTarget) {
		currentTarget = filepath.Join(filepath.Dir(currentLink), currentTarget)
	}

	requiredFiles := []string{
		filepath.Join(currentTarget, "VERSION"),
		filepath.Join(currentTarget, "dist", "index.js"),
		filepath.Join(currentTarget, "dist", "cli", "index.js"),
		filepath.Join(currentTarget, "package.json"),
	}
	for _, filePath := range requiredFiles {
		if _, err := os.Stat(filePath); err != nil {
			return fmt.Errorf("healthcheck missing file %s: %w", filePath, err)
		}
	}

	if err := importModule(currentTarget, "./dist/index.js"); err != nil {
		return fmt.Errorf("plugin entry import failed: %w", err)
	}
	if err := importModule(currentTarget, "./dist/cli/index.js"); err != nil {
		return fmt.Errorf("cli entry import failed: %w", err)
	}

	return nil
}

func importModule(cwd string, modulePath string) error {
	cmd := exec.Command(
		"node",
		"--input-type=module",
		"--eval",
		fmt.Sprintf("await import('%s')", modulePath),
	)
	cmd.Dir = cwd
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: %s", err, string(output))
	}
	return nil
}
