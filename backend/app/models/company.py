"""SQLAlchemy models for companies, financials, and filings."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    ticker: Mapped[str] = mapped_column(String(32))
    bse_code: Mapped[str] = mapped_column(String(16), default="")
    sector: Mapped[str] = mapped_column(String(128))
    latest_revenue: Mapped[float] = mapped_column(Float, default=0.0)
    revenue_growth_pct: Mapped[float] = mapped_column(Float, default=0.0)
    risk_flag: Mapped[str] = mapped_column(String(16), default="MEDIUM")
    data_source: Mapped[str] = mapped_column(String(16), default="seed")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    financials: Mapped[list["Financial"]] = relationship(back_populates="company")
    filings: Mapped[list["Filing"]] = relationship(back_populates="company")


class Financial(Base):
    __tablename__ = "financials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(String(64), ForeignKey("companies.id"))
    fiscal_year: Mapped[str] = mapped_column(String(16))
    revenue: Mapped[float] = mapped_column(Float, default=0.0)
    ebitda: Mapped[float] = mapped_column(Float, default=0.0)
    pat: Mapped[float] = mapped_column(Float, default=0.0)
    debt_to_equity: Mapped[float] = mapped_column(Float, default=0.0)

    company: Mapped["Company"] = relationship(back_populates="financials")


class Filing(Base):
    __tablename__ = "filings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[str] = mapped_column(String(64), ForeignKey("companies.id"))
    title: Mapped[str] = mapped_column(String(512))
    fiscal_year: Mapped[str] = mapped_column(String(16))
    pdf_path: Mapped[str] = mapped_column(Text, default="")
    pdf_hash: Mapped[str] = mapped_column(String(64), default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)

    company: Mapped["Company"] = relationship(back_populates="filings")
