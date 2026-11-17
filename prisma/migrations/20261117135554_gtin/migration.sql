/*
  Warnings:

  - You are about to drop the column `lastSerial` on the `Organization` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gtin,serialNumber]` on the table `Battery` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gtin]` on the table `BatteryModel` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `gtin` to the `Battery` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gtin` to the `BatteryModel` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Battery_modelId_serialNumber_key";

-- AlterTable
ALTER TABLE "Battery" ADD COLUMN     "gtin" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BatteryModel" ADD COLUMN     "gtin" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "lastSerial";

-- CreateIndex
CREATE UNIQUE INDEX "Battery_gtin_serialNumber_key" ON "Battery"("gtin", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryModel_gtin_key" ON "BatteryModel"("gtin");
