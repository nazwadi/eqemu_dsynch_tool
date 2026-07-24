import {PickPrivateKeyFile} from '../../wailsjs/go/main/App';
import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// The Connect/Edit modal for either database (activeModal is 'source' | 'sink' | null). Kept as
// one component covering both sides (mirroring the ternary pattern already used throughout) rather
// than two near-identical components, since the only difference between them is which set of
// fields/setters is currently active. Owns its own focus-on-open ref/effect rather than taking it
// as a prop — that behavior is entirely internal to this modal, so there's no reason for App.jsx
// to know it exists.
//
// SSH tunnel fields (added 2026-07-19) are gated behind a "Connect via SSH tunnel" checkbox,
// hidden until enabled — the same progressive-disclosure pattern TablePlus/DBeaver/Navicat all use
// for the same reason: most connections never need this, so it shouldn't cost permanent space or
// attention in the common case. ssh/setSsh carry one side's whole SSH sub-config as a single
// object (host/port/username/authMethod/password/privateKeyPath/passphrase) rather than seven more
// individual value+setter prop pairs on top of the ten this modal already has — App.jsx resolves
// which side's object to pass down the same way it already does for every other field here.
function ConnectModal({
    activeModal, setActiveModal, connectError, setConnectError, connecting, connect,
    sourceHost, setSourceHost, sourcePort, setSourcePort, sourceUsername, setSourceUsername,
    sourcePassword, setSourcePassword, dbSourceName, setDbSourceName,
    sinkHost, setSinkHost, sinkPort, setSinkPort, sinkUsername, setSinkUsername,
    sinkPassword, setSinkPassword, dbSinkName, setDbSinkName,
    ssh, setSsh
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(activeModal, () => {
        setActiveModal(null)
        setConnectError(null)
    })

    if (!activeModal) return null

    function updateSsh(field, value) {
        setSsh(prev => ({...prev, [field]: value}))
    }

    async function browseForPrivateKey() {
        const path = await PickPrivateKeyFile().catch(() => '')
        if (path) updateSsh('privateKeyPath', path)
    }

    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            onClick={e => {
                // Only the backdrop itself, not a click that bubbled up from the modal box —
                // this isn't a destructive action (unlike the Confirm modals, which deliberately
                // don't offer this), so dismissing on an outside click is a safe convenience.
                if (e.target === e.currentTarget) {
                    setActiveModal(null)
                    setConnectError(null)
                }
            }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 max-h-[85vh] overflow-y-auto flex flex-col gap-3">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">{activeModal === 'source' ? 'Connect Source' : 'Connect Sink'}</h2>
                    <button onClick={() => {
                        setActiveModal(null)
                        setConnectError(null)
                    }} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                <label>Host</label>
                <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                       value={activeModal === 'source' ? sourceHost : sinkHost}
                       onChange={e => activeModal === 'source' ? setSourceHost(e.target.value) : setSinkHost(e.target.value)}
                       autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                <label>Port</label>
                <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                       value={activeModal === 'source' ? sourcePort : sinkPort}
                       onChange={e => activeModal === 'source' ? setSourcePort(e.target.value) : setSinkPort(e.target.value)}/>
                <label>Username</label>
                <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                       value={activeModal === 'source' ? sourceUsername : sinkUsername}
                       onChange={e => activeModal === 'source' ? setSourceUsername(e.target.value) : setSinkUsername(e.target.value)}
                       autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                <label>Password</label>
                <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                       value={activeModal === 'source' ? sourcePassword : sinkPassword}
                       onChange={e => activeModal === 'source' ? setSourcePassword(e.target.value) : setSinkPassword(e.target.value)}
                       type="password"/>
                <label>Database</label>
                <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                       value={activeModal === 'source' ? dbSourceName : dbSinkName}
                       onChange={e => activeModal === 'source' ? setDbSourceName(e.target.value) : setDbSinkName(e.target.value)}
                       autoCapitalize="off" autoCorrect="off" spellCheck={false}/>

                <div className="border-t border-gray-700 pt-3 mt-1 flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox"
                               className="accent-yellow-400 cursor-pointer w-3.5 h-3.5"
                               checked={ssh.enabled}
                               onChange={e => updateSsh('enabled', e.target.checked)}/>
                        Connect via SSH tunnel
                    </label>
                    {ssh.enabled && (
                        <div className="flex flex-col gap-2 pl-3 border-l-2 border-gray-700 ml-1">
                            <label className="text-xs text-gray-400">SSH Host</label>
                            <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                                   value={ssh.host}
                                   onChange={e => updateSsh('host', e.target.value)}
                                   autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                            <label className="text-xs text-gray-400">SSH Port</label>
                            <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                                   value={ssh.port}
                                   onChange={e => updateSsh('port', e.target.value)}/>
                            <label className="text-xs text-gray-400">SSH Username</label>
                            <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                                   value={ssh.username}
                                   onChange={e => updateSsh('username', e.target.value)}
                                   autoCapitalize="off" autoCorrect="off" spellCheck={false}/>

                            <div className="flex gap-1 mt-1">
                                <button type="button"
                                        onClick={() => updateSsh('authMethod', 'privateKey')}
                                        className={`flex-1 text-xs px-2 py-1 rounded border cursor-pointer ${ssh.authMethod === 'privateKey' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                    Private Key
                                </button>
                                <button type="button"
                                        onClick={() => updateSsh('authMethod', 'password')}
                                        className={`flex-1 text-xs px-2 py-1 rounded border cursor-pointer ${ssh.authMethod === 'password' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                    Password
                                </button>
                            </div>

                            {ssh.authMethod === 'privateKey' ? (
                                <>
                                    <label className="text-xs text-gray-400">Private Key File</label>
                                    <div className="flex gap-2">
                                        <input className="flex-1 min-w-0 border border-gray-600 bg-gray-700 rounded px-2 py-1 text-xs truncate"
                                               readOnly
                                               value={ssh.privateKeyPath}
                                               placeholder="No file selected"
                                               title={ssh.privateKeyPath || 'No file selected'}/>
                                        <button type="button" onClick={browseForPrivateKey}
                                                className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400 cursor-pointer shrink-0">
                                            Browse…
                                        </button>
                                    </div>
                                    <label className="text-xs text-gray-400">Passphrase <span className="text-gray-600">(if the key is encrypted)</span></label>
                                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                                           type="password"
                                           value={ssh.passphrase}
                                           onChange={e => updateSsh('passphrase', e.target.value)}/>
                                </>
                            ) : (
                                <>
                                    <label className="text-xs text-gray-400">SSH Password</label>
                                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                                           type="password"
                                           value={ssh.password}
                                           onChange={e => updateSsh('password', e.target.value)}/>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {connectError && (
                    <div className="text-xs text-red-400 bg-red-950 border border-red-800 rounded px-2 py-1">
                        {connectError}
                    </div>
                )}
                <button onClick={connect} disabled={connecting}
                        className="text-sm px-3 py-2 rounded font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                    {connecting ? 'Connecting…' : (activeModal === 'source' ? 'Connect Source' : 'Connect Sink')}
                </button>
            </div>
        </div>
    )
}

export default ConnectModal
