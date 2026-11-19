import { api } from '../api.js';

// An agent's own totals over every invoice they have saved (the history list is paged).
export const getMyTotals = (token) => api('/my-totals', { token });

// Managing agents, for the superadmin.
export const listAgents = (token) => api('/agents', { token });
export const addAgent = (token, { phone, name }) =>
  api('/agents', { method: 'POST', token, body: { phone, name } });
export const removeAgent = (token, phone) =>
  api(`/agents/${encodeURIComponent(phone)}`, { method: 'DELETE', token });
// One agent: their totals and a page of their saved invoices, newest first.
export const getAgent = (token, phone, { limit = 50, offset = 0 } = {}) =>
  api(`/agents/${encodeURIComponent(phone)}?limit=${limit}&offset=${offset}`, { token });
