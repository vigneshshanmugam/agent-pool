import { AgentStatus } from 'agentkeepalive'
import { AgentOptions, Agent } from 'http';

type LogFn = (message?: any, ...optional: any[]) => void;

interface Logger {
    info: LogFn;
    warn: LogFn;
    error: LogFn;
    debug: LogFn;
}

export interface AgentPoolOptions {
    agentType?: Agent;
    maxAgents?: number;
    destroyTime?: number;
    logger?: Logger;
}
    
declare class AgentPool {
    constructor(options? : AgentPoolOptions, agentOptions?: AgentOptions) {}

    /**
     * Get active agent from the pool
     */
    getAgent(): Agent;

    /**
     * Get the stats for the pool at any given point of time
     */
    stats(): AgentStatus | null;
}

export = AgentPool;
