import { api } from '../api.js';

// Saved invoice history (server/src/history). Every call needs the sign-in token.
// An entry is { id, agentId, createdAt, updatedAt, debit, credit, net, netRounded, type,
// imageRef, method }. Amounts are exact decimal strings in rupees.

// Saves an invoice. Saving the same picture (imageRef) again updates its record.
export const saveHistoryEntry = ({ debit, credit, imageRef, method }, token) =>
  api('/history', {
    method: 'POST',
    token,
    body: { debit, credit, ...(imageRef ? { imageRef } : {}), ...(method ? { method } : {}) },
  });

export const updateHistoryEntry = (id, { debit, credit }, token) =>
  api(`/history/${id}`, { method: 'PATCH', token, body: { debit, credit } });

export const getHistoryEntry = (id, token) => api(`/history/${id}`, { token });

export const deleteHistoryEntry = (id, token) => api(`/history/${id}`, { method: 'DELETE', token });

// filters: { q, type, from, to, limit, offset } (from and to are ISO times); blanks are left out.
export function listHistory(filters, token) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return api(`/history${query ? `?${query}` : ''}`, { token }); // { entries, total, limit, offset }
}
