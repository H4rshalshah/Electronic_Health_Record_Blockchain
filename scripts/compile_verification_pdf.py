import os
import re
import base64
import subprocess
import html
import urllib.parse
from markdown_it import MarkdownIt

# Input and output paths
workspace_dir = '/home/himanshu/Desktop/EHR_blockchain'
md_path = os.path.join(workspace_dir, 'CareGrid_Backend_and_Ledger_Verification.md')
html_path = '/tmp/caregrid_verification.html'
pdf_path = os.path.join(workspace_dir, 'CareGrid_Backend_and_Ledger_Verification.pdf')
desktop_pdf = '/home/himanshu/Desktop/CareGrid_Backend_and_Ledger_Verification.pdf'

print(f"Reading markdown from: {md_path}")
with open(md_path, 'r', encoding='utf-8') as f:
    md_content = f.read()

# Initialize Markdown parser with GFM features
md = MarkdownIt('gfm-like', {'html': True, 'linkify': True, 'typographer': True})
body_html = md.render(md_content)

# Professional CSS template
html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CareGrid - Backend & Ledger Verification Report - Himanshu (24MCF1R16)</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

@page {{
    size: A4;
    margin: 16mm 14mm 16mm 14mm;
}}

* {{
    box-sizing: border-box;
}}

body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 9.6pt;
    line-height: 1.5;
    color: #1e293b;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
}}

h1, h2, h3, h4, h5, h6 {{
    color: #0f172a;
    font-weight: 700;
    line-height: 1.25;
    margin-top: 1.3em;
    margin-bottom: 0.4em;
    page-break-after: avoid;
    break-after: avoid;
}}

h1 {{
    font-size: 16pt;
    border-bottom: 2.5px solid #2563eb;
    padding-bottom: 6px;
    margin-top: 0;
    color: #1e3a8a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}}

h2 {{
    font-size: 12.5pt;
    border-bottom: 1.5px solid #cbd5e1;
    padding-bottom: 4px;
    margin-top: 1.3em;
    color: #1e40af;
}}

h3 {{
    font-size: 10.5pt;
    color: #0369a1;
    margin-top: 1.1em;
}}

h4 {{
    font-size: 9.5pt;
    color: #334155;
    margin-top: 0.9em;
}}

p {{
    margin: 0.5em 0;
    text-align: justify;
}}

strong {{
    font-weight: 600;
    color: #0f172a;
}}

ul, ol {{
    margin: 0.4em 0;
    padding-left: 20px;
}}

li {{
    margin: 0.25em 0;
}}

/* Inline code: clean crisp bold monospaced */
code {{
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
    font-size: 8.8pt;
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
    padding: 1px 4px;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
}}

/* Code blocks: light slate background, high contrast dark text, blue left border */
pre {{
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
    font-size: 8pt;
    line-height: 1.42;
    background-color: #f8fafc !important;
    color: #0f172a !important;
    padding: 9px 12px;
    border-radius: 5px;
    border: 1px solid #cbd5e1;
    border-left: 4px solid #2563eb;
    margin: 0.6em 0;
    page-break-inside: avoid;
    break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-all;
}}

pre code {{
    font-family: inherit !important;
    font-size: inherit !important;
    background-color: transparent !important;
    color: inherit !important;
    padding: 0 !important;
    border: none !important;
    font-weight: 500 !important;
}}

/* Tables: allow page breaking across rows but never split a row */
table {{
    width: 100%;
    border-collapse: collapse;
    margin: 0.8em 0;
    font-size: 8.5pt;
    page-break-inside: auto;
    break-inside: auto;
}}

thead {{
    display: table-header-group;
}}

tr {{
    page-break-inside: avoid;
    break-inside: avoid;
}}

th, td {{
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    text-align: left;
    vertical-align: top;
}}

th {{
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
    border-bottom: 2px solid #94a3b8;
}}

tr:nth-child(even) {{
    background-color: #f8fafc;
}}

blockquote {{
    margin: 0.8em 0;
    padding: 6px 14px;
    border-left: 3.5px solid #0284c7;
    background-color: #f0f9ff;
    color: #0369a1;
    border-radius: 0 4px 4px 0;
    font-size: 9pt;
}}

hr {{
    border: none;
    border-top: 1px solid #cbd5e1;
    margin: 1.2em 0;
}}

.report-footer {{
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt;
    color: #64748b;
    text-align: center;
}}

@media print {{
    body {{
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }}
    
    h1, h2, h3, h4 {{
        page-break-after: avoid;
        break-after: avoid;
    }}
    
    pre {{
        page-break-inside: avoid;
        break-inside: avoid;
    }}
}}
</style>
</head>
<body>
{body_html}
<div class="report-footer">
    CareGrid Consortium Healthcare Blockchain Verification Report — Verified by Himanshu (24MCF1R16), MCA 3rd Year, NIT Warangal
</div>
</body>
</html>"""

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_template)
print(f"HTML rendered to: {html_path} ({os.path.getsize(html_path)} bytes)")

# Convert HTML to PDF using Chrome Headless with --no-pdf-header-footer
chrome_cmd = [
    '/usr/bin/google-chrome',
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--disable-dev-shm-usage',
    f'--print-to-pdf={pdf_path}',
    html_path
]

print("Executing Google Chrome headless PDF generation...")
result = subprocess.run(chrome_cmd, capture_output=True, text=True)
if result.returncode != 0:
    print(f"Chrome error: {result.stderr}")
else:
    print(f"PDF generated successfully at: {pdf_path}")
    print(f"File size: {os.path.getsize(pdf_path):,} bytes")

    # Create Desktop copy
    try:
        import shutil
        shutil.copy2(pdf_path, desktop_pdf)
        print(f"Copied to Desktop: {desktop_pdf}")
        ehr_folder = '/home/himanshu/Desktop/24MCF1R16_Himanshu_EHR'
        if os.path.isdir(ehr_folder):
            shutil.copy2(pdf_path, os.path.join(ehr_folder, 'CareGrid_Backend_and_Ledger_Verification.pdf'))
            shutil.copy2(pdf_path, os.path.join(ehr_folder, 'ledger&backendcommands.pdf'))
            print(f"Copied to {ehr_folder}")
    except Exception as e:
        print(f"Desktop copy notice: {e}")

# Clean up temporary HTML
try:
    os.remove(html_path)
    print("Cleaned up temporary HTML file.")
except Exception:
    pass
