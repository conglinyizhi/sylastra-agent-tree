package lock

import "testing"

func TestAcquireRelease(t *testing.T) {
	root := t.TempDir()

	handle, err := Acquire(root)
	if err != nil {
		t.Fatalf("first acquire failed: %v", err)
	}
	if _, err := Acquire(root); err == nil {
		t.Fatalf("expected second acquire to fail")
	}
	if err := handle.Release(); err != nil {
		t.Fatalf("release failed: %v", err)
	}
	if _, err := Acquire(root); err != nil {
		t.Fatalf("acquire after release failed: %v", err)
	}
}
