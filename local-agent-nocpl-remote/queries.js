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
  // NCPL_110126 — Sales Order brokerage report (RDR1 UDFs: U_Brok_Seller, U_Brok_Buyer).
  // Also referred to as "SO brokerage" or "SODA brokerage" — same report, same query.
  // fromDate is inclusive, toDate is exclusive (e.g. April 2026 -> '2026-04-01', '2026-05-01').
  get_sales_order_brokerage: {
    sql: `SELECT T0.DocNum,T0.DocDate,T0.CardCode,T0.CardName,T1.LineNum,T1.ItemCode,T1.Dscription,
T1.Quantity,T1.Price,T1.Currency,T1.LineTotal,T1.WhsCode,
T1.U_Brok_Seller AS Seller_Brokerage_Rate,T1.U_Brok_Buyer AS Buyer_Brokerage_Rate,
(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Seller,0)) AS Seller_Brokerage_Amount,
(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Buyer,0)) AS Buyer_Brokerage_Amount,
(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Seller,0))+(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Buyer,0)) AS Total_Brokerage
FROM [NCPL_110126].[dbo].[ORDR] T0
INNER JOIN [NCPL_110126].[dbo].[RDR1] T1 ON T0.DocEntry=T1.DocEntry
WHERE T0.DocDate >= @p0 AND T0.DocDate < @p1 AND T0.CANCELED='N'
ORDER BY T0.DocDate,T0.DocNum,T1.LineNum`,
    params: ['fromDate', 'toDate']
  },

  // NCPL_110126 — Delivery brokerage report (DLN1 UDFs: U_Brok_Seller, U_Brok_Buyer).
  // fromDate is inclusive, toDate is exclusive (e.g. April 2026 -> '2026-04-01', '2026-05-01').
  get_delivery_brokerage: {
    sql: `SELECT T0.DocNum,T0.DocDate,T0.CardCode,T0.CardName,T1.LineNum,T1.ItemCode,T1.Dscription,
T1.Quantity,T1.Price,T1.Currency,T1.LineTotal,T1.WhsCode,
T1.U_Brok_Seller AS Seller_Brokerage_Rate,T1.U_Brok_Buyer AS Buyer_Brokerage_Rate,
(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Seller,0)) AS Seller_Brokerage_Amount,
(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Buyer,0)) AS Buyer_Brokerage_Amount,
(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Seller,0))+(ISNULL(T1.Quantity,0)*ISNULL(T1.U_Brok_Buyer,0)) AS Total_Brokerage
FROM [NCPL_110126].[dbo].[ODLN] T0
INNER JOIN [NCPL_110126].[dbo].[DLN1] T1 ON T0.DocEntry=T1.DocEntry
WHERE T0.DocDate >= @p0 AND T0.DocDate < @p1 AND T0.CANCELED='N'
ORDER BY T0.DocDate,T0.DocNum,T1.LineNum`,
    params: ['fromDate', 'toDate']
  }
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
