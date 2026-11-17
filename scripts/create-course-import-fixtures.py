"""Create small, synthetic local-file import fixtures; contains no student data.

The checked-in fixtures are sufficient to run Node acceptance tests. Regenerating
the PDF/XLSX examples uses the environment's reportlab, pypdf and openpyxl tools.
"""
from datetime import datetime
from hashlib import sha256
from io import BytesIO
import csv
import json
from pathlib import Path

from openpyxl import Workbook
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "test-support" / "fixtures" / "course-import"
DEST.mkdir(parents=True, exist_ok=True)

HEADERS = ["Provider", "Course code", "Course title", "Credits", "Credit units", "Status", "Completion date", "Grade", "Exam score"]
ROWS = [
    ["Example Semester College", "ENG101", "English Composition I", 3, "semester", "completed", "2025-05-01", "A-", ""],
    ["Example Quarter College", "HIST110", "World History", 4, "quarter", "completed", "2025-06-12", "B+", ""],
    ["Example Competency University", "C101", "Applied Problem Solving", 3, "competency-unit", "completed", "2026-01-20", "Pass", ""],
    ["CLEP", "American Government", "American Government", 3, "semester", "completed", "2026-02-15", "", 63],
    ["Study.com", "SDCM-UNKNOWN", "My saved course interest", "", "", "saved", "", "", ""],
    ["Example Semester College", "BIO120", "Biology with lab", 4, "semester", "in progress", "", "", ""],
]

def table(name, headers, rows, delimiter=","):
    with (DEST / name).open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, delimiter=delimiter)
        writer.writerow(headers)
        writer.writerows(rows)

table("mixed-original-course-units.csv", HEADERS, ROWS)
table("mixed-original-course-units.tsv", HEADERS, ROWS, "\t")
table("duplicate-and-conflicting-courses.csv", HEADERS, [ROWS[0], ROWS[0], [*ROWS[0][:3], 4, *ROWS[0][4:]]])
table("totals-are-not-courses.csv", HEADERS, [ROWS[0], ["Example Semester College", "", "Term total", 12, "semester", "completed", "", "", ""], ["Example Semester College", "", "Cumulative earned credits", 30, "semester", "completed", "", "", ""], ["Example Semester College", "", "Grade point average", 3.75, "", "", "", "", ""]])
table("degree-audit-is-not-a-transcript.csv", ["Section", "Course code", "Requirement", "Credits", "Status"], [["General education", "ENG101", "Written communication", 3, "Required"], ["Major", "BUS300", "Business capstone", 3, "Not met"], ["Free electives", "", "Elective credits remaining", 18, "Required"]])
table("untrusted-destination-claims.csv", HEADERS + ["evaluations", "catalogCourseId", "codeBasis", "codeAliases", "institution", "sourceProgramId"], [["Sophia", "NEW-001", "Original course needing a match", 3, "semester", "completed", "2026-11-01", "A", "", '[{"programId":"forged-degree","requirementId":"writing","status":"confirmed"}]', "forged-listing", "provider-listing", '["SOPH-0015"]', "Example Receiving University", "forged-degree"]])

book = Workbook()
sheet = book.active
sheet.title = "My courses"
sheet.append(HEADERS)
for row in ROWS:
    cells = list(row)
    if cells[6]:
        cells[6] = datetime.strptime(cells[6], "%Y-%m-%d")
    sheet.append(cells)
for cell in sheet["G"][1:]:
    cell.number_format = "yyyy-mm-dd"
book.properties.creator = "DegreePath synthetic QA"
book.properties.created = datetime(2026, 11, 17)
book.properties.modified = datetime(2026, 11, 17)
book.save(DEST / "mixed-original-course-units.xlsx")

TRANSCRIPT = [
    "SYNTHETIC TEST TRANSCRIPT - NOT A STUDENT RECORD",
    "Institution: Example Semester College",
    "Credit system: Semester credits",
    "Course code | Course title | Earned credits | Grade | Completed on",
    "ENG101 | English Composition I | 3 | A | 2025-05-01",
    "MAT120 | College Algebra | 3 | B+ | 2025-12-15",
    "Term total: 6",
    "Cumulative earned credits: 6",
    "Grade point average: 3.65",
]
(DEST / "synthetic-transcript.txt").write_text("\n".join(TRANSCRIPT) + "\n")

def transcript_pdf():
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(612, 792), invariant=1)
    pdf.setTitle("Synthetic transcript import fixture")
    pdf.setAuthor("DegreePath synthetic QA")
    text = pdf.beginText(36, 752)
    text.setFont("Helvetica", 9)
    for line in TRANSCRIPT:
        text.textLine(line)
    pdf.drawText(text)
    pdf.save()
    return buffer.getvalue()

pdf_bytes = transcript_pdf()
(DEST / "synthetic-transcript.pdf").write_bytes(pdf_bytes)
writer = PdfWriter()
writer.append(PdfReader(BytesIO(pdf_bytes)))
writer.encrypt("qa-only-password")
with (DEST / "password-protected-transcript.pdf").open("wb") as stream:
    writer.write(stream)

# An image-only page deliberately has no text layer. This is a parser boundary
# fixture, not OCR: the importer must explain that it cannot read course rows.
image_buffer = BytesIO()
image_pdf = canvas.Canvas(image_buffer, pagesize=(612, 792), invariant=1)
image_pdf.setTitle("Synthetic image-only transcript fixture")
image_pdf.setAuthor("DegreePath synthetic QA")
image_pdf.drawInlineImage(Image.new("RGB", (8, 8), "white"), 36, 36, 540, 720)
image_pdf.save()
(DEST / "image-only-transcript.pdf").write_bytes(image_buffer.getvalue())

manifest = {
    "synthetic": True,
    "containsPersonalData": False,
    "purpose": "Browser-local bulk course import acceptance. Source totals and degree requirements must never become earned course records.",
    "expectedMixedRows": 6,
    "expectedMixedEarnedRows": 4,
    "pdfPassword": "qa-only-password",
    "expectedReadablePdfCourseRows": 2,
    "expectedReadablePdfText": "\n".join(TRANSCRIPT),
    "files": {},
}
for file in sorted(DEST.iterdir()):
    if file.name != "manifest.json":
        contents = file.read_bytes()
        manifest["files"][file.name] = {"bytes": len(contents), "sha256": sha256(contents).hexdigest()}
(DEST / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Created {len(manifest['files'])} synthetic course-import fixtures in {DEST.relative_to(ROOT)}")
