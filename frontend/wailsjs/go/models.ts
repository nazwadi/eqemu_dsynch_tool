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

