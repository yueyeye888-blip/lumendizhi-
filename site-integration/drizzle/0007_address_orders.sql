CREATE TABLE `address_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`request_no` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`user_name` text NOT NULL,
	`template_id` text NOT NULL,
	`template_name` text NOT NULL,
	`subject_name` text NOT NULL,
	`recipient_email` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`status_message` text,
	`external_order_no` text,
	`external_order_url` text,
	`payment_amount` text,
	`payment_currency` text,
	`payment_network` text,
	`payment_address` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `address_orders_request_no_unique` ON `address_orders` (`request_no`);