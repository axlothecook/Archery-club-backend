-- CreateTable
CREATE TABLE "ClientErrorReport" (
    "id" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientErrorReport_pkey" PRIMARY KEY ("id")
);
