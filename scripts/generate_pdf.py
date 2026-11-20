import os
import re
import base64
import subprocess
import html
import urllib.parse
from markdown_it import MarkdownIt

# Input and output paths
workspace_dir = '/home/himanshu/Desktop/EHR_blockchain'
md_path = os.path.join(workspace_dir, 'Contribution_report_Himanshu(24MCF1R16).md')
html_path = '/tmp/contribution_report.html'
pdf_path = os.path.join(workspace_dir, 'Contribution_report_Himanshu(24MCF1R16).pdf')
desktop_pdf = '/home/himanshu/Desktop/Contribution_report_Himanshu(24MCF1R16).pdf'

print(f"Reading markdown from: {md_path}")
with open(md_path, 'r', encoding='utf-8') as f:
    md_content = f.read()

# Initialize Markdown parser with GFM features
md = MarkdownIt('gfm-like', {'html': True, 'linkify': True, 'typographer': True})
body_html = md.render(md_content)

# Convert all image sources to base64 data URIs
def embed_images(match):
    full_tag = match.group(0)
    src = match.group(1)
    clean_src = html.unescape(urllib.parse.unquote(src))
    
    if clean_src.startswith('http://') or clean_src.startswith('https://') or clean_src.startswith('data:'):
        return full_tag
        
    abs_img_path = os.path.join(workspace_dir, clean_src)
    if os.path.exists(abs_img_path):
        ext = os.path.splitext(abs_img_path)[1].lower().replace('.', '')
        if ext == 'jpg':
            ext = 'jpeg'
        with open(abs_img_path, 'rb') as img_f:
            b64_data = base64.b64encode(img_f.read()).decode('ascii')
        return full_tag.replace(src, f"data:image/{ext};base64,{b64_data}")
    else:
        print(f"Warning: image not found: {abs_img_path}")
        return full_tag

body_html = re.sub(r'<img\s+[^>]*src="([^"]+)"[^>]*>', embed_images, body_html)

# Professional CSS template
html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Individual Contribution Report - Himanshu (24MCF1R16)</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

@page {{
    size: A4;
    margin: 18mm 16mm 20mm 16mm;
    @bottom-center {{
        content: counter(page);
    }}
}}

* {{
    box-sizing: border-box;
}}

body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.6;
    color: #1f2328;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
}}

h1, h2, h3, h4, h5, h6 {{
    color: #0f172a;
    font-weight: 700;
    line-height: 1.3;
    margin-top: 1.4em;
    margin-bottom: 0.5em;
    page-break-after: avoid;
    break-after: avoid;
}}

h1 {{
    font-size: 20pt;
    border-bottom: 2px solid #2563eb;
    padding-bottom: 8px;
    margin-top: 0;
    color: #1e3a8a;
}}

h2 {{
    font-size: 14pt;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 5px;
    margin-top: 1.6em;
    color: #1e40af;
}}

h3 {{
    font-size: 12pt;
    color: #334155;
    margin-top: 1.3em;
}}

h4 {{
    font-size: 11pt;
    color: #475569;
    margin-top: 1.1em;
}}

p {{
    margin: 0.6em 0;
    text-align: justify;
}}

strong {{
    font-weight: 600;
    color: #0f172a;
}}

ul, ol {{
    margin: 0.5em 0;
    padding-left: 24px;
}}

li {{
    margin: 0.3em 0;
}}

/* Inline code: seamless bold with text */
code {{
    font-family: inherit;
    font-size: inherit;
    background-color: transparent !important;
    color: #0f172a !important;
    font-weight: 600;
    padding: 0 !important;
    border: none !important;
    border-radius: 0 !important;
}}

/* Code blocks: clean, high-contrast, professional light background */
pre {{
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 8.5pt;
    line-height: 1.5;
    background-color: #f8fafc;
    color: #0f172a;
    padding: 10px 14px;
    border-radius: 6px;
    overflow-x: auto;
    border: 1px solid #cbd5e1;
    border-left: 3.5px solid #2563eb;
    margin: 0.8em 0;
    page-break-inside: avoid;
    break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-all;
}}

pre code {{
    font-family: inherit !important;
    font-size: inherit !important;
    background-color: transparent !important;
    color: #0f172a !important;
    padding: 0 !important;
    border: none !important;
    font-weight: 500 !important;
}}

table {{
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 9pt;
    page-break-inside: avoid;
    break-inside: avoid;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}}

th, td {{
    padding: 7px 10px;
    border: 1px solid #cbd5e1;
    text-align: left;
}}

th {{
    background-color: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
}}

tr:nth-child(even) {{
    background-color: #f8fafc;
}}

img {{
    max-width: 98%;
    height: auto;
    display: block;
    margin: 12px auto;
    border-radius: 6px;
    border: 1px solid #cbd5e1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    page-break-inside: avoid;
    break-inside: avoid;
}}

blockquote {{
    margin: 1em 0;
    padding: 8px 16px;
    border-left: 4px solid #3b82f6;
    background-color: #eff6ff;
    color: #1e40af;
    border-radius: 0 4px 4px 0;
}}

hr {{
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 1.5em 0;
}}

a {{
    color: #2563eb;
    text-decoration: underline;
    word-break: break-all;
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
    
    pre, table, img {{
        page-break-inside: avoid;
        break-inside: avoid;
    }}
}}
</style>
</head>
<body>
{body_html}
</body>
</html>"""

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_template)
print(f"HTML rendered to: {html_path} ({os.path.getsize(html_path)} bytes)")

# Convert HTML to PDF using Chrome Headless
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
            shutil.copy2(pdf_path, os.path.join(ehr_folder, os.path.basename(pdf_path)))
            print(f"Copied to {ehr_folder}")
    except Exception as e:
        print(f"Desktop copy notice: {e}")

# Clean up temporary HTML
try:
    os.remove(html_path)
    print("Cleaned up temporary HTML file.")
except Exception:
    pass
