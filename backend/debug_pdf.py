"""
Run:  python debug_pdf.py "path/to/your.pdf"
Prints raw extracted text and table contents to help tune the parser.
"""
import sys
import pdfplumber

path = sys.argv[1] if len(sys.argv) > 1 else input("PDF path: ").strip()

with pdfplumber.open(path) as pdf:
    all_text = "\n".join(p.extract_text() or "" for p in pdf.pages)

if not all_text.strip():
    print("No text layer — running OCR fallback...\n")
    import pytesseract
    from pdf2image import convert_from_path

    images = convert_from_path(path, dpi=300)
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
