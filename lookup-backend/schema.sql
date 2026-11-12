-- LANDORA 授權房源索引；僅可匯入具合法使用依據的資料
CREATE TABLE IF NOT EXISTS listing_index (
 id TEXT PRIMARY KEY,
 listing_url TEXT NOT NULL UNIQUE,
 listing_type TEXT NOT NULL CHECK(listing_type IN ('house','land')),
 city TEXT NOT NULL, district TEXT NOT NULL, section TEXT,
 address TEXT, community TEXT, floor INTEGER, area_ping REAL,
 source_name TEXT NOT NULL, source_url TEXT NOT NULL,
 permission_basis TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0,
 observed_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS listing_parcels (
 listing_id TEXT NOT NULL REFERENCES listing_index(id) ON DELETE CASCADE,
 parcel_number TEXT NOT NULL,
 share_numerator INTEGER, share_denominator INTEGER,
 PRIMARY KEY(listing_id,parcel_number)
);
CREATE INDEX IF NOT EXISTS idx_house_location ON listing_index(listing_type,city,district,address);
CREATE INDEX IF NOT EXISTS idx_house_community ON listing_index(listing_type,city,district,community);
CREATE INDEX IF NOT EXISTS idx_land_location ON listing_index(listing_type,city,district,section);
CREATE INDEX IF NOT EXISTS idx_parcel_number ON listing_parcels(parcel_number,listing_id);
