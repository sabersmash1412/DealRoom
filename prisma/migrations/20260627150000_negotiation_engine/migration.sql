ALTER TABLE "Listing"
ADD COLUMN "returnPolicy" TEXT;

ALTER TABLE "Seller"
ADD COLUMN "agentConfig" JSONB;

ALTER TABLE "Negotiation"
ADD COLUMN "campaignId" TEXT,
ADD COLUMN "engineState" JSONB;

CREATE INDEX "Negotiation_campaignId_idx" ON "Negotiation"("campaignId");

CREATE TABLE "BuyerAgentProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT,
  "utilityWeights" JSONB NOT NULL,
  "reservationValue" JSONB NOT NULL,
  "strategy" TEXT NOT NULL,
  "guardrails" JSONB,
  "preferences" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyerAgentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerAgentProfile_userId_key" ON "BuyerAgentProfile"("userId");
