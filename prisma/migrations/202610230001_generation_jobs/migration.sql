CREATE TABLE "GenerationJob" (
 "id" TEXT NOT NULL PRIMARY KEY, "ownerId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('test','notes')),
 "state" TEXT NOT NULL DEFAULT 'queued' CHECK ("state" IN ('queued','running','validating','completed','failed','cancelled')),
 "inputHash" TEXT NOT NULL, "inputJson" JSONB NOT NULL,
 "resultMaterialId" TEXT, "errorCode" TEXT, "attemptCount" INTEGER NOT NULL DEFAULT 0,
 "leaseToken" TEXT, "leaseUntil" DATETIME, "deadlineAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "GenerationJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "GenerationJob_resultMaterialId_fkey" FOREIGN KEY ("resultMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GenerationJob_ownerId_requestId_key" ON "GenerationJob"("ownerId","requestId");
CREATE UNIQUE INDEX "GenerationJob_one_active_per_owner" ON "GenerationJob"("ownerId") WHERE "state" IN ('queued','running','validating');
CREATE INDEX "GenerationJob_ownerId_createdAt_idx" ON "GenerationJob"("ownerId","createdAt");
CREATE INDEX "GenerationJob_state_createdAt_idx" ON "GenerationJob"("state","createdAt");
