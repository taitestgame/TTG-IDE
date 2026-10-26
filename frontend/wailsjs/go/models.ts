export namespace agent {
	
	export class Checkpoint {
	    id: string;
	    sessionId: string;
	    description: string;
	    files: string[];
	    modifiedFiles?: string[];
	    createdFiles?: string[];
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Checkpoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sessionId = source["sessionId"];
	        this.description = source["description"];
	        this.files = source["files"];
	        this.modifiedFiles = source["modifiedFiles"];
	        this.createdFiles = source["createdFiles"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
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
	export class MultiAIConfig {
	    id: string;
	    name: string;
	    baseUrl: string;
	    apiKey: string;
	    model: string;
	    providerId?: string;
	    providerName?: string;
	
	    static createFrom(source: any = {}) {
	        return new MultiAIConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.providerId = source["providerId"];
	        this.providerName = source["providerName"];
	    }
	}
	export class ToolCall {
	    id: string;
	    name: string;
	    arguments: Record<string, any>;
	    result?: string;
	    isError?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ToolCall(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.arguments = source["arguments"];
	        this.result = source["result"];
	        this.isError = source["isError"];
	    }
	}
	export class PlanStep {
	    id: number;
	    description: string;
	    status: string;
	    tool?: string;
	    input?: any;
	    result?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PlanStep(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.description = source["description"];
	        this.status = source["status"];
	        this.tool = source["tool"];
	        this.input = source["input"];
	        this.result = source["result"];
	        this.error = source["error"];
	    }
	}
	export class Plan {
	    id: string;
	    goal: string;
	    steps: PlanStep[];
	    currentStep: number;
	    answer?: string;
	    thinking?: string;
	    toolCalls?: ToolCall[];
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Plan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.goal = source["goal"];
	        this.steps = this.convertValues(source["steps"], PlanStep);
	        this.currentStep = source["currentStep"];
	        this.answer = source["answer"];
	        this.thinking = source["thinking"];
	        this.toolCalls = this.convertValues(source["toolCalls"], ToolCall);
	        this.createdAt = this.convertValues(source["createdAt"], null);
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
	export class MultiAIResult {
	    modelId: string;
	    modelName: string;
	    sandboxDir: string;
	    answer: string;
	    plan?: Plan;
	    diff?: string;
	    durationMs: number;
	    status: string;
	    error?: string;
	    filesEdited?: string[];
	
	    static createFrom(source: any = {}) {
	        return new MultiAIResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.modelId = source["modelId"];
	        this.modelName = source["modelName"];
	        this.sandboxDir = source["sandboxDir"];
	        this.answer = source["answer"];
	        this.plan = this.convertValues(source["plan"], Plan);
	        this.diff = source["diff"];
	        this.durationMs = source["durationMs"];
	        this.status = source["status"];
	        this.error = source["error"];
	        this.filesEdited = source["filesEdited"];
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
	export class MultiAISession {
	    sessionId: string;
	    prompt: string;
	    verifyCmd?: string;
	    // Go type: time
	    createdAt: any;
	    results: MultiAIResult[];
	    selectedId?: string;
	
	    static createFrom(source: any = {}) {
	        return new MultiAISession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.prompt = source["prompt"];
	        this.verifyCmd = source["verifyCmd"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.results = this.convertValues(source["results"], MultiAIResult);
	        this.selectedId = source["selectedId"];
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
	
	

}

export namespace capabilities {
	
	export class ToolDefinition {
	    name: string;
	    description: string;
	    category: string;
	    parameters: Record<string, any>;
	    requiresAuth: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ToolDefinition(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.category = source["category"];
	        this.parameters = source["parameters"];
	        this.requiresAuth = source["requiresAuth"];
	    }
	}

}

export namespace skills {
	
	export class Skill {
	    name: string;
	    description: string;
	    content: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new Skill(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.content = source["content"];
	        this.path = source["path"];
	    }
	}

}

export namespace sqlite {
	
	export class MessageRecord {
	    id: string;
	    sessionId: string;
	    sender: string;
	    content: string;
	    toolCallsJson: string;
	    // Go type: time
	    timestamp: any;
	
	    static createFrom(source: any = {}) {
	        return new MessageRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sessionId = source["sessionId"];
	        this.sender = source["sender"];
	        this.content = source["content"];
	        this.toolCallsJson = source["toolCallsJson"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
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
	export class MultiAIRunRecord {
	    id: string;
	    prompt: string;
	    strategy: string;
	    nodesJson: string;
	    resultsJson: string;
	    synthesis: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new MultiAIRunRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.prompt = source["prompt"];
	        this.strategy = source["strategy"];
	        this.nodesJson = source["nodesJson"];
	        this.resultsJson = source["resultsJson"];
	        this.synthesis = source["synthesis"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
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
	export class SessionRecord {
	    id: string;
	    title: string;
	    workspacePath: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new SessionRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.workspacePath = source["workspacePath"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
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

}

