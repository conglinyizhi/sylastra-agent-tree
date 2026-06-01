package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"sylastra-agent-tree/updater/internal/commands"
)

func main() {
	root := flag.String("root", "", "update state root")
	asJSON := flag.Bool("json", false, "emit json")
	version := flag.String("version", "", "target version for prepare")
	manifestURL := flag.String("manifest-url", "", "manifest url for prepare")
	channel := flag.String("channel", "stable", "update channel")
	flag.Parse()

	if *root == "" {
		exitErr("missing required --root")
	}
	if flag.NArg() < 1 {
		exitErr("missing command")
	}

	command := flag.Arg(0)
	var (
		resp commands.Response
		err  error
	)

	switch command {
	case "prepare":
		if *version == "" {
			exitErr("prepare requires --version")
		}
		resp, err = commands.Prepare(*root, *version, *manifestURL, *channel)
	case "activate":
		resp, err = commands.Activate(*root)
	case "healthcheck":
		resp, err = commands.Healthcheck(*root)
	case "rollback":
		resp, err = commands.Rollback(*root)
	case "cleanup":
		resp, err = commands.Cleanup(*root)
	default:
		exitErr(fmt.Sprintf("unknown command: %s", command))
	}

	if err != nil {
		exitErr(err.Error())
	}
	if *asJSON {
		data, marshalErr := json.MarshalIndent(resp, "", "  ")
		if marshalErr != nil {
			exitErr(marshalErr.Error())
		}
		fmt.Println(string(data))
		return
	}
	fmt.Printf("%s: %s\n", resp.Command, resp.State.Status)
}

func exitErr(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
