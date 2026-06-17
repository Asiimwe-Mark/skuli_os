"""Deterministic migration: replace the boilerplate
   useEffect(() => { document.title = "X | SKULI"; }, []);
   with useDocumentTitle("X") across all pages.
   Audit 3.6 — done in a script, not 11 manual edits."""
import os
import re
from pathlib import Path

REPO = Path(r"C:\Users\Asiimwe Mark Amooti\Desktop\skuli_os")

PAGES = [
    ("app/dashboard/analytics/page.tsx", "Analytics"),
    ("app/dashboard/attendance/page.tsx", "Attendance"),
    ("app/dashboard/fees/accounts/page.tsx", "Fee Accounts"),
    ("app/dashboard/fees/defaulters/page.tsx", "Defaulters"),
    ("app/dashboard/fees/page.tsx", "Fees"),
    ("app/dashboard/fees/payments/page.tsx", "Record Payment"),
    ("app/dashboard/page.tsx", "Overview"),
    ("app/dashboard/settings/school/page.tsx", "School Settings"),
    ("app/dashboard/settings/users/page.tsx", "Users & Roles"),
    ("app/dashboard/staff/page.tsx", "Staff"),
    ("app/dashboard/students/page.tsx", "Students"),
]

HOOK_IMPORT_LINE = 'import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";'

# Find an existing import from "react" so we can add our hook import
# right after it. If there are multiple useXxx imports, append to the
# same line. Most files have `import { ... } from "react";` as a
# single line.
REACT_IMPORT_RE = re.compile(
    r'^import \{([^}]+)\} from ["\']react["\'];', re.MULTILINE
)

def migrate_file(rel_path: str, title: str) -> bool:
    p = REPO / rel_path
    if not p.exists():
        print(f"  X missing: {p}")
        return False
    text = p.read_text(encoding="utf-8")
    original = text

    # 1. Replace the useEffect boilerplate with the hook call.
    old_eff = f'useEffect(() => {{ document.title = "{title} | SKULI"; }}, []);'
    new_eff = f'useDocumentTitle("{title}");'
    if old_eff not in text:
        print(f"  X pattern not found in {rel_path}")
        return False
    text = text.replace(old_eff, new_eff)

    # 2. Add the import. The hook lives in
    #    @/lib/hooks/useDocumentTitle, not in "react". Always add
    #    a fresh import line just before the first non-import line.
    if HOOK_IMPORT_LINE in text:
        return _write(p, text, original)
    # Find the position to insert: after the last import line at
    # the top of the file. We use a simple scan for lines starting
    # with "import ".
    lines = text.splitlines(keepends=True)
    last_import_idx = -1
    for i, line in enumerate(lines):
        if line.startswith("import ") or line.startswith("import\t"):
            last_import_idx = i
        elif line.strip() and not line.startswith("import "):
            break
    if last_import_idx >= 0:
        lines.insert(last_import_idx + 1, HOOK_IMPORT_LINE + "\n")
        text = "".join(lines)
    else:
        # No imports at all — add at the top
        text = HOOK_IMPORT_LINE + "\n" + text

    return _write(p, text, original)


def _write(p: Path, text: str, original: str) -> bool:
    if text == original:
        print(f"  = no change: {p}")
        return False
    p.write_text(text, encoding="utf-8")
    print(f"  + migrated: {p.relative_to(REPO)}")
    return True


def main():
    changed = 0
    for path, title in PAGES:
        if migrate_file(path, title):
            changed += 1
    print(f"\nMigrated {changed}/{len(PAGES)} files.")


if __name__ == "__main__":
    main()
