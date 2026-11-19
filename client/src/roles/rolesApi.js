import { api } from '../api.js';

// Agent lists (saved invoices), for agents.
export const listEntries = (token) => api('/entries', { token });
export const saveEntry = (token, { debit, credit, method }) =>
  api('/entries', { method: 'POST', token, body: { debit, credit, method } });
export const deleteEntry = (token, id) =>
  api(`/entries/${encodeURIComponent(id)}`, { method: 'DELETE', token });

// Managing agents, for the superadmin.
export const listAgents = (token) => api('/agents', { token });
export const addAgent = (token, { phone, name }) =>
  api('/agents', { method: 'POST', token, body: { phone, name } });
export const removeAgent = (token, phone) =>
  api(`/agents/${encodeURIComponent(phone)}`, { method: 'DELETE', token });
export const getAgent = (token, phone) => api(`/agents/${encodeURIComponent(phone)}`, { token });
