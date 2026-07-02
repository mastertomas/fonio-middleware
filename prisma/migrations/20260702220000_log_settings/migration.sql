-- CreateTable
CREATE TABLE "LogSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "debugRetentionDays" INTEGER NOT NULL DEFAULT 14,
    "operationalRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "piiRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "maxRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogSettings_pkey" PRIMARY KEY ("id")
);
