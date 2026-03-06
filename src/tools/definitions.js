// OpenAI function calling tool definitions
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'lookup_customer',
      description: 'Look up a customer account by their email address. Returns customer profile, loyalty tier, and order history.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Customer email address' },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_order',
      description: 'Look up details of a specific order by order ID. Returns status, items, tracking, and dates.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'Order ID (e.g., ORD-1001)' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_orders',
      description: 'Get all orders for a customer. Use after looking up the customer to see their full order history.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Customer ID (e.g., cust-001)' },
        },
        required: ['customer_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the knowledge base for articles about policies, troubleshooting, shipping, returns, warranties, billing, and account information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query describing what the customer needs help with' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ticket',
      description: 'Create a support ticket for issues that need follow-up or cannot be resolved immediately.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Customer ID' },
          subject: { type: 'string', description: 'Brief subject line for the ticket' },
          description: { type: 'string', description: 'Detailed description of the issue' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Ticket priority' },
          category: {
            type: 'string',
            enum: ['order_issue', 'return', 'warranty', 'billing', 'technical', 'general'],
            description: 'Issue category',
          },
        },
        required: ['customer_id', 'subject', 'description', 'priority', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'process_refund',
      description: 'Process a refund for a delivered or return-requested order. Only use after confirming with the customer.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'Order ID to refund' },
          amount: { type: 'number', description: 'Refund amount (omit for full refund)' },
          reason: { type: 'string', description: 'Reason for the refund' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Escalate the conversation to a human agent. Use when the customer explicitly asks for a manager, the issue is too complex, or the customer is very frustrated.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Customer ID (if known)' },
          reason: { type: 'string', description: 'Why the conversation is being escalated' },
          priority: { type: 'string', enum: ['high', 'urgent'], description: 'Escalation priority' },
        },
        required: ['reason', 'priority'],
      },
    },
  },
];

module.exports = { toolDefinitions };
