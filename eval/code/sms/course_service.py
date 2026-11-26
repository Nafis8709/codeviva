import logging

from app.domain.course import parse_course
from app.domain.validation import field_error, is_positive_int
from app.errors import Conflict, NotFound, ValidationFailed

log = logging.getLogger(__name__)


class CourseService:
    """Course and enrollment use cases. Knows nothing about HTTP, JSON or status codes."""

    def __init__(self, course_repo, student_repo, enrollment_repo):
        self.course_repo = course_repo
        self.student_repo = student_repo
        self.enrollment_repo = enrollment_repo

    # ---------- Courses ----------

    def create_course(self, data):
        course = parse_course(data)
        if self.course_repo.get(course.code) is not None:
            raise Conflict(f"A course with code {course.code} already exists")

        self.course_repo.add(course)
        log.info("course created code=%s seats=%s", course.code, course.seats)
        return course

    def list_courses(self):
        return self.course_repo.list()

    def get_course(self, code):
        course = self.course_repo.get(code)
        if course is None:
            raise NotFound(f"No course with code {code}")
        return course

    def replace_course(self, code, data):
        self.get_course(code)  # 404 is checked before validation
        course = parse_course(data, code)
        course.check_seats_fit(self.enrollment_repo.count_for_course(code))

        self.course_repo.save(course)
        log.info("course updated code=%s seats=%s", code, course.seats)
        return course

    def delete_course(self, code):
        self.get_course(code)
        if self.enrollment_repo.count_for_course(code) > 0:
            raise Conflict("Course still has enrolled students; drop the enrollments first")

        self.course_repo.delete(code)
        log.info("course deleted code=%s", code)

    # ---------- Enrollments ----------

    def enroll(self, code, data):
        course = self.get_course(code)

        # The student ID is in the body, not the URL, so a missing student is
        # invalid content (422) rather than a missing target resource (404)
        student_id = data.get("studentId")
        if not is_positive_int(student_id):
            raise ValidationFailed("1 field is invalid.", [field_error("/studentId", "must be a positive integer")])
        student = self.student_repo.get(student_id)
        if student is None:
            raise ValidationFailed("1 field is invalid.", [field_error("/studentId", "no student has this ID")])

        already_enrolled = self.enrollment_repo.exists(code, student_id)
        enrolled_count = self.enrollment_repo.count_for_course(code)
        course.check_can_enroll(enrolled_count, already_enrolled)

        self.enrollment_repo.add(code, student_id)
        log.info("student enrolled course=%s student=%s seats_left=%s",
                 code, student_id, course.seats - enrolled_count - 1)
        return student

    def list_enrollments(self, code):
        self.get_course(code)
        return self.enrollment_repo.list_students(code)

    def get_enrollment(self, code, student_id):
        self.get_course(code)
        if not self.enrollment_repo.exists(code, student_id):
            raise NotFound(f"Student {student_id} is not enrolled in {code}")
        return self.student_repo.get(student_id)

    def drop(self, code, student_id):
        self.get_enrollment(code, student_id)

        self.enrollment_repo.delete(code, student_id)
        log.info("student dropped course=%s student=%s", code, student_id)
