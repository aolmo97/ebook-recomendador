-- CreateTable
CREATE TABLE "MangaSeries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "coverUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MangaChapter" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MangaChapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MangaChapter_seriesId_chapterId_key" ON "MangaChapter"("seriesId", "chapterId");

-- AddForeignKey
ALTER TABLE "MangaChapter" ADD CONSTRAINT "MangaChapter_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MangaSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
