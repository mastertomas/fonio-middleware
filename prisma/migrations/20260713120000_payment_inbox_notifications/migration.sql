-- Track which Hostaway guest charges already triggered an inbox payment note.
ALTER TABLE "Reservation" ADD COLUMN "paymentBaselinedAt" TIMESTAMP(3);

CREATE TABLE "NotifiedGuestCharge" (
    "id" TEXT NOT NULL,
    "hostawayChargeId" INTEGER NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "inboxPosted" BOOLEAN NOT NULL DEFAULT false,
    "hostawayMessageId" INTEGER,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotifiedGuestCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotifiedGuestCharge_hostawayChargeId_key" ON "NotifiedGuestCharge"("hostawayChargeId");
CREATE INDEX "NotifiedGuestCharge_reservationId_idx" ON "NotifiedGuestCharge"("reservationId");

ALTER TABLE "NotifiedGuestCharge" ADD CONSTRAINT "NotifiedGuestCharge_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
