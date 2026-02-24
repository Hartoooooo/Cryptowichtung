-- CreateTable
CREATE TABLE "IsinCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT NOT NULL,
    "sourcePdfUrl" TEXT NOT NULL,
    "asOfDate" TEXT,
    "weightsJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "parseVersion" INTEGER NOT NULL DEFAULT 1,
    "sha256Pdf" TEXT
);

-- CreateTable
CREATE TABLE "FetchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isin" TEXT NOT NULL,
    "attemptAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "httpStatus" INTEGER,
    "sourceUrl" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "IsinCache_isin_key" ON "IsinCache"("isin");
