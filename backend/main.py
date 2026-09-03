"""Capital Screener FastAPI application."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.companies import router
from app.core.config import settings
from app.db.seed import seed_if_empty

logging.basicConfig(
    level=logging.DEBUG if settings.APP_DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("capital-screener")


@asynccontextmanager
async def lifespan(app: FastAPI):
    result = seed_if_empty()
    logger.info("Startup seed result: %s", result)
    yield


app = FastAPI(
    title="Capital Screener API",
    description="Company screening, RAG Q&A, and investment memo generation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"message": "Capital Screener API", "docs": "/docs"}
