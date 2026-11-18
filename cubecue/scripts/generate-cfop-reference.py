"""Extract functional reference notation as data, never execute downloaded code.

Read the user-requested reference saved at .cache/cfop-reference/solvethecube.html.
The next CJS tool uses the independent cubejs oracle to produce test states.
"""

import json
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path


class ReferenceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stage = None
        self.case = None
        self.depth = 0
        self.chunks = []
        self.rows = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h2" and attrs.get("id") in ("oll", "pll"):
            self.stage = attrs["id"].upper()
        if self.stage and tag == "div" and attrs.get("class") == "alg":
            self.case = f"{self.stage}-{attrs['data-number']}"
        if tag == "span":
            if self.depth:
                self.depth += 1
            elif self.case and attrs.get("class") == "steps":
                self.depth = 1
                self.chunks = []

    def handle_data(self, data):
        if self.depth:
            self.chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "span" and self.depth:
            self.depth -= 1
            if not self.depth:
                self.rows.append({"id": self.case, "algorithm": "".join(self.chunks)})
                self.case = None


path = Path(".cache/cfop-reference/solvethecube.html")
parser = ReferenceParser()
parser.feed(path.read_text())
assert len(parser.rows) == 78
Path(".cache/cfop-reference/reference-algorithms.json").write_text(json.dumps({
    "source": "https://solvethecube.com/algorithms", "retrieved": "2026-11-12",
    "source_sha256": sha256(path.read_bytes()).hexdigest(), "cases": parser.rows,
}, indent=2) + "\n")
