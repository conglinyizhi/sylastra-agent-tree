package download

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func Fetch(url string, destination string, expectedSHA string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download failed: %s", resp.Status)
	}

	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer out.Close()

	hash := sha256.New()
	writer := io.MultiWriter(out, hash)
	if _, err := io.Copy(writer, resp.Body); err != nil {
		return err
	}

	sum := hex.EncodeToString(hash.Sum(nil))
	if expectedSHA != "" && sum != expectedSHA {
		return fmt.Errorf("sha256 mismatch: expected %s got %s", expectedSHA, sum)
	}
	return nil
}
