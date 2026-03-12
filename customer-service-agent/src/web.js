const { foil } = require('../foil');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const multer = require('multer');
const { SupportAgent } = require('./agents/support');

const AGENT_NAME = 'customer-support-agent';
const PORT = process.env.PORT || 3005;

// Validate environment
if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY is required');
  process.exit(1);
}

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

// ── Session management ──────────────────────────────────────────────
const sessions = new Set();

function endSession(sessionId) {
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
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
  sessions.add(sessionId);
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
  sessions.add(sessionId);

  try {
    const result = await foil.trace(async (ctx) => {
      return agent.processMessage(sessionId, message, {
        imagePath: imagePath || undefined,
        ctx,
      });
    }, { name: 'chat', input: message, sessionId });

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
});
