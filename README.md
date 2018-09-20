# agent-pool

Agent pool that rotates keepalive agents and pre-connect the sockets for working with DNS based traffic switching.

It is similar to [W3C Resource Hints Preconnect](https://w3c.github.io/resource-hints/#preconnect) but for Node.js Agents.

[![Build Status](https://travis-ci.org/vigneshshanmugam/agent-pool.svg?branch=master)](https://travis-ci.org/vigneshshanmugam/agent-pool)
[![codecov](https://codecov.io/gh/vigneshshanmugam/agent-pool/branch/master/graph/badge.svg)](https://codecov.io/gh/vigneshshanmugam/agent-pool)

### Why?

When you are running high traffic application servers, You would normally end up using [Agents](https://nodejs.org/api/http.html#http_class_http_agent) with `keepAlive` in Node.js to reuse the connections. The kept alive connections does not incur DNS + TCP + TLS overhead. An Agent also takes care of all low-level socket pooling(adding/removing sockets) capabilities that your application doesn't need to worry about.

### Problem - DNS based traffic switching

If your application is using keepAlive Agents and doing traffic switching between two stacks via `weighted DNS records`, you won't see any redirection of the traffic to the new stack because the connection is reused as long as there are requests to be processed. To force clients to switch, we have to disable the load balancer of the old stack or delete it completely.

### Solution - Agent pooling with socket Preconnect

Agent pool that maintains the list of agents via Queue and assigns an agent to serve all requests for a specified interval. After the interval, the next agent will be created and assigned to the requests. Once the queue reaches its max agents limit (configurable), The old agents are recycled/destroyed and the new agent will be assigned to serve the traffic.

Once we assign the new agent after the specified interval, the sockets in the old agent will be closed and timed out. All the traffic would end up going via new Agent that needs to create lots of Sockets and perform DNS + TCP + TLS negotiation again. This would result in increased latency, connection and read timeouts.

In order to address this, the following steps are done before switching the traffic to next available agent

- If the previous Agent was actively serving traffic, Extract the meta information(hostname, port) from the sockets
- Create a pool of sockets in the new agent and establish the connection to all backend hosts which should take care of DNS + TCP + TLS (Reuse existing TLS session for same hosts)
- Assign the created sockets to Agent's free socket pool
- Mark the new agent as active after the specified interval.

## Install

```sh
yarn add agent-pool
```

## Usage

```js
const AgentPool = require("agent-pool");
const { HttpsAgent } = require("agentkeepalive");

const httpsPool = new AgentPool({
  maxAgents: 5,
  agentType: HttpsAgent,
  destroyTime: 1000 * 60 // 1 min
});

const agent = httpsPool.getAgent(); // returns the active agent

// Use it in your request lib
const https = require("https");
const { URL } = require("url");

https.request(
  Object.assign(new URL("https://example.com");, {
    agent
  })
);
```

## API

### httpsPool = new AgentPool(options, agentOptions)

Instantiate the `Agentpool` instance with options and agentOptions that are passed to the underlying HTTP/HTTPS Agent.

- `options` {Object} - Configurable options on the agent pool

  - `agentType` - An Agent class that is responsible for managing connection pooling. (default: agentkeepalive [`HttpAgent`](https://github.com/node-modules/agentkeepalive))
  - `maxAgents` - The maximum number of agents that are kept in the pool at a given point of time (default: `3`)
  - `destroyTime` - The minimum time required for the new agents to become active and start serving requests (default: `1 minute`)
  - `logger` - Custom logger that is compatible with [console API](https://developer.mozilla.org/en-US/docs/Web/API/console) to log the agent activity. You can use [pino](https://github.com/pinojs/pino/) (default: `console`)

- `agentOptions` {Object} - Configurable options that are passed to the underlying Agent - Check [agentkeepalive](https://github.com/node-modules/agentkeepalive/blob/master/README.md#new-agentoptions)

### httpsPool.getAgent()

returns the active agent that can be used to serve request

## LICENSE

MIT
