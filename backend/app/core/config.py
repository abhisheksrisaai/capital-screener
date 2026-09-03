"""Capital Screener application configuration."""

from pathlib import Path

from dotenv import load_dotenv
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", case_sensitive=True)

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    QDRANT_MODE: str = "local"
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_LOCAL_PATH: str = ""

    DATABASE_URL: str = "sqlite:///./data/screener.db"
    DATA_DIR: str = ""
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

    APP_DEBUG: bool = True
    APP_PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:5173"

    @property
    def project_root(self) -> Path:
        return Path(__file__).resolve().parent.parent.parent

    @property
    def repo_root(self) -> Path:
        if self.DATA_DIR:
            return Path(self.DATA_DIR).parent
        return self.project_root.parent

    @property
    def data_dir(self) -> Path:
        if self.DATA_DIR:
            path = Path(self.DATA_DIR)
        else:
            path = self.repo_root / "data"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def processed_dir(self) -> Path:
        path = self.data_dir / "processed"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def raw_dir(self) -> Path:
        path = self.data_dir / "raw"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def reports_dir(self) -> Path:
        path = self.project_root / "reports"
        path.mkdir(exist_ok=True)
        return path

    @property
    def has_groq(self) -> bool:
        return bool(self.GROQ_API_KEY) and "your_" not in self.GROQ_API_KEY


settings = Settings()
