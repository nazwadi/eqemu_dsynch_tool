import {useEffect, useState} from 'react';
import {Connect, GetZones, LoadConfig, SaveConfig} from "../../wailsjs/go/main/App";

// A fresh, independent SSH sub-config object per call — used for both sourceSsh/sinkSsh's initial
// state and for hydrating from a loaded Config that predates this field (see the LoadConfig
// effect below), so an old config.json with no Source.SshConfig still gets sane defaults instead
// of undefined fields the ConnectModal inputs would choke on.
function defaultSshConfig() {
    return {
        enabled: false,
        host: '', port: '22', username: '',
        authMethod: 'privateKey',
        password: '', privateKeyPath: '', passphrase: ''
    }
}

// Converts a loaded Go ConnectionConfig's UseSSH/SshConfig fields into the flat `ssh` object shape
// ConnectModal reads — the inverse of connectionConfigFor() below. Spread onto defaultSshConfig()
// at the call site (not here) so a config.json predating this feature, or one with a
// partially-empty SshConfig, still ends up with every field defined.
function hydrateSshConfig(connectionConfig) {
    const ssh = connectionConfig?.SshConfig
    if (!ssh) return {}
    return {
        enabled: !!connectionConfig.UseSSH,
        host: ssh.Host ?? '', port: ssh.Port || '22', username: ssh.Username ?? '',
        authMethod: ssh.AuthMethod || 'privateKey',
        password: ssh.Password ?? '', privateKeyPath: ssh.PrivateKeyPath ?? '', passphrase: ssh.Passphrase ?? ''
    }
}

