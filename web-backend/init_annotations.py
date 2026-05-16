"""
Run once to create the object_annotations table.
Usage:  python init_annotations.py
"""
import asyncio
from databases import Database
from starlette.config import Config

config = Config(".env")
DATABASE_URL = config("DATABASE_URL")


async def init():
    db = Database(DATABASE_URL)
    await db.connect()

    await db.execute(
        """CREATE TABLE IF NOT EXISTS object_annotations (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL DEFAULT '',
            geofence    GEOMETRY(GEOMETRY, 4326),
            label_point GEOMETRY(POINT, 4326),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"""
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS object_annotations_fence_gist"
        " ON object_annotations USING GIST(geofence) WHERE geofence IS NOT NULL"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS object_annotations_label_gist"
        " ON object_annotations USING GIST(label_point) WHERE label_point IS NOT NULL"
    )

    await db.disconnect()
    print("object_annotations table created.")


if __name__ == "__main__":
    asyncio.run(init())
