#!/usr/bin/env python3
"""Pick the last complete review JSON object and validate it.

Codex sometimes writes more than one JSON value, or trailing lines after the
object. json.load then fails with "Extra data". Job outputs are not used.
"""

import json
import sys

NEEDED = {"merge_recommendation", "risk_level", "security_concerns", "key_issues_to_review"}
ISSUE_KEYS = {"relevant_file", "issue_header", "issue_content"}
RECOMMENDATIONS = {"safe_to_merge", "merge_with_caution", "changes_required"}
RISKS = {"low", "medium", "high"}


class ReviewParseError(Exception):
    pass


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


def line_count(text):
    if text == "":
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def parse_failure(text, object_count, missing_field):
    """Metadata only. Never include any of the review text."""
    return (
        "审核结果无法解析，已省略原文。"
        f"字节数={len(text.encode('utf-8'))}，行数={line_count(text)}，"
        f"JSON 对象数={object_count}，缺少字段={missing_field}。"
    )


def parse_review(text):
    """Return the last complete object that has merge_recommendation."""
    body = text[1:] if text.startswith("\ufeff") else text
    object_count = 0
    chosen = None
    for value in iter_json_values(body):
        if not isinstance(value, dict):
            continue
        object_count += 1
        if "merge_recommendation" in value:
            chosen = value
    if chosen is None:
        raise ReviewParseError(parse_failure(text, object_count, "merge_recommendation"))
    return chosen


def validate_review(data):
    if not isinstance(data, dict) or set(data) != NEEDED:
        missing = sorted(NEEDED - set(data)) if isinstance(data, dict) else sorted(NEEDED)
        extra = len(set(data) - NEEDED) if isinstance(data, dict) else 0
        missing_text = ",".join(missing) if missing else "(无)"
        raise ReviewParseError(f"审核结果字段不合法。缺少字段={missing_text}，多余字段数={extra}。")
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
