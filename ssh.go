package main

import (
	"database/sql"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/skeema/knownhosts"
	"golang.org/x/crypto/ssh"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SshConfig holds everything needed to open an SSH tunnel and forward the actual DB connection
// through it. AuthMethod picks which of Password/PrivateKeyPath+Passphrase is used — mirroring
// how desktop DB clients (TablePlus, DBeaver, Navicat) let a connection profile carry both but
// only ever use one at a time, rather than trying to infer intent from which fields are non-empty.
type SshConfig struct {
	Host           string
	Port           string
	Username       string
	AuthMethod     string // "password" | "privateKey"
	Password       string
	PrivateKeyPath string
	Passphrase     string // only used if the private key itself is encrypted
}

// sshTunnel bundles the local listener DB traffic is forwarded through and the SSH client that
// carries it, so both can be torn down together on reconnect/shutdown. Kept as a small struct
// (not two separate App fields) so Connect() can't accidentally close one half without the other.
type sshTunnel struct {
	listener net.Listener
	client   *ssh.Client
}

func (t *sshTunnel) Close() error {
	_ = t.listener.Close()
	return t.client.Close()
}

// sshAuthMethods builds the auth method for an SSH tunnel from exactly one of Password or
// PrivateKeyPath+Passphrase, picked by AuthMethod — never both, so a connection profile that has
// leftover data in the unused field (e.g. switched from password to key auth) can't accidentally
// try the wrong one.
func sshAuthMethods(cfg SshConfig) ([]ssh.AuthMethod, error) {
	switch cfg.AuthMethod {
	case "password":
		return []ssh.AuthMethod{ssh.Password(cfg.Password)}, nil
	case "privateKey":
		keyData, err := os.ReadFile(cfg.PrivateKeyPath)
		if err != nil {
			return nil, fmt.Errorf("reading private key %q: %w", cfg.PrivateKeyPath, err)
		}
		var signer ssh.Signer
		if cfg.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyData, []byte(cfg.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyData)
		}
		if err != nil {
			return nil, fmt.Errorf("parsing private key %q: %w", cfg.PrivateKeyPath, err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	default:
		return nil, fmt.Errorf("unknown SSH auth method %q", cfg.AuthMethod)
	}
}

// sshHostKeyDB loads host key verification data from the user's own ~/.ssh/known_hosts — the same
// trust model the system `ssh`/`git` already use on this machine, deliberately not
// ssh.InsecureIgnoreHostKey(). If the host isn't already known, the callback (and therefore
// ssh.Dial) fails with a knownhosts error rather than silently trusting whatever key the server
// presents; the fix is the same one `ssh` itself would ask for — connect to the host once via a
// terminal to add it, then retry here.
//
// Returns *knownhosts.HostKeyDB (github.com/skeema/knownhosts, a thin wrapper around
// x/crypto/ssh/knownhosts) rather than a bare ssh.HostKeyCallback, specifically for its
// HostKeyAlgorithms() method — see openSSHTunnel's use of it for why a plain callback isn't
// enough on its own (real, shipped bug: an ED25519-only known_hosts entry was being rejected as
// "unknown" because x/crypto/ssh's default HostKeyAlgorithms order tries RSA-family algorithms
// first, so a server with both key types configured presented its RSA key — one known_hosts had
// no matching entry for — instead of the ED25519 one the user's own `ssh`/`git` already trust).
func sshHostKeyDB() (*knownhosts.HostKeyDB, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")
	db, err := knownhosts.NewDB(knownHostsPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s (run `ssh` to the SSH host once first to add it): %w", knownHostsPath, err)
	}
	return db, nil
}

// forwardConn splices one accepted local connection through the SSH client to remoteAddr — the
// actual port-forwarding half of the tunnel. Each accepted connection gets its own goroutine pair
// (one per direction) so a slow or stalled client can't block others sharing the same tunnel.
func forwardConn(localConn net.Conn, sshClient *ssh.Client, remoteAddr string) {
	defer func() { _ = localConn.Close() }()
	remoteConn, err := sshClient.Dial("tcp", remoteAddr)
	if err != nil {
		return
	}
	defer func() { _ = remoteConn.Close() }()

	done := make(chan struct{}, 2)
	go func() {
		_, _ = io.Copy(remoteConn, localConn)
		done <- struct{}{}
	}()
	go func() {
		_, _ = io.Copy(localConn, remoteConn)
		done <- struct{}{}
	}()
	<-done
}

// openSSHTunnel dials the SSH server in cfg, then opens a local, loopback-only listener that
// forwards every accepted connection through that SSH session to remoteHost:remotePort (the
// actual MySQL server, reachable from the SSH host's network but not directly from this machine —
// the whole reason a tunnel is needed). The returned local address is what Connect() then hands
// to sql.Open in place of the real DB host/port. The listener binds 127.0.0.1:0 (an OS-assigned
// ephemeral port on loopback only) rather than a fixed port, so multiple tunnels (source + sink)
// never collide and nothing outside this machine can reach the forwarded port directly.
func openSSHTunnel(cfg SshConfig, remoteHost, remotePort string) (*sshTunnel, string, error) {
	authMethods, err := sshAuthMethods(cfg)
	if err != nil {
		return nil, "", err
	}
	hostKeyDB, err := sshHostKeyDB()
	if err != nil {
		return nil, "", err
	}

	sshAddr := net.JoinHostPort(cfg.Host, cfg.Port)

	sshClientConfig := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            authMethods,
		HostKeyCallback: hostKeyDB.HostKeyCallback(),
		// Pinned to whatever key type(s) known_hosts actually has recorded for this host, instead
		// of left nil (x/crypto/ssh's own default order, RSA-family before ED25519 — see
		// sshHostKeyDB's doc comment for the bug this caused). HostKeyAlgorithms() returns nil for
		// a host with no known_hosts entry at all; ssh.ClientConfig treats a nil slice here the
		// same as never setting the field (checked via `!= nil`, not len == 0 — see
		// golang.org/x/crypto/ssh/handshake.go), so a genuinely unknown host still falls through to
		// the library default order and fails the same "knownhosts: key is unknown" way it always
		// did, rather than this pinning masking that case.
		HostKeyAlgorithms: hostKeyDB.HostKeyAlgorithms(sshAddr),
		Timeout:           5 * time.Second,
	}

	client, err := ssh.Dial("tcp", sshAddr, sshClientConfig)
	if err != nil {
		return nil, "", fmt.Errorf("SSH connection to %s failed: %w", sshAddr, err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = client.Close()
		return nil, "", fmt.Errorf("opening local tunnel listener: %w", err)
	}

	remoteAddr := net.JoinHostPort(remoteHost, remotePort)
	go func() {
		for {
			localConn, err := listener.Accept()
			if err != nil {
				return // listener closed (tunnel torn down) — exit cleanly
			}
			go forwardConn(localConn, client, remoteAddr)
		}
	}()

	return &sshTunnel{listener: listener, client: client}, listener.Addr().String(), nil
}

func (a *App) Connect(c *ConnectionConfig, isSource bool) error {
	host, port := c.Host, c.Port

	var tunnel *sshTunnel
	if c.UseSSH {
		t, localAddr, err := openSSHTunnel(c.SshConfig, c.Host, c.Port)
		if err != nil {
			return fmt.Errorf("SSH tunnel: %w", err)
		}
		tunnel = t
		host, port, err = net.SplitHostPort(localAddr)
		if err != nil {
			_ = tunnel.Close()
			return err
		}
	}

	// Built via mysql.Config/FormatDSN rather than raw string concatenation — a username or
	// password containing '@', ':', '/', or '?' (all plausible in a real DB password) would
	// otherwise be misparsed into the wrong host/db instead of just failing loudly. FormatDSN is
	// the driver's own documented way to avoid exactly this.
	dsnConfig := mysql.NewConfig()
	dsnConfig.User = c.Username
	dsnConfig.Passwd = c.Password
	dsnConfig.Net = "tcp"
	dsnConfig.Addr = net.JoinHostPort(host, port)
	dsnConfig.DBName = c.DbName
	dsnConfig.Timeout = 5 * time.Second

	db, err := sql.Open("mysql", dsnConfig.FormatDSN())
	if err != nil {
		if tunnel != nil {
			_ = tunnel.Close()
		}
		return err
	}
	err = db.Ping()
	if err != nil {
		if tunnel != nil {
			_ = tunnel.Close()
		}
		return err
	}
	db.SetConnMaxLifetime(time.Minute * 3)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)

	// Close out any tunnel AND db pool from a previous connection on this same side before
	// replacing them. Neither is cleaned up by Go's GC on its own: a stale tunnel is a live
	// goroutine plus an open listener that would otherwise run forever, and sql.DB has no
	// finalizer — dropping the reference without calling Close() leaves its pooled MySQL
	// connections (up to MaxOpenConns) open for the rest of the process's life, one more leaked
	// pool per reconnect. shutdown() closing sourceDB/sinkDB only handles the LAST one; every
	// reconnect in between needs this same cleanup.
	if isSource {
		if a.sourceTunnel != nil {
			_ = a.sourceTunnel.Close()
		}
		if a.sourceDB != nil {
			_ = a.sourceDB.Close()
		}
		a.sourceDB = db
		a.sourceTunnel = tunnel
	} else {
		if a.sinkTunnel != nil {
			_ = a.sinkTunnel.Close()
		}
		if a.sinkDB != nil {
			_ = a.sinkDB.Close()
		}
		a.sinkDB = db
		a.sinkTunnel = tunnel
	}

	return nil
}

// PickPrivateKeyFile opens a native "choose a file" dialog for the SSH private key field, so the
// user can browse to e.g. ~/.ssh/id_rsa instead of typing the path by hand. Returns "" (no error)
// if the user cancels the dialog — the frontend treats that as "leave the field unchanged."
func (a *App) PickPrivateKeyFile() (string, error) {
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select SSH Private Key",
	})
}
