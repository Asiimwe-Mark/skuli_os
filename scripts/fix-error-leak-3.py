"""Aggressive error-leak patcher.

Most of the remaining routes use a tail that puts `status` and `message`
on the same line as `return errorResponse(...)`. Replace the entire
`catch (err)` block with `return handleRouteError(err, route);`. Keep
imports tidy afterwards.
"""
import re
import sys
from pathlib import Path

ROOT = Path(r"C:\Users\Asiimwe Mark Amooti\Desktop\skulii-os\app\api")

# Variants we want to replace. Each is a `} catch (err...) {` block.
VARIANTS = [
    re.compile(
        r"\}\s*catch\s*\(err:\s*unknown\)\s*\{\s*"
        r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"Internal server error\";[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}",
        re.MULTILINE,
    ),
    re.compile(
        r"\}\s*catch\s*\(err\)\s*\{\s*"
        r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"Internal server error\";[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}",
        re.MULTILINE,
    ),
    re.compile(
        r"\}\s*catch\s*\(err:\s*unknown\)\s*\{\s*"
        r"const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"Internal server error\";[ \t]*\n"
        r"\s*const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}",
        re.MULTILINE,
    ),
    re.compile(
        r"\}\s*catch\s*\(err\)\s*\{\s*"
        r"const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"Internal server error\";[ \t]*\n"
        r"\s*const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}",
        re.MULTILINE,
    ),
    # some routes use a custom default message
    re.compile(
        r"\}\s*catch\s*\(err\)\s*\{\s*"
        r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"[^\"]+\";[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}",
        re.MULTILINE,
    ),
    re.compile(
        r"\}\s*catch\s*\(err:\s*unknown\)\s*\{\s*"
        r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"[^\"]+\";[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}",
        re.MULTILINE,
    ),
    # some routes use a one-liner return with consts above
    re.compile(
        r"\}\s*catch\s*\(err\)\s*\{\s*"
        r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
        r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"[^\"]+\";[ \t]*\n"
        r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
        r"\s*\}\s*\n",
        re.MULTILINE,
    ),
]


def route_label(path: Path) -> str:
    rel = path.relative_to(ROOT)
    return "/".join(rel.parts).replace("\\", "/")


def patch_route(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    label = route_label(path)
    patched_text = text
    for variant in VARIANTS:
        patched_text, _ = variant.subn(
            f"}} catch (err: unknown) {{\n    return handleRouteError(err, \"{label}\");\n  }}",
            patched_text,
        )
    if patched_text == text:
        return False

    # Tidy imports
    if "getErrorStatus(" not in patched_text:
        patched_text = re.sub(
            r"[ \t]*getErrorStatus,?\s*\n",
            "\n",
            patched_text,
        )
        patched_text = re.sub(
            r"\n\s*\}\s*from\s*\"@/lib/api-helpers\"",
            "\n} from \"@/lib/api-helpers\"",
            patched_text,
        )
    if "errorResponse(" not in patched_text:
        patched_text = re.sub(
            r"[ \t]*errorResponse,?\s*\n",
            "\n",
            patched_text,
        )
    # If we removed all named imports, leave an empty list alone.
    patched_text = re.sub(
        r"import\s*\{\s*,(\s*\})",
        r"import {\1",
        patched_text,
    )
    path.write_text(patched_text, encoding="utf-8")
    return True


def main() -> int:
    patched = []
    for route in ROOT.rglob("route.ts"):
        if patch_route(route):
            patched.append(str(route.relative_to(ROOT)))
    print(f"Patched {len(patched)} routes:")
    for p in patched:
        print(f"  - {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())