import { MockClient } from './MockClient.js';
import { Agent } from '../agent/agent.js';

const client = new MockClient();
const agent = new Agent(client);

// Setup test events
client.simulate();
