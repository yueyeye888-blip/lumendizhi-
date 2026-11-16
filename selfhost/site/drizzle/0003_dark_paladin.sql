CREATE TABLE `resource_group_items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`package_code` text,
	`country` text,
	`supplier` text DEFAULT 'eSIMAccess' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resource_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`accent` text DEFAULT 'bg-[#5578b6]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
