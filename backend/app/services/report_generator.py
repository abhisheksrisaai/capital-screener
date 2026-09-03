"""Investment memo PDF generation."""

import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)

_WEASYPRINT_AVAILABLE: Optional[bool] = None


def _check_weasyprint() -> bool:
    global _WEASYPRINT_AVAILABLE
    if _WEASYPRINT_AVAILABLE is None:
        try:
            from weasyprint import HTML  # noqa: F401
            _WEASYPRINT_AVAILABLE = True
        except OSError:
            _WEASYPRINT_AVAILABLE = False
    return _WEASYPRINT_AVAILABLE


class MemoGenerator:
    def __init__(self) -> None:
        self._templates_dir = Path(__file__).resolve().parent.parent / "templates"
        self._env: Optional[Environment] = None

    @property
    def env(self) -> Environment:
        if self._env is None:
            self._env = Environment(
                loader=FileSystemLoader(str(self._templates_dir)),
                autoescape=select_autoescape(["html", "xml"]),
            )
        return self._env

    def generate_memo(self, context: Dict[str, Any]) -> bytes:
        context.setdefault("generated_at", datetime.now(timezone.utc).strftime("%B %d, %Y"))
        template = self.env.get_template("memo.html")
        html_content = template.render(**context)

        if _check_weasyprint():
            try:
                from weasyprint import HTML
                return HTML(string=html_content).write_pdf()
            except Exception as exc:
                logger.error("WeasyPrint failed: %s\n%s", exc, traceback.format_exc())

        return html_content.encode("utf-8")


memo_generator = MemoGenerator()
