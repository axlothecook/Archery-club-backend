/*
  Warnings:

  - You are about to drop the column `isMinor` on the `Archer` table. All the data in the column will be lost.
  - You are about to drop the column `minorVisibleFields` on the `Archer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Archer" DROP COLUMN "isMinor",
DROP COLUMN "minorVisibleFields",
ADD COLUMN     "birthDate" TIMESTAMP(3);
