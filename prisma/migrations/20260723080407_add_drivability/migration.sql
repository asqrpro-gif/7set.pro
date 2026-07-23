-- AlterTable
ALTER TABLE `diagnosticreport` ADD COLUMN `diy_difficulty` VARCHAR(191) NULL,
    ADD COLUMN `diy_difficulty_score` VARCHAR(191) NULL,
    ADD COLUMN `diy_difficulty_text` VARCHAR(191) NULL,
    ADD COLUMN `diy_instructions` LONGTEXT NULL,
    ADD COLUMN `diy_possible` BOOLEAN NULL,
    ADD COLUMN `diy_time` VARCHAR(191) NULL,
    ADD COLUMN `diy_tools` TEXT NULL,
    ADD COLUMN `drivability` VARCHAR(191) NULL,
    ADD COLUMN `free_diagnosis` TEXT NULL,
    ADD COLUMN `price_labor` VARCHAR(191) NULL,
    ADD COLUMN `price_parts` VARCHAR(191) NULL,
    ADD COLUMN `schema_faq` TEXT NULL,
    ADD COLUMN `userId` VARCHAR(191) NULL,
    ADD COLUMN `verdict` TEXT NULL;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NULL,
    `role` VARCHAR(191) NULL DEFAULT 'user',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DiagnosticReport` ADD CONSTRAINT `DiagnosticReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
