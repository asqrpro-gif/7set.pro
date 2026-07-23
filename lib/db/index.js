import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

// Гарантируем наличие папки /db/
const dbDir = path.join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Подключаемся к единому файлу базы данных SQLite через встроенный движок Node.js
const dbPath = path.join(dbDir, 'app.db');
const db = new DatabaseSync(dbPath);

// Включаем режим WAL (Write-Ahead Logging) для быстрой работы
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Автоматическая инициализация таблиц
 */
export function initDB() {
  db.exec(`
    -- Таблица пользователей (Водители)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'user', -- 'user' | 'admin'
      subscription_plan TEXT DEFAULT 'free', -- 'free' | 'premium'
      subscription_expires_at INTEGER,
      created_at INTEGER NOT NULL
    );

    -- Таблица автомобилей (Гараж)
    CREATE TABLE IF NOT EXISTS cars (
      id TEXT PRIMARY KEY,
      user_phone TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      last_manual_km INTEGER NOT NULL,
      last_manual_km_date INTEGER NOT NULL,
      avg_daily_km REAL DEFAULT 30.0,
      FOREIGN KEY (user_phone) REFERENCES users(phone) ON DELETE CASCADE
    );

    -- Таблица сервисного журнала (Бортовик)
    CREATE TABLE IF NOT EXISTS service_logs (
      id TEXT PRIMARY KEY,
      car_id TEXT NOT NULL,
      type TEXT NOT NULL, -- 'maintenance' | 'incident' | 'fuel'
      title TEXT NOT NULL,
      km INTEGER NOT NULL,
      cost_kzt INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
    );

    -- Таблица транзакций (Оплаты Kaspi / Paybox)
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_phone TEXT NOT NULL,
      amount_kzt INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'failed'
      payment_type TEXT NOT NULL, -- 'single_error' | 'premium_subscription'
      created_at INTEGER NOT NULL
    );
  `);

  console.log('✅ SQLite База данных успешно инициализирована!');
}

export default db;
