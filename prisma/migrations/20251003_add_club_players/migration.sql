-- CreateTable
CREATE TABLE "club_player" (
    "club_id" INTEGER NOT NULL,
    "person_id" INTEGER NOT NULL,
    "default_shirt_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "club_player_pkey" PRIMARY KEY ("club_id", "person_id"),
    CONSTRAINT "club_player_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "club"("club_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "club_player_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("person_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "club_player_club_id_default_shirt_number_key" ON "club_player"("club_id", "default_shirt_number") WHERE "default_shirt_number" IS NOT NULL;
