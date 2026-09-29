from pathlib import Path

import pypdfium2 as pdfium

from src.layout.paddle_vl_text_layer import PageChar, PageTextLayer, clean_text, readable

FIXTURES = Path(__file__).parent.parent / "fixtures" / "document-ast"


def line(text: str, x: float, y: float) -> list[PageChar]:
    return [PageChar(char, x + 10 * index, y) for index, char in enumerate(text)]


def test_clean_text_joins_lines_like_a_paragraph() -> None:
    raw = "multi\x02ple agents talk in ﬁxed\r\nrounds of state-\r\nof-the-art\r\n  messages "

    assert clean_text(raw) == "multiple agents talk in fixed rounds of state-of-the-art messages"


def test_readable_rejects_empty_and_garbled_text() -> None:
    assert readable("Latent communication between agents.")
    assert not readable("")
    assert not readable(" abc")


def test_text_takes_characters_whose_centres_fall_inside_the_box() -> None:
    chars = [
        *line("left", 0, 5),
        PageChar(" ", 40, 5),
        *line("right", 300, 5),
        PageChar("\r", 350, 5),
        PageChar("\n", 350, 5),
        *line("next", 0, 25),
    ]
    layer = PageTextLayer(chars)

    assert layer.text((0, 0, 100, 40)) == "left next"
    assert layer.text((290, 0, 400, 10)) == "right"
    assert layer.text((0, 100, 100, 120)) is None


def test_text_of_a_real_page_stays_inside_its_column() -> None:
    with pdfium.PdfDocument(FIXTURES / "structured-document.pdf") as document:
        page = document[0]
        width, height = page.get_size()
        layer = PageTextLayer.read(page, 2)
        page.close()

    whole = layer.text((0, 0, width * 2, height * 2))
    left = layer.text((0, 0, width, height * 2))

    assert whole and "Left column preserves reading order" in whole
    assert left and "Left column preserves reading order" in left
    assert len(left) < len(whole)


def test_pages_without_a_usable_text_layer_go_to_the_vlm() -> None:
    with pdfium.PdfDocument(FIXTURES / "scanned-mixed-document.pdf") as document:
        scan, typed = document[0], document[1]
        width, height = scan.get_size()
        scanned = PageTextLayer.read(scan, 2)
        upright = PageTextLayer.read(typed, 2)
        typed.set_rotation(90)
        rotated = PageTextLayer.read(typed, 2)
        scan.close()
        typed.close()
    everything = (0, 0, width * 2, height * 2)

    assert scanned.text(everything) is None
    assert upright.text(everything) == "Text beside a synthetic scan"
    assert rotated.text(everything) is None
