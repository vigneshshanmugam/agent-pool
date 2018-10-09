"use strict";

const assert = require("assert");
const sinon = require("sinon");
const http = require("http");
const Agent = require("agentkeepalive");
const AgentPool = require("../lib/agent-pool");

describe("AgentPool", () => {
  let httpPool, loggerStub, clock;
  let destroyTime = 1000;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    loggerStub = {
      debug: sinon.spy(),
      warn: sinon.spy()
    };
    httpPool = new AgentPool({
      maxAgents: 3,
      destroyTime,
      agentType: Agent,
      logger: loggerStub
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it("create pool with agent options", () => {
    assert.equal(httpPool.maxAgents, 3);
    assert.equal(httpPool.destroyTime, 1000);
  });

  it("return https agent with specified options", () => {
    const pool = new AgentPool(
      {},
      {
        maxSockets: 20,
        maxFreeSockets: 10
      }
    );
    const agent = pool.getAgent();
    assert.equal(agent.maxFreeSockets, 10);
    assert.equal(agent.maxSockets, 20);
  });

  it("return the agent instance that is passed to agentType", () => {
    assert(httpPool.getAgent() instanceof Agent);
  });

  it("return the old active agent for successive calls", () => {
    const agent1 = httpPool.getAgent();
    const agent2 = httpPool.getAgent();
    assert.deepStrictEqual(agent1, agent2);
    assert.equal(httpPool.agents.length, 1); // Number of agents on the pool
  });

  it("return the new active agent for same pool after agent destroy time", () => {
    const agent1 = httpPool.getAgent();
    clock.tick(destroyTime);
    const agent2 = httpPool.getAgent();
    assert.notDeepStrictEqual(agent1, agent2);
    assert.equal(httpPool.agents.length, 2);
  });

  it("should recycle old agent after 3 max agents and timeout", () => {
    httpPool.getAgent();
    clock.tick(destroyTime);
    httpPool.getAgent();
    assert.equal(httpPool.agents.length, 2);
    clock.tick(destroyTime);
    httpPool.getAgent();
    assert.equal(httpPool.agents.length, 3);
    // to make sure its not more than 3 agents
    httpPool.getAgent();
    assert.equal(httpPool.agents.length, 3);
    // to trigger recycle
    clock.tick(destroyTime);
    assert.equal(httpPool.agents.length, 2);
    // trigger to create new agent since the httpPool is down by 1
    clock.tick(destroyTime);
    assert.equal(httpPool.agents.length, 3);
  });

  it("return metrics for active agent when changed", () => {
    const httpRequest = new http.ClientRequest("http://localhost:20/");

    const agent = httpPool.getAgent();
    agent.addRequest(httpRequest, {});

    httpRequest.on("error", () => {});
    httpRequest.end();

    const { createSocketCount, sockets } = httpPool.stats();

    assert.deepStrictEqual(
      { createSocketCount, sockets },
      {
        createSocketCount: 1,
        sockets: { "localhost::": 1 }
      }
    );
    // successive call to stats should return null
    assert.equal(null, httpPool.stats());
  });

  it("log error and return null on non agentkeepalive", () => {
    const newPool = new AgentPool({
      agentType: http.Agent,
      maxAgents: 1,
      logger: loggerStub
    });
    const agent = newPool.getAgent();
    const stats = newPool.stats();
    assert.ok(agent instanceof http.Agent);
    sinon.assert.calledOnce(loggerStub.warn);
    assert.equal(stats, null);
  });

  describe("Agent with preconnected sockets", () => {
    let server = null;
    let port = null;
    before(done => {
      server = http.createServer((req, res) => {
        return res.end(req.url);
      });
      server.listen(0, () => {
        port = server.address().port;
        done();
      });
    });

    function requestPromise(options) {
      return new Promise((resolve, reject) => {
        const request = http.request(options);

        request.on("response", resolve);
        request.on("error", reject);
        request.end();
      });
    }

    it("handle socket connection failures during preconnect", done => {
      const options = {
        agent: httpPool.getAgent(),
        port: 2, // unassigned port
        path: "/"
      };
      const agent1 = httpPool.getAgent();

      requestPromise(options)
        .catch(() => {
          assert.equal(httpPool.agents.length, 1);
          clock.tick(destroyTime);
          sinon.assert.calledWithExactly(
            loggerStub.debug,
            "Creating preconnect agent with socket pool of 1"
          );
          return requestPromise(options);
        })
        .catch(() => {
          clock.tick(destroyTime / 3);
          const agent2 = httpPool.getAgent();
          assert.equal(httpPool.agents.length, 2);
          assert.notStrictEqual(agent1, agent2);

          const { sockets, freeSockets } = httpPool.stats();
          assert.deepStrictEqual(
            { sockets, freeSockets },
            {
              sockets: {},
              freeSockets: {}
            }
          );
          done();
        });
    });

    it("create agent with preconnect sockets", done => {
      const options = {
        agent: httpPool.getAgent(),
        port,
        path: "/"
      };
      const agent1 = httpPool.getAgent();

      requestPromise(options)
        .then(() => {
          assert.equal(httpPool.agents.length, 1);
          const socketNames = Object.keys(agent1.sockets);
          assert.deepStrictEqual(socketNames, [`localhost:${port}:`]);

          let { createSocketCount, sockets } = httpPool.stats();
          assert.deepStrictEqual(
            { createSocketCount, sockets },
            {
              createSocketCount: 1,
              sockets: { [`localhost:${port}:`]: 1 }
            }
          );
          clock.tick(destroyTime);
          sinon.assert.calledWith(
            loggerStub.debug,
            "Creating preconnect agent with socket pool of 1"
          );
          return requestPromise(options);
        })
        .then(() => {
          // Activate new preconnect agent
          clock.tick(destroyTime / 3);
          const agent2 = httpPool.getAgent();
          assert.equal(httpPool.agents.length, 2);
          assert.notStrictEqual(agent1, agent2);
          // sockets will be assigned as freeSockets for new agents
          const { createSocketCount, sockets, freeSockets } = httpPool.stats();

          assert.deepStrictEqual(
            { createSocketCount, sockets, freeSockets },
            {
              createSocketCount: 1,
              sockets: {},
              freeSockets: { [`localhost:${port}:`]: 1 }
            }
          );

          clock.tick(destroyTime);
          /**
           * There are no requests in flight to trigger movement of freeSockets -> sockets so we should
           * create agent without preconnect sockets
           */
          sinon.assert.calledWith(
            loggerStub.debug,
            "Creating agent without preconnected sockets"
          );
          assert.equal(httpPool.agents.length, 3);
          done();
        });
    });
  });
});
