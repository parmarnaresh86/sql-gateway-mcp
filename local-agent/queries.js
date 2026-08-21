// The allowlist. This is the only thing the agent will ever execute,
// regardless of what the MCP server (or the LLM behind it) asks for.
//
// Placeholder syntax depends on DB_ENGINE (see db.js):
//   mysql, sqlite  -> "?"          e.g. "SELECT * FROM t WHERE id = ?"
//   postgres       -> "$1, $2..."  e.g. "SELECT * FROM t WHERE id = $1"
//   mssql          -> "@p0, @p1..." e.g. "SELECT * FROM t WHERE id = @p0"
//
// `params` lists the named parameters in the exact order they must be
// substituted into the placeholders above.
export const QUERIES = {
  // Example - replace with real queries for your database.
  // get_customer_balance: {
  //   sql: 'SELECT CardCode, CardName, Balance FROM OCRD WHERE CardCode = ?',
  //   params: ['cardCode']
  // }
};

export function resolveParams(queryName, params = {}) {
  const query = QUERIES[queryName];
  if (!query) {
    throw new Error(`Query "${queryName}" is not in the allowlist.`);
  }

  const values = query.params.map((name) => {
    if (!(name in params)) {
      throw new Error(`Missing required parameter "${name}" for query "${queryName}".`);
    }
    return params[name];
  });

  return { sql: query.sql, values };
}
