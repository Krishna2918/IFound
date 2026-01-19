/**
 * Database Sync Script
 *
 * Run with: node src/tests/syncDb.js
 */

require('dotenv').config();

const { sequelize } = require('../config/database');
const { syncDatabase } = require('../models');

async function sync() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    console.log('Syncing database schema (alter mode)...');
    await syncDatabase({ alter: true });
    console.log('Database synced successfully!');

    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

sync();
