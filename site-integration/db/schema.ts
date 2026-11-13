import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const resourceOwnership = sqliteTable("resource_ownership", {
  resourceId: text("resource_id").primaryKey(),
  supplier: text("supplier").notNull().default("eSIMAccess"),
  orderNo: text("order_no"),
  ownerUserId: text("owner_user_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ownerName: text("owner_name"),
  groupId: text("group_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const notificationLog = sqliteTable("notification_log", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id").notNull(),
  kind: text("kind").notNull(),
  sentAt: text("sent_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const integrationSettings = sqliteTable("integration_settings", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const userSecurity = sqliteTable("user_security", {
  userId: text("user_id").primaryKey(),
  pinHash: text("pin_hash").notNull(),
  pinSalt: text("pin_salt").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const quotaTransactions = sqliteTable("quota_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull(),
  kind: text("kind").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reference: text("reference"),
  note: text("note"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const warehouseInventory = sqliteTable("warehouse_inventory", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  supplier: text("supplier").notNull(),
  productName: text("product_name").notNull(),
  category: text("category").notNull().default("数字账号"),
  country: text("country"),
  unitPrice: integer("unit_price"),
  currency: text("currency").notNull().default("USD"),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  status: text("status").notNull().default("available"),
  claimedByUserId: text("claimed_by_user_id"),
  claimedByEmail: text("claimed_by_email"),
  claimedByName: text("claimed_by_name"),
  recipientEmail: text("recipient_email"),
  claimedAt: text("claimed_at"),
  emailStatus: text("email_status").notNull().default("not_sent"),
  emailProviderId: text("email_provider_id"),
  emailError: text("email_error"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const resourceStatusOverrides = sqliteTable(
  "resource_status_overrides",
  {
    id: text("id").primaryKey(),
    supplier: text("supplier").notNull(),
    resourceId: text("resource_id").notNull(),
    status: text("status").notNull().default("normal"),
    note: text("note"),
    recheckAt: text("recheck_at"),
    markedByUserId: text("marked_by_user_id").notNull(),
    markedByEmail: text("marked_by_email").notNull(),
    markedAt: text("marked_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
);

export const resourceGroups = sqliteTable("resource_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  accent: text("accent").notNull().default("bg-[#5578b6]"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const resourceGroupItems = sqliteTable("resource_group_items", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  packageCode: text("package_code"),
  country: text("country"),
  supplier: text("supplier").notNull().default("eSIMAccess"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const resourceGroupMembers = sqliteTable("resource_group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull(),
  userEmail: text("user_email").notNull(),
  canPurchase: integer("can_purchase", { mode: "boolean" })
    .notNull()
    .default(true),
  assignedBy: text("assigned_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sampleDocumentRequests = sqliteTable("sample_document_requests", {
  id: text("id").primaryKey(),
  requestNo: text("request_no").notNull(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull(),
  documentType: text("document_type").notNull(),
  country: text("country").notNull(),
  subjectName: text("subject_name").notNull(),
  addressLine: text("address_line").notNull(),
  purpose: text("purpose").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status").notNull().default("generated"),
  emailStatus: text("email_status").notNull().default("pending"),
  emailProviderId: text("email_provider_id"),
  emailError: text("email_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const personalDetailsDrafts = sqliteTable("personal_details_drafts", {
  userId: text("user_id").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const addressOrders = sqliteTable("address_orders", {
  id: text("id").primaryKey(),
  requestNo: text("request_no").notNull().unique(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull(),
  templateId: text("template_id").notNull(),
  templateName: text("template_name").notNull(),
  subjectName: text("subject_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status").notNull().default("queued"),
  statusMessage: text("status_message"),
  externalOrderNo: text("external_order_no"),
  externalOrderUrl: text("external_order_url"),
  paymentAmount: text("payment_amount"),
  paymentCurrency: text("payment_currency"),
  paymentNetwork: text("payment_network"),
  paymentAddress: text("payment_address"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
