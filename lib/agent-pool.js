const url = require("url");
const Agent = require("agentkeepalive");
const { HttpsAgent } = require("agentkeepalive");

module.exports = class AgentPool {
  constructor(options = {}, agentOptions) {
    this.maxAgents = options.maxAgents || 3;
    this.agentType = options.agentType || HttpsAgent;
    this.destroyTime = options.destroyTime || 1000 * 60;
    this.logger = options.logger || console;
    this.agentOptions = agentOptions || {
      freeSocketKeepAliveTimeout: 25000,
      keepAlive: true,
      maxFreeSockets: 300 // per backend host
    };

    this.agents = [];
    this.activeAgent = null;
    // Busy creating new agent with free sockets on the pool
    this.isBusy = false;
    // To trigger recycling of agents
    this.startTimer();
  }

  _addToPool(agent) {
    this.agents.push(agent);
  }

  createAgent() {
    return new this.agentType(this.agentOptions);
  }

  setActiveAgent(agent) {
    this.isBusy = false;
    this._addToPool(agent);
    this.activeAgent = agent;
  }

  fillAndRecycle() {
    if (this.isBusy) {
      return;
    }

    if (this.agents.length >= this.maxAgents) {
      const oldAgent = this.agents.shift();
      oldAgent.destroy();
      this.logger.debug(
        `Destroying the old ${this.activeAgent.protocol} agent`
      );
    } else if (
      this.activeAgent &&
      Object.keys(this.activeAgent.sockets).length > 0
    ) {
      /**
       * If there is a previous activeAgent and it has been actively handling traffic,
       * We need to extract the  socket information and use it for creating new ones.
       *
       * If not, we create agent without preconnected sockets
       */
      const socketMetas = [
        ...getSocketMetaInfo(this.activeAgent.sockets),
        ...getSocketMetaInfo(this.activeAgent.freeSockets)
      ];
      this.logger.info(
        `Creating preconnect agent with socket pool of ${socketMetas.length}`
      );
      this.isBusy = true;
      const newAgent = this.createAgent();
      for (const meta of socketMetas) {
        /**
         * Create a pool of sockets in the new agent and establish the connection to the
         * backend host with the meta information
         * https://github.com/node-modules/agentkeepalive/blob/82ff0e85bfbc282c4bad1ccfabf46d4a82943f6d/lib/_http_agent.js#L251
         *
         * This method takes care of DNS + TCP + SSL + (Reuses existing TLS session for new sockets belonging to same hosts)
         */
        newAgent.createSocket(
          meta.request,
          meta.options,
          (err, createdSocket) => {
            if (err) {
              this.logger.warn(
                { err },
                "Failed to create preconnect socket for",
                meta.options.host
              );
              return;
            }
            createdSocket._httpMessage = {
              shouldKeepAlive: true
            };
            /**
             * Assign it to the freeSockets pool once we have created a socket
             * https://github.com/node-modules/agentkeepalive/blob/master/lib/_http_agent.js#L75
             *
             * Agent takes care of adding the socket to the proper backend host
             */
            createdSocket.emit("free");
          }
        );
      }
      /**
       * Instead of relying on newly created sockets ready/connect events and
       * checking if it hits maxFreeSockets limit(300), we activate the new agent
       * after quarter of destroy time(20 seconds) has elapsed, since its a safe bet
       */
      setTimeout(
        () => this.setActiveAgent(newAgent),
        Number(this.destroyTime / 3)
      );
    } else {
      this.logger.debug("Creating agent without preconnected sockets");
      const newAgent = this.createAgent();
      this.setActiveAgent(newAgent);
    }
  }

  startTimer() {
    setTimeout(() => {
      this.startTimer();
      this.fillAndRecycle();
    }, this.destroyTime);
  }

  getAgent() {
    if (this.activeAgent) {
      return this.activeAgent;
    }
    const newAgent = this.createAgent();
    this.setActiveAgent(newAgent);

    return this.activeAgent;
  }

  stats() {
    const agent = this.getAgent();
    if (!(agent instanceof Agent)) {
      this.logger.warn("Stats is supported only for agentkeepalive");
      return null;
    }

    if (agent && agent.statusChanged) {
      return agent.getCurrentStatus();
    }
    return null;
  }
};

/**
 * For creating new Sockets, We need to extract the list of existing connections from
 * the last active Agent's sockets and freeSockets pool to preconnect.
 */
function getSocketMetaInfo(sockets) {
  const meta = [];
  const servers = Object.keys(sockets);

  if (servers.length === 0) {
    return meta;
  }

  for (const name of servers) {
    const [host, port] = name.split(":", 2);
    const protocol = port === "443" ? "https:" : "http:";
    const options = Object.assign(url.parse(`${protocol}//${host}`), {
      port: Number(port),
      servername: host
    });
    /**
     * When we are creating sockets before assigning them to new request,
     * we need to create a dummy request object which satisfies the logic
     * in agentkeepalive.
     * https://github.com/node-modules/agentkeepalive/blob/82ff0e85bfbc282c4bad1ccfabf46d4a82943f6d/lib/_http_agent.js#L337
     */
    const request = { getHeader: () => null };

    for (var i = 0; i < sockets[name].length; i++) {
      meta.push({ options, request });
    }
  }
  return meta;
}
