from funcs import table, generalized_table, type_col, str_col, bool_col, int_col

table(
    "railway_line",
    {
        "railway": [
            "rail", "narrow_gauge", "light_rail", "subway", "tram",
            "monorail", "funicular", "miniature",
        ],
        "construction:railway": [
            "rail", "narrow_gauge", "light_rail", "subway", "tram",
        ],
        "disused:railway": [
            "rail", "narrow_gauge", "light_rail", "subway", "tram",
        ],
    },
    "linestring",
    columns=[
        type_col,
        str_col("usage"),
        str_col("service"),
        str_col("electrified"),
        str_col("voltage"),
        str_col("gauge"),
        str_col("maxspeed"),
        int_col("tracks"),
        bool_col("tunnel"),
        bool_col("bridge"),
        str_col("construction:railway", "construction"),
        str_col("disused:railway", "disused"),
    ],
)

generalized_table(
    "railway_line_gen_100",
    "railway_line",
    tolerance=100,
    sql_filter="type IN ('rail', 'narrow_gauge', 'light_rail') AND (usage IS NULL OR usage IN ('main', 'branch', 'industrial'))",
)

generalized_table(
    "railway_line_gen_500",
    "railway_line_gen_100",
    tolerance=500,
    sql_filter="usage = 'main' OR usage IS NULL",
)

table(
    "railway_station",
    {
        "railway": ["station", "halt", "tram_stop"],
        "public_transport": ["station", "stop_position"],
    },
    ["points", "polygons"],
    columns=[
        type_col,
        str_col("name"),
    ],
)

table(
    "railway_facility",
    {
        "railway": ["yard", "depot", "roundhouse", "turntable", "wash"],
    },
    ["points", "polygons"],
    columns=[
        type_col,
        str_col("name"),
    ],
)
