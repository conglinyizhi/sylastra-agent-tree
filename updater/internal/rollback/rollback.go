package rollback

import "sylastra-agent-tree/updater/internal/activate"

func Switch(root string, currentVersion string, previousVersion string) error {
	return activate.Switch(root, currentVersion, previousVersion)
}
