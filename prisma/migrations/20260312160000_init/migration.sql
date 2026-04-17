-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('DOT', 'WEATHER', 'TOURISM', 'MANUAL');

-- CreateEnum
CREATE TYPE "CameraCategory" AS ENUM ('TRAFFIC', 'WEATHER', 'AVIATION', 'BEACH', 'TOURISM', 'DOWNTOWN', 'MOUNTAIN', 'PARK', 'HARBOR', 'SKI', 'OTHER');

-- CreateEnum
CREATE TYPE "StreamType" AS ENUM ('HLS', 'MJPEG', 'JPEG', 'IFRAME', 'YOUTUBE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CameraStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'RUNNING');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('SYSTEM', 'ADMIN', 'USER', 'ANONYMOUS');

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "CameraCategory" NOT NULL,
    "description" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "stateCode" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "pageUrl" TEXT,
    "providerUrl" TEXT,
    "status" "CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "raw" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraStream" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "type" "StreamType" NOT NULL DEFAULT 'UNKNOWN',
    "url" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "isEmbeddable" BOOLEAN NOT NULL DEFAULT false,
    "status" "CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CameraStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraImage" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CameraImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "baseUrl" TEXT,
    "attribution" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncCron" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedCount" INTEGER NOT NULL DEFAULT 0,
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "errors" JSONB,
    "raw" JSONB,

    CONSTRAINT "SourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraCheck" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetUrl" TEXT,
    "httpStatus" INTEGER,
    "contentType" TEXT,
    "responseMs" INTEGER,
    "success" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "uptimePercent" DOUBLE PRECISION,

    CONSTRAINT "CameraCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraTag" (
    "cameraId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "CameraTag_pkey" PRIMARY KEY ("cameraId","tagId")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "embedUrl" TEXT,
    "imageUrl" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "stateCode" TEXT,
    "city" TEXT,
    "category" "CameraCategory" NOT NULL,
    "notes" TEXT,
    "contactEmail" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "moderationNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "anonId" TEXT,
    "userId" TEXT,
    "cameraId" TEXT,
    "regionId" TEXT,
    "savedSearch" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "stateCode" TEXT NOT NULL,
    "city" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bounds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraAlias" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_slug_key" ON "Camera"("slug");

-- CreateIndex
CREATE INDEX "Camera_sourceId_idx" ON "Camera"("sourceId");

-- CreateIndex
CREATE INDEX "Camera_sourceType_category_idx" ON "Camera"("sourceType", "category");

-- CreateIndex
CREATE INDEX "Camera_stateCode_city_idx" ON "Camera"("stateCode", "city");

-- CreateIndex
CREATE INDEX "Camera_latitude_longitude_idx" ON "Camera"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Camera_status_isEnabled_idx" ON "Camera"("status", "isEnabled");

-- CreateIndex
CREATE INDEX "Camera_lastCheckedAt_idx" ON "Camera"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CameraStream_cameraId_url_key" ON "CameraStream"("cameraId", "url");

-- CreateIndex
CREATE INDEX "CameraStream_type_idx" ON "CameraStream"("type");

-- CreateIndex
CREATE INDEX "CameraStream_status_idx" ON "CameraStream"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CameraImage_cameraId_url_key" ON "CameraImage"("cameraId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Source_key_key" ON "Source"("key");

-- CreateIndex
CREATE INDEX "Source_type_status_idx" ON "Source"("type", "status");

-- CreateIndex
CREATE INDEX "SourceRun_sourceId_startedAt_idx" ON "SourceRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "SourceRun_status_idx" ON "SourceRun"("status");

-- CreateIndex
CREATE INDEX "CameraCheck_cameraId_checkedAt_idx" ON "CameraCheck"("cameraId", "checkedAt");

-- CreateIndex
CREATE INDEX "CameraCheck_success_idx" ON "CameraCheck"("success");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "CameraTag_tagId_idx" ON "CameraTag"("tagId");

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_anonId_idx" ON "Favorite"("anonId");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE INDEX "Favorite_cameraId_idx" ON "Favorite"("cameraId");

-- CreateIndex
CREATE UNIQUE INDEX "Region_slug_key" ON "Region"("slug");

-- CreateIndex
CREATE INDEX "Region_stateCode_city_idx" ON "Region"("stateCode", "city");

-- CreateIndex
CREATE UNIQUE INDEX "CameraAlias_cameraId_normalizedAlias_key" ON "CameraAlias"("cameraId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "CameraAlias_normalizedAlias_idx" ON "CameraAlias"("normalizedAlias");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraStream" ADD CONSTRAINT "CameraStream_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraImage" ADD CONSTRAINT "CameraImage_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRun" ADD CONSTRAINT "SourceRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraCheck" ADD CONSTRAINT "CameraCheck_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraTag" ADD CONSTRAINT "CameraTag_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraTag" ADD CONSTRAINT "CameraTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraAlias" ADD CONSTRAINT "CameraAlias_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
