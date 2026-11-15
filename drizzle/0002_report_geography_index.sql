-- Hand-written: drizzle-kit can't express this expression index.
-- Duplicate candidates in metres: `ST_DWithin(location::geography, point, 50)` uses it.
-- Queries must repeat `visibility = 'visible'` for the partial index to apply.
CREATE INDEX "reports_location_geog_gist" ON "reports" USING gist (("location"::geography)) WHERE "visibility" = 'visible';
