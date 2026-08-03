// In-memory stand-in for Cloudflare D1, covering exactly the queries
// worker.js issues — lets the real Worker run under plain Node for tests.
export function fakeD1() {
  const licenses = new Map(); // key -> row
  const activations = [];     // rows
  return {
    _licenses: licenses,
    _activations: activations,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM licenses WHERE key')) return licenses.get(args[0]) || null;
              throw new Error('fake-d1: unhandled first(): ' + sql);
            },
            async all() {
              if (sql.includes('FROM activations WHERE license_key')) {
                return { results: activations.filter((a) => a.license_key === args[0] && !a.deactivated_at) };
              }
              throw new Error('fake-d1: unhandled all(): ' + sql);
            },
            async run() {
              if (sql.startsWith('INSERT INTO activations')) {
                activations.push({ license_key: args[0], machine_id: args[1], machine_name: args[2], activated_at: new Date().toISOString(), deactivated_at: null });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith('UPDATE activations')) {
                let n = 0;
                activations.forEach((a) => {
                  if (a.license_key === args[0] && a.machine_id === args[1] && !a.deactivated_at) { a.deactivated_at = new Date().toISOString(); n++; }
                });
                return { meta: { changes: n } };
              }
              if (sql.startsWith('INSERT INTO licenses')) {
                licenses.set(args[0], { key: args[0], customer: args[1], email: args[2], seats: args[3], note: args[4], kind: args[5] || 'full', status: 'active', created_at: new Date().toISOString() });
                return { meta: { changes: 1 } };
              }
              throw new Error('fake-d1: unhandled run(): ' + sql);
            }
          };
        },
        async all() { // un-bound list query
          if (sql.includes('FROM licenses l')) {
            return { results: [...licenses.values()].map((l) => ({ ...l, seats_used: activations.filter((a) => a.license_key === l.key && !a.deactivated_at).length })) };
          }
          throw new Error('fake-d1: unhandled all(): ' + sql);
        }
      };
    }
  };
}
