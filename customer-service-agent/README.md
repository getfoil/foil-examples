# Customer Service Agent

A demo customer support agent for "TechMart Electronics" that showcases Foil's tracing capabilities. Includes both a CLI and a browser-based chat interface with image upload support.

The agent uses OpenAI GPT-4o-mini with tool calling to look up customers, search orders, query a knowledge base, process refunds, and escalate tickets — all traced through the Foil SDK.

## Setup

```bash
npm install
```

Set your environment variables:

```bash
export OPENAI_API_KEY=sk-...       # Required
export FOIL_API_KEY=sk_live_...    # Optional — enables Foil tracing
```

## Running

### Web UI

```bash
npm run web
```

Open [http://localhost:3005](http://localhost:3005) in your browser. You'll see a chat interface where you can:

- Converse with the support agent
- Upload images (e.g. photos of damaged products)
- Click test customer email chips to quickly start a conversation
- Start new sessions with the "New Session" button

Each session is a single Foil trace. All message turns appear as spans within that trace, so you can see the full conversation flow in your Foil dashboard.

### CLI

```bash
npm start
```

Type messages in the terminal. Use `/new` to start a new session, `/quit` to exit. You can also pass image file paths directly in your message.

## Test Customers

The agent uses in-memory mock data. These test customers are available:

| Email | Tier | Notes |
|-------|------|-------|
| sarah@example.com | Gold | Multiple orders |
| marcus.j@example.com | Platinum | Has a pending return |
| emily.d@example.com | Standard | New customer |

## Foil Tracing

When `FOIL_API_KEY` is set, every conversation is traced through Foil. You'll see:

- **One trace per session** — the full conversation from start to finish
- **LLM spans** — each message turn, including input/output and token usage
- **Tool spans** — nested under each LLM span (customer lookups, order searches, etc.)
- **Media uploads** — attached images are uploaded and visible in the trace

View your traces at [app.getfoil.com](https://app.getfoil.com).
