package commands

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func createReleaseArchive(t *testing.T, tempDir string) (string, string) {
	t.Helper()
	artifactDir := filepath.Join(tempDir, "release-artifact")
	if err := os.MkdirAll(filepath.Join(artifactDir, "dist", "cli"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(artifactDir, "VERSION"), []byte("1.2.3\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(artifactDir, "package.json"), []byte("{\"name\":\"sylastra-agent-tree\"}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(artifactDir, "dist", "index.js"), []byte("export const plugin = true;\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(artifactDir, "dist", "cli", "index.js"), []byte("export const cli = true;\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	archivePath := filepath.Join(tempDir, "artifact.tar.gz")
	cmd := exec.Command("tar", "-czf", archivePath, "release-artifact")
	cmd.Dir = tempDir
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("tar failed: %v: %s", err, string(output))
	}

	sum := sha256.Sum256(mustReadFile(t, archivePath))
	return archivePath, hex.EncodeToString(sum[:])
}

func mustReadFile(t *testing.T, filePath string) []byte {
	t.Helper()
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestPrepareActivateRollback(t *testing.T) {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		t.Skip("manifest fixture currently covers linux-amd64 only")
	}

	tempDir := t.TempDir()
	archivePath, archiveSHA := createReleaseArchive(t, tempDir)

	var serverURL string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"stable": map[string]any{
					"version": "1.2.3",
					"artifacts": map[string]any{
						"linux-amd64": map[string]string{
							"url":    serverURL + "/artifact.tar.gz",
							"sha256": archiveSHA,
						},
					},
				},
			})
		case "/artifact.tar.gz":
			http.ServeFile(w, r, archivePath)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	serverURL = server.URL

	root := filepath.Join(tempDir, "root")
	prepareResp, err := Prepare(root, "1.2.3", server.URL+"/manifest.json", "stable")
	if err != nil {
		t.Fatalf("prepare failed: %v", err)
	}
	if !prepareResp.OK || prepareResp.State.Status != "prepared" {
		t.Fatalf("unexpected prepare response: %+v", prepareResp)
	}
	if _, err := os.Stat(filepath.Join(root, "releases", "1.2.3", "VERSION")); err != nil {
		t.Fatalf("expected prepared release dir: %v", err)
	}

	activateResp, err := Activate(root)
	if err != nil {
		t.Fatalf("activate failed: %v", err)
	}
	if activateResp.State.CurrentVersion != "1.2.3" {
		t.Fatalf("unexpected current version after activate: %+v", activateResp.State)
	}
	healthResp, err := Healthcheck(root)
	if err != nil {
		t.Fatalf("healthcheck failed: %v", err)
	}
	if healthResp.State.Status != "healthy" {
		t.Fatalf("expected healthy status: %+v", healthResp.State)
	}

	rollbackResp, err := Rollback(root)
	if err != nil {
		t.Fatalf("rollback failed: %v", err)
	}
	if rollbackResp.State.CurrentVersion != "" {
		t.Fatalf("expected empty current version after rollback: %+v", rollbackResp.State)
	}
}

func TestCleanupRemovesUnusedReleases(t *testing.T) {
	root := t.TempDir()
	for _, version := range []string{"1.0.0", "1.0.1", "1.0.2"} {
		versionDir := filepath.Join(root, "releases", version)
		if err := os.MkdirAll(versionDir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(versionDir, "VERSION"), []byte(version), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "state.json"), []byte("{\n  \"status\": \"healthy\",\n  \"currentVersion\": \"1.0.2\",\n  \"previousVersion\": \"1.0.1\"\n}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := Cleanup(root); err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	if _, err := os.Stat(filepath.Join(root, "releases", "1.0.0")); !os.IsNotExist(err) {
		t.Fatalf("expected old release to be removed")
	}
	if _, err := os.Stat(filepath.Join(root, "releases", "1.0.1")); err != nil {
		t.Fatalf("expected previous release to remain: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "releases", "1.0.2")); err != nil {
		t.Fatalf("expected current release to remain: %v", err)
	}
}

func TestPrepareRejectsQuarantinedVersion(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(root, "state.json"),
		[]byte("{\n  \"status\": \"failed\",\n  \"quarantinedVersions\": [\"1.2.3\"]\n}\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}

	if _, err := Prepare(root, "1.2.3", "https://example.com/manifest.json", "stable"); err == nil {
		t.Fatalf("expected quarantined version to be rejected")
	}
}
