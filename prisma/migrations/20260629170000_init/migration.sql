-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('LIVE', 'DRAFT', 'HIDDEN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AvailabilityMode" AS ENUM ('PARENT_ONLY', 'CHILDREN_ONLY', 'BOTH');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('ADD_GUEST', 'ADD_PET', 'CANCELLATION', 'MODIFICATION', 'EARLY_CHECKIN', 'LATE_CHECKOUT', 'RESERVATION_QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'AUTO_APPROVED', 'FORWARDED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('AUTO', 'MANUAL', 'DENY');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('VIEWER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'SECURITY');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingGroup" (
    "id" TEXT NOT NULL,
    "hostawayParentId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "availabilityMode" "AvailabilityMode" NOT NULL DEFAULT 'BOTH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "hostawayId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "personCapacity" INTEGER NOT NULL DEFAULT 1,
    "bedroomsNumber" INTEGER,
    "roomType" TEXT,
    "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "listingGroupId" TEXT,
    "parentHostawayId" INTEGER,
    "tags" TEXT[],
    "rawMetadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "minNights" INTEGER,
    "price" DOUBLE PRECISION,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "hostawayId" INTEGER NOT NULL,
    "listingId" TEXT NOT NULL,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "numberOfGuests" INTEGER NOT NULL,
    "adults" INTEGER,
    "children" INTEGER,
    "pets" INTEGER,
    "status" TEXT NOT NULL,
    "phoneHash" TEXT,
    "emailHash" TEXT,
    "guestNameMasked" TEXT,
    "hostawayConversationId" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredFields" TEXT[],
    "minMatchCount" INTEGER NOT NULL DEFAULT 2,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "requestType" "RequestType" NOT NULL,
    "mode" "ApprovalMode" NOT NULL DEFAULT 'MANUAL',
    "conditions" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestRequest" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "requestType" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "fonioCallId" TEXT,
    "callerPhoneHash" TEXT,
    "forwardedToHostaway" BOOLEAN NOT NULL DEFAULT false,
    "hostawayMessageId" INTEGER,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "ipHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostawayToken" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostawayToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ListingGroup_hostawayParentId_key" ON "ListingGroup"("hostawayParentId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_hostawayId_key" ON "Listing"("hostawayId");

-- CreateIndex
CREATE INDEX "Listing_city_idx" ON "Listing"("city");

-- CreateIndex
CREATE INDEX "Listing_status_isBookable_idx" ON "Listing"("status", "isBookable");

-- CreateIndex
CREATE INDEX "Listing_listingGroupId_idx" ON "Listing"("listingGroupId");

-- CreateIndex
CREATE INDEX "CalendarDay_date_isAvailable_idx" ON "CalendarDay"("date", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarDay_listingId_date_key" ON "CalendarDay"("listingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_hostawayId_key" ON "Reservation"("hostawayId");

-- CreateIndex
CREATE INDEX "Reservation_phoneHash_idx" ON "Reservation"("phoneHash");

-- CreateIndex
CREATE INDEX "Reservation_emailHash_idx" ON "Reservation"("emailHash");

-- CreateIndex
CREATE INDEX "Reservation_arrivalDate_departureDate_idx" ON "Reservation"("arrivalDate", "departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationConfig_name_key" ON "VerificationConfig"("name");

-- CreateIndex
CREATE INDEX "ApprovalRule_requestType_isActive_idx" ON "ApprovalRule"("requestType", "isActive");

-- CreateIndex
CREATE INDEX "ApprovalRule_listingId_idx" ON "ApprovalRule"("listingId");

-- CreateIndex
CREATE INDEX "GuestRequest_status_idx" ON "GuestRequest"("status");

-- CreateIndex
CREATE INDEX "GuestRequest_createdAt_idx" ON "GuestRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_expiresAt_idx" ON "ApiLog"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiLog_source_action_idx" ON "ApiLog"("source", "action");

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_listingGroupId_fkey" FOREIGN KEY ("listingGroupId") REFERENCES "ListingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestRequest" ADD CONSTRAINT "GuestRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
