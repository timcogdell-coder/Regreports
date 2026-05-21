"""
Run:  python debug_pdf.py "path/to/your.pdf"
Prints raw extracted text and table contents to help tune the parser.
"""
import sys, pdfplumber

path = sys.argv[1] if len(sys.argv) > 1 else input("PDF path: ").strip()

with pdfplumber.open(path) as pdf:
    all_text = "\n".join(p.extract_text() or "" for p in pdf.pages)

if not all_text.strip():
    print("No text layer — running OCR fallback...\n")
    import os, pytesseract
    from pdf2image import convert_from_path

    tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    poppler_path  = r"C:\poppler\poppler-24.08.0\Library\bin"

    if os.path.exists(tesseract_cmd):
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    images = convert_from_path(path, dpi=300, poppler_path=poppler_path)
    for i, img in enumerate(images, 1):
        text = pytesseract.image_to_string(img, config="--psm 6")
        print(f"\n{'='*60}\nPAGE {i} (OCR)\n{'='*60}")
        print(text[:4000])
else:
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            print(f"\n{'='*60}\nPAGE {i} (text)\n{'='*60}")
            print((page.extract_text() or "")[:3000])

            tables = page.extract_tables()
            for ti, table in enumerate(tables, 1):
                print(f"\n--- Table {ti} on page {i} ---")
                for row in table[:8]:
                    print(row)
