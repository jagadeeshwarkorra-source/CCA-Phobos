"""
Centralised structured logger for the CCA DRP Dashboard backend.

Usage in any module:
    from src.logger import get_logger
    logger = get_logger(__name__)
    logger.info("Data loaded", extra={"rows": 1000, "action": "get_overview"})
    logger.error("Processing failed", extra={"error": str(e)})

Rules:
  - Never use print() for diagnostic output — always use this logger.
  - Pass contextual data via extra={} for structured log ingestion.
  - Use appropriate levels: DEBUG (dev details), INFO (milestones),
    WARNING (recoverable), ERROR (exceptions/failures).
"""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class _JsonFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON for structured log ingestion.

    Inputs:  A logging.LogRecord, optionally with extra dict fields.
    Outputs: UTF-8 JSON string with timestamp, level, module, message,
             and any extra key/value pairs appended.
    """

    # Built-in LogRecord attributes that should not be re-emitted as extras
    _SKIP_KEYS = frozenset({
        "args", "asctime", "created", "exc_info", "exc_text", "filename",
        "funcName", "levelname", "levelno", "lineno", "message", "module",
        "msecs", "msg", "name", "pathname", "process", "processName",
        "relativeCreated", "stack_info", "taskName", "thread", "threadName",
    })

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level":     record.levelname,
            "module":    record.name,
            "message":   record.getMessage(),
        }

        # Append any extra fields the caller passed via extra={...}
        for key, value in record.__dict__.items():
            if key not in self._SKIP_KEYS:
                entry[key] = value

        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


def get_logger(name: str) -> logging.Logger:
    """
    Returns a named logger configured with the centralised JSON formatter.

    Args:
        name: Typically pass __name__ from the calling module so log lines
              show the correct module path (e.g. "src.agents.data_agent").

    Returns:
        A logging.Logger instance that writes structured JSON to stdout.
        Repeated calls with the same name return the same logger instance.
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(_JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        logger.propagate = False  # prevent double-logging via root logger

    return logger
