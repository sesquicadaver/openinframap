from funcs import table, str_col, type_col

table(
    "port",
    {
        "landuse": ["port", "harbour"],
        "harbour": ["yes", "ferry", "fishing", "cargo", "marina", "naval", "tanker"],
        "waterway": ["dock", "boatyard"],
    },
    ["points", "polygons"],
    columns=[str_col("name")],
)

table(
    "ferry_terminal",
    {"amenity": ["ferry_terminal"]},
    ["points", "polygons"],
    columns=[str_col("name")],
)

table(
    "pier",
    {"man_made": ["pier", "jetty", "breakwater", "groyne", "quay"]},
    ["linestrings", "polygons"],
    columns=[type_col],
)
