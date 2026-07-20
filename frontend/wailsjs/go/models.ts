export namespace main {
	
	export class UIPrefs {
	    SidebarWidth: number;
	    SidebarCollapsed: boolean;
	    DetailWidth: number;
	
	    static createFrom(source: any = {}) {
	        return new UIPrefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.SidebarWidth = source["SidebarWidth"];
	        this.SidebarCollapsed = source["SidebarCollapsed"];
	        this.DetailWidth = source["DetailWidth"];
	    }
	}
	export class SshConfig {
	    Host: string;
	    Port: string;
	    Username: string;
	    AuthMethod: string;
	    Password: string;
	    PrivateKeyPath: string;
	    Passphrase: string;
	
	    static createFrom(source: any = {}) {
	        return new SshConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Host = source["Host"];
	        this.Port = source["Port"];
	        this.Username = source["Username"];
	        this.AuthMethod = source["AuthMethod"];
	        this.Password = source["Password"];
	        this.PrivateKeyPath = source["PrivateKeyPath"];
	        this.Passphrase = source["Passphrase"];
	    }
	}
	export class ConnectionConfig {
	    DbName: string;
	    Host: string;
	    Port: string;
	    Username: string;
	    Password: string;
	    UseSSH: boolean;
	    SshConfig: SshConfig;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DbName = source["DbName"];
	        this.Host = source["Host"];
	        this.Port = source["Port"];
	        this.Username = source["Username"];
	        this.Password = source["Password"];
	        this.UseSSH = source["UseSSH"];
	        this.SshConfig = this.convertValues(source["SshConfig"], SshConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Config {
	    Source: ConnectionConfig;
	    Sink: ConnectionConfig;
	    UI: UIPrefs;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Source = this.convertValues(source["Source"], ConnectionConfig);
	        this.Sink = this.convertValues(source["Sink"], ConnectionConfig);
	        this.UI = this.convertValues(source["UI"], UIPrefs);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class GridEntry {
	    Number: number;
	    X: number;
	    Y: number;
	    Z: number;
	    Heading: number;
	    Pause: number;
	    Centerpoint: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GridEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Number = source["Number"];
	        this.X = source["X"];
	        this.Y = source["Y"];
	        this.Z = source["Z"];
	        this.Heading = source["Heading"];
	        this.Pause = source["Pause"];
	        this.Centerpoint = source["Centerpoint"];
	    }
	}
	export class GridPoint {
	    Id: number;
	    Fields: Record<string, any>;
	    Entries: GridEntry[];
	
	    static createFrom(source: any = {}) {
	        return new GridPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Id = source["Id"];
	        this.Fields = source["Fields"];
	        this.Entries = this.convertValues(source["Entries"], GridEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GridDiffRow {
	    Status: string;
	    Source?: GridPoint;
	    Sink?: GridPoint;
	    FieldsDiffer: boolean;
	    EntriesDiffer: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GridDiffRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Status = source["Status"];
	        this.Source = this.convertValues(source["Source"], GridPoint);
	        this.Sink = this.convertValues(source["Sink"], GridPoint);
	        this.FieldsDiffer = source["FieldsDiffer"];
	        this.EntriesDiffer = source["EntriesDiffer"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class NPC {
	    Id: number;
	    HasSpawnPoint: boolean;
	    Fields: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new NPC(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Id = source["Id"];
	        this.HasSpawnPoint = source["HasSpawnPoint"];
	        this.Fields = source["Fields"];
	    }
	}
	export class NPCDiffRow {
	    Status: string;
	    Source?: NPC;
	    Sink?: NPC;
	
	    static createFrom(source: any = {}) {
	        return new NPCDiffRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Status = source["Status"];
	        this.Source = this.convertValues(source["Source"], NPC);
	        this.Sink = this.convertValues(source["Sink"], NPC);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NPCFactionEntryDiff {
	    FactionID: number;
	    FactionName: string;
	    SourceExists: boolean;
	    SourceValue: number;
	    SourceNPCValue: number;
	    SourceTemp: number;
	    SinkExists: boolean;
	    SinkValue: number;
	    SinkNPCValue: number;
	    SinkTemp: number;
	    Differs: boolean;
	
	    static createFrom(source: any = {}) {
	        return new NPCFactionEntryDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.FactionID = source["FactionID"];
	        this.FactionName = source["FactionName"];
	        this.SourceExists = source["SourceExists"];
	        this.SourceValue = source["SourceValue"];
	        this.SourceNPCValue = source["SourceNPCValue"];
	        this.SourceTemp = source["SourceTemp"];
	        this.SinkExists = source["SinkExists"];
	        this.SinkValue = source["SinkValue"];
	        this.SinkNPCValue = source["SinkNPCValue"];
	        this.SinkTemp = source["SinkTemp"];
	        this.Differs = source["Differs"];
	    }
	}
	export class NPCFactionComparison {
	    SourceId: number;
	    SinkId: number;
	    SourceFields: Record<string, any>;
	    SinkFields: Record<string, any>;
	    Entries: NPCFactionEntryDiff[];
	
	    static createFrom(source: any = {}) {
	        return new NPCFactionComparison(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.SourceId = source["SourceId"];
	        this.SinkId = source["SinkId"];
	        this.SourceFields = source["SourceFields"];
	        this.SinkFields = source["SinkFields"];
	        this.Entries = this.convertValues(source["Entries"], NPCFactionEntryDiff);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PoolEntry {
	    NPCID: number;
	    NPCName: string;
	    Chance: number;
	    Orphaned: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PoolEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.NPCID = source["NPCID"];
	        this.NPCName = source["NPCName"];
	        this.Chance = source["Chance"];
	        this.Orphaned = source["Orphaned"];
	    }
	}
	export class SkippedNPC {
	    NPCID: number;
	    Name: string;
	    Reason: string;
	
	    static createFrom(source: any = {}) {
	        return new SkippedNPC(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.NPCID = source["NPCID"];
	        this.Name = source["Name"];
	        this.Reason = source["Reason"];
	    }
	}
	export class SkippedSpawn {
	    X: number;
	    Y: number;
	    Z: number;
	    Reason: string;
	
	    static createFrom(source: any = {}) {
	        return new SkippedSpawn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.X = source["X"];
	        this.Y = source["Y"];
	        this.Z = source["Z"];
	        this.Reason = source["Reason"];
	    }
	}
	export class SpawnPoint {
	    Id: number;
	    SpawnGroupId: number;
	    SpawnGroupFields: Record<string, any>;
	    LocationSharedCount: number;
	    Fields: Record<string, any>;
	    Pool: PoolEntry[];
	
	    static createFrom(source: any = {}) {
	        return new SpawnPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Id = source["Id"];
	        this.SpawnGroupId = source["SpawnGroupId"];
	        this.SpawnGroupFields = source["SpawnGroupFields"];
	        this.LocationSharedCount = source["LocationSharedCount"];
	        this.Fields = source["Fields"];
	        this.Pool = this.convertValues(source["Pool"], PoolEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SpawnDiffRow {
	    Status: string;
	    Source?: SpawnPoint;
	    Sink?: SpawnPoint;
	    FieldsDiffer: boolean;
	    PoolDiffers: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SpawnDiffRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Status = source["Status"];
	        this.Source = this.convertValues(source["Source"], SpawnPoint);
	        this.Sink = this.convertValues(source["Sink"], SpawnPoint);
	        this.FieldsDiffer = source["FieldsDiffer"];
	        this.PoolDiffers = source["PoolDiffers"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SpawnGroupDiffRow {
	    Status: string;
	    SourceGroupId: number;
	    SinkGroupId: number;
	    Name: string;
	    SourceFields: Record<string, any>;
	    SinkFields: Record<string, any>;
	    SourcePool: PoolEntry[];
	    SinkPool: PoolEntry[];
	    SourceLocationCount: number;
	    SinkLocationCount: number;
	    FieldsDiffer: boolean;
	    PoolDiffers: boolean;
	    AmbiguousSinkGroupIds: number[];
	    SampleCoord: number[];
	
	    static createFrom(source: any = {}) {
	        return new SpawnGroupDiffRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Status = source["Status"];
	        this.SourceGroupId = source["SourceGroupId"];
	        this.SinkGroupId = source["SinkGroupId"];
	        this.Name = source["Name"];
	        this.SourceFields = source["SourceFields"];
	        this.SinkFields = source["SinkFields"];
	        this.SourcePool = this.convertValues(source["SourcePool"], PoolEntry);
	        this.SinkPool = this.convertValues(source["SinkPool"], PoolEntry);
	        this.SourceLocationCount = source["SourceLocationCount"];
	        this.SinkLocationCount = source["SinkLocationCount"];
	        this.FieldsDiffer = source["FieldsDiffer"];
	        this.PoolDiffers = source["PoolDiffers"];
	        this.AmbiguousSinkGroupIds = source["AmbiguousSinkGroupIds"];
	        this.SampleCoord = source["SampleCoord"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SpawnGroupZoneUsage {
	    Zone: string;
	    Version: number;
	    Count: number;
	
	    static createFrom(source: any = {}) {
	        return new SpawnGroupZoneUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Zone = source["Zone"];
	        this.Version = source["Version"];
	        this.Count = source["Count"];
	    }
	}
	export class SpawnGroupSyncResult {
	    DryRun: boolean;
	    SpawnGroupName: string;
	    FieldsChanged: boolean;
	    EntriesBefore: number;
	    EntriesAfter: number;
	    OtherZoneUsage: SpawnGroupZoneUsage[];
	    NotFound: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SpawnGroupSyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DryRun = source["DryRun"];
	        this.SpawnGroupName = source["SpawnGroupName"];
	        this.FieldsChanged = source["FieldsChanged"];
	        this.EntriesBefore = source["EntriesBefore"];
	        this.EntriesAfter = source["EntriesAfter"];
	        this.OtherZoneUsage = this.convertValues(source["OtherZoneUsage"], SpawnGroupZoneUsage);
	        this.NotFound = source["NotFound"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class SpawnSyncOptions {
	    ZoneShortName: string;
	    ZoneVersion: number;
	    DryRun: boolean;
	    SpawnIds: number[];
	    NewSpawnCoords: number[][];
	
	    static createFrom(source: any = {}) {
	        return new SpawnSyncOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ZoneShortName = source["ZoneShortName"];
	        this.ZoneVersion = source["ZoneVersion"];
	        this.DryRun = source["DryRun"];
	        this.SpawnIds = source["SpawnIds"];
	        this.NewSpawnCoords = source["NewSpawnCoords"];
	    }
	}
	export class SpawnSyncResult {
	    DryRun: boolean;
	    Created: number;
	    Updated: number;
	    Skipped: SkippedSpawn[];
	    Errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new SpawnSyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DryRun = source["DryRun"];
	        this.Created = source["Created"];
	        this.Updated = source["Updated"];
	        this.Skipped = this.convertValues(source["Skipped"], SkippedSpawn);
	        this.Errors = source["Errors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SyncGridsOptions {
	    ZoneIdNumber: number;
	    DryRun: boolean;
	    GridIds: number[];
	    NewGridIds: number[];
	
	    static createFrom(source: any = {}) {
	        return new SyncGridsOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ZoneIdNumber = source["ZoneIdNumber"];
	        this.DryRun = source["DryRun"];
	        this.GridIds = source["GridIds"];
	        this.NewGridIds = source["NewGridIds"];
	    }
	}
	export class SyncGridsResult {
	    DryRun: boolean;
	    Created: number;
	    Updated: number;
	    Errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new SyncGridsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DryRun = source["DryRun"];
	        this.Created = source["Created"];
	        this.Updated = source["Updated"];
	        this.Errors = source["Errors"];
	    }
	}
	export class SyncOptions {
	    ZoneShortName: string;
	    ZoneVersion: number;
	    ZoneIdNumber: number;
	    SyncNPCTypes: boolean;
	    SyncSpawns: boolean;
	    DryRun: boolean;
	    NPCIds: number[];
	
	    static createFrom(source: any = {}) {
	        return new SyncOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ZoneShortName = source["ZoneShortName"];
	        this.ZoneVersion = source["ZoneVersion"];
	        this.ZoneIdNumber = source["ZoneIdNumber"];
	        this.SyncNPCTypes = source["SyncNPCTypes"];
	        this.SyncSpawns = source["SyncSpawns"];
	        this.DryRun = source["DryRun"];
	        this.NPCIds = source["NPCIds"];
	    }
	}
	export class TODOItem {
	    ID: number;
	    Dismissed: boolean;
	    Type: string;
	    SourceID: number;
	    SinkID: number;
	    NPCID: number;
	    NPCName: string;
	    ZoneName: string;
	    ZoneVersion: number;
	
	    static createFrom(source: any = {}) {
	        return new TODOItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Dismissed = source["Dismissed"];
	        this.Type = source["Type"];
	        this.SourceID = source["SourceID"];
	        this.SinkID = source["SinkID"];
	        this.NPCID = source["NPCID"];
	        this.NPCName = source["NPCName"];
	        this.ZoneName = source["ZoneName"];
	        this.ZoneVersion = source["ZoneVersion"];
	    }
	}
	export class SyncResult {
	    DryRun: boolean;
	    NPCsSynced: number[];
	    SpawnsSynced: number;
	    SpawnsCreatedForNPCs: number[];
	    Skipped: SkippedNPC[];
	    TODOItems: TODOItem[];
	    Errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new SyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DryRun = source["DryRun"];
	        this.NPCsSynced = source["NPCsSynced"];
	        this.SpawnsSynced = source["SpawnsSynced"];
	        this.SpawnsCreatedForNPCs = source["SpawnsCreatedForNPCs"];
	        this.Skipped = this.convertValues(source["Skipped"], SkippedNPC);
	        this.TODOItems = this.convertValues(source["TODOItems"], TODOItem);
	        this.Errors = source["Errors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SyncSpawnGroupOptions {
	    ZoneShortName: string;
	    ZoneVersion: number;
	    X: number;
	    Y: number;
	    Z: number;
	    DryRun: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SyncSpawnGroupOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ZoneShortName = source["ZoneShortName"];
	        this.ZoneVersion = source["ZoneVersion"];
	        this.X = source["X"];
	        this.Y = source["Y"];
	        this.Z = source["Z"];
	        this.DryRun = source["DryRun"];
	    }
	}
	
	
	export class Zone {
	    Id: number;
	    ZoneIdNumber: number;
	    Version: number;
	    ShortName: string;
	    LongName: string;
	
	    static createFrom(source: any = {}) {
	        return new Zone(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Id = source["Id"];
	        this.ZoneIdNumber = source["ZoneIdNumber"];
	        this.Version = source["Version"];
	        this.ShortName = source["ShortName"];
	        this.LongName = source["LongName"];
	    }
	}

}

