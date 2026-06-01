package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"sylastra-agent-tree/updater/internal/activate"
	"sylastra-agent-tree/updater/internal/download"
	"sylastra-agent-tree/updater/internal/extract"
	"sylastra-agent-tree/updater/internal/health"
	"sylastra-agent-tree/updater/internal/lock"
	"sylastra-agent-tree/updater/internal/manifest"
	"sylastra-agent-tree/updater/internal/platform"
	"sylastra-agent-tree/updater/internal/rollback"
	"sylastra-agent-tree/updater/internal/state"
)

type Response struct {
	OK      bool        `json:"ok"`
	Command string      `json:"command"`
	Root    string      `json:"root"`
	State   state.State `json:"state"`
	Message string      `json:"message,omitempty"`
}

func Prepare(root string, version string, manifestURL string, channel string) (Response, error) {
	lockHandle, err := lock.Acquire(root)
	if err != nil {
		return Response{}, err
	}
	defer lockHandle.Release()

	st, err := state.Load(root)
	if err != nil {
		return Response{}, err
	}
	st.Status = state.StatusPreparing
	st.PreparedVersion = version
	st.ManifestURL = manifestURL
	st.Channel = channel
	st.LastError = ""
	for _, quarantined := range st.QuarantinedVersions {
		if quarantined == version {
			st.Status = state.StatusFailed
			st.LastError = fmt.Sprintf("version %s is quarantined after a previous failed activation", version)
			_ = state.Save(root, st)
			return Response{}, fmt.Errorf(st.LastError)
		}
	}
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}

	mf, err := manifest.Fetch(manifestURL)
	if err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	entry, err := manifest.ResolveChannel(mf, channel)
	if err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	if entry.Version != version {
		st.Status = state.StatusFailed
		st.LastError = fmt.Sprintf("manifest version mismatch: expected %s got %s", version, entry.Version)
		_ = state.Save(root, st)
		return Response{}, fmt.Errorf(st.LastError)
	}
	platformName, err := platform.Current()
	if err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	artifact, ok := entry.Artifacts[platformName]
	if !ok {
		st.Status = state.StatusFailed
		st.LastError = fmt.Sprintf("manifest missing artifact for %s", platformName)
		_ = state.Save(root, st)
		return Response{}, fmt.Errorf(st.LastError)
	}

	archivePath := filepath.Join(root, "downloads", version+".tar.gz")
	if err := download.Fetch(artifact.URL, archivePath, artifact.SHA256); err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}

	extractRoot := filepath.Join(root, "downloads", "extract-"+version)
	releaseDir := filepath.Join(root, "releases", version)
	if err := extract.TarGz(archivePath, extractRoot); err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	topDir, err := extract.FindSingleTopLevelDir(extractRoot)
	if err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	if err := state.ReplaceDir(topDir, releaseDir); err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}

	st.Status = state.StatusPrepared
	st.LastError = ""
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}
	return Response{
		OK:      true,
		Command: "prepare",
		Root:    root,
		State:   st,
		Message: fmt.Sprintf("prepared version %s", version),
	}, nil
}

func Activate(root string) (Response, error) {
	lockHandle, err := lock.Acquire(root)
	if err != nil {
		return Response{}, err
	}
	defer lockHandle.Release()

	st, err := state.Load(root)
	if err != nil {
		return Response{}, err
	}
	st.Status = state.StatusActivating
	st.LastError = ""
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}
	if err := activate.Switch(root, st.CurrentVersion, st.PreparedVersion); err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	st.PreviousVersion = st.CurrentVersion
	st.CurrentVersion = st.PreparedVersion
	st.Status = state.StatusAwaitingHealth
	st.LastError = ""
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}
	return Response{OK: true, Command: "activate", Root: root, State: st}, nil
}

func Healthcheck(root string) (Response, error) {
	lockHandle, err := lock.Acquire(root)
	if err != nil {
		return Response{}, err
	}
	defer lockHandle.Release()

	st, err := state.Load(root)
	if err != nil {
		return Response{}, err
	}
	if err := health.Check(root); err != nil {
		st.Status = state.StatusRollbackRequired
		st.LastError = err.Error()
		st.QuarantinedVersions = appendUnique(st.QuarantinedVersions, st.CurrentVersion)
		_ = state.Save(root, st)
		return Response{}, err
	}
	st.Status = state.StatusHealthy
	st.LastError = ""
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}
	return Response{OK: true, Command: "healthcheck", Root: root, State: st}, nil
}

func Rollback(root string) (Response, error) {
	lockHandle, err := lock.Acquire(root)
	if err != nil {
		return Response{}, err
	}
	defer lockHandle.Release()

	st, err := state.Load(root)
	if err != nil {
		return Response{}, err
	}
	st.Status = state.StatusRollingBack
	st.LastError = ""
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}
	if err := rollback.Switch(root, st.CurrentVersion, st.PreviousVersion); err != nil {
		st.Status = state.StatusFailed
		st.LastError = err.Error()
		_ = state.Save(root, st)
		return Response{}, err
	}
	st.CurrentVersion = st.PreviousVersion
	st.PreparedVersion = ""
	st.LastError = ""
	st.Status = state.StatusHealthy
	if err := state.Save(root, st); err != nil {
		return Response{}, err
	}
	return Response{OK: true, Command: "rollback", Root: root, State: st}, nil
}

func Cleanup(root string) (Response, error) {
	lockHandle, err := lock.Acquire(root)
	if err != nil {
		return Response{}, err
	}
	defer lockHandle.Release()

	st, err := state.Load(root)
	if err != nil {
		return Response{}, err
	}

	currentKeep := map[string]bool{}
	if st.CurrentVersion != "" {
		currentKeep[st.CurrentVersion] = true
	}
	if st.PreviousVersion != "" {
		currentKeep[st.PreviousVersion] = true
	}
	if st.PreparedVersion != "" {
		currentKeep[st.PreparedVersion] = true
	}

	releasesDir := filepath.Join(root, "releases")
	entries, err := os.ReadDir(releasesDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			if currentKeep[entry.Name()] {
				continue
			}
			_ = os.RemoveAll(filepath.Join(releasesDir, entry.Name()))
		}
	}

	return Response{
		OK:      true,
		Command: "cleanup",
		Root:    root,
		State:   st,
		Message: "cleanup completed",
	}, nil
}

func appendUnique(values []string, candidate string) []string {
	if candidate == "" {
		return values
	}
	for _, value := range values {
		if value == candidate {
			return values
		}
	}
	return append(values, candidate)
}
