import csv
from datetime import datetime
from pathlib import Path


DATA_PATTERNS = ("round_*.txt", "csab_*.txt")
DEFAULT_QUOTAS = ["AI", "All India", "Other State"]
DEFAULT_SEAT_TYPE = "OPEN"
DEFAULT_GENDER = "Gender-Neutral"
DEFAULT_LIMIT = 100
OUTPUT_DIR = Path("results")


def normalize(value):
    return " ".join(str(value).strip().lower().split())


def parse_rank(value):
    """Return an integer rank, or None for values like '-' / '50P'."""
    text = str(value).strip().replace(",", "")
    if text.isdigit():
        return int(text)
    return None


def parse_list_input(raw_value, defaults):
    text = raw_value.strip()
    if not text:
        return defaults
    if normalize(text) in {"all", "any", "*"}:
        return None
    return [item.strip() for item in text.split(",") if item.strip()]


def quota_matches(row_quota, selected_quotas):
    if selected_quotas is None:
        return True

    aliases = {
        "ai": {"ai", "all india", "all-india"},
        "all india": {"ai", "all india", "all-india"},
        "other state": {"os", "other state"},
        "os": {"os", "other state"},
        "home state": {"hs", "home state"},
        "hs": {"hs", "home state"},
    }

    row_value = normalize(row_quota)
    for quota in selected_quotas:
        quota_value = normalize(quota)
        possible_values = aliases.get(quota_value, {quota_value})
        if row_value in possible_values:
            return True
    return False


def field_matches(row_value, selected_values):
    if selected_values is None:
        return True
    row_normalized = normalize(row_value)
    return any(row_normalized == normalize(value) for value in selected_values)


def discover_data_files():
    files = []
    for pattern in DATA_PATTERNS:
        files.extend(Path(".").glob(pattern))

    return sorted(files, key=file_sort_key)


def file_sort_key(path_or_name):
    stem = Path(path_or_name).stem
    if "_" not in stem:
        return (99, 0, stem)

    name, number = stem.split("_", 1)
    group_order = {"round": 0, "csab": 1}
    try:
        number_value = int(number)
    except ValueError:
        number_value = 0
    return (group_order.get(name, 99), number_value, stem)


def result_sort_key(item):
    return (
        file_sort_key(item["source"]),
        item["closing_rank"],
        item["institute"],
        item["program"],
    )


def near_miss_sort_key(item):
    return (
        file_sort_key(item["source"]),
        -item["closing_rank"],
        item["institute"],
        item["program"],
    )


def is_iit(institute):
    return normalize(institute).startswith("indian institute of technology")


def rank_for_row(item, mains_rank, advanced_rank):
    if is_iit(item["institute"]):
        if advanced_rank is None:
            return None, None
        return advanced_rank, "JEE Advanced"
    return mains_rank, "JEE Main"


def load_rows(quotas, seat_types, genders):
    matches = []

    for file_path in discover_data_files():
        with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            for row in reader:
                closing_rank = parse_rank(row.get("Closing Rank", ""))
                opening_rank = parse_rank(row.get("Opening Rank", ""))

                if closing_rank is None:
                    continue
                if not quota_matches(row.get("Quota", ""), quotas):
                    continue
                if not field_matches(row.get("Seat Type", ""), seat_types):
                    continue
                if not field_matches(row.get("Gender", ""), genders):
                    continue

                item = {
                    "source": file_path.name,
                    "institute": row.get("Institute", "").strip(),
                    "program": row.get("Academic Program Name", "").strip(),
                    "quota": row.get("Quota", "").strip(),
                    "seat_type": row.get("Seat Type", "").strip(),
                    "gender": row.get("Gender", "").strip(),
                    "opening_rank": opening_rank,
                    "closing_rank": closing_rank,
                }
                matches.append(item)

    return matches


def load_possible_matches(mains_rank, advanced_rank, quotas, seat_types, genders):
    matches = []
    for item in load_rows(quotas, seat_types, genders):
        rank_used, exam = rank_for_row(item, mains_rank, advanced_rank)
        if rank_used is not None and item["closing_rank"] > rank_used:
            item["rank_used"] = rank_used
            item["exam"] = exam
            matches.append(item)
    return sorted(matches, key=result_sort_key)


def load_near_missed_matches(mains_rank, advanced_rank, quotas, seat_types, genders):
    matches = []
    for item in load_rows(quotas, seat_types, genders):
        rank_used, exam = rank_for_row(item, mains_rank, advanced_rank)
        if rank_used is not None and item["closing_rank"] < rank_used:
            item["rank_used"] = rank_used
            item["exam"] = exam
            matches.append(item)
    return sorted(matches, key=near_miss_sort_key)


def ask_rank(prompt):
    while True:
        raw_rank = input(prompt).strip().replace(",", "")
        if raw_rank.isdigit() and int(raw_rank) > 0:
            return int(raw_rank)
        print("Please enter a positive number, for example: 45000")


