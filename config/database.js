const mysql = require("mysql2");
const { dbHost, dbName, dbPass, dbUser } = require("../config/dotenvConfig");

class Database {
  constructor() {
    this.host = dbHost;
    this.username = dbUser;
    this.password = dbPass;
    this.database = dbName;
//  this.host = "localhost";
//     this.username = "root";
    
//     this.password = "";
//     this.database = "gamestechindia";


    // ✅ CREATE POOL instead of single connection
    this.pool = mysql.createPool({
      host: this.host,
      user: this.username,
      password: this.password,
      database: this.database,
      waitForConnections: true,
      connectionLimit: 10,        // Max 10 concurrent connections
      queueLimit: 0,              // Unlimited queue
      enableKeepAlive: true,      // Keep connections alive
      keepAliveInitialDelay: 0,   // Start keep-alive immediately
    });

    // Get a promise-based wrapper
    this.promisePool = this.pool.promise();

    this.testConnection();
  }

  // Test connection on startup
  async testConnection() {
    try {
      const connection = await this.promisePool.getConnection();
      console.log("✅ Connected to database successfully!");
      connection.release();
    } catch (err) {
      console.error("❌ Database Connectivity Error:", err);
    }
  }

  select(tbl_name, column = "*", where = "", params = [], print = false) {
    let wr = "";
    if (where !== "") {
      wr = `WHERE ${where}`;
    }
    const sql = `SELECT ${column} FROM ${tbl_name} ${wr}`;
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results[0]); // Returns first row or undefined
      });
    });
  }

  selectAll(
    tbl_name,
    column = "*",
    where = "",
    params = [],
    orderby = "",
    print = false
  ) {
    let wr = "";
    if (where !== "") {
      wr = `WHERE ${where}`;
    }
    const sql = `SELECT ${column} FROM ${tbl_name} ${wr} ${orderby}`;
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results); // Returns all rows
      });
    });
  }

  insert(tbl_name, data, print = false) {
    const sql = `INSERT INTO ${tbl_name} SET ?`;
    if (print) {
      console.log(sql, data);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, data, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          insert_id: result.insertId,
          affected_rows: result.affectedRows,
          info: result.info,
        });
      });
    });
  }

  update(table_name, form_data, where = "", params = [], print = false) {
    let whereSQL = "";
    if (where !== "") {
      whereSQL = ` WHERE ${where}`;
    }
    const sql = `UPDATE ${table_name} SET ? ${whereSQL}`;
    if (print) {
      console.log(sql, [form_data, ...params]);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, [form_data, ...params], (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          affected_rows: result.affectedRows,
          info: result.info,
        });
      });
    });
  }

  delete(tbl_name, where = "", params = [], print = false) {
    let whereSQL = "";
    if (where !== "") {
      whereSQL = ` WHERE ${where}`;
    }
    const sql = `DELETE FROM ${tbl_name} ${whereSQL}`;
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          info: result.info,
        });
      });
    });
  }

  query(sql, params = [], print = false) {
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results[0]);
      });
    });
  }

  queryAll(sql, params = [], print = false) {
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });
    });
  }

  insertAll(sql, params = [], print = false) {
    if (print) {
      console.log(sql, params);
    }
    return new Promise((resolve, reject) => {
      this.pool.query(sql, params, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          status: true,
          insert_id: result.insertId,
          affected_rows: result.affectedRows,
          info: result.info,
        });
      });
    });
  }

  // ✅ Add graceful shutdown method
  async close() {
    return new Promise((resolve, reject) => {
      this.pool.end((err) => {
        if (err) {
          console.error('Error closing database pool:', err);
          reject(err);
        } else {
          console.log('✅ Database pool closed');
          resolve();
        }
      });
    });
  }
}

const db = new Database();

module.exports = db;