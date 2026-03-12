const { foil } = require('../foil');
const readline = require('readline');
const { SupportAgent } = require('./agents/support');

// Validate environment
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required');
  process.exit(1);
}

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
console.log('  TechMart Customer Support');
console.log('='.repeat(60));
console.log(`  Session: ${currentSessionId}`);
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

async function main() {
  await foil.trace(async (ctx) => {
    let running = true;

    while (running) {
      const input = await ask('\x1b[36mYou: \x1b[0m');
      const trimmed = input.trim();

      if (!trimmed) continue;

      if (trimmed === '/quit' || trimmed === '/exit') {
        running = false;
        continue;
      }

      if (trimmed === '/new') {
        agent.endConversation(currentSessionId);
        currentSessionId = `session-${Date.now()}`;
        console.log(`\n--- New session: ${currentSessionId} ---\n`);
        continue;
      }

      try {
        const result = await agent.processMessage(currentSessionId, trimmed, { ctx });
        console.log(`\x1b[33mAlex: \x1b[0m${result.content}\n`);
      } catch (err) {
        console.error(`\x1b[31mError: ${err.message}\x1b[0m\n`);
      }
    }
  }, { name: 'chat-session', sessionId: currentSessionId, timeout: 0 });

  console.log('\nGoodbye!\n');
  rl.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
