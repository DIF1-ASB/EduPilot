"""Read-only acceptance gate over synthetic, already-rendered fixtures."""
import json
from pathlib import Path
import pdfplumber

root = Path(__file__).resolve().parents[3] / 'work/stage1-qa/answer-sheets'
expected = {'short': 12, 'variants': 12, 'long': 12, 'empty': 6, 'multipage': 108}
report = []
for name, count in expected.items():
    for mode in ('pdf', 'word'):
        source = root / (name + '.pdf') if mode == 'pdf' else root / (name + '-word-v2') / (name + '.pdf')
        with pdfplumber.open(source) as doc:
            texts = [p.extract_text() or '' for p in doc.pages]
            assert all(len(text.strip()) > 25 for text in texts), f'{name}/{mode}: blank or orphan-only page'
            # LibreOffice paints a single rule as two coincident edge segments.
            rules = {(i, round(line['y0'], 1)) for i, p in enumerate(doc.pages) for line in p.lines if abs(line['y0'] - line['y1']) < 1 and line['x1'] - line['x0'] > 400}
            assert len(rules) == count, f'{name}/{mode}: {len(rules)} lines, expected {count}'
            if name == 'short':
                assert '−' in texts[0], f'{name}/{mode}: mathematical minus lost'
            if name == 'long':
                assert 'Задание long' in texts[0], f'{name}/{mode}: header-only first page'
            for p in doc.pages:
                assert all(c['x0'] >= 35 and c['x1'] <= p.width - 35 and c['top'] >= 30 and c['bottom'] <= p.height - 30 for c in p.chars), f'{name}/{mode}: text outside margins'
            report.append({'fixture': name, 'mode': mode, 'pages': len(doc.pages), 'answerLines': len(rules)})
print(json.dumps(report, ensure_ascii=False))
