import {useState, useEffect} from 'react';
import './App.css';
import {Connect, CompareZones, LoadConfig, SaveConfig, GetZones} from "../wailsjs/go/main/App";

function App() {
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
    const [activeModal, setActiveModal] = useState(null)
    const [searchFilter, setSearchFilter] = useState('')
    const [selectedZoneShortName, setSelectedZoneShortName] = useState('')
    const [selectedZoneLongName, setSelectedZoneLongName] = useState('')
    const [selectedNpc, setSelectedNpc] = useState(null)
    const [diffRows, setDiffRows] = useState([])
    const [sourceConnected, setSourceConnected] = useState(false)
    const [sinkConnected, setSinkConnected] = useState(false)

    function connect() {
        const config = {
            Host: activeModal === 'source' ? sourceHost : sinkHost,
            Port: activeModal === 'source' ? sourcePort : sinkPort,
            Username: activeModal === 'source' ? sourceUsername : sinkUsername,
            Password: activeModal === 'source' ? sourcePassword : sinkPassword,
            DbName: activeModal === 'source' ? dbSourceName : dbSinkName
        }
        const isSource = activeModal === 'source'
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
                SaveConfig({
                    Source: {
                        Host: sourceHost,
                        Port: sourcePort,
                        Username: sourceUsername,
                        Password: sourcePassword,
                        DbName: dbSourceName
                    },
                    Sink: {
                        Host: sinkHost,
                        Port: sinkPort,
                        Username: sinkUsername,
                        Password: sinkPassword,
                        DbName: dbSinkName
                    }
                }).catch(err => console.error("save config failed:", err))
            })
            .catch(err => console.error("connection failed:", err))
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

                // auto-connect source
                Connect(config.Source, true)
                    .then(() => GetZones())
                    .then(zones => {
                        setZones(zones)
                        setSourceConnected(true)
                    })
                    .catch(() => {})

                // auto-connect sink
                Connect(config.Sink, false)
                    .then(() => setSinkConnected(true))
                    .catch(() => {})
            })
            .catch(() => {}) // ignore if no config file yet
    }, [])

    return (
        <div id="App" className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
            {activeModal && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium">Connect Source</h2>
                        <button onClick={() => setActiveModal(null)}>✕</button>
                    </div>
                    <label>Host</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={activeModal === 'source' ? sourceHost : sinkHost}
                           onChange={e => activeModal === 'source' ? setSourceHost(e.target.value) : setSinkHost(e.target.value)}/>
                    <label>Port</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={activeModal === 'source' ? sourcePort : sinkPort}
                           onChange={e => activeModal === 'source' ? setSourcePort(e.target.value) : setSinkPort(e.target.value)}/>
                    <label>Username</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={activeModal === 'source' ? sourceUsername : sinkUsername}
                           onChange={e => activeModal === 'source' ? setSourceUsername(e.target.value) : setSinkUsername(e.target.value)}/>
                    <label>Password</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={activeModal === 'source' ? sourcePassword : sinkPassword}
                           onChange={e => activeModal === 'source' ? setSourcePassword(e.target.value) : setSinkPassword(e.target.value)} type="password"/>
                    <label>Database</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                           value={activeModal === 'source' ? dbSourceName: dbSinkName}
                           onChange={e => activeModal === 'source' ? setDbSourceName(e.target.value) : setDbSinkName(e.target.value)}/>
                    <button onClick={connect}>
                        {activeModal === 'source' ? 'Connect Source' : 'Connect Sink'}
                    </button>
                </div>
            </div>}
            <div className="flex flex-1 min-h-0">
                <div className="w-64 bg-gray-900 border-b border-gray-700 flex flex-col h-full min-h-0">
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                        Connections
                    </div>
                    <div className="px-3 py-2 flex flex-col gap-2">
                        <div className="border border-gray-600 rounded p-2 flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-400">Source</div>
                                <div className="text-xs text-white">{sourceConnected ? sourceHost : 'Not connected'}</div>
                            </div>
                            <div className="flex flex-items gap-2">
                                <div
                                    className={`w-2 h-2 rounded-full ${sourceConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <button onClick={() => setActiveModal('source')}
                                        className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:text-white hover:border-gray-400">
                                    {sourceConnected ? 'Edit' : 'Connect'}
                                </button>
                            </div>
                        </div>
                        <div className="border border-gray-600 rounded p-2 flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-400">Sink</div>
                                <div className="text-xs text-white">{sinkConnected ? sinkHost : 'Not connected'}</div>
                            </div>
                            <div className="flex flex-items gap-2">
                                <div
                                    className={`w-2 h-2 rounded-full ${sinkConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <button onClick={() => setActiveModal('sink')}
                                        className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:text-white hover:border-gray-400">
                                    {sinkConnected ? 'Edit' : 'Connect'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-t border-b border-gray-700">
                        Zones
                    </div>
                    <div className="px-3 py-2">
                        <input className="w-full border border-gray-600 bg-gray-700 rounded px-2 py-1 text-sm"
                               placeholder="Filter zones..."
                               value={searchFilter}
                               onChange={e => setSearchFilter(e.target.value)}/>
                    </div>
                    <div className="overflow-y-auto flex-1 pl-4 pt-2">
                        <div className="overflow-y-auto">
                            <ul>
                                {zones
                                    .filter(zone => zone.ShortName.toLowerCase().includes(searchFilter.toLowerCase()))
                                    .map(zone => (
                                        <li
                                            onClick={() => {
                                                setSelectedZoneShortName(zone.ShortName)
                                                setSelectedZoneLongName(zone.LongName)
                                                CompareZones(zone.ShortName).then(diffRows => setDiffRows(diffRows))
                                            }}
                                            key={zone.Id}
                                            className={selectedZoneShortName === zone.ShortName ? 'text-yellow-400 cursor-pointer' : 'cursor-pointer'}
                                        >
                                            {zone.ShortName}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                </div>
                <div id="input" className="w-1/2 flex flex-1 flex-col">
                    <div className="justify-center">
                        <div
                            className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                            {selectedZoneLongName} - {selectedZoneShortName}
                        </div>
                    </div>
                    <div className="flex flex-1 min-h-0 overflow-hidden flex-col overflow-y-auto">
                        {diffRows.map((row, index) => (
                            <div key={index} className={`flex border-b border-gray-800 ${
                                row.Status === 'new' ? 'bg-green-950' :
                                row.Status === 'removed' ? 'bg-red-950' :
                                row.Status === 'modified' ? 'bg-yellow-950' :
                                'bg-transparent'
                            }`} onClick={() => setSelectedNpc(row)}>
                                <div className="flex-1 test-xs px-2 py-1">{row.Source?.Name} ({row.Source?.Id})</div>
                                <div className="flex-1 test-xs px-2 py-1 border border-gray-700">{row.Sink?.Name} ({row.Sink?.Id})</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="w-64 bg-gray-800">
                    <div className="justify-center">
                        <div
                            className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                            NPC Detail
                        </div>
                        <div className="px-3 py-2 flex flex-col gap-3 text-xs">
                            {selectedNpc && <>
                                <div>
                                    <div className="text-gray-400 uppercase tracking-wider mb-1">Status</div>
                                    <div className="text-yellow-400">{selectedNpc.Status}</div>
                                </div>
                                {[
                                    {label: 'Name', key: 'Name'},
                                    {label: 'Level', key: 'Level'},
                                    {label: 'HP', key: 'HP'},
                                    {label: 'Race', key: 'Race'},
                                    {label: 'Class', key: 'Class'},
                                ].map(field => {
                                    const srcVal = selectedNpc.Source?.[field.key]
                                    const sinkVal = selectedNpc.Sink?.[field.key]
                                    const differs = srcVal !== sinkVal
                                    return (
                                        <div key={field.key}>
                                            <div className="text-gray-400 uppercase tracking-wider mb-1">{field.label}</div>
                                            <div className="flex gap-2">
                                                <span className={differs ? 'text-yellow-400' : 'text-gray-300'}>{srcVal ?? '—'}</span>
                                                <span className="text-gray-600">→</span>
                                                <span className={differs ? 'text-yellow-400' : 'text-gray-300'}>{sinkVal ?? '—'}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
