-- Archer.cardPhoto* becomes nullable. An archer may have no card photo (e.g. the
-- vsk.hr-only draft stubs); the front-end shows a default stock image when null,
-- the WA-style "no photo" placeholder. Mirrors profilePhoto* (already nullable).
ALTER TABLE "Archer" ALTER COLUMN "cardPhotoUrl" DROP NOT NULL;
ALTER TABLE "Archer" ALTER COLUMN "cardPhotoAlt" DROP NOT NULL;
