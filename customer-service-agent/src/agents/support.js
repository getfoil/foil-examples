const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { toolDefinitions } = require('../tools/definitions');
const { toolHandlers } = require('../tools/handlers');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function detectImageFile(message) {
  const trimmed = message.trim();
  const words = trimmed.split(/\s+/);

  // Check each word for an image file path (last match wins)
  let filePath = null;
  let textParts = [];

  for (const word of words) {
    const ext = path.extname(word).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) && fs.existsSync(word)) {
      filePath = word;
    } else {
      textParts.push(word);
    }
  }

  if (filePath) {
    return { isImage: true, filePath, textPart: textParts.join(' ') || '' };
  }
  return { isImage: false };
}

const SYSTEM_PROMPT = `You are a senior customer support agent for TechMart Electronics. Your name is Alex.

## Guidelines
- Be warm, professional, and empathetic. Use the customer's name when you know it.
- Always look up the customer's account first when they provide an email. This gives you context about their loyalty tier and history.
- Search the knowledge base when answering policy questions (returns, shipping, warranty, billing).
- For order issues, look up the specific order to get accurate status information.
- Confirm with the customer before processing refunds or creating tickets.
- Escalate to a human agent when: the customer is extremely frustrated and you cannot resolve it, the customer explicitly asks for a manager, or the issue is outside your capabilities.
- If the customer shares an image (photo of damage, screenshot, etc.), acknowledge it and describe what you observe.
- Never guess information — always use tools to look it up.
- Keep responses concise but helpful. Don't over-explain unless the customer asks for details.

## Tone Calibration
- Standard/Silver customers: Friendly and helpful
- Gold customers: Extra attentive, mention their loyalty benefits
- Platinum customers: VIP treatment, proactive offers, mention their dedicated account manager`;

function accumulateTokens(total, response) {
  if (response?.usage) {
    total.prompt += response.usage.prompt_tokens || 0;
    total.completion += response.usage.completion_tokens || 0;
    total.total += response.usage.total_tokens || 0;
  }
}

async function executeTools(response, handlers) {
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
}

class SupportAgent {
  constructor({ openaiApiKey, model = 'gpt-4o-mini' }) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.model = model;
    this.conversations = new Map();
  }

  getOrCreateConversation(sessionId) {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
        customerContext: null,
        turnCount: 0,
      });
    }
    return this.conversations.get(sessionId);
  }

  async processMessage(sessionId, userMessage, { imagePath, ctx } = {}) {
    const convo = this.getOrCreateConversation(sessionId);
    convo.turnCount++;

    // Detect image file paths in the message
    const { isImage, filePath, textPart } = imagePath
      ? { isImage: true, filePath: imagePath, textPart: userMessage || '' }
      : detectImageFile(userMessage);

    if (isImage) {
      const base64 = fs.readFileSync(filePath).toString('base64');
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : 'image/jpeg';
      const textMessage = textPart || 'Customer attached this image:';
      convo.messages.push({
        role: 'user',
        content: [
          { type: 'text', text: textMessage },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      });
    } else {
      convo.messages.push({ role: 'user', content: userMessage });
    }

    const totalTokens = { prompt: 0, completion: 0, total: 0 };

    // Demo: force hallucination by stripping tools so the model must answer
    // from its training data instead of looking anything up.
    const forceHallucinate = /\bfrom memory\b/i.test(userMessage)
      || userMessage.trim().startsWith('/demo-hallucinate');

    // Foil-traced path: wrap the entire tool-calling loop in one LLM span
    if (ctx) {
      const content = await ctx.llmCall(this.model, async () => {
        let response = await this.openai.chat.completions.create({
          model: this.model,
          messages: forceHallucinate
            ? [...convo.messages, { role: 'system', content: 'Answer the customer directly from what you know. Do not say you need to look anything up — just provide specific details.' }]
            : convo.messages,
          ...(forceHallucinate ? {} : { tools: toolDefinitions, tool_choice: 'auto' }),
        });
        accumulateTokens(totalTokens, response);

        while (response.choices[0].finish_reason === 'tool_calls' || response.choices[0].message.tool_calls) {
          const assistantMessage = response.choices[0].message;
          convo.messages.push(assistantMessage);

          const toolMessages = await ctx.executeTools(response, toolHandlers);
          convo.messages.push(...toolMessages);

          if (assistantMessage.tool_calls) {
            for (const tc of assistantMessage.tool_calls) {
              if (tc.function.name === 'lookup_customer') {
                const resultMsg = toolMessages.find((m) => m.tool_call_id === tc.id);
                if (resultMsg) {
                  try {
                    const parsed = JSON.parse(resultMsg.content);
                    if (parsed.id) convo.customerContext = parsed;
                  } catch {}
                }
              }
            }
          }

          response = await this.openai.chat.completions.create({
            model: this.model,
            messages: convo.messages,
            tools: toolDefinitions,
            tool_choice: 'auto',
          });
          accumulateTokens(totalTokens, response);
        }

        const finalMessage = response.choices[0].message;
        convo.messages.push(finalMessage);
        return finalMessage.content;
      }, { input: userMessage });

      return {
        content,
        customerContext: convo.customerContext,
        turnCount: convo.turnCount,
      };
    }

    // Initial LLM call
    let response = await this.openai.chat.completions.create({
      model: this.model,
      messages: forceHallucinate
        ? [...convo.messages, { role: 'system', content: 'Answer the customer directly from what you know. Do not say you need to look anything up — just provide specific details.' }]
        : convo.messages,
      ...(forceHallucinate ? {} : { tools: toolDefinitions, tool_choice: 'auto' }),
    });
    accumulateTokens(totalTokens, response);

    // Tool call loop — keep calling LLM until it produces a final text response
    while (response.choices[0].finish_reason === 'tool_calls' || response.choices[0].message.tool_calls) {
      const assistantMessage = response.choices[0].message;
      convo.messages.push(assistantMessage);

      const toolMessages = await executeTools(response, toolHandlers);
      convo.messages.push(...toolMessages);

      // Track customer context when we look them up
      if (assistantMessage.tool_calls) {
        for (const tc of assistantMessage.tool_calls) {
          if (tc.function.name === 'lookup_customer') {
            const resultMsg = toolMessages.find((m) => m.tool_call_id === tc.id);
            if (resultMsg) {
              try {
                const parsed = JSON.parse(resultMsg.content);
                if (parsed.id) convo.customerContext = parsed;
              } catch {}
            }
          }
        }
      }

      // Next LLM call with tool results
      response = await this.openai.chat.completions.create({
        model: this.model,
        messages: convo.messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
      });
      accumulateTokens(totalTokens, response);
    }

    const finalMessage = response.choices[0].message;
    convo.messages.push(finalMessage);

    return {
      content: finalMessage.content,
      customerContext: convo.customerContext,
      turnCount: convo.turnCount,
    };
  }

  endConversation(sessionId) {
    this.conversations.delete(sessionId);
  }
}

module.exports = { SupportAgent };
