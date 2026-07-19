import {useEffect, useRef} from 'react';

// The Connect/Edit modal for either database (activeModal is 'source' | 'sink' | null). Kept as
// one component covering both sides (mirroring the ternary pattern already used throughout) rather
// than two near-identical components, since the only difference between them is which set of
// fields/setters is currently active. Owns its own focus-on-open ref/effect rather than taking it
// as a prop — that behavior is entirely internal to this modal, so there's no reason for App.jsx
// to know it exists.
function ConnectModal({
    activeModal, setActiveModal, connectError, setConnectError, connecting, connect,
    sourceHost, setSourceHost, sourcePort, setSourcePort, sourceUsername, setSourceUsername,
    sourcePassword, setSourcePassword, dbSourceName, setDbSourceName,
    sinkHost, setSinkHost, sinkPort, setSinkPort, sinkUsername, setSinkUsername,
    sinkPassword, setSinkPassword, dbSinkName, setDbSinkName
}) {
    const connectModalRef = useRef(null)
    useEffect(() => {
        if (activeModal) connectModalRef.current?.focus()
    }, [activeModal])

    if (!activeModal) return null
    return (
        <div
            ref={connectModalRef}
            tabIndex={-1}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    setActiveModal(null)
                    setConnectError(null)
                }
            }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">{activeModal === 'source' ? 'Connect Source' : 'Connect Sink'}</h2>
                    <button onClick={() => {
                        setActiveModal(null)
                        setConnectError(null)
                    }}>✕</button>
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
                {connectError && (
                    <div className="text-xs text-red-400 bg-red-950 border border-red-800 rounded px-2 py-1">
                        {connectError}
                    </div>
                )}
                <button onClick={connect} disabled={connecting}>
                    {connecting ? 'Connecting…' : (activeModal === 'source' ? 'Connect Source' : 'Connect Sink')}
                </button>
            </div>
        </div>
    )
}

export default ConnectModal
