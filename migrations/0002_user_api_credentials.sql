CREATE TABLE "user_api_credentials" (
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('gemini', 'groq', 'mistral')),
  "encrypted_key" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "selected" INTEGER NOT NULL DEFAULT 0 CHECK ("selected" IN (0, 1)),
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("user_id", "provider")
);

CREATE INDEX "user_api_credentials_selected_idx"
  ON "user_api_credentials" ("user_id", "selected");
