-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validTo" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_deviceId_idx" ON "Booking"("deviceId");

-- CreateIndex
CREATE INDEX "Pin_deviceId_isActive_idx" ON "Pin"("deviceId", "isActive");

-- CreateIndex
CREATE INDEX "Pin_bookingId_idx" ON "Pin"("bookingId");

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
