-- CreateTable
CREATE TABLE "IsinCache" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "sourcePdfUrl" TEXT NOT NULL,
    "asOfDate" TEXT,
    "weightsJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "parseVersion" INTEGER NOT NULL DEFAULT 1,
    "sha256Pdf" TEXT,

    CONSTRAINT "IsinCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchLog" (
    "id" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "attemptAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "httpStatus" INTEGER,
    "sourceUrl" TEXT,

    CONSTRAINT "FetchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IsinCache_isin_key" ON "IsinCache"("isin");
