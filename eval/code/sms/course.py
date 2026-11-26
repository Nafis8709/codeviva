from dataclasses import dataclass

from app.domain.validation import failure_detail, field_error, is_positive_int, is_text
from app.errors import Conflict, ValidationFailed

MAX_CODE_LENGTH = 20
MAX_TITLE_LENGTH = 100
MAX_SEATS = 500


@dataclass
class Course:
    code: str
    title: str
    seats: int

    def check_can_enroll(self, enrolled_count, already_enrolled):
        """Business rules for enrolling one more student."""
        if already_enrolled:
            raise Conflict("Student is already enrolled in this course")
        if enrolled_count >= self.seats:
            raise Conflict("No seats left in this course")

    def check_seats_fit(self, enrolled_count):
        """Seats cannot be reduced below the number already enrolled."""
        if self.seats < enrolled_count:
            raise Conflict(f"Course already has {enrolled_count} enrolled students; seats cannot be lower")


def parse_course(data, code=None):
    """Build a Course from request data, or raise ValidationFailed.

    On create (POST) the code comes from the body.
    On replace (PUT) the code comes from the URL and is passed in as code.
    """
    errors = []

    if code is None:
        code = data.get("code")
        if not is_text(code, MAX_CODE_LENGTH) or not code.strip().isalnum():
            errors.append(field_error("/code", f"must be letters and digits only, at most {MAX_CODE_LENGTH} characters"))
    elif "code" in data and data["code"] != code:
        errors.append(field_error("/code", "must match the course code in the URL"))

    title = data.get("title")
    if not is_text(title, MAX_TITLE_LENGTH):
        errors.append(field_error("/title", f"must be a non-empty string of at most {MAX_TITLE_LENGTH} characters"))

    seats = data.get("seats")
    if not is_positive_int(seats) or seats > MAX_SEATS:
        errors.append(field_error("/seats", f"must be an integer from 1 to {MAX_SEATS}"))

    if errors:
        raise ValidationFailed(failure_detail(errors), errors)

    return Course(code.strip(), title.strip(), seats)
