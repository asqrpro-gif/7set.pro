-- CreateTable
CREATE TABLE `DiagnosticReport` (
    `id` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `teaser_text` TEXT NOT NULL,
    `full_analysis_markdown` LONGTEXT NOT NULL,
    `sto_protection_tips` TEXT NOT NULL,
    `is_paid` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
