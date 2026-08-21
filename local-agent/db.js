// DB driver abstraction. Only the driver matching DB_ENGINE is ever
// imported, so machines only need the one package that's actually in use.
let driverCache = null;

async function getDriver() {
  if (driverCache) return driverCache;
  const engine = (process.env.DB_ENGINE || '').toLowerCase();

  if (engine === 'mysql') {
    const mysql = (await import('mysql2/promise')).default;
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    driverCache = {
      run: async (sql, values) => {
        const [rows] = await pool.query(sql, values);
        return rows;
      },
      runRaw: async (sql) => {
        const [rows] = await pool.query(sql);
        return rows;
      }
    };
  } else if (engine === 'postgres') {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    driverCache = {
      run: async (sql, values) => {
        const result = await pool.query(sql, values);
        return result.rows;
      },
      runRaw: async (sql) => {
        const result = await pool.query(sql);
        return result.rows;
      }
    };
  } else if (engine === 'mssql') {
    const mssql = (await import('mssql')).default;
    const rawHost = process.env.DB_HOST || '';
    const [hostPart, instancePart] = rawHost.split('\\');
    const config = {
      server: hostPart,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    };
    if (instancePart) {
      config.options.instanceName = instancePart;
    } else {
      config.port = Number(process.env.DB_PORT || 1433);
    }
    const pool = await mssql.connect(config);
    driverCache = {
      run: async (sql, values) => {
        const request = pool.request();
        values.forEach((value, index) => request.input(`p${index}`, value));
        const result = await request.query(sql);
        return result.recordset;
      },
      runRaw: async (sql) => {
        const result = await pool.request().query(sql);
        return result.recordset;
      }
    };
  } else if (engine === 'hana') {
    const hdb = (await import('hdb')).default;
    const client = hdb.createClient({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 30015),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });
    await new Promise((resolve, reject) => {
      client.connect((err) => (err ? reject(err) : resolve()));
    });
    driverCache = {
      run: (sql, values) =>
        new Promise((resolve, reject) => {
          client.exec(sql, values, (err, rows) => (err ? reject(err) : resolve(rows)));
        }),
      runRaw: (sql) =>
        new Promise((resolve, reject) => {
          client.exec(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
        })
    };
  } else if (engine === 'sqlite') {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(process.env.DB_PATH);
    driverCache = {
      run: async (sql, values) => {
        const stmt = db.prepare(sql);
        return stmt.all(...values);
      },
      runRaw: async (sql) => {
        const stmt = db.prepare(sql);
        return stmt.all();
      }
    };
  } else {
    throw new Error(
      `Unsupported or missing DB_ENGINE: "${process.env.DB_ENGINE}". Use mysql, postgres, mssql, hana, or sqlite.`
    );
  }

  return driverCache;
}

export async function runQuery(sql, values) {
  const driver = await getDriver();
  return driver.run(sql, values);
}

export async function runRawQuery(sql) {
  const driver = await getDriver();
  return driver.runRaw(sql);
}
