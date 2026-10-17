ALTER TABLE "Assignment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'homework';
ALTER TABLE "Assignment" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Assignment" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "Assignment" ADD COLUMN "answerPolicy" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Assignment" ADD COLUMN "solutionsReleasedAt" DATETIME;
ALTER TABLE "Assignment" ADD COLUMN "disclosureLockedAt" DATETIME;
ALTER TABLE "Assignment" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "Assignment" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Assignment" ADD COLUMN "snapshotJson" JSONB;
ALTER TABLE "Assignment" ADD COLUMN "materialVersion" INTEGER;

CREATE TABLE "AssessmentAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "startRequestId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "draftAnswersJson" JSONB NOT NULL,
  "submittedAnswersJson" JSONB,
  "submittedAt" DATETIME,
  "completionKind" TEXT,
  "resultJson" JSONB,
  "reviewJson" JSONB,
  "reviewedAt" DATETIME,
  CONSTRAINT "AssessmentAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssessmentAttempt_assignmentId_studentId_number_key" ON "AssessmentAttempt"("assignmentId","studentId","number");
CREATE UNIQUE INDEX "AssessmentAttempt_assignmentId_studentId_startRequestId_key" ON "AssessmentAttempt"("assignmentId","studentId","startRequestId");
CREATE UNIQUE INDEX "AssessmentAttempt_one_active" ON "AssessmentAttempt"("assignmentId","studentId") WHERE "status"='in_progress';
CREATE INDEX "AssessmentAttempt_studentId_assignmentId_idx" ON "AssessmentAttempt"("studentId","assignmentId");

CREATE TABLE "AssessmentStartRequest" (
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("assignmentId","studentId","requestId"),
  CONSTRAINT "AssessmentStartRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentStartRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentStartRequest_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AssessmentStartRequest_attemptId_idx" ON "AssessmentStartRequest"("attemptId");
