-- AlterTable
ALTER TABLE "LogSettings" ADD COLUMN "debugAutoDelete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LogSettings" ADD COLUMN "operationalAutoDelete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LogSettings" ADD COLUMN "piiAutoDelete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LogSettings" ADD COLUMN "autoPurgeEnabled" BOOLEAN NOT NULL DEFAULT true;