// Source/sink connection state, the Connect/ConnectModal flow, and the Config file's full
// load/save lifecycle — including UI layout prefs, since Go's Config type bundles Source/Sink/UI
// into one file and saving only part of it risks overwriting the other part with zero values (a
// real, if minor, bug this consolidation replaced — connect()'s own SaveConfig call used to omit
// UI entirely, silently resetting sidebar/detail width on every reconnect). uiPrefs (from
// useUIPrefs) is taken as a parameter rather than closed over implicitly, so that dependency is
// visible in this hook's own signature.
export function useConnections(uiPrefs) {
    const [zones, setZones] = useState([])
    const [sourceHost, setSourceHost] = useState('')
    const [sourcePort, setSourcePort] = useState('')
    const [sourceUsername, setSourceUsername] = useState('')
    const [sourcePassword, setSourcePassword] = useState('')
    const [dbSourceName, setDbSourceName] = useState('')
    const [sinkHost, setSinkHost] = useState('')
    const [sinkPort, setSinkPort] = useState('')
    const [sinkUsername, setSinkUsername] = useState('')
    const [sinkPassword, setSinkPassword] = useState('')
    const [dbSinkName, setDbSinkName] = useState('')
    // One object per side (not 7 more value+setter pairs) — see ConnectModal's header comment.
    // authMethod defaults to 'privateKey' since that's the more common bastion-host setup; port
    // defaults to '22' the way desktop DB clients pre-fill it rather than leaving it blank.
    const [sourceSsh, setSourceSsh] = useState(() => defaultSshConfig())
    const [sinkSsh, setSinkSsh] = useState(() => defaultSshConfig())
    const [activeModal, setActiveModal] = useState(null)
    const [connectError, setConnectError] = useState(null)
    const [connecting, setConnecting] = useState(false)
    const [sourceConnected, setSourceConnected] = useState(false)
    const [sinkConnected, setSinkConnected] = useState(false)

    // Builds one side's full ConnectionConfig (DB fields + SSH tunnel sub-config) from this hook's
    // state — shared by connect() and persistUIPrefs() so there's exactly one place that knows how
    // a `ssh` object (see defaultSshConfig) maps onto the Go SshConfig shape.
    function connectionConfigFor(host, port, username, password, dbName, ssh) {
        return {
            Host: host, Port: port, Username: username, Password: password, DbName: dbName,
            UseSSH: ssh.enabled,
            SshConfig: {
                Host: ssh.host, Port: ssh.port, Username: ssh.username,
                AuthMethod: ssh.authMethod, Password: ssh.password,
                PrivateKeyPath: ssh.privateKeyPath, Passphrase: ssh.passphrase
            }
        }
    }

    function currentFullConfig(overrides = {}) {
        return {
            Source: connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh),
            Sink: connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh),
            UI: {
                SidebarWidth: uiPrefs.sidebarWidth,
                SidebarCollapsed: uiPrefs.sidebarCollapsed,
                DetailWidth: uiPrefs.detailWidth,
                ...overrides
            }
        }
    }

    // Persists the current layout prefs (or an override taken mid-drag, before its setState has
    // committed) alongside the connection config that's already threaded through this hook's
    // state — SaveConfig always writes the whole Config, so this reads the same state connect()
    // saves rather than introducing a second source of truth for it.
    function persistUIPrefs(overrides = {}) {
        SaveConfig(currentFullConfig(overrides)).catch(err => console.error("save UI prefs failed:", err))
    }

    function connect() {
        setConnectError(null)
        setConnecting(true)
        const isSource = activeModal === 'source'
        const config = isSource
            ? connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh)
            : connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh)
        Connect(config, isSource)
            .then(() => isSource ? GetZones() : Promise.resolve())
            .then(zones => {
                if (isSource) {
                    setZones(zones)
                    setSourceConnected(true)
                } else {
                    setSinkConnected(true)
                }
                setActiveModal(null)
                SaveConfig(currentFullConfig()).catch(err => console.error("save config failed:", err))
            })
            .catch(err => setConnectError(String(err)))
            .finally(() => setConnecting(false))
    }

    useEffect(() => {
        LoadConfig()
            .then(config => {
                setSourceHost(config.Source.Host)
                setSourcePort(config.Source.Port)
                setSourceUsername(config.Source.Username)
                setSourcePassword(config.Source.Password)
                setDbSourceName(config.Source.DbName)
                setSinkHost(config.Sink.Host)
                setSinkPort(config.Sink.Port)
                setSinkUsername(config.Sink.Username)
                setSinkPassword(config.Sink.Password)
                setDbSinkName(config.Sink.DbName)
                setSourceSsh({...defaultSshConfig(), ...hydrateSshConfig(config.Source)})
                setSinkSsh({...defaultSshConfig(), ...hydrateSshConfig(config.Sink)})

                // A config.json written before this field existed has no UI key at all; a zero
                // value here (SidebarWidth: 0, etc.) means "never explicitly set" either way, so
                // falling back to the existing hardcoded defaults is correct in both cases.
                if (config.UI) {
                    if (config.UI.SidebarWidth) uiPrefs.setSidebarWidth(config.UI.SidebarWidth)
                    if (config.UI.DetailWidth) uiPrefs.setDetailWidth(config.UI.DetailWidth)
                    uiPrefs.setSidebarCollapsed(!!config.UI.SidebarCollapsed)
                }

                // auto-connect source
                Connect(config.Source, true)
                    .then(() => GetZones())
                    .then(zones => {
                        setZones(zones)
                        setSourceConnected(true)
                    })
                    .catch(() => {
                    })

                // auto-connect sink
                Connect(config.Sink, false)
                    .then(() => setSinkConnected(true))
                    .catch(() => {
                    })
            })
            .catch(() => {
            }) // ignore if no config file yet
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return {
        zones,
        sourceHost, setSourceHost, sourcePort, setSourcePort,
        sourceUsername, setSourceUsername, sourcePassword, setSourcePassword,
        dbSourceName, setDbSourceName,
        sinkHost, setSinkHost, sinkPort, setSinkPort,
        sinkUsername, setSinkUsername, sinkPassword, setSinkPassword,
        dbSinkName, setDbSinkName,
        sourceSsh, setSourceSsh, sinkSsh, setSinkSsh,
        activeModal, setActiveModal,
        connectError, setConnectError,
        connecting, sourceConnected, sinkConnected,
        connect, persistUIPrefs
    }
}
