import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  role: text('role').notNull().default('user'), // 'user', 'admin'
  subscriptionPlan: text('subscription_plan').notNull().default('free'), // 'free', 'premium'
  subscriptionExpiresAt: integer('subscription_expires_at'), // timestamp
  createdAt: integer('created_at').notNull() // timestamp
});

export const cars = sqliteTable('cars', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  year: integer('year').notNull(),
  lastManualKm: integer('last_manual_km'),
  lastManualKmDate: integer('last_manual_km_date'), // timestamp
  avgDailyKm: real('avg_daily_km')
});

export const serviceLogs = sqliteTable('service_logs', {
  id: text('id').primaryKey(),
  carId: text('car_id').notNull().references(() => cars.id),
  type: text('type').notNull(), // 'maintenance', 'incident', 'fuel'
  title: text('title').notNull(),
  km: integer('km').notNull(),
  costKzt: integer('cost_kzt').notNull()
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  amountKzt: integer('amount_kzt').notNull(),
  status: text('status').notNull().default('pending'), // 'pending', 'paid', 'failed'
  paymentType: text('payment_type').notNull() // 'single_error', 'premium_subscription'
});
