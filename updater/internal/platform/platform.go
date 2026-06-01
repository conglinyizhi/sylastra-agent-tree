package platform

import (
	"fmt"
	"runtime"
)

func Current() (string, error) {
	switch runtime.GOOS {
	case "linux", "darwin":
	default:
		return "", fmt.Errorf("unsupported os: %s", runtime.GOOS)
	}

	arch := runtime.GOARCH
	switch arch {
	case "amd64", "arm64":
	default:
		return "", fmt.Errorf("unsupported arch: %s", arch)
	}

	return fmt.Sprintf("%s-%s", runtime.GOOS, arch), nil
}
