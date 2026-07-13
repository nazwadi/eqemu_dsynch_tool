import {useState} from 'react';
import './App.css';
import {Connect, GetNPCsForZone, GetZones} from "../wailsjs/go/main/App";

function App() {
    const [zones, setZones] = useState([])
    const [host, setHost] = useState('')
    const [port, setPort] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [dbName, setDbName] = useState('')
    const [activeModal, setActiveModal] = useState(null)
    const [searchFilter, setSearchFilter] = useState('')
    const [selectedZone, setSelectedZone] = useState('')
    const [selectedNpc, setSelectedNpc] = useState('')
    const [npcs, setNpcs] = useState([])
    const [sourceConnected, setSourceConnected] = useState(false)
    const [sinkConnected, setSinkConnected] = useState(false)

    function connect() {
        const config = {
            Host: host,
            Port: port,
            Username: username,
            Password: password,
            DbName: dbName
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
            })
            .catch(err => console.error("connection failed:", err))
    }

    return (
        <div id="App" className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
            {activeModal && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium">Connect Source</h2>
                        <button onClick={() => setActiveModal(null)}>✕</button>
                    </div>
                    <label>Host</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={host}
                           onChange={e => setHost(e.target.value)}/>
                    <label>Port</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={port}
                           onChange={e => setPort(e.target.value)}/>
                    <label>Username</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={username}
                           onChange={e => setUsername(e.target.value)}/>
                    <label>Password</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={password}
                           onChange={e => setPassword(e.target.value)} type="password"/>
                    <label>Database</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={dbName}
                           onChange={e => setDbName(e.target.value)}/>
                    <button onClick={connect}>
                        {activeModal === 'source' ? 'Connect Source' : 'Connect Sink'}
                    </button>
                </div>
            </div>}
            <div className="flex flex-1 min-h-0">
                <div className="w-64 bg-gray-800 flex flex-col h-full min-h-0">
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                        Connections
                    </div>
                    <div className="px-3 py-2 flex flex-col gap-2">
                        <div className="border border-gray-600 rounded p-2 flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-400">Source</div>
                                <div className="text-xs text-white">{sourceConnected ? host : 'Not connected'}</div>
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
                                <div className="text-xs text-white">{sinkConnected ? host : 'Not connected'}</div>
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
                                                setSelectedZone(zone.ShortName)
                                                GetNPCsForZone(zone.ShortName)
                                                    .then(npcs => setNpcs(npcs))
                                            }}
                                            key={zone.Id}
                                            className={selectedZone === zone.ShortName ? 'text-yellow-400 cursor-pointer' : 'cursor-pointer'}
                                        >
                                            {zone.ShortName}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                </div>
                <div id="input" className="w-1/2 flex flex-col">
                    <div className="justify-center">
                        <div
                            className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                            NPC's that Spawn in {selectedZone}
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 pl-4 pt-2">
                        <div className="overflow-y-auto">
                            <ul>
                                {npcs
                                    .filter(npc => npc.Name.toLowerCase().includes(searchFilter.toLowerCase()))
                                    .map(npc => (
                                        <li
                                            onClick={() => setSelectedNpc(npc.Name)}
                                            key={npc.Id}
                                            className={selectedNpc === npc.Name ? 'text-yellow-400 cursor-pointer' : 'cursor-pointer'}
                                        >
                                            {npc.Name}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                </div>
                <div className="w-1/2 bg-gray-800">
                </div>
            </div>
        </div>
    )
}

export default App
