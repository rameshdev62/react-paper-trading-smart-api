-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiry" TEXT,
    "strike" TEXT,
    "lotsize" TEXT,
    "exchSeg" TEXT NOT NULL,
    "tickSize" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_token_key" ON "Instrument"("token");