def ask_limit(prompt):
    raw_limit = input(prompt).strip()
    if not raw_limit:
        return DEFAULT_LIMIT
    if normalize(raw_limit) == "all":
        return None
    if raw_limit.isdigit() and int(raw_limit) > 0:
        return int(raw_limit)
    print(f"Invalid limit. Showing default {DEFAULT_LIMIT} results.")
    return DEFAULT_LIMIT


def ask_yes_no(prompt, default=False):
    default_text = "Y/n" if default else "y/N"
    raw_value = input(f"{prompt} [{default_text}]: ").strip()
    if not raw_value:
        return default
    return normalize(raw_value) in {"y", "yes"}


def format_rank(value):
    return "-" if value is None else str(value)


def render_results(title, matches, limit):
    shown_matches = matches if limit is None else matches[:limit]

    if not shown_matches:
        return f"\n{title}\nNo matching institute/program found for these filters.\n"

    headers = ["No.", "File", "Exam", "Rank Used", "Institute", "Program", "Quota", "Seat", "Gender", "Opening", "Closing"]
    rows = []
    for index, item in enumerate(shown_matches, start=1):
        rows.append(
            [
                str(index),
                item["source"],
                item["exam"],
                format_rank(item["rank_used"]),
                item["institute"],
                item["program"],
                item["quota"],
                item["seat_type"],
                item["gender"],
                format_rank(item["opening_rank"]),
                format_rank(item["closing_rank"]),
            ]
        )

    widths = []
    for column_index, header in enumerate(headers):
        max_width = max(len(row[column_index]) for row in rows)
        widths.append(max(max_width, len(header)))

    lines = ["", title]
    lines.append(" | ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    lines.append("-+-".join("-" * width for width in widths))
    for row in rows:
        lines.append(" | ".join(value.ljust(widths[index]) for index, value in enumerate(row)))

    lines.append(f"\nShowing {len(shown_matches)} of {len(matches)} matching rows.")
    return "\n".join(lines) + "\n"


def describe_values(values):
    if values is None:
        return "all"
    return ", ".join(values)


def save_output(content):
    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = OUTPUT_DIR / f"rank_results_{timestamp}.txt"
    counter = 1

    while output_path.exists():
        output_path = OUTPUT_DIR / f"rank_results_{timestamp}_{counter}.txt"
        counter += 1

    output_path.write_text(content, encoding="utf-8")
    return output_path


def main():
    data_files = discover_data_files()
    if not data_files:
        patterns = ", ".join(DATA_PATTERNS)
        print(f"No data files found. Expected files matching: {patterns}")
        return

    print(f"Found {len(data_files)} data files: {', '.join(path.name for path in data_files)}")
    advanced_rank = None
    advanced_qualified = ask_yes_no("Are you JEE Advanced qualified", default=False)
    if advanced_qualified:
        advanced_rank = ask_rank("Enter your JEE Advanced rank: ")
    mains_rank = ask_rank("Enter your JEE Main rank: ")

    quota_prompt = "Quota(s) [default: AI, All India, Other State; type all for any]: "
    seat_prompt = f"Seat type(s) [default: {DEFAULT_SEAT_TYPE}; type all for any]: "
    gender_prompt = f"Gender(s) [default: {DEFAULT_GENDER}; type all for any]: "

    quotas = parse_list_input(input(quota_prompt), DEFAULT_QUOTAS)
    seat_types = parse_list_input(input(seat_prompt), [DEFAULT_SEAT_TYPE])
    genders = parse_list_input(input(gender_prompt), [DEFAULT_GENDER])
    possible_limit = ask_limit(f"How many possible results to show? Press Enter for {DEFAULT_LIMIT}, or type all: ")
    show_near_missed = ask_yes_no(
        "Also show closing ranks below your rank, nearest to your rank",
        default=False,
    )
    near_missed_limit = None
    if show_near_missed:
        near_missed_limit = ask_limit(
            f"How many nearest lower closing-rank results to show? Press Enter for {DEFAULT_LIMIT}, or type all: "
        )

    possible_matches = load_possible_matches(mains_rank, advanced_rank, quotas, seat_types, genders)

    output_parts = [
        "JEE Institute/Program Rank Results",
        f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"JEE Advanced qualified: {'yes' if advanced_qualified else 'no'}",
        f"JEE Advanced rank: {format_rank(advanced_rank)}",
        f"JEE Main rank: {mains_rank}",
        f"Quota: {describe_values(quotas)}",
        f"Seat type: {describe_values(seat_types)}",
        f"Gender: {describe_values(genders)}",
        "",
        render_results(
            "Possible options: closing rank greater than your rank",
            possible_matches,
            possible_limit,
        ),
    ]

    if show_near_missed:
        near_missed_matches = load_near_missed_matches(mains_rank, advanced_rank, quotas, seat_types, genders)
        output_parts.append(
            render_results(
                "Near misses: closing rank less than your rank, nearest first",
                near_missed_matches,
                near_missed_limit,
            )
        )

    output = "\n".join(output_parts)
    print(output)

    output_path = save_output(output)
    print(f"Output saved to: {output_path}")


if __name__ == "__main__":
    main()
