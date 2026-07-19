export namespace main {
	
	export class SshConfig {
	    Host: string;
	    Port: string;
	    Username: string;
	    PrivateKey: string;
	
	    static createFrom(source: any = {}) {
	        return new SshConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Host = source["Host"];
	        this.Port = source["Port"];
	        this.Username = source["Username"];
	        this.PrivateKey = source["PrivateKey"];
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
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Source = this.convertValues(source["Source"], ConnectionConfig);
	        this.Sink = this.convertValues(source["Sink"], ConnectionConfig);
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
	    Type: string;
	    SourceID: number;
	    SinkID: number;
	    NPCID: number;
	    NPCName: string;
	    ZoneName: string;
	
	    static createFrom(source: any = {}) {
	        return new TODOItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Type = source["Type"];
	        this.SourceID = source["SourceID"];
	        this.SinkID = source["SinkID"];
	        this.NPCID = source["NPCID"];
	        this.NPCName = source["NPCName"];
	        this.ZoneName = source["ZoneName"];
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

