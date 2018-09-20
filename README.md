# agent-pool

Agent pool that rotates keepalive agents for working with DNS based load balancing systems

[![Build Status](https://travis-ci.org/vigneshshanmugam/agent-pool.svg?branch=master)](https://travis-ci.org/vigneshshanmugam/agent-pool)
[![codecov](https://codecov.io/gh/vigneshshanmugam/agent-pool/branch/master/graph/badge.svg)](https://codecov.io/gh/vigneshshanmugam/agent-pool)

## Install

```sh
yarn add agent-pool
```

## Usage

```js
const AgentPool = require("agent-pool");

const httpsPool = new AgentPool({
  maxAgents: 5,
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
