from dataclasses import dataclass


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


@dataclass(frozen=True)
class Wind:
    u: float  # m/s  west → east
    v: float  # m/s  south → north


@dataclass
class TrajectoryConfig:
    duration_hours: int = 24
    step_minutes: int = 60
    strip_half_width_m: float = 10_000.0  # 10 km each side → 20 km total
    model: str = "iconEu"
    fallback_model: str = "gfs"
