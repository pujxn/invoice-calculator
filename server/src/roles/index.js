// Who a phone number belongs to. There are two roles:
//   superadmin  numbers listed in SUPERADMIN_PHONES; adds and removes agents and sees every list.
//   agent       numbers a superadmin has added (and not removed); processes invoices and keeps a list.
// Any other number is not allowed in. Looked up on every request, so removing an agent (or a number
// from SUPERADMIN_PHONES after a restart) takes effect at once, even for a session already open.
export const SUPERADMIN_NAME = 'Superadmin';

export function createRoles({ superadmins, store }) {
  const supers = new Set(superadmins);
  return {
    isSuperadmin: (phone) => supers.has(phone),
    // { phone, name, role } or null.
    lookup(phone) {
      if (supers.has(phone)) return { phone, name: SUPERADMIN_NAME, role: 'superadmin' };
      const agent = store.getAgent(phone);
      if (agent && !agent.removedAt) return { phone, name: agent.name, role: 'agent' };
      return null;
    },
  };
}
