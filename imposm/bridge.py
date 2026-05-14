from funcs import table, str_col, type_col

table(
    "bridge",
    {
        "bridge": ["yes", "viaduct", "aqueduct", "suspension", "movable", "covered"],
        "man_made": ["bridge"],
    },
    "linestring",
    columns=[
        type_col,
        str_col("name"),
        str_col("highway"),
        str_col("railway"),
        str_col("waterway"),
    ],
)
