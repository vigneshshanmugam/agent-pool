"use strict";

const assert = require("assert");
const sinon = require("sinon");
const HttpsAgent = require("agentkeepalive").HttpsAgent;
const AgentPool = require("../lib/agent-pool");

describe("AgentPool", () => {
  let httpsPool, loggerStub, clock;
  let destroyTime = 1000;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    loggerStub = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy()
    };
    httpsPool = new AgentPool({
      maxAgents: 3,
      destroyTime,
      logger: loggerStub
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it("create pool with agent options", () => {
    assert.equal(httpsPool.maxAgents, 3);
    assert.equal(httpsPool.destroyTime, 1000);
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

  it("return https agent by default", () => {
    assert(httpsPool.getAgent() instanceof HttpsAgent);
  });

  it("return the old active agent for successive calls", () => {
    const agent1 = httpsPool.getAgent();
    const agent2 = httpsPool.getAgent();
    assert.deepStrictEqual(agent1, agent2);
    assert.equal(httpsPool.agents.length, 1); // Number of agents on the pool
  });

  it("return the new active agent for same pool after agent destroy time", () => {
    const agent1 = httpsPool.getAgent();
    clock.tick(destroyTime);
    const agent2 = httpsPool.getAgent();
    assert.notDeepStrictEqual(agent1, agent2);
    assert.equal(httpsPool.agents.length, 2);
  });

  it("should recycle old agent after 3 max agents and timeout", () => {
    httpsPool.getAgent();
    clock.tick(destroyTime);
    httpsPool.getAgent();
    assert.equal(httpsPool.agents.length, 2);
    clock.tick(destroyTime);
    httpsPool.getAgent();
    assert.equal(httpsPool.agents.length, 3);
    // to make sure its not more than 3 agents
    httpsPool.getAgent();
    assert.equal(httpsPool.agents.length, 3);
    // to trigger recycle
    clock.tick(destroyTime);
    assert.equal(httpsPool.agents.length, 2);
    // trigger to create new agent since the httpsPool is down by 1
    clock.tick(destroyTime);
    assert.equal(httpsPool.agents.length, 3);
  });
});
