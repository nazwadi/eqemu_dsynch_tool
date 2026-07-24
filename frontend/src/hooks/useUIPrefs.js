import {useState} from 'react';

// Sidebar/detail panel layout prefs — deliberately just state + setters, no persistence logic of
// its own. Persisting them means writing the *whole* Config file (Source/Sink/UI together, see
// Go's Config type), so that logic lives in useConnections (which owns connect()'s own SaveConfig
// call too) rather than being split in a way that risks one call overwriting the other's half with
// zero values — see useConnections' persistUIPrefs for the full reasoning.
export function useUIPrefs() {
    const [sidebarWidth, setSidebarWidth] = useState(256)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [detailWidth, setDetailWidth] = useState(240)

    return {
        sidebarWidth, setSidebarWidth,
        sidebarCollapsed, setSidebarCollapsed,
        detailWidth, setDetailWidth
    }
}
