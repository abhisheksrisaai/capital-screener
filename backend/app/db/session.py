"""SQLAlchemy session and engine setup."""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


def _resolve_db_url() -> str:
    url = settings.DATABASE_URL
    if url.startswith("sqlite:///"):
        db_path = url.replace("sqlite:///", "", 1)
        if not db_path.startswith("/"):
            db_path = str(settings.project_root / db_path)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{db_path}"
    return url


engine = create_engine(_resolve_db_url(), connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
