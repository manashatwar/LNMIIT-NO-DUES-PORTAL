"""
Advisory OCR service — Design.md § OCR Pipeline.

Extracts text from an uploaded file and flags name/roll mismatches as WARNINGS
only. Never raises for a mismatch, never auto-rejects. Degrades gracefully if
Tesseract / Pillow are not installed (returns empty text + no warnings).
"""
import re


import os

# Common Windows install locations for the Tesseract engine (so PATH isn't required).
_WINDOWS_TESSERACT_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
]


def _configure_tesseract(pytesseract):
    """Point pytesseract at the engine if it's installed at a known Windows path."""
    for path in _WINDOWS_TESSERACT_PATHS:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            return


def _try_extract_text(file_path):
    """Return extracted text, or '' if OCR libraries/engine are unavailable/failing."""
    try:
        from PIL import Image  # type: ignore
        import pytesseract      # type: ignore
    except Exception:
        return ""
    _configure_tesseract(pytesseract)
    try:
        if file_path.lower().endswith(".pdf"):
            # PDF OCR would need pdf2image/poppler; skip gracefully.
            return ""
        img = Image.open(file_path).convert("L")  # grayscale
        return pytesseract.image_to_string(img)
    except Exception:
        return ""


def extract_and_match(file_path, student):
    """
    Returns (text, fields, warnings).
    `fields` holds any parsed roll/name; `warnings` lists advisory mismatches.
    """
    text = _try_extract_text(file_path)
    fields = {}
    warnings = []

    if not text:
        return text, fields, warnings

    # Parse an LNMIIT-style roll (e.g. 24UCC174) if present
    roll_match = re.search(r"\b\d{2}[A-Z]{3}\d{3}\b", text)
    if roll_match:
        fields["roll_no"] = roll_match.group(0)
        if student.roll_no and fields["roll_no"] != student.roll_no:
            warnings.append(
                f"OCR roll '{fields['roll_no']}' does not match record '{student.roll_no}'"
            )

    # Advisory name check
    if student.name and student.name.lower() not in text.lower():
        warnings.append(f"Student name '{student.name}' not found in document text")

    return text, fields, warnings
