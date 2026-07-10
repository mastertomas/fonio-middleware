-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
