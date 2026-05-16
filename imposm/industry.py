from funcs import table, type_col, str_col

table(
    "works",
    {"man_made": ["works"]},
    ["points", "polygons"],
    columns=[type_col, str_col("name")],
)

table(
    "industrial_zone",
    {"landuse": ["industrial", "quarry"]},
    "polygon",
    columns=[type_col, str_col("name")],
)
