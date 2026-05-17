#!/usr/bin/env python3
"""
GEM (Global Energy Monitor) data import script.

Downloads or reads GEM tracker CSV/Excel files and inserts them into
the gem_facility PostGIS table (see schema/gem.sql).

Usage:
    python gem_import.py --db "$DB_URI" --tracker coal --file GCPT_2024.csv
    python gem_import.py --db "$DB_URI" --tracker nuclear --file GNPT_2024.xlsx

Supported trackers and expected CSV column sets are defined in TRACKER_CONFIGS below.
All GEM data files can be downloaded from: https://globalenergymonitor.org/projects/

Environment:
    DB_URI  PostgreSQL connection string (fallback if --db not specified)
"""

import argparse
import os
import sys
import psycopg2
from psycopg2.extras import execute_batch
import csv
import openpyxl
from typing import Optional


# ---------------------------------------------------------------------------
# Column mapping config for each GEM tracker.
# Keys are canonical field names; values are lists of possible CSV header names
# (case-insensitive, tried in order).
# ---------------------------------------------------------------------------
TRACKER_CONFIGS: dict[str, dict[str, list[str]]] = {
    "coal": {
        "gem_id":         ["Unit ID", "unit_id", "GEM Unit ID"],
        "name":           ["Unit name", "Plant name", "Name"],
        "facility_type":  ["Technology", "Combustion technology", "Coal type"],
        "capacity_mw":    ["Capacity (MW)", "Capacity (MWe)", "capacity_mw"],
        "status":         ["Status", "Plant status"],
        "country":        ["Country", "country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Year", "Start year", "COD", "year_operating"],
        "year_retire":    ["Retired year", "Retirement year", "year_retired"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL", "Wiki page", "GEM URL"],
    },
    "nuclear": {
        "gem_id":         ["Unit ID", "GEM Unit ID"],
        "name":           ["Unit name", "Plant name", "Name"],
        "facility_type":  ["Reactor type", "Technology", "Type"],
        "capacity_mw":    ["Capacity (MW)", "Capacity (MWe)", "capacity_mw", "Gross capacity (MWe)"],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Commercial operation date", "Year", "COD", "Start year"],
        "year_retire":    ["Retirement year", "Permanent shutdown"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL", "Wiki page"],
    },
    "hydro": {
        "gem_id":         ["Project ID", "GEM Project ID", "Unit ID"],
        "name":           ["Project name", "Name", "Dam name"],
        "facility_type":  ["Type", "Generation type", "Technology"],
        "capacity_mw":    ["Capacity (MW)", "Installed capacity (MW)"],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Year", "Start year", "COD"],
        "year_retire":    ["Retired year"],
        "owner":          ["Owner", "Developer", "Operator"],
        "project_url":    ["URL", "Wiki page"],
    },
    "gas": {
        "gem_id":         ["Project ID", "GEM Project ID", "Unit ID"],
        "name":           ["Project name", "Name", "Facility name"],
        "facility_type":  ["Type", "Technology", "Plant type"],
        "capacity_mw":    ["Capacity (MW)", "Power capacity (MW)"],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Start year", "Year", "COD"],
        "year_retire":    ["Retired year", "Closure year"],
        "owner":          ["Owner", "Operator", "Developer"],
        "project_url":    ["URL", "Wiki page"],
    },
    "oil": {
        "gem_id":         ["Project ID", "GEM Project ID"],
        "name":           ["Project name", "Name", "Facility name"],
        "facility_type":  ["Type", "Infrastructure type"],
        "capacity_mw":    [],  # oil infrastructure uses throughput, not MW
        "status":         ["Status"],
        "country":        ["Country", "Countries"],
        "lat":            ["Latitude", "lat", "Start latitude"],
        "lon":            ["Longitude", "lon", "Start longitude"],
        "year_start":     ["Start year", "Year"],
        "year_retire":    ["Retired year"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL", "Wiki page"],
    },
    "oil_gas": {
        "gem_id":         ["Unit ID", "GEM Unit ID"],
        "name":           ["Unit name", "Plant name", "Name"],
        "facility_type":  ["Technology", "Plant type", "Type"],
        "capacity_mw":    ["Capacity (MW)"],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Start year", "Year"],
        "year_retire":    ["Retired year"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL"],
    },
    "chemicals": {
        "gem_id":         ["Project ID", "Facility ID"],
        "name":           ["Project name", "Facility name", "Name"],
        "facility_type":  ["Type", "Chemical type", "Product"],
        "capacity_mw":    [],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Start year", "Year"],
        "year_retire":    ["Retired year"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL"],
    },
    "bioenergy": {
        "gem_id":         ["Unit ID", "Plant ID"],
        "name":           ["Unit name", "Plant name", "Name"],
        "facility_type":  ["Technology", "Feedstock", "Type"],
        "capacity_mw":    ["Capacity (MW)", "Electrical capacity (MW)"],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Start year", "Year", "COD"],
        "year_retire":    ["Retired year"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL", "Wiki page"],
    },
    "power": {
        "gem_id":         ["Unit ID", "GEM Unit ID"],
        "name":           ["Unit name", "Plant name", "Name"],
        "facility_type":  ["Technology", "Fuel", "Type"],
        "capacity_mw":    ["Capacity (MW)", "Installed capacity (MW)"],
        "status":         ["Status"],
        "country":        ["Country"],
        "lat":            ["Latitude", "lat"],
        "lon":            ["Longitude", "lon"],
        "year_start":     ["Start year", "Year", "COD"],
        "year_retire":    ["Retired year", "Retirement year"],
        "owner":          ["Owner", "Operator"],
        "project_url":    ["URL", "Wiki page"],
    },
}


def find_column(row: dict, candidates: list[str]) -> Optional[str]:
    """Case-insensitive column lookup from a list of candidate names."""
    row_lower = {k.lower(): v for k, v in row.items()}
    for c in candidates:
        val = row_lower.get(c.lower())
        if val is not None:
            return str(val).strip() or None
    return None


def parse_year(val: Optional[str]) -> Optional[int]:
    if not val:
        return None
    try:
        y = int(str(val)[:4])
        return y if 1800 < y < 2200 else None
    except (ValueError, TypeError):
        return None


def parse_float(val: Optional[str]) -> Optional[float]:
    if not val:
        return None
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def read_csv(path: str) -> list[dict]:
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        return list(reader)


def read_excel(path: str) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        return []
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(rows[0])]
    return [dict(zip(headers, row)) for row in rows[1:]]


def import_tracker(conn, tracker: str, rows: list[dict], replace: bool) -> int:
    config = TRACKER_CONFIGS[tracker]
    records = []

    for row in rows:
        lat_s = find_column(row, config.get("lat", []))
        lon_s = find_column(row, config.get("lon", []))
        name  = find_column(row, config.get("name", []))

        if not lat_s or not lon_s or not name:
            continue

        lat = parse_float(lat_s)
        lon = parse_float(lon_s)
        if lat is None or lon is None:
            continue
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            continue

        records.append((
            find_column(row, config.get("gem_id", [])),
            name,
            tracker,
            find_column(row, config.get("facility_type", [])),
            parse_float(find_column(row, config.get("capacity_mw", []))),
            find_column(row, config.get("status", [])),
            find_column(row, config.get("country", [])),
            lat, lon,
            parse_year(find_column(row, config.get("year_start", []))),
            parse_year(find_column(row, config.get("year_retire", []))),
            find_column(row, config.get("owner", [])),
            find_column(row, config.get("project_url", [])),
        ))

    if not records:
        return 0

    with conn.cursor() as cur:
        if replace:
            cur.execute("DELETE FROM gem_facility WHERE tracker = %s", (tracker,))

        execute_batch(cur, """
            INSERT INTO gem_facility
                (gem_id, name, tracker, facility_type, capacity_mw, status, country,
                 geometry, year_start, year_retire, owner, project_url)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s,
                 ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 3857),
                 %s, %s, %s, %s)
        """, records, page_size=500)

    conn.commit()
    return len(records)


def main():
    parser = argparse.ArgumentParser(description="Import GEM tracker data into PostGIS")
    parser.add_argument("--db",      default=os.environ.get("DB_URI"), help="PostgreSQL URI")
    parser.add_argument("--tracker", required=True, choices=list(TRACKER_CONFIGS),
                        help="GEM tracker name")
    parser.add_argument("--file",    required=True, help="Path to GEM CSV or Excel file")
    parser.add_argument("--replace", action="store_true",
                        help="Delete existing rows for this tracker before import")
    args = parser.parse_args()

    if not args.db:
        print("ERROR: --db or DB_URI environment variable required", file=sys.stderr)
        sys.exit(1)

    path = args.file
    if path.lower().endswith((".xlsx", ".xls")):
        rows = read_excel(path)
    else:
        rows = read_csv(path)

    print(f"Read {len(rows)} rows from {path}")

    conn = psycopg2.connect(args.db)
    try:
        n = import_tracker(conn, args.tracker, rows, args.replace)
        print(f"Imported {n} facilities (tracker={args.tracker})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
