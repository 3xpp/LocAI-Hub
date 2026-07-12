"""Shared domain validation errors without HTTP or persistence coupling."""


class InputValidationError(ValueError):
    """Describe one field-oriented validation failure."""

    field: str
    message: str

    def __init__(self, field: str, message: str) -> None:
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")
