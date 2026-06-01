package manifest

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Artifact struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
}

type VersionEntry struct {
	Version   string              `json:"version"`
	Artifacts map[string]Artifact `json:"artifacts"`
}

type Manifest struct {
	Stable *VersionEntry `json:"stable,omitempty"`
	Beta   *VersionEntry `json:"beta,omitempty"`
}

func Fetch(url string) (Manifest, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return Manifest{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Manifest{}, fmt.Errorf("manifest request failed: %s", resp.Status)
	}

	var mf Manifest
	if err := json.NewDecoder(resp.Body).Decode(&mf); err != nil {
		return Manifest{}, err
	}
	return mf, nil
}

func ResolveChannel(mf Manifest, channel string) (*VersionEntry, error) {
	switch channel {
	case "stable":
		if mf.Stable == nil {
			return nil, fmt.Errorf("manifest missing stable channel")
		}
		return mf.Stable, nil
	case "beta":
		if mf.Beta == nil {
			return nil, fmt.Errorf("manifest missing beta channel")
		}
		return mf.Beta, nil
	default:
		return nil, fmt.Errorf("unsupported channel: %s", channel)
	}
}
