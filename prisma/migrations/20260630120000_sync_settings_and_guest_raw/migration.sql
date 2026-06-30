-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "guestPhone" TEXT,
ADD COLUMN "guestEmail" TEXT,
ADD COLUMN "guestName" TEXT;

-- CreateTable
CREATE TABLE "SyncSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "lastAutoSyncAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SyncSettings" ("id", "autoSyncEnabled", "intervalMinutes", "updatedAt")
VALUES ('default', true, 30, CURRENT_TIMESTAMP);
