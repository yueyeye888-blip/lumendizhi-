CREATE TABLE `resource_status_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier` text NOT NULL,
	`resource_id` text NOT NULL,
	`status` text DEFAULT 'normal' NOT NULL,
	`note` text,
	`recheck_at` text,
	`marked_by_user_id` text NOT NULL,
	`marked_by_email` text NOT NULL,
	`marked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE TABLE `warehouse_inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`supplier` text NOT NULL,
	`product_name` text NOT NULL,
	`category` text DEFAULT '数字账号' NOT NULL,
	`country` text,
	`unit_price` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`claimed_by_user_id` text,
	`claimed_by_email` text,
	`claimed_by_name` text,
	`recipient_email` text,
	`claimed_at` text,
	`email_status` text DEFAULT 'not_sent' NOT NULL,
	`email_provider_id` text,
	`email_error` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
