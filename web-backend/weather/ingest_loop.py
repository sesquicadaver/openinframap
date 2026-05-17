"""
Runs the weather ingest job on startup, then every INGEST_INTERVAL_H hours.
Executed by the weather-ingest Docker service:
    uv run python -m weather.ingest_loop
"""

import asyncio
import logging
import os
from pathlib import Path

from .ingest import DEFAULT_CACHE_DIR, ingest_gfs, ingest_icon_eu

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

INTERVAL_H = int(os.environ.get("INGEST_INTERVAL_H", "3"))
SOURCE = os.environ.get("INGEST_SOURCE", "icon-eu")


async def run_once(cache_dir: Path) -> None:
    try:
        if SOURCE == "gfs":
            await ingest_gfs(cache_dir)
        else:
            try:
                await ingest_icon_eu(cache_dir)
            except Exception as exc:
                logger.warning("ICON-EU ingest failed (%s), trying GFS fallback", exc)
                await ingest_gfs(cache_dir)
    except Exception as exc:
        logger.error("Ingest failed: %s", exc)


async def main() -> None:
    cache_dir = DEFAULT_CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Weather ingest loop started (source=%s, interval=%dh)", SOURCE, INTERVAL_H)

    while True:
        await run_once(cache_dir)
        logger.info("Sleeping %d hours until next ingest", INTERVAL_H)
        await asyncio.sleep(INTERVAL_H * 3600)


if __name__ == "__main__":
    asyncio.run(main())
