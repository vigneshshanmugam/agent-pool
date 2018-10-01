import { AgentOptions, Agent } from 'http';

interface Logger {
    info: () => void;
    warn: () => void;
    error: () => void;
    debug: () => void;
}

export interface AgentPoolOptions {
    agentType: Agent;
    maxAgents: number;
    destroyTime: number;
    logger?: Logger;
}
    
export interface KeepAliveAgentOptions extends AgentOptions {
    keepAliveTimeout: number;
}

declare class AgentPool {
    constructor(options? : AgentPoolOptions, agentOptions: KeepAliveAgentOptions) {}

    /**
     * Get active agent from the pool
     */
    getAgent(): Agent;

    /**
     * Get the stats for the pool at any given point of time
     */
    stats(): any;
}

export = AgentPool;
