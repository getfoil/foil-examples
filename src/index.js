const readline = require('readline');
const { Foil } = require('@getfoil/foil-js');
const { SupportAgent } = require('./agents/support');

const AGENT_NAME = 'customer-support-agent';

// Validate environment
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required');
  process.exit(1);
}

const foilApiKey = process.env.FOIL_API_KEY;

const foil = new Foil({
  apiKey: foilApiKey,
  agentName: AGENT_NAME,
  debug: !!process.env.FOIL_DEBUG,
});

const agent = new SupportAgent({
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

let currentSessionId = `session-${Date.now()}`;

console.log('\n' + '='.repeat(60));
console.log('  TechMart Customer Support - Powered by Foil');
console.log('='.repeat(60));
console.log(`  Session: ${currentSessionId}`);
if (foilApiKey) {
  console.log('  Foil tracing: ON');
} else {
  console.log('  Foil tracing: OFF (set FOIL_API_KEY to enable)');
}
console.log('');
console.log('  Type your message and press Enter.');
console.log('  Type a file path to attach an image (e.g., photo.jpg)');
console.log('  Commands: /new (new session), /quit (exit)');
console.log('');
console.log('  Test customers:');
console.log('    sarah@example.com (Gold, multiple orders)');
console.log('    marcus.j@example.com (Platinum, has a return)');
console.log('    emily.d@example.com (Standard, new customer)');
console.log('='.repeat(60) + '\n');

// Minimal mock context for when Foil is not configured
function createMockCtx() {
  const executeTools = async (response, handlers) => {
    const toolCalls = response.choices[0].message.tool_calls || [];
    const messages = [];
    for (const tc of toolCalls) {
      const args = JSON.parse(tc.function.arguments);
      const handler = handlers[tc.function.name];
      let result;
      try {
        result = handler ? await handler(args) : { error: `Unknown tool: ${tc.function.name}` };
      } catch (e) {
        result = { error: e.message };
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    return messages;
  };

  return {
    startSpan: async (_kind, _name, _attrs = {}) => ({
      end: async () => {},
    }),
    executeTools,
    llmCall: async (_model, fn) => fn(),
    step: async (_model, fn, handlers = {}) => {
      const response = await fn();
      const toolMessages = await executeTools(response, handlers);
      return { response, toolMessages };
    },
    tool: async (_name, fn) => fn(),
    retriever: async (_name, fn) => fn(),
    recordSignal: async () => {},
    recordFeedback: async () => {},
  };
}

async function runConversation(ctx) {
  while (true) {
    const input = await ask('\x1b[36mYou: \x1b[0m');
    const trimmed = input.trim();

    if (!trimmed) continue;

    if (trimmed === '/quit' || trimmed === '/exit') {
      return 'quit';
    }

    if (trimmed === '/new') {
      agent.endConversation(currentSessionId);
      currentSessionId = `session-${Date.now()}`;
      console.log(`\n--- New session: ${currentSessionId} ---\n`);
      return 'new';
    }

    try {
      const result = await agent.processMessage(currentSessionId, trimmed, ctx);
      console.log(`\x1b[33mAlex: \x1b[0m${result.content}\n`);
    } catch (err) {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m\n`);
    }
  }
}

// Resolve when SIGINT is received so the conversation loop can exit cleanly
let sigintResolve = null;
process.on('SIGINT', () => {
  if (sigintResolve) {
    sigintResolve('quit');
    sigintResolve = null;
  }
});

async function main() {
  let running = true;

  while (running) {
    let action;

    // Race the conversation against Ctrl+C so the trace ends normally
    const sigintPromise = new Promise((resolve) => {
      sigintResolve = resolve;
    });

    if (foilApiKey) {
      action = await foil.trace(
        async (ctx) => {
          return Promise.race([runConversation(ctx), sigintPromise]);
        },
        {
          name: 'customer-support-session',
          sessionId: currentSessionId,
          timeout: 0,
        },
      );
    } else {
      const mockCtx = createMockCtx();
      action = await Promise.race([runConversation(mockCtx), sigintPromise]);
    }

    sigintResolve = null;

    if (action === 'quit') {
      running = false;
    }
    // 'new' → loop continues, starts a new trace
  }

  console.log('\nGoodbye!\n');
  await foil.shutdown();
  rl.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
