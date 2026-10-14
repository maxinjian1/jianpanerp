-- CreateTable
CREATE TABLE "public"."LlmRequestLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "dataClass" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT false,
    "maskedFields" JSONB,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmRequestLog_tenantId_createdAt_idx" ON "public"."LlmRequestLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmRequestLog_provider_createdAt_idx" ON "public"."LlmRequestLog"("provider", "createdAt");
