-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('FABRICANTE', 'IMPORTADOR', 'CONCESIONARIO', 'TALLER', 'ENTIDAD_TECNICA', 'RECICLADOR', 'AUTORIDAD');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OPERADOR', 'CONCESIONARIO', 'TALLER', 'ENTIDAD_TECNICA', 'RECICLADOR', 'AUTORIDAD');

-- CreateEnum
CREATE TYPE "BatteryState" AS ENUM ('EN_USO', 'EN_SERVICIO', 'SEGUNDA_VIDA', 'BAJA_SOLICITADA', 'RECICLADA');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDIENTE', 'VALIDADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "cuit" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "operatorCode" TEXT,
    "lastSerial" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryModel" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chemistry" TEXT NOT NULL,
    "nominalCapacityKwh" DOUBLE PRECISION NOT NULL,
    "nominalVoltageV" DOUBLE PRECISION NOT NULL,
    "massKg" DOUBLE PRECISION NOT NULL,
    "dismantlingFileUrl" TEXT,
    "carbonFootprintKgCo2e" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Battery" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3) NOT NULL,
    "state" "BatteryState" NOT NULL,
    "operatorId" TEXT NOT NULL,
    "createdByOrgId" TEXT NOT NULL,
    "dealerOrgId" TEXT,
    "serviceOrgId" TEXT,
    "previousBatteryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Battery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "domain" TEXT,
    "vin" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryVehicleLink" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3),

    CONSTRAINT "BatteryVehicleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryEvent" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "organizationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,

    CONSTRAINT "BatteryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCertificate" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "sohPercent" DOUBLE PRECISION NOT NULL,
    "measuredCapacityKwh" DOUBLE PRECISION NOT NULL,
    "internalResistanceMOhm" DOUBLE PRECISION NOT NULL,
    "testMethod" TEXT NOT NULL,
    "reusable" BOOLEAN NOT NULL,
    "fileUrl" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDIENTE',
    "validatedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecyclerReceipt" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "recyclerId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedMassKg" DOUBLE PRECISION NOT NULL,
    "manifestNumber" TEXT NOT NULL,
    "fileUrl" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDIENTE',
    "validatedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecyclerReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "batteryId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "details" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_cuit_key" ON "Organization"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_operatorCode_key" ON "Organization"("operatorCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryModel_operatorId_name_key" ON "BatteryModel"("operatorId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Battery_passportId_key" ON "Battery"("passportId");

-- CreateIndex
CREATE UNIQUE INDEX "Battery_previousBatteryId_key" ON "Battery"("previousBatteryId");

-- CreateIndex
CREATE INDEX "Battery_state_idx" ON "Battery"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Battery_modelId_serialNumber_key" ON "Battery"("modelId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_domain_key" ON "Vehicle"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "BatteryVehicleLink_batteryId_idx" ON "BatteryVehicleLink"("batteryId");

-- CreateIndex
CREATE INDEX "BatteryVehicleLink_vehicleId_idx" ON "BatteryVehicleLink"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryEvent_hash_key" ON "BatteryEvent"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryEvent_batteryId_seq_key" ON "BatteryEvent"("batteryId", "seq");

-- CreateIndex
CREATE INDEX "HealthCertificate_batteryId_idx" ON "HealthCertificate"("batteryId");

-- CreateIndex
CREATE INDEX "HealthCertificate_status_idx" ON "HealthCertificate"("status");

-- CreateIndex
CREATE INDEX "RecyclerReceipt_batteryId_idx" ON "RecyclerReceipt"("batteryId");

-- CreateIndex
CREATE INDEX "RecyclerReceipt_status_idx" ON "RecyclerReceipt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_batteryId_idx" ON "AuditLog"("batteryId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryModel" ADD CONSTRAINT "BatteryModel_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BatteryModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_createdByOrgId_fkey" FOREIGN KEY ("createdByOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_dealerOrgId_fkey" FOREIGN KEY ("dealerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_serviceOrgId_fkey" FOREIGN KEY ("serviceOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battery" ADD CONSTRAINT "Battery_previousBatteryId_fkey" FOREIGN KEY ("previousBatteryId") REFERENCES "Battery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryVehicleLink" ADD CONSTRAINT "BatteryVehicleLink_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Battery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryVehicleLink" ADD CONSTRAINT "BatteryVehicleLink_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryEvent" ADD CONSTRAINT "BatteryEvent_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Battery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryEvent" ADD CONSTRAINT "BatteryEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryEvent" ADD CONSTRAINT "BatteryEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCertificate" ADD CONSTRAINT "HealthCertificate_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Battery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCertificate" ADD CONSTRAINT "HealthCertificate_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecyclerReceipt" ADD CONSTRAINT "RecyclerReceipt_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Battery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecyclerReceipt" ADD CONSTRAINT "RecyclerReceipt_recyclerId_fkey" FOREIGN KEY ("recyclerId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
