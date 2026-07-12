import {useState, useEffect} from 'react';
import logo from './assets/images/logo-universal.png';
import './App.css';
import {Greet} from "../wailsjs/go/main/App";
import {GetZones} from "../wailsjs/go/main/App";
import {Connect} from "../wailsjs/go/main/App";

function App() {
    const [resultText, setResultText] = useState("Please enter your name below 👇");
    const [name, setName] = useState('');
    const [zones, setZones] = useState([])
    const [host, setHost] = useState('')
    const [port, setPort] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [dbName, setDbName] = useState('')
    const updateName = (e) => setName(e.target.value);
    const updateResultText = (result) => setResultText(result);
    function greet() {
        Greet(name).then(updateResultText);
    }
    function connectSource() {
        const config = {
            Host: host,
            Port: port,
            Username: username,
            Password: password,
            DbName: dbName
        }

        Connect(config, true)
            .then(() => console.log("connected"))
            .catch(err => console.error("connection failed:", err))
    }
    useEffect(() => {
        GetZones().then(zones => setZones(zones));
    }, []);

    return (
        <div id="App">
            <img src={logo} id="logo" alt="logo"/>
            <div id="result" className="result">{resultText}</div>
            <div id="input" className="input-box">
                <input id="name" className="input" onChange={updateName} autoComplete="off" name="input" type="text"/>
                <button className="btn" onClick={greet}>Greet</button>
            </div>
            <div id="input" className="input-box">
                <input value={host} onChange={e => setHost(e.target.value)} />
                <input value={port} onChange={e => setPort(e.target.value)} />
                <input value={username} onChange={e => setUsername(e.target.value)} />
                <input value={password} onChange={e => setPassword(e.target.value)} />
                <input value={dbName} onChange={e => setDbName(e.target.value)} />
                <button onClick={connectSource}>Connect Source</button>
            </div>
            <ul>
                {zones.map(zone => (
                    <li key={zone.Id}>{zone.ShortName}</li>
                ))}
            </ul>
        </div>
    )
}

export default App
