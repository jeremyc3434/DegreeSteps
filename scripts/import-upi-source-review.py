"""Prepare a reviewed UPI ACE source catalog from previously fetched official HTML.

This command performs no network request. Ordinary builds validate the committed
packet and captures with upi-course-catalog.mjs; they never depend on audit paths.
"""
import argparse
import datetime
import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parent.parent
REVIEW_DATE = "2026-11-25"
PACKET = ROOT / ("content/catalog/upi-course-identities-reviewed-" + REVIEW_DATE + ".json")


def text(value):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value)).split())


def date(value):
    return datetime.datetime.strptime(value, "%m/%d/%Y").date().isoformat()


def parse_ace(body):
    pairs = re.findall(r'<div class="label[^\"]*">(.*?)</div>\s*<div class="value[^\"]*">(.*?)</div>', body, re.S)
    fields = {text(label): {"text": text(value), "html": value} for label, value in pairs}
    assert fields["Credit Type:"]["text"] == "Course" and fields["Organization:"]["text"] == "UPI Study"
    title = html.unescape(re.search(r'<meta name="twitter:title" content="([^\"]+)"', body)[1])
    table = re.search(r'<table class="credit-recommendations">(.*?)</table>', body, re.S)[1]
    assert "Credits (SH)" in text(table)
    cells = [text(cell) for cell in re.findall(r"<td\b[^>]*>(.*?)</td>", table, re.S)]
    assert len(cells) == 3 and cells[0] in ("Lower-Division Baccalaureate", "Upper-Division Baccalaureate")
    selected = text(re.search(r'<option\b(?=[^>]*\bselected="selected")[^>]*>(.*?)</option>', fields["ACE Credit Recommendation Period:"]["html"], re.S)[1])
    start, end = selected.split(" - ")
    result = {
        "aceId": fields["ACE ID:"]["text"], "title": title,
        "providerCourseCode": fields["Organization's ID:"]["text"],
        "sourceCredits": float(cells[1]), "sourceCreditSystem": "semester",
        "sourceUpper": cells[0] == "Upper-Division Baccalaureate",
        "courseVersion": int(fields["Version:"]["text"]),
        "recommendationStart": date(start), "recommendationEnd": date(end),
        "minScore": float(fields["Minimum Passing Score:"]["text"]), "creditSubject": cells[2],
        "identityQuote": " ".join(label + " " + fields[label]["text"] for label in ("ACE ID:", "Version:", "Organization's ID:", "Organization:")),
        "sourceCreditQuote": "Level Credits (SH) Subject " + " ".join(cells),
        "recommendationPeriodQuote": "ACE Credit Recommendation Period: " + selected,
    }
    assert re.fullmatch(r"UPIS-\d{4}", result["aceId"])
    assert result["recommendationStart"] <= REVIEW_DATE <= result["recommendationEnd"]
    return result


