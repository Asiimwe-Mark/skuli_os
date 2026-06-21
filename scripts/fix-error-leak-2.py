"""Patch the second (and most common) error-leak pattern: a 3-line
catch tail that maps err -> (status, message) -> errorResponse.

This is the variant where routes use a local `status` and `message`
variable. After this pass, every `err.message` echo in the API tree
should be gone.
"""
import re
import sys
from pathlib import Path

ROOT = Path(r"C:\Users\Asiimwe Mark Amooti\Desktop\skulii-os\app\api")

# Match:
#   } catch (err: unknown) {
#     const status = getErrorStatus(err);
#     const message = err instanceof Error ? err.message : "Internal server error";
#     return errorResponse(message, status);
#   }
TAIL_RE = re.compile(
    r"\}\s*catch\s*\(err:\s*unknown\)\s*\{\s*"
    r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
    r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"Internal server error\";[ \t]*\n"
    r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
    r"\s*\}",
)

# Some catch blocks use `err` (no : unknown annotation).
TAIL_RE_2 = re.compile(
    r"\}\s*catch\s*\(err\)\s*\{\s*"
    r"const\s+status\s*=\s*getErrorStatus\(err\);[ \t]*\n"
    r"\s*const\s+message\s*=\s*err\s+instanceof\s+Error\s*\?\s*err\.message\s*:\s*\"Internal server error\";[ \t]*\n"
    r"\s*return\s+errorResponse\(message,\s*status\);[ \t]*\n"
    r"\s*\}",
)


def route_label(path: Path) -> str:
    rel = path.relative_to(ROOT)
    return "/".join(rel.parts).replace("\\", "/")


def patch_route(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    label = route_label(path)
    new_text, count = TAIL_RE.subn(
        "} catch (err: unknown) {\n    return handleRouteError(err, \""
        + label
        + "\");\n  }",
        text,
    )
    if count == 0:
        new_text, count = TAIL_RE_2.subn(
            "} catch (err) {\n    return handleRouteError(err, \""
            + label
            + "\");\n  }",
            text,
        )
    if count == 0:
        return False

    # Drop getErrorStatus import if no longer used.
    if "getErrorStatus(" not in new_text:
        new_text = re.sub(
            r"(\n\s*)getErrorStatus(,?)",
            "",
            new_text,
        )
        new_text = re.sub(
            r",(\s*\n\s*\})",
            r"\1",
            new_text,
        )
    if "errorResponse(" not in new_text:
        new_text = re.sub(
            r"(\n\s*)errorResponse(,?)",
            "",
            new_text,
        )
        new_text = re.sub(
            r",(\s*\n\s*\})",
            r"\1",
            new_text,
        )

    path.write_text(new_text, encoding="utf-8")
    return True


def main() -> int:
    patched = []
    for route in ROOT.rglob("route.ts"):
        if patch_route(route):
            patched.append(str(route.relative_to(ROOT)))
    print(f"Patched {len(patched)} additional routes:")
    for p in patched:
        print(f"  - {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())