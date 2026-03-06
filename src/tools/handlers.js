const {
  lookupCustomerByEmail,
  lookupOrder,
  getCustomerOrders,
  createTicket,
  processRefund,
  escalateToHuman,
} = require('../knowledge/customers');
const { searchArticles } = require('../knowledge/articles');

// Map of tool name -> handler function
const toolHandlers = {
  lookup_customer: async (args) => {
    const customer = lookupCustomerByEmail(args.email);
    if (!customer) return { error: `No customer found with email: ${args.email}` };
    return customer;
  },

  lookup_order: async (args) => {
    const order = lookupOrder(args.order_id);
    if (!order) return { error: `Order ${args.order_id} not found` };
    return order;
  },

  get_customer_orders: async (args) => {
    const orders = getCustomerOrders(args.customer_id);
    if (orders.length === 0) return { error: `No orders found for customer ${args.customer_id}` };
    return { count: orders.length, orders };
  },

  search_knowledge_base: async (args) => {
    const results = searchArticles(args.query);
    if (results.length === 0) return { message: 'No relevant articles found', query: args.query };
    return {
      count: results.length,
      articles: results.map((a) => ({ id: a.id, title: a.title, category: a.category, content: a.content })),
    };
  },

  create_ticket: async (args) => {
    return createTicket(args);
  },

  process_refund: async (args) => {
    return processRefund(args);
  },

  escalate_to_human: async (args) => {
    return escalateToHuman(args);
  },
};

module.exports = { toolHandlers };
