-- Archer: add a second, optional photo. cardPhoto* = the uniform team-grid
-- headshot (shoulders-up); profilePhoto* = the bigger image shown on the
-- individual /team/:slug profile page. Nullable: when absent the front-end
-- shows a placeholder.
ALTER TABLE "Archer" ADD COLUMN "profilePhotoUrl" TEXT;
ALTER TABLE "Archer" ADD COLUMN "profilePhotoAlt" TEXT;
