from funcs import table, str_col, type_col

table(
    "airport",
    {
        "aeroway": ["aerodrome", "heliport"],
        "military": ["airfield"],
    },
    ["points", "polygons"],
    columns=[
        type_col,
        str_col("name"),
        str_col("iata"),
        str_col("icao"),
        str_col("military"),
    ],
)

table(
    "runway",
    {"aeroway": ["runway", "taxiway", "stopway", "holding_position"]},
    "linestring",
    columns=[type_col, str_col("ref")],
)

table(
    "aeroway_area",
    {"aeroway": ["terminal", "hangar", "apron", "helipad", "gate"]},
    "polygon",
    columns=[type_col, str_col("name"), str_col("ref")],
)

table(
    "helipad",
    {"aeroway": ["helipad"]},
    ["points", "polygons"],
    columns=[str_col("name")],
)
