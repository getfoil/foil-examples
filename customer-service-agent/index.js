'use strict';

const { customerService55: foil } = require('./foil');

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Simulated backend data ---

const orders = {
  'ORD-1001': { status: 'delivered', item: 'Wireless Headphones', total: 79.99, date: '2026-02-28', tracking: 'TRK-9988' },
  'ORD-1002': { status: 'in_transit', item: 'USB-C Hub', total: 34.50, date: '2026-03-04', tracking: 'TRK-5544', eta: '2026-03-08' },
  'ORD-1003': { status: 'processing', item: 'Mechanical Keyboard', total: 129.00, date: '2026-03-06', tracking: null },
};

const products = {
  'PRD-100': { name: 'Wireless Headphones', price: 79.99, stock: 12, warranty: '1 year' },
  'PRD-200': { name: 'USB-C Hub', price: 34.50, stock: 0, warranty: '6 months' },
  'PRD-300': { name: 'Mechanical Keyboard', price: 129.00, stock: 5, warranty: '2 years' },
};

// --- Tool implementations ---

function lookupOrder(orderId) {
  const order = orders[orderId];
  if (!order) return { error: `Order ${orderId} not found` };
  return order;
}

function checkProductAvailability(productName) {
  const product = Object.values(products).find(
    (p) => p.name.toLowerCase().includes(productName.toLowerCase()),
  );
  if (!product) return { error: `Product "${productName}" not found` };
  return { ...product, available: product.stock > 0 };
}

function initiateRefund(orderId, reason) {
  const order = orders[orderId];
  if (!order) return { error: `Order ${orderId} not found` };
  if (order.status !== 'delivered') return { error: 'Refund only available for delivered orders' };
  return { refundId: 'REF-' + Date.now(), status: 'initiated', amount: order.total, reason };
}

function createSupportTicket(subject, description, priority) {
  return {
    ticketId: 'TKT-' + Date.now(),
    subject,
    description,
    priority: priority || 'normal',
    status: 'open',
    created: new Date().toISOString(),
  };
}

const toolImplementations = {
  lookup_order: ({ order_id }) => lookupOrder(order_id),
  check_product_availability: ({ product_name }) => checkProductAvailability(product_name),
  initiate_refund: ({ order_id, reason }) => initiateRefund(order_id, reason),
  create_support_ticket: ({ subject, description, priority }) => createSupportTicket(subject, description, priority),
};

// --- Tool definitions for OpenAI ---

const tools = [
  {
    type: 'function',
    function: {
      name: 'lookup_order',
      description: 'Look up an order by its ID to check status, tracking, and details.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'The order ID (e.g. ORD-1001)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_product_availability',
      description: 'Check if a product is available in stock and get its price/warranty info.',
      parameters: {
        type: 'object',
        properties: {
          product_name: { type: 'string', description: 'The product name to search for' },
        },
        required: ['product_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'initiate_refund',
      description: 'Initiate a refund for a delivered order. Only works for delivered orders.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'The order ID to refund' },
          reason: { type: 'string', description: 'Reason for the refund' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_support_ticket',
      description: 'Create a support ticket for issues that need human follow-up.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Brief subject line' },
          description: { type: 'string', description: 'Full description of the issue' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Ticket priority' },
        },
        required: ['subject', 'description'],
      },
    },
  },
];

// --- System prompt ---

const SYSTEM_PROMPT = `You are a helpful customer service agent for TechStore, an electronics retailer.

You can:
- Look up order status and tracking info
- Check product availability and pricing
- Initiate refunds for delivered orders
- Create support tickets for complex issues

Guidelines:
- Be friendly and concise
- Always verify order IDs before taking actions
- If a customer sends an image (e.g. a damaged product photo), acknowledge it and describe what you see
- For damaged products, create a support ticket with high priority and mention the image was reviewed
- Never make up order information — always use the lookup tool`;

// --- Agentic loop ---

async function handleUserMessage(messages, ctx) {
  const lastUserMsg = messages[messages.length - 1];
  const userInput = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : (Array.isArray(lastUserMsg?.content) ? lastUserMsg.content.find((c) => c.type === 'text')?.text : null) || '';

  return ctx.llmCall('gpt-4o', async () => {
    let response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools,
    });

    while (response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0) {
      messages.push(response.choices[0].message);
      const toolMessages = await ctx.executeTools(response, toolImplementations);
      messages.push(...toolMessages);
      response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools,
      });
    }

    messages.push(response.choices[0].message);
    return response.choices[0].message.content;
  }, { input: userInput });
}

// --- Multimodal helper ---

function buildUserMessage(text, imagePath) {
  const content = [];

  if (text) {
    content.push({ type: 'text', text });
  }

  if (imagePath) {
    const resolved = path.resolve(imagePath);
    if (!fs.existsSync(resolved)) {
      console.error(`  Image not found: ${resolved}`);
      return { role: 'user', content: text || '' };
    }

    const base64 = fs.readFileSync(resolved).toString('base64');
    const ext = path.extname(resolved).slice(1).toLowerCase();
    const mimeType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';

    content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64}` },
    });

    console.log(`  [image] Attached ${path.basename(resolved)}`);
  }

  return { role: 'user', content };
}

// --- Interactive chat loop ---

async function main() {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  const sessionId = `session-${Date.now()}`;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  console.log('TechStore Customer Service Agent');
  console.log('Type your message, or attach an image: /image <path> <message>');
  console.log('Type /quit to exit\n');

  await foil.trace(async (ctx) => {
    while (true) {
      const input = (await ask('You: ')).trim();
      if (!input) continue;
      if (input === '/quit') break;

      let userMsg;
      if (input.startsWith('/image ')) {
        const parts = input.slice(7).trim().split(/\s+/);
        const imagePath = parts[0];
        const text = parts.slice(1).join(' ') || 'Please look at this image.';
        userMsg = buildUserMessage(text, imagePath);
      } else {
        userMsg = { role: 'user', content: input };
      }

      messages.push(userMsg);

      try {
        const reply = await handleUserMessage(messages, ctx);
        console.log(`\nAgent: ${reply}\n`);
      } catch (err) {
        console.error(`\nError: ${err.message}\n`);
      }
    }
  }, { name: 'chat-session', sessionId, timeout: 0 });

  rl.close();
  await foil.shutdown();
}

main();
