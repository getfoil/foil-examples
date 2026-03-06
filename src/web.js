const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const multer = require('multer');
const { Foil } = require('@getfoil/foil-js');
const { SupportAgent } = require('./agents/support');

const AGENT_NAME = 'customer-support-agent';
const PORT = process.env.PORT || 3005;

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

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

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

// ── Session trace management ────────────────────────────────────────
// Keep one Foil trace open per session. The trace callback returns a
// promise that stays pending until endSession() is called, keeping the
// trace alive across multiple HTTP requests.
const sessions = new Map(); // sessionId → { ctx, end }

function getOrCreateSession(sessionId) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  if (!foilApiKey) {
    const session = { ctx: createMockCtx(), end: () => {} };
    sessions.set(sessionId, session);
    return session;
  }

  // Create a promise that we control — resolving it ends the trace
  let resolveTrace;
  const pending = new Promise((resolve) => {
    resolveTrace = resolve;
  });

  const session = { ctx: null, end: null, ready: null };

  // Start the trace in the background. The callback receives ctx and
  // waits on `pending` — which only resolves when we call session.end().
  session.ready = foil.trace(
    (ctx) => {
      session.ctx = ctx;
      return pending;
    },
    {
      name: 'customer-support-web',
      sessionId,
      timeout: 0, // no timeout — session lives until explicitly ended
    },
  );

  session.end = () => {
    resolveTrace();
    sessions.delete(sessionId);
  };

  sessions.set(sessionId, session);
  return session;
}

function endSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.end();
    agent.endConversation(sessionId);
  }
}

// Clean up idle sessions after 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessionActivity = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastActive] of sessionActivity) {
    if (now - lastActive > SESSION_TTL_MS) {
      endSession(sessionId);
      sessionActivity.delete(sessionId);
    }
  }
}, 60 * 1000);

// ── Express app ─────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// End a session (called via beacon on page unload)
app.post('/api/session/end', (req, res) => {
  const sessionId = req.body.sessionId;
  if (sessionId) {
    endSession(sessionId);
    sessionActivity.delete(sessionId);
  }
  res.sendStatus(204);
});

// Create a new session (ends any previous one)
app.post('/api/session/new', (req, res) => {
  const oldSessionId = req.body.oldSessionId;
  if (oldSessionId) {
    endSession(oldSessionId);
    sessionActivity.delete(oldSessionId);
  }
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  getOrCreateSession(sessionId);
  res.json({ sessionId });
});

// Chat endpoint — accepts JSON or multipart with image
app.post('/api/chat', upload.single('image'), async (req, res) => {
  const sessionId = req.body.sessionId;
  const message = req.body.message || '';
  const imagePath = req.file ? req.file.path : null;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  if (!message && !imagePath) {
    return res.status(400).json({ error: 'message or image is required' });
  }

  sessionActivity.set(sessionId, Date.now());

  try {
    const session = getOrCreateSession(sessionId);

    // Wait for ctx to be available (trace callback may not have run yet)
    if (!session.ctx) {
      await new Promise((resolve) => {
        const check = () => {
          if (session.ctx) return resolve();
          setTimeout(check, 5);
        };
        check();
      });
    }

    const result = await agent.processMessage(sessionId, message, session.ctx, {
      imagePath: imagePath || undefined,
    });

    res.json({
      reply: result.content,
      customerContext: result.customerContext,
      turnCount: result.turnCount,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process message' });
  } finally {
    // Clean up temp file
    if (imagePath) {
      fs.unlink(imagePath, () => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`\nTechMart Support Web UI running at http://localhost:${PORT}`);
  if (foilApiKey) {
    console.log('Foil tracing: ON');
  } else {
    console.log('Foil tracing: OFF (set FOIL_API_KEY to enable)');
  }
});
