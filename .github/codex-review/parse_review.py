#!/usr/bin/env python3
"""Pick the last complete review JSON object and validate it.

Codex sometimes writes more than one JSON value, or trailing lines after the
object. json.load then fails with "Extra data". Job outputs are not used.
"""

import json
import re
import sys

NEEDED = {"merge_recommendation", "risk_level", "security_concerns", "key_issues_to_review"}
ISSUE_KEYS = {"relevant_file", "issue_header", "issue_content"}
RECOMMENDATIONS = {"safe_to_merge", "merge_with_caution", "changes_required"}
RISKS = {"low", "medium", "high"}


class ReviewParseError(Exception):
    pass


_JSON_SECRET_KEYS = (
    r"token|password|secret|access_token|refresh_token|api_key|id_token|authorization|credential"
)


def safe_excerpt(text, limit=180):
    """Short single-line excerpt. Credential values are removed before truncation."""
    text = text.replace("\x00", "")
    text = re.sub(
        r"(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
        "<redacted>",
        text,
    )
    # Quoted JSON credential fields: replace the whole value, including spaces.
    text = re.sub(
        rf'(?i)"({_JSON_SECRET_KEYS})"\s*:\s*"(?:\\.|[^"\\])*"',
        r'"\1":"<redacted>"',
        text,
    )
    text = re.sub(
        rf"(?i)'({_JSON_SECRET_KEYS})'\s*:\s*'(?:\\.|[^'\\])*'",
        r"'\1':'<redacted>'",
        text,
    )
    # Authorization: Bearer <entire token>, including the token after Bearer.
    text = re.sub(
        r"(?i)\bauthorization\s*[:=]\s*bearer\s+\S+",
        "authorization: Bearer <redacted>",
        text,
    )
    text = re.sub(r"(?i)\bbearer\s+\S+", "Bearer <redacted>", text)
    text = re.sub(
        r"(?i)\b(authorization|api[_-]?key|token|secret|password|credential|CODEX_AUTH_JSON)"
        r"\s*[:=]\s*(?:bearer\s+)?\S+",
        r"\1=<redacted>",
        text,
    )
    # JWT-looking strings (header.payload.signature, or a long eyJ… blob).
    text = re.sub(
        r"\beyJ[A-Za-z0-9_\-]{8,}={0,2}(?:\.[A-Za-z0-9_\-]+={0,2}){0,2}",
        "<redacted>",
        text,
    )
    text = re.sub(
        r"(?i)\b(sk|ghp|gho|ghu|ghs|github_pat|xox[baprs])[A-Za-z0-9_\-\.]{8,}",
        "<redacted>",
        text,
    )
    text = re.sub(r"[A-Za-z0-9+/]{40,}={0,2}", "<redacted>", text)
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return text or "(空)"


def iter_json_values(text):
    decoder = json.JSONDecoder()
    idx = 0
    length = len(text)
    while idx < length:
        start = text.find("{", idx)
        if start < 0:
            return
        try:
            value, end = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            idx = start + 1
            continue
        yield value
        idx = max(end, start + 1)


def parse_review(text):
    """Return the last complete object that has merge_recommendation."""
    if text.startswith("\ufeff"):
        text = text[1:]
    chosen = None
    for value in iter_json_values(text):
        if isinstance(value, dict) and "merge_recommendation" in value:
            chosen = value
    if chosen is None:
        raise ReviewParseError(
            "审核结果里没有找到带 merge_recommendation 的完整 JSON 对象"
            "（输出里可能有多段 JSON 或尾部杂讯）。摘录：" + safe_excerpt(text)
        )
    return chosen


def validate_review(data):
    if not isinstance(data, dict) or set(data) != NEEDED:
        raise ReviewParseError("审核结果字段不合法")
    if data["merge_recommendation"] not in RECOMMENDATIONS:
        raise ReviewParseError("审核建议不合法")
    if data["risk_level"] not in RISKS or not isinstance(data["security_concerns"], str):
        raise ReviewParseError("审核风险或安全字段不合法")
    issues = data["key_issues_to_review"]
    if not isinstance(issues, list) or len(issues) > 3 or any(
        not isinstance(issue, dict) or set(issue) != ISSUE_KEYS or any(not isinstance(value, str) for value in issue.values())
        for issue in issues
    ):
        raise ReviewParseError("审核问题字段不合法")
    return data


def main():
    if len(sys.argv) != 2:
        raise SystemExit("用法：parse_review.py <review-file>")
    try:
        raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
    except OSError:
        raise SystemExit("无法读取审核结果文件")
    try:
        data = validate_review(parse_review(raw))
    except ReviewParseError as exc:
        raise SystemExit(str(exc))
    json.dump(data, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