def provider_course(body, url):
    nodes = []
    for raw in re.findall(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', body, re.S):
        try:
            data = json.loads(raw)
        except ValueError:
            continue
        nodes.extend(data if isinstance(data, list) else data.get("@graph", [data]))
    courses = [node for node in nodes if node.get("@type") == "Course" and node.get("url") == url and isinstance(node.get("educationalCredentialAwarded"), dict) and node["educationalCredentialAwarded"].get("identifier", {}).get("propertyID") == "ACE course ID"]
    assert len(courses) == 1, (url, "Requires one exact URL-bound provider Course graph")
    course = courses[0]
    credential, offer = course["educationalCredentialAwarded"], course.get("offers", {})
    return {
        "aceId": credential["identifier"]["value"], "providerCourseCode": course["courseCode"],
        "title": course["name"], "courseUrl": course["url"],
        "recommendationStart": credential["validFrom"], "recommendationEnd": credential["expires"],
        "advertisedCredits": course.get("numberOfCredits"), "creditNote": credential.get("name"),
        "price": float(offer["price"]) if offer.get("priceCurrency") == "USD" and offer.get("category") == "Paid" and offer.get("availability") == "https://schema.org/InStock" else None,
        "currency": offer.get("priceCurrency"), "offerUrl": offer.get("url"),
    }


def subject(title):
    for label, pattern in [
        ("Math", r"statistic|calculus|mathematics"),
        ("Science", r"biology|chemistry|physics|environment"),
        ("English & communication", r"writing|composition|english"),
        ("Technology", r"database|computer|information technology|javascript|python|cybersecurity"),
        ("Business", r"account|business|finance|marketing|economics|entrepreneur"),
        ("Social science", r"psychology|sociology"),
        ("Humanities", r"philosophy"),
    ]:
        if re.search(pattern, title, re.I):
            return label
    return "Other subjects"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-dir", required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    capture_dir = Path(args.capture_dir)
    sources, captures = {}, {}

    def source(filename, source_id, kind, title, roles):
        metadata = json.loads((capture_dir / filename.replace(".html", ".metadata.json")).read_text())
        body = (capture_dir / filename).read_bytes()
        digest = hashlib.sha256(body).hexdigest()
        assert metadata["status"] == 200 and metadata["complete"] is True and metadata["rawBodyCaptured"] is True and metadata["sha256"] == digest
        # The existing factory expects .txt captures with .json sidecars. The
        # payload remains the exact origin HTML bytes, not normalized text.
        path = "content/source-captures/" + digest[:16] + ".txt"
        captures[path] = body
        item = {"id": source_id, "kind": kind, "title": title, "url": metadata["url"], "roles": roles,
                "checkedOn": REVIEW_DATE, "capturedAt": metadata["fetchedAt"], "capture": path, "sha256": digest,
                "status": 200, "complete": True, "rawBodyCaptured": True, "bytes": len(body),
                "captureFormat": "raw-html", "contentType": metadata["contentType"]}
        assert source_id not in sources or sources[source_id] == item
        sources[source_id] = item
        return item, body.decode("utf-8")

    cards = []
    for page in range(1, 5):
        filename = "upi-ace-catalog.html" if page == 1 else "upi-ace-catalog-page-" + str(page) + ".html"
        item, body = source(filename, "upi-provider-catalog-page-" + str(page) + "-" + REVIEW_DATE, "provider-catalog", "UPI published ACE course catalog, page " + str(page), ["current-offering-listing"])
        for match in re.finditer(r'<a\b(?=[^>]*class="card card--published card--course")[^>]*href="([^\"]+)"[^>]*>(.*?)</a>', body, re.S):
            name = text(re.search(r'<h3 class="card__name">(.*?)</h3>', match[2], re.S)[1])
            cards.append({"courseUrl": urljoin("https://www.upistudy.com", html.unescape(match[1])), "cardTitle": name, "sourceId": item["id"]})
    assert len(cards) == 22 and len({card["courseUrl"] for card in cards}) == 22, "Review changed provider catalog breadth before refreshing."

    course_pages = {}
    for path in sorted(capture_dir.glob("upi-course-upis-*.html")):
        metadata = json.loads(path.with_suffix(".metadata.json").read_text())
        graph = provider_course(path.read_text(), metadata["url"])
        assert graph["aceId"] not in course_pages
        course_pages[graph["aceId"]] = (path.name, graph)
    assert len(course_pages) == 22

    courses = []
    for path in sorted(capture_dir.glob("upis-*.html")):
        ace = parse_ace(path.read_text())
        ace_id = ace["aceId"]
        provider_filename, current = course_pages[ace_id]
        card = next(card for card in cards if card["courseUrl"] == current["courseUrl"])
        assert current["recommendationStart"] == ace["recommendationStart"] and current["recommendationEnd"] == ace["recommendationEnd"]
        ace_source, _ = source(path.name, "upi-ace-" + ace_id.lower() + "-" + REVIEW_DATE, "ace-course-exhibit", "ACE " + ace_id + " version " + str(ace["courseVersion"]) + ": " + ace["title"], ["provider-identity", "recommendation-period", "original-source-credits"])
        provider_source, _ = source(provider_filename, "upi-provider-" + ace_id.lower() + "-" + REVIEW_DATE, "provider-course", "UPI current offering: " + current["title"], ["provider-identity", "current-offering", "pricing"])
        code_aliases = list(dict.fromkeys([ace["providerCourseCode"], current["providerCourseCode"], card["cardTitle"].split(":", 1)[0].strip()]))
        source_ids = [ace_source["id"], provider_source["id"], card["sourceId"]]
        courses.append({**ace, "id": "upi-study-" + ace_id.lower(), "creditBasis": "ACE", "nccrsId": None,
                        "courseUrl": current["courseUrl"], "url": current["courseUrl"], "codeAliases": code_aliases,
                        "subject": subject(ace["title"]), "creditOrigin": "alternative", "currentOffering": current,
                        "identityVerificationStatus": "verified-current-provider-course-and-independent-ace-exhibit",
                        "sourceCreditStatus": "verified-from-independent-ace-exhibit", "sourceIds": source_ids, "identitySourceIds": source_ids,
                        "sourceCreditEvidence": {"sourceIds": [ace_source["id"]], "quote": ace["sourceCreditQuote"]},
                        "providerCatalogEvidence": card, "mappingStatus": "source-listing", "mappedCourseIds": [],
                        "schoolAcceptance": "not-established-by-course-listing",
                        "otherRecommendationStatus": "Provider NCCRS claims are not an independently verified NCCRS recommendation in this packet.",
                        "quantityStatus": "independent-ace-quantity-retained" if current["advertisedCredits"] == ace["sourceCredits"] else "different-provider-and-ace-quantities-retained-separately"})
    assert len(courses) == 22
    review = {"kind": "reviewed-source-course-catalog", "version": 1, "id": "upi-source-course-identities-" + REVIEW_DATE,
              "provider": "UPI Study", "checkedOn": REVIEW_DATE,
              "scope": "Current published UPI ACE course offerings independently matched to the selected active ACE exhibit version. Source recommendations do not establish receiving-school acceptance or exact degree placements. Provider NCCRS claims and generic catalog credit defaults are not imported as ACE facts.",
              "courses": courses, "sources": sorted(sources.values(), key=lambda item: item["id"]),
              "unimported": [{"route": "NCCRS-only UPI courses", "reason": "No independently retrieved current NCCRS exhibit set; organization retrieval returned HTTP 503 in the retained audit."}]}
    output = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        for relative, body in captures.items():
            target = ROOT / relative
            if target.exists():
                assert target.read_bytes() == body, "Source capture hash-prefix collision"
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(body)
            evidence = next(item for item in sources.values() if item["capture"] == relative)
            target.with_suffix(".json").write_text(json.dumps({
                "url": evidence["url"], "fetchedAt": evidence["capturedAt"],
                "sha256": evidence["sha256"], "bytes": len(body), "status": evidence["status"],
                "complete": True, "rawBodyCaptured": True, "captureFormat": "raw-html",
                "contentType": evidence["contentType"],
                "scope": "Exact public origin HTML retained in the factory's text-capture convention; no credit award is inferred."
            }, indent=2) + "\n")
        PACKET.write_text(output)
    print(json.dumps({"write": args.write, "review": review["id"], "courses": len(courses), "sourceCaptures": len(captures), "captureBytes": sum(len(body) for body in captures.values()), "receivingAwardsCreated": 0}))


if __name__ == "__main__":
    main()
