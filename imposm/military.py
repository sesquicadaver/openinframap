from funcs import table, type_col, str_col

table(
    "military",
    {
        "military": [
            "base",
            "barracks",
            "bunker",
            "depot",
            "range",
            "training_area",
            "naval_base",
            "checkpoint",
            "ammunition",
            "installation",
        ],
        "landuse": ["military"],
    },
    ["points", "polygons"],
    columns=[type_col, str_col("name")],
)
