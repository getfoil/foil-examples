// Simulated customer database
const customers = {
  'cust-001': {
    id: 'cust-001',
    name: 'Sarah Chen',
    email: 'sarah@example.com',
    phone: '555-100-2000',
    loyaltyTier: 'Gold',
    memberSince: '2023-03-15',
    lifetimeSpend: 2450.0,
    openTickets: 0,
    orders: ['ORD-1001', 'ORD-1002', 'ORD-1005', 'ORD-1008'],
    notes: 'Prefers email communication. VIP customer.',
  },
  'cust-002': {
    id: 'cust-002',
    name: 'Marcus Johnson',
    email: 'marcus.j@example.com',
    phone: '555-200-3000',
    loyaltyTier: 'Platinum',
    memberSince: '2021-11-20',
    lifetimeSpend: 8920.0,
    openTickets: 1,
    orders: ['ORD-1003', 'ORD-1004', 'ORD-1006', 'ORD-1009', 'ORD-1010'],
    notes: 'Long-time customer. Has dedicated account manager.',
  },
  'cust-003': {
    id: 'cust-003',
    name: 'Emily Davis',
    email: 'emily.d@example.com',
    phone: '555-300-4000',
    loyaltyTier: 'Standard',
    memberSince: '2025-01-10',
    lifetimeSpend: 89.99,
    openTickets: 0,
    orders: ['ORD-1007'],
    notes: 'New customer.',
  },
};

const orders = {
  'ORD-1001': {
    id: 'ORD-1001',
    customerId: 'cust-001',
    status: 'delivered',
    total: 299.99,
    items: [{ name: 'Noise-Cancelling Headphones', sku: 'NCH-500', qty: 1, price: 299.99 }],
    orderDate: '2025-10-01',
    deliveredDate: '2025-10-05',
    tracking: 'TRK-AAA-111',
  },
  'ORD-1002': {
    id: 'ORD-1002',
    customerId: 'cust-001',
    status: 'shipped',
    total: 149.99,
    items: [{ name: 'Mechanical Keyboard', sku: 'MKB-200', qty: 1, price: 149.99 }],
    orderDate: '2025-12-20',
    tracking: 'TRK-BBB-222',
    estimatedDelivery: '2025-12-27',
  },
  'ORD-1003': {
    id: 'ORD-1003',
    customerId: 'cust-002',
    status: 'delivered',
    total: 1299.99,
    items: [{ name: '4K Monitor 32"', sku: 'MON-4K32', qty: 1, price: 1299.99 }],
    orderDate: '2025-09-15',
    deliveredDate: '2025-09-19',
    tracking: 'TRK-CCC-333',
  },
  'ORD-1004': {
    id: 'ORD-1004',
    customerId: 'cust-002',
    status: 'processing',
    total: 449.98,
    items: [
      { name: 'Ergonomic Mouse', sku: 'ERM-100', qty: 1, price: 89.99 },
      { name: 'USB-C Docking Station', sku: 'DCK-400', qty: 1, price: 359.99 },
    ],
    orderDate: '2025-12-22',
    estimatedShipDate: '2025-12-24',
  },
  'ORD-1005': {
    id: 'ORD-1005',
    customerId: 'cust-001',
    status: 'delivered',
    total: 59.99,
    items: [{ name: 'Webcam HD 1080p', sku: 'WCM-1080', qty: 1, price: 59.99 }],
    orderDate: '2025-06-10',
    deliveredDate: '2025-06-14',
    tracking: 'TRK-DDD-444',
  },
  'ORD-1006': {
    id: 'ORD-1006',
    customerId: 'cust-002',
    status: 'return_requested',
    total: 199.99,
    items: [{ name: 'Wireless Earbuds Pro', sku: 'WEB-PRO', qty: 1, price: 199.99 }],
    orderDate: '2025-11-01',
    deliveredDate: '2025-11-05',
    returnReason: 'Left earbud has static noise',
    returnRequestDate: '2025-12-20',
  },
  'ORD-1007': {
    id: 'ORD-1007',
    customerId: 'cust-003',
    status: 'delivered',
    total: 89.99,
    items: [{ name: 'Portable Charger 20000mAh', sku: 'PWR-20K', qty: 1, price: 89.99 }],
    orderDate: '2025-01-15',
    deliveredDate: '2025-01-20',
    tracking: 'TRK-EEE-555',
  },
  'ORD-1008': {
    id: 'ORD-1008',
    customerId: 'cust-001',
    status: 'cancelled',
    total: 39.99,
    items: [{ name: 'Screen Protector Pack', sku: 'SPP-3PK', qty: 1, price: 39.99 }],
    orderDate: '2025-12-18',
    cancelReason: 'Customer changed mind',
  },
  'ORD-1009': {
    id: 'ORD-1009',
    customerId: 'cust-002',
    status: 'shipped',
    total: 749.99,
    items: [{ name: 'Standing Desk Converter', sku: 'SDK-750', qty: 1, price: 749.99 }],
    orderDate: '2025-12-19',
    tracking: 'TRK-FFF-666',
    estimatedDelivery: '2025-12-26',
  },
  'ORD-1010': {
    id: 'ORD-1010',
    customerId: 'cust-002',
    status: 'delivered',
    total: 129.99,
    items: [{ name: 'Laptop Stand Aluminum', sku: 'LSA-100', qty: 1, price: 129.99 }],
    orderDate: '2025-08-05',
    deliveredDate: '2025-08-09',
    tracking: 'TRK-GGG-777',
  },
};

const tickets = [];
let ticketCounter = 1000;

function lookupCustomerByEmail(email) {
  return Object.values(customers).find((c) => c.email === email) || null;
}

function lookupCustomerById(id) {
  return customers[id] || null;
}

function lookupOrder(orderId) {
  return orders[orderId] || null;
}

function getCustomerOrders(customerId) {
  const customer = customers[customerId];
  if (!customer) return [];
  return customer.orders.map((id) => orders[id]).filter(Boolean);
}

function createTicket({ customerId, subject, description, priority, category }) {
  ticketCounter++;
  const ticket = {
    id: `TKT-${ticketCounter}`,
    customerId,
    subject,
    description,
    priority: priority || 'medium',
    category: category || 'general',
    status: 'open',
    createdAt: new Date().toISOString(),
    assignedTo: priority === 'high' ? 'senior-support' : 'support-team',
  };
  tickets.push(ticket);
  if (customers[customerId]) {
    customers[customerId].openTickets++;
  }
  return ticket;
}

function processRefund({ orderId, amount, reason }) {
  const order = orders[orderId];
  if (!order) return { error: 'Order not found' };
  if (order.status !== 'delivered' && order.status !== 'return_requested') {
    return { error: `Cannot refund order with status: ${order.status}` };
  }
  const refundAmount = amount || order.total;
  order.status = 'refunded';
  return {
    refundId: `REF-${Date.now()}`,
    orderId,
    amount: refundAmount,
    reason,
    status: 'approved',
    estimatedProcessingDays: 5,
  };
}

function escalateToHuman({ customerId, reason, priority }) {
  return {
    escalationId: `ESC-${Date.now()}`,
    customerId,
    reason,
    priority: priority || 'high',
    assignedTo: priority === 'urgent' ? 'manager' : 'senior-support',
    estimatedResponseTime: priority === 'urgent' ? '15 minutes' : '1 hour',
    status: 'escalated',
  };
}

module.exports = {
  lookupCustomerByEmail,
  lookupCustomerById,
  lookupOrder,
  getCustomerOrders,
  createTicket,
  processRefund,
  escalateToHuman,
};
