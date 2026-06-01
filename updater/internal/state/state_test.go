package state

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSaveAndLoad(t *testing.T) {
	root := t.TempDir()
	initial := State{
		Status:          StatusPrepared,
		PreparedVersion: "1.2.3",
	}

	if err := Save(root, initial); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	loaded, err := Load(root)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if loaded.Status != StatusPrepared {
		t.Fatalf("unexpected status: %s", loaded.Status)
	}
	if loaded.PreparedVersion != "1.2.3" {
		t.Fatalf("unexpected prepared version: %s", loaded.PreparedVersion)
	}
}

func TestReplaceDir(t *testing.T) {
	source := filepath.Join(t.TempDir(), "source")
	destination := filepath.Join(t.TempDir(), "destination")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "file.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := ReplaceDir(source, destination); err != nil {
		t.Fatalf("replace dir failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(destination, "file.txt")); err != nil {
		t.Fatalf("expected copied file: %v", err)
	}
}
