import {useState} from 'react';
import './App.css';
import {Connect, GetZones} from "../wailsjs/go/main/App";

function App() {
    const [zones, setZones] = useState([])
    const [host, setHost] = useState('')
    const [port, setPort] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [dbName, setDbName] = useState('')
    const [showModal, setShowModal] = useState(false)

    function connectSource() {
        const config = {
            Host: host,
            Port: port,
            Username: username,
            Password: password,
            DbName: dbName
        }

        Connect(config, true)
            .then(() => {
                console.log("connected")
                return GetZones()
            })
            .then(zones => {
                console.log("zones:", zones)
                setZones(zones)
                setShowModal(false)
            })
            .catch(err => console.error("connection failed:", err))
    }

    return (
        <div id="App" className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
            {showModal && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium">Connect Source</h2>
                        <button onClick={() => setShowModal(false)}>✕</button>
                    </div>
                    <label>Host</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={host} onChange={e => setHost(e.target.value)}/>
                    <label>Port</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={port} onChange={e => setPort(e.target.value)}/>
                    <label>Username</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={username} onChange={e => setUsername(e.target.value)}/>
                    <label>Password</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={password} onChange={e => setPassword(e.target.value)} type="password"/>
                    <label>Database</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1" value={dbName} onChange={e => setDbName(e.target.value)}/>
                    <button onClick={connectSource}>Connect Source</button>
                </div>
            </div>}
            <div className="flex flex-1 min-h-0">
                <div className="w-64 bg-gray-800 flex flex-col h-full min-h-0">
                    <div className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                        Connections
                    </div>
                    <div className="px-3 py-2 flex justify-between items-center">
                        <button onClick={() => setShowModal(true)} className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:text-white hover:border-gray-400">
                            + Add
                        </button>
                    </div>
                    <div className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-t border-b border-gray-700">
                        Zones
                    </div>
                    <div className="overflow-y-auto flex-1 pl-4 pt-2">
                    <ul>
                        {zones.map(zone => (
                            <li key={zone.Id}>{zone.ShortName}</li>
                        ))}
                    </ul>
                    </div>
                </div>
                <div id="input" className="w-1/2 flex flex-col">
                    <div>
                        <h3>Source</h3>
                    </div>
                    <div>
                        <h3>Sink</h3>
                    </div>
                </div>
                <div className="w-1/2 bg-gray-800">
                </div>
            </div>
        </div>
    )
}

export default App
