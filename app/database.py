"""SQLAlchemy engine, session factory and database dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core import get_settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""


settings = get_settings()
_engine_options = {"pool_pre_ping": True}
if settings.database_url.startswith("sqlite"):
    _engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(settings.database_url, **_engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and always close it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
