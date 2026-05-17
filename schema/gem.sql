-- Global Energy Monitor (GEM) facilities table
-- Populated by imposm/gem_import.py from GEM CSV/Excel downloads
-- GEM trackers: https://globalenergymonitor.org/projects/

CREATE TABLE IF NOT EXISTS gem_facility (
    id             SERIAL PRIMARY KEY,
    gem_id         VARCHAR(100),                          -- GEM internal unit/project ID
    name           TEXT NOT NULL,
    tracker        VARCHAR(50) NOT NULL,                  -- which GEM tracker (see below)
    facility_type  VARCHAR(100),                          -- technology or sub-type within tracker
    capacity_mw    DECIMAL(12, 2),                        -- nameplate capacity in MW (NULL if not applicable)
    status         VARCHAR(50),                           -- operating | construction | planned | retired | cancelled | mothballed | shelved
    country        VARCHAR(100),
    geometry       GEOMETRY(Point, 3857) NOT NULL,        -- stored in Web Mercator for Tegola
    year_start     SMALLINT,                              -- commissioning year
    year_retire    SMALLINT,                              -- decommissioning / retirement year
    owner          TEXT,
    project_url    TEXT,
    last_updated   DATE DEFAULT CURRENT_DATE
);

-- Tracker values (matches GEM project slugs):
--   power        Global Integrated Power Tracker
--   coal         Global Coal Plant Tracker
--   oil          Global Oil Infrastructure Tracker
--   gas          Global Gas Infrastructure Tracker
--   oil_gas      Global Oil & Gas Plant Tracker
--   chemicals    Global Chemicals Inventory
--   nuclear      Global Nuclear Power Tracker
--   bioenergy    Global Bioenergy Power Tracker
--   hydro        Global Hydropower Tracker

CREATE INDEX IF NOT EXISTS gem_facility_geom_idx ON gem_facility USING GIST (geometry);
CREATE INDEX IF NOT EXISTS gem_facility_tracker_idx ON gem_facility (tracker);
CREATE INDEX IF NOT EXISTS gem_facility_status_idx ON gem_facility (status);
CREATE INDEX IF NOT EXISTS gem_facility_gem_id_idx ON gem_facility (gem_id);

ANALYZE gem_facility;
