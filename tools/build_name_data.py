#!/usr/bin/env python3
"""Build app/js/name-data.js: first names, sorted by whether they are usually a woman's or a man's.

The app uses this for one thing: choosing wrong answers in a multiple-choice question that could
be right (see app/js/name-guess.js). Nothing here is about any student.

Source: US Social Security Administration, "Beyond the Top 1000 Names", national data (names.zip),
linked from https://www.ssa.gov/oact/babynames/limits.html. It lists every first name given to at
least five babies of one sex in a year, with the count. The site refuses scripted downloads, so
download names.zip in a browser, then:

    python3 tools/build_name_data.py /path/to/names.zip app/js/name-data.js

A name is placed when at least MIN_PEOPLE people have it (from FIRST_YEAR on) and we can be
confident that at least LOW of them are one sex (the lower end of a 95% Wilson interval, so a rare
name has to be nearly all one way). A name with enough people that fails the second test goes on
the "either" list, so that nothing downstream guesses it from its ending.
"""
import collections, datetime, hashlib, math, sys, textwrap, zipfile

FIRST_YEAR, MIN_PEOPLE, LOW = 1940, 100, 0.9


def wilson_low(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    return (p + z * z / (2 * n) - z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d


def main(zip_path, out_path):
    z = zipfile.ZipFile(zip_path)
    years = sorted(int(n[3:7]) for n in z.namelist() if n.startswith("yob") and n.endswith(".txt"))
    years = [y for y in years if y >= FIRST_YEAR]
    totals = collections.defaultdict(lambda: [0, 0])
    for y in years:
        for line in z.read(f"yob{y}.txt").decode("ascii").splitlines():
            name, sex, count = line.split(",")
            if not name.isalpha() or sex not in ("F", "M"):
                raise SystemExit(f"unexpected line in yob{y}.txt: {line!r}")
            totals[name.lower()][0 if sex == "F" else 1] += int(count)

    lists = {"f": [], "m": [], "u": []}
    for name, (f, m) in totals.items():
        n = f + m
        if n < MIN_PEOPLE:
            continue
        sure = wilson_low(max(f, m), n) >= LOW
        lists[("f" if f > m else "m") if sure else "u"].append(name)

    def block(names):
        return "\n".join(textwrap.wrap(" ".join(sorted(names)), 110))

    digest = hashlib.sha256(open(zip_path, "rb").read()).hexdigest()
    out = f"""// GENERATED FILE. Do not edit by hand: run tools/build_name_data.py.
//
// First names, sorted by whether they are usually a woman's or a man's, for choosing
// wrong answers that could be right (see name-guess.js).
//
// Source: US Social Security Administration, "Beyond the Top 1000 Names", national data,
// https://www.ssa.gov/oact/babynames/limits.html (names.zip, SHA-256 {digest[:16]}...).
// Births {years[0]} to {years[-1]}. Built {datetime.date.today().isoformat()}.
// A name is here if at least {MIN_PEOPLE} people have it. It is placed when we can be confident
// at least {int(LOW * 100)}% of them are one sex; otherwise it is on the "either" list.
// {len(lists['f']):,} women's names, {len(lists['m']):,} men's, {len(lists['u']):,} either.

export const DATA_FEMALE = `
{block(lists['f'])}
`;

export const DATA_MALE = `
{block(lists['m'])}
`;

export const DATA_EITHER = `
{block(lists['u'])}
`;
"""
    open(out_path, "w").write(out)
    print(f"{out_path}: {len(lists['f']):,} women's names, {len(lists['m']):,} men's, {len(lists['u']):,} either; "
          f"{len(out) / 1024:.0f} KB; births {years[0]} to {years[-1]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
