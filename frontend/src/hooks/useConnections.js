import {useEffect, useState} from 'react';
import {Connect, Disconnect, GetZones, LoadConfig, SaveConfig} from "../../wailsjs/go/main/App";

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

// Whether a loaded ConnectionConfig wants to auto-connect on startup. Deliberately checks key
// PRESENCE ('AutoConnect' in connectionConfig), not truthiness (connectionConfig.AutoConnect) —
// AutoConnect:false is a real, meaningful, persisted choice once a user has toggled it off, so
// treating "falsy" as "unset, default true" the way UIPrefs' zero-means-unset widths do would make
// it impossible to actually save "off." Go's json.Marshal always includes a plain bool field (no
// omitempty), so the key is only ever absent from a config.json written before this feature
// shipped — exactly the one case that should fall back to true (preserve existing behavior for
// upgrading users) rather than silently stop auto-connecting connections they never touched.
function hydrateAutoConnect(connectionConfig) {
    if (!connectionConfig || !('AutoConnect' in connectionConfig)) return true
    return connectionConfig.AutoConnect
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
    // Status per side, not a plain boolean — 'disconnected' | 'connecting' | 'connected' | 'error'.
    // The extra states are what let the sidebar show a live "Connecting…" indicator during the
    // startup auto-connect race (previously invisible — it just silently stayed red until it
    // either flipped green or didn't) and distinguish "never tried" from "tried and failed" so a
    // real connection error isn't indistinguishable from having never connected at all.
    const [sourceStatus, setSourceStatus] = useState('disconnected')
    const [sinkStatus, setSinkStatus] = useState('disconnected')
    // Last error per side, independent of connectError (which is scoped to the modal's own
    // in-progress attempt and clears when the modal closes) — this is what the sidebar's error
    // state shows on hover, including for a startup auto-connect failure that never opened the
    // modal at all.
    const [sourceLastError, setSourceLastError] = useState(null)
    const [sinkLastError, setSinkLastError] = useState(null)
    // Auto-connect-on-startup preference per side (see ConnectionConfig.AutoConnect's own comment
    // for the full reasoning) — independent of the current live connection: toggling this doesn't
    // connect or disconnect anything by itself, it only changes what the next app start does.
    const [sourceAutoConnect, setSourceAutoConnectState] = useState(true)
    const [sinkAutoConnect, setSinkAutoConnectState] = useState(true)
    const [mapsDirectory, setMapsDirectory] = useState('') // Brewall's Maps folder — see zonemap.go/useZoneMap.js
    const [excludedNpcFields, setExcludedNpcFields] = useState([]) // npc_types columns Sync never overwrites on an existing sink row — see the NPCs tab's "Excluded fields" drawer

    // Builds one side's full ConnectionConfig (DB fields + SSH tunnel sub-config + AutoConnect)
    // from this hook's state — shared by connect() and persistUIPrefs() so there's exactly one
    // place that knows how a `ssh` object (see defaultSshConfig) maps onto the Go SshConfig shape.
    function connectionConfigFor(host, port, username, password, dbName, ssh, autoConnect) {
        return {
            Host: host, Port: port, Username: username, Password: password, DbName: dbName,
            UseSSH: ssh.enabled,
            SshConfig: {
                Host: ssh.host, Port: ssh.port, Username: ssh.username,
                AuthMethod: ssh.authMethod, Password: ssh.password,
                PrivateKeyPath: ssh.privateKeyPath, Passphrase: ssh.passphrase
            },
            AutoConnect: autoConnect
        }
    }

    function currentFullConfig(overrides = {}) {
        return {
            Source: connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh, sourceAutoConnect),
            Sink: connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh, sinkAutoConnect),
            MapsDirectory: mapsDirectory,
            ExcludedNPCFields: excludedNpcFields,
            UI: {
                SidebarWidth: uiPrefs.sidebarWidth,
                SidebarCollapsed: uiPrefs.sidebarCollapsed,
                DetailWidth: uiPrefs.detailWidth,
                ...overrides
            }
        }
    }

    // Sets mapsDirectory and immediately persists it — not gated behind Connect the way DB
    // settings are, since there's no "connect" step for a plain folder path, just "remember it."
    function setAndPersistMapsDirectory(dir) {
        setMapsDirectory(dir)
        SaveConfig({...currentFullConfig(), MapsDirectory: dir}).catch(err => console.error("save maps directory failed:", err))
    }

    // Same immediate-persist shape as setAndPersistMapsDirectory — a plain preference, not gated
    // behind Connect. Takes the full next list rather than one field at a time so ExcludedFieldsDrawer
    // can add/remove without this hook needing separate add/remove entry points.
    function setAndPersistExcludedNpcFields(fields) {
        setExcludedNpcFields(fields)
        SaveConfig({...currentFullConfig(), ExcludedNPCFields: fields}).catch(err => console.error("save excluded NPC fields failed:", err))
    }

    // Flips one side's auto-connect-on-startup preference and persists immediately — same "plain
    // preference, saved right away" shape as maps directory/excluded fields, deliberately NOT
    // gated behind the Connect modal's confirm flow, since this isn't a connection attempt at all.
    // Reads its own just-toggled value directly (not the stale closed-over state) so the very same
    // click that flips the UI also saves the right value, rather than saving the pre-toggle one.
    function setSourceAutoConnect(value) {
        setSourceAutoConnectState(value)
        SaveConfig({
            ...currentFullConfig(),
            Source: connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh, value)
        }).catch(err => console.error("save source auto-connect failed:", err))
    }

    function setSinkAutoConnect(value) {
        setSinkAutoConnectState(value)
        SaveConfig({
            ...currentFullConfig(),
            Sink: connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh, value)
        }).catch(err => console.error("save sink auto-connect failed:", err))
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
        const setStatus = isSource ? setSourceStatus : setSinkStatus
        const setLastError = isSource ? setSourceLastError : setSinkLastError
        setStatus('connecting')
        const config = isSource
            ? connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh, sourceAutoConnect)
            : connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh, sinkAutoConnect)
        Connect(config, isSource)
            .then(() => isSource ? GetZones() : Promise.resolve())
            .then(zones => {
                if (isSource) {
                    setZones(zones)
                }
                setStatus('connected')
                setLastError(null)
                setActiveModal(null)
                SaveConfig(currentFullConfig()).catch(err => console.error("save config failed:", err))
            })
            .catch(err => {
                setConnectError(String(err))
                setStatus('error')
                setLastError(String(err))
            })
            .finally(() => setConnecting(false))
    }

    // On-demand disconnect for one side — the counterpart to connect(), triggered from the
    // sidebar's own "Disconnect" button rather than the modal (there's nothing to edit or confirm,
    // just an action to take). Clears zones on a source disconnect since they're fetched
    // exclusively from source and would otherwise silently go stale in the zone list. Deliberately
    // does NOT touch sourceAutoConnect/sinkAutoConnect — disconnecting now says nothing about
    // whether the next app start should reconnect, that's what the separate toggle is for.
    function disconnect(isSource) {
        const setStatus = isSource ? setSourceStatus : setSinkStatus
        const setLastError = isSource ? setSourceLastError : setSinkLastError
        Disconnect(isSource)
            .then(() => {
                setStatus('disconnected')
                setLastError(null)
                if (isSource) setZones([])
            })
            .catch(err => console.error(`disconnect ${isSource ? 'source' : 'sink'} failed:`, err))
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
                const sourceAutoConnectWanted = hydrateAutoConnect(config.Source)
                const sinkAutoConnectWanted = hydrateAutoConnect(config.Sink)
                setSourceAutoConnectState(sourceAutoConnectWanted)
                setSinkAutoConnectState(sinkAutoConnectWanted)
                setMapsDirectory(config.MapsDirectory ?? '')
                setExcludedNpcFields(config.ExcludedNPCFields ?? [])

                // A config.json written before this field existed has no UI key at all; a zero
                // value here (SidebarWidth: 0, etc.) means "never explicitly set" either way, so
                // falling back to the existing hardcoded defaults is correct in both cases.
                if (config.UI) {
                    if (config.UI.SidebarWidth) uiPrefs.setSidebarWidth(config.UI.SidebarWidth)
                    if (config.UI.DetailWidth) uiPrefs.setDetailWidth(config.UI.DetailWidth)
                    uiPrefs.setSidebarCollapsed(!!config.UI.SidebarCollapsed)
                }

                // auto-connect source — only if this side's own saved preference wants it (see
                // AutoConnect's own comment for why this is the actual fix for "I don't want an
                // active SSH connection restarting every time I rebuild during development").
                if (sourceAutoConnectWanted) {
                    setSourceStatus('connecting')
                    Connect(config.Source, true)
                        .then(() => GetZones())
                        .then(zones => {
                            setZones(zones)
                            setSourceStatus('connected')
                        })
                        .catch(err => {
                            setSourceStatus('error')
                            setSourceLastError(String(err))
                        })
                }

                // auto-connect sink
                if (sinkAutoConnectWanted) {
                    setSinkStatus('connecting')
                    Connect(config.Sink, false)
                        .then(() => setSinkStatus('connected'))
                        .catch(err => {
                            setSinkStatus('error')
                            setSinkLastError(String(err))
                        })
                }
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
        connecting,
        sourceStatus, sinkStatus,
        sourceLastError, sinkLastError,
        sourceAutoConnect, setSourceAutoConnect, sinkAutoConnect, setSinkAutoConnect,
        disconnect,
        mapsDirectory, setMapsDirectory: setAndPersistMapsDirectory,
        excludedNpcFields, setExcludedNpcFields: setAndPersistExcludedNpcFields,
        connect, persistUIPrefs
    }
}
