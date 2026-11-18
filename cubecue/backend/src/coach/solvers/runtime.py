"""Shared process admission and errors, with no solving algorithms."""

from threading import BoundedSemaphore

worker_slot = BoundedSemaphore(1)


class SolverError(Exception):
    def __init__(self, code: str, message: str, status: int = 503):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
