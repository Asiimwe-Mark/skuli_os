"""Repair the broken useDocumentTitle imports inserted by the prior
migration run. The old script put `useDocumentTitle` into the
existing `from "react";` line, but the hook is exported from
`@/lib/hooks/useDocumentTitle`.

This script:
  1. Removes `, useDocumentTitle` (or `, useDocumentTitle}`) from the
     `from "react";` import in each file.
  2. Adds a new `import { useDocumentTitle } from
     "@/lib/hooks/useDocumentTitle";` line right after the
     `from "react";` import.
  3. Is idempotent: if the new import already exists, the file is
     left alone.
"""
import re
from pathlib import Path

REPO = Path(r"C:\Users\Asiimwe Mark Amooti\Desktop\skuli_os")

# Walk the same set of pages the migration touched.
PAGES = [
    "app/dashboard/analytics/page.tsx",
    "app/dashboard/attendance/page.tsx",
    "app/dashboard/fees/accounts/page.tsx",
    "app/dashboard/fees/defaulters/page.tsx",
    "app/dashboard/fees/page.tsx",
    "app/dashboard/fees/payments/page.tsx",
    "app/dashboard/page.tsx",
    "app/dashboard/settings/school/page.tsx",
    "app/dashboard/settings/users/page.tsx",
    "app/dashboard/staff/page.tsx",
    "app/dashboard/students/page.tsx",
]

HOOK_IMPORT_LINE_DQ = 'import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";'
HOOK_IMPORT_LINE_SQ = "import { useDocumentTitle } from '@/lib/hooks/useDocumentTitle';"

# Match the broken react import line. Captures: (1) the rest of the
# import (everything before `, useDocumentTitle`), (2) the quote
# character used. We allow optional whitespace after the comma.
BROKEN_REACT_RE = re.compile(
    r'^import \{([^}]*?),\s*useDocumentTitle\s*\}\s*from\s*(["\'])react\2\s*;\s*\n',
    re.MULTILINE,
)


def _hook_import_line(quote: str) -> str:
    return HOOK_IMPORT_LINE_SQ if quote == "'" else HOOK_IMPORT_LINE_DQ


def fix_file(rel_path: str) -> bool:
    p = REPO / rel_path
    if not p.exists():
        print(f"  X missing: {p}")
        return False
    text = p.read_text(encoding="utf-8")
    original = text

    quote = '"' if 'from "react"' in text else "'"

    # 1. If the correct hook import is already present, do nothing.
    hook_line = _hook_import_line(quote)
    if hook_line in text:
        print(f"  = already fixed: {p.relative_to(REPO)}")
        return False

    # 2. Strip `, useDocumentTitle` from the broken react import.
    def _strip(m: re.Match) -> str:
        before = m.group(1).rstrip()
        q = m.group(2)
        return f'import {{{before}}} from {q}react{q};\n'

    new_text, n = BROKEN_REACT_RE.subn(_strip, text, count=1)
    if n == 0:
        print(f"  X broken pattern not found: {p.relative_to(REPO)}")
        return False
    text = new_text

    # 3. Insert the new hook import line right after the
    #    `from "react";` import we just repaired.
    react_re = re.compile(
        r"^import \{[^}]*\} from " + re.escape(quote) + r"react" + re.escape(quote) + r";\n",
        re.MULTILINE,
    )
    text, m = react_re.subn(
        lambda mm: mm.group(0) + hook_line + "\n",
        text,
        count=1,
    )
    if m == 0:
        print(f"  X failed to insert hook import: {p.relative_to(REPO)}")
        return False

    if text == original:
        print(f"  = no change: {p.relative_to(REPO)}")
        return False
    p.write_text(text, encoding="utf-8")
    print(f"  + fixed: {p.relative_to(REPO)}")
    return True


def main():
    changed = 0
    for rel in PAGES:
        if fix_file(rel):
            changed += 1
    print(f"\nFixed {changed}/{len(PAGES)} files.")


if __name__ == "__main__":
    main()
