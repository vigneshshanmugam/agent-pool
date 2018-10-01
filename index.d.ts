import { HttpsAgent } from 'agentkeepalive';
import { AgentOptions, Agent } from 'http';

export interface AgentPoolOptions extends AgentOptions {
    agentType: Agent;
    maxAgents: number;
    destroyTime: number;
    logger?: any;
}
    
export interface KeepAliveAgentOptions extends AgentOptions {
    keepAliveTimeout: number;
}

export = AgentPool;

declare class AgentPool {
    constructor(options? : AgentPoolOptions, agentOptions: KeepAliveAgentOptions) {}

    /**
     * Create an agent of `agentType` passed to constructor
     */
    createAgent(): Agent;

    /**
     * Set the active agent in pool
     * @param agent The agent
     */
    setActiveAgent(agent: Agent): void;

    /**
     * Kill old agent and set new ones in the pool
     */
    fillAndRecycle(): void;

    /**
     * Set the timer to monitor the pool and fillAndRecycle
     */
    startTimer(): void;

    /**
     * Get active agent from the pool
     */
    getAgent(): Agent;

    /**
     * Get the stats for the pool at any given point of time
     */
    stats(): any;
}