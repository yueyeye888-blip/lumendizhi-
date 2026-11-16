CREATE TABLE `resource_group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_email` text NOT NULL,
	`can_purchase` integer DEFAULT true NOT NULL,
	`assigned_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
