'use strict';

const { customerService55: foil } = require('./foil');

const express = require('express');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 3005;

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

const tools = [
  { type: 'function', function: { name: 'lookup_order', description: 'Look up an order by its ID to check status, tracking, and details.', parameters: { type: 'object', properties: { order_id: { type: 'string', description: 'The order ID (e.g. ORD-1001)' } }, required: ['order_id'] } } },
  { type: 'function', function: { name: 'check_product_availability', description: 'Check if a product is available in stock and get its price/warranty info.', parameters: { type: 'object', properties: { product_name: { type: 'string', description: 'The product name to search for' } }, required: ['product_name'] } } },
  { type: 'function', function: { name: 'initiate_refund', description: 'Initiate a refund for a delivered order. Only works for delivered orders.', parameters: { type: 'object', properties: { order_id: { type: 'string', description: 'The order ID to refund' }, reason: { type: 'string', description: 'Reason for the refund' } }, required: ['order_id', 'reason'] } } },
  { type: 'function', function: { name: 'create_support_ticket', description: 'Create a support ticket for issues that need human follow-up.', parameters: { type: 'object', properties: { subject: { type: 'string', description: 'Brief subject line' }, description: { type: 'string', description: 'Full description of the issue' }, priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Ticket priority' } }, required: ['subject', 'description'] } } },
];

const SYSTEM_PROMPT = `You are a helpful customer service agent for TechStore, an electronics retailer.

You can:
- Look up order status and tracking info
- Check product availability and pricing
- Initiate refunds for delivered orders
- Create support tickets for complex issues

Guidelines:
- Be friendly and concise
- Always verify order IDs before taking actions
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

// --- Session management ---

const sessionMessages = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessionActivity = new Map();

// --- Foil session trace management ---
// Keeps one Foil trace alive per conversation session. The trace is
// created on the first request and stays open (via a deferred promise)
// until the session ends or times out.

const sessionTraces = new Map();

async function getSessionCtx(sessionId) {
  if (sessionTraces.has(sessionId)) {
    return sessionTraces.get(sessionId).ctx;
  }

  let ctxResolve;
  const ctxReady = new Promise((r) => { ctxResolve = r; });

  foil.trace(async (ctx) => {
    const entry = { ctx, end: null };
    sessionTraces.set(sessionId, entry);
    ctxResolve(ctx);
    return new Promise((resolve) => { entry.end = resolve; });
  }, { name: 'chat-session', sessionId, timeout: 0 });

  return ctxReady;
}

function endSessionTrace(sessionId) {
  const entry = sessionTraces.get(sessionId);
  if (entry) {
    if (entry.end) entry.end();
    sessionTraces.delete(sessionId);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastActive] of sessionActivity) {
    if (now - lastActive > SESSION_TTL_MS) {
      endSessionTrace(sessionId);
      sessionMessages.delete(sessionId);
      sessionActivity.delete(sessionId);
    }
  }
}, 60 * 1000);

// --- Express app ---

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/session/new', (req, res) => {
  const oldSessionId = req.body.oldSessionId;
  if (oldSessionId) {
    endSessionTrace(oldSessionId);
    sessionMessages.delete(oldSessionId);
    sessionActivity.delete(oldSessionId);
  }
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessionMessages.set(sessionId, [{ role: 'system', content: SYSTEM_PROMPT }]);
  res.json({ sessionId });
});

app.post('/api/session/end', (req, res) => {
  const sessionId = req.body?.sessionId;
  if (sessionId) {
    endSessionTrace(sessionId);
    sessionMessages.delete(sessionId);
    sessionActivity.delete(sessionId);
  }
  res.sendStatus(204);
});

app.post('/api/chat', async (req, res) => {
  const sessionId = req.body.sessionId;
  const message = req.body.message || '';

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  sessionActivity.set(sessionId, Date.now());

  if (!sessionMessages.has(sessionId)) {
    sessionMessages.set(sessionId, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }

  const messages = sessionMessages.get(sessionId);
  messages.push({ role: 'user', content: message });

  try {
    const ctx = await getSessionCtx(sessionId);
    const reply = await handleUserMessage(messages, ctx);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

app.listen(PORT, () => {
  console.log(`\nTechStore Support Web UI running at http://localhost:${PORT}`);
});
