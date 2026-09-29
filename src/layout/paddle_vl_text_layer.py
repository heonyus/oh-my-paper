# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownParameterType=false, reportMissingParameterType=false, reportAttributeAccessIssue=false, reportPrivateUsage=false
"""
Lets PaddleOCR-VL take plain prose from the PDF's own text layer instead of recognizing it.

The reader and its translations read body text from PDF.js and use PaddleOCR-VL only for the
page's layout, tables, equations and headings, yet prose is most of what the VLM would read:
on a typical paper page it is four blocks in five. A prose block whose text the PDF already
carries skips recognition and takes that text instead. Scanned pages, rotated pages and
blocks whose text layer is missing or garbled are recognized as before.
"""

import ctypes
import re
import unicodedata
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Any, Final, NamedTuple

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

# Raw PaddleOCR-VL labels of blocks that hold running text. Titles stay with the VLM: the
# reader places them from Paddle's reading, which also mends small caps PDF text splits.
PROSE_LABELS: Final = frozenset(
    {
        "text",
        "content",
        "abstract",
        "reference",
        "reference_content",
        "list",
        "algorithm",
        "code",
        "figure_title",
        "table_title",
        "header",
        "footer",
        "number",
        "page_number",
        "aside_text",
        "footnote",
        "vision_footnote",
    }
)

_TEXT_KEY: Final = "ohmypaper_text_layer"
_LIGATURES: Final = re.compile("[\ufb00-\ufb06]")
# PDFium marks a hyphen it joined across a line break with STX.
_JOINED_HYPHEN: Final = "\x02"
_UNREADABLE_SHARE: Final = 0.02
# Points a character's centre may sit outside its text object's bounds.
_PLACEMENT_TOLERANCE: Final = 2.0


def clean_text(raw: str) -> str:
    """Joins a text layer's lines into one paragraph the way the VLM would write it."""
    text = raw.replace(_JOINED_HYPHEN, "")
    text = _LIGATURES.sub(lambda match: unicodedata.normalize("NFKC", match.group()), text)
    text = re.sub(r"-[ \t]*\r?\n[ \t]*", "-", text)
    return re.sub(r"\s+", " ", text).strip()


def readable(text: str) -> bool:
    """False for a text layer that is empty or garbled by a broken font encoding."""
    if not text:
        return False
    unreadable = sum(
        1
        for character in text
        if character == "\ufffd" or unicodedata.category(character) in {"Cc", "Co", "Cs"}
    )
    return unreadable <= len(text) * _UNREADABLE_SHARE


class PageChar(NamedTuple):
    """One character of the text layer, with its centre in rendered-image pixels."""

    text: str
    x: float
    y: float


def _object_bounds(text_object: Any) -> tuple[float, float, float, float]:
    left, bottom, right, top = (ctypes.c_float() for _ in range(4))
    pdfium_c.FPDFPageObj_GetBounds(text_object, left, bottom, right, top)
    return left.value, bottom.value, right.value, top.value


def _read_chars(text_page: pdfium.PdfTextPage) -> list[tuple[str, float, float]]:
    """Each character with its centre in PDF points; characters PDFium cannot place are blank.
    A surrogate pair counts as one character.

    Text of a figure embedded from another PDF can get character boxes far from where it
    is drawn, over the body text around it. Its own object's bounds disagree with such a
    box, which gives it away.
    """
    raw = text_page.raw
    bounds: dict[int, tuple[float, float, float, float]] = {}
    chars: list[tuple[str, float, float]] = []
    count = text_page.count_chars()
    index = 0
    while index < count:
        code = pdfium_c.FPDFText_GetUnicode(raw, index)
        x1, y1, x2, y2 = text_page.get_charbox(index)
        x, y = (x1 + x2) / 2, (y1 + y2) / 2
        width = 1
        if 0xD800 <= code <= 0xDBFF and index + 1 < count:
            low = pdfium_c.FPDFText_GetUnicode(raw, index + 1)
            if 0xDC00 <= low <= 0xDFFF:
                code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
                width = 2
        text = "\ufffd" if 0xD800 <= code <= 0xDFFF else chr(code) if code else ""
        text_object = pdfium_c.FPDFText_GetTextObject(raw, index)
        address = ctypes.cast(text_object, ctypes.c_void_p).value if text_object else None
        if address is not None and text.strip():
            if address not in bounds:
                bounds[address] = _object_bounds(text_object)
            left, bottom, right, top = bounds[address]
            margin = _PLACEMENT_TOLERANCE
            if not (left - margin <= x <= right + margin and bottom - margin <= y <= top + margin):
                text = ""
        chars.append((text, x, y))
        index += width
    return chars


class PageTextLayer:
    """A page's text layer, looked up by boxes in the pixels of the page's rendered image.

    PDFium's own bounded-text lookup also returns lines far outside the box, such as the
    labels inside a figure, so characters are chosen by where their centres fall.
    """

    def __init__(self, chars: list[PageChar] | None) -> None:
        self._chars = chars

    @classmethod
    def read(cls, page: pdfium.PdfPage, scale: float) -> "PageTextLayer":
        # Mapping a rotated page's text to its rendered image is not worth the risk.
        if page.get_rotation() != 0:
            return cls(None)
        left, _bottom, _right, top = page.get_cropbox()
        with closing(page.get_textpage()) as text_page:
            chars = [
                PageChar(text, (x - left) * scale, (top - y) * scale)
                for text, x, y in _read_chars(text_page)
            ]
        return cls(chars)

    def text(self, box: Any) -> str | None:
        """The text inside `box`, or None when the VLM must read the block."""
        if self._chars is None:
            return None
        x1, y1, x2, y2 = (float(value) for value in box[:4])
        inside = [
            index
            for index, char in enumerate(self._chars)
            if char.text.strip() and x1 <= char.x <= x2 and y1 <= char.y <= y2
        ]
        if not inside:
            return None
        chosen = set(inside)
        parts: list[str] = []
        for index in range(inside[0], inside[-1] + 1):
            char = self._chars[index].text
            if index in chosen or char in {_JOINED_HYPHEN, "\r", "\n"}:
                parts.append(char)
            else:
                # A space, or a character of another region read in between.
                parts.append(" ")
        text = clean_text("".join(parts))
        return text if readable(text) else None


# Rendered image name -> text layer, for the one predict call running now.
_layers: dict[str, PageTextLayer] = {}
# id(page image array) -> rendered image name, filled as the pipeline reads each image.
_image_names: dict[int, str] = {}
# Rendered image names of the pages the running layout-parsing step works on, by index.
_page_names: list[str | None] = []


@contextmanager
def text_layers(
    document: pdfium.PdfDocument, images: dict[str, int], scale: float
) -> Iterator[None]:
    """Serves the text layers of `images` (image name -> page number) while the block runs."""
    for name, page_number in images.items():
        with closing(document[page_number - 1]) as page:
            _layers[name] = PageTextLayer.read(page, scale)
    try:
        yield
    finally:
        _layers.clear()
        _image_names.clear()
        _page_names.clear()


def _block_text(page_index: int, block: dict[str, Any]) -> str | None:
    name = _page_names[page_index] if page_index < len(_page_names) else None
    layer = _layers.get(name) if name else None
    return layer.text(block["box"]) if layer else None


def _group_text(page_index: int, block: dict[str, Any], blocks: list[dict[str, Any]]) -> str | None:
    """The text of `block` and, for a merged paragraph, of the blocks merged into it."""
    group = block.get("group_id")
    members = [block] + [
        member
        for member in blocks
        if group is not None and member is not block and member.get("group_id") == group
    ]
    texts = [_block_text(page_index, member) for member in members]
    if any(text is None for text in texts):
        return None
    return " ".join(text for text in texts if text)


def install() -> None:
    """Teaches the PaddleOCR-VL pipeline to read prose from the text layer. Call it once,
    before the pipeline is created."""
    from paddlex.inference.pipelines.paddleocr_vl import pipeline as module

    pipeline_class = module._PaddleOCRVLPipeline
    if getattr(pipeline_class, "_ohmypaper_text_layer", False):
        return
    pipeline_class._ohmypaper_text_layer = True

    class PageImageReader(module.ReadImage):
        def read(self, img: Any) -> Any:
            image = super().read(img)
            if isinstance(img, str):
                _image_names[id(image)] = Path(img).name
            return image

    module.ReadImage = PageImageReader

    parse_layout = pipeline_class.get_layout_parsing_results
    collect = pipeline_class._paddleocr_vl_collect_page_vlm_entries_core
    assemble = pipeline_class._paddleocr_vl_assemble_parsing_results

    def get_layout_parsing_results(self: Any, *args: Any, **kwargs: Any) -> Any:
        images = kwargs["images"] if "images" in kwargs else args[0]
        _page_names[:] = [_image_names.get(id(image)) for image in images]
        return parse_layout(self, *args, **kwargs)

    def collect_page_vlm_entries(
        self: Any, page_idx: int, blocks_for_img: list[dict[str, Any]], *args: Any
    ) -> Any:
        entries, has_spotting, drop_figures = collect(self, page_idx, blocks_for_img, *args)
        kept = []
        for entry in entries:
            block = blocks_for_img[entry[1]]
            text = (
                _group_text(page_idx, block, blocks_for_img)
                if block["label"] in PROSE_LABELS
                else None
            )
            if text is None:
                kept.append(entry)
            else:
                # Like the VLM, which reads a merged paragraph from this block's image, the
                # whole paragraph goes to this block and the blocks merged into it stay empty.
                block[_TEXT_KEY] = text
        return kept, has_spotting, drop_figures

    def assemble_parsing_results(
        self: Any,
        blocks: list[list[dict[str, Any]]],
        batches: dict[Any, Any],
        ids: dict[Any, Any],
        *args: Any,
    ) -> Any:
        # Text-layer blocks join as one more recognition batch, in the order assembly reads them.
        read = [
            ((page_index, index), block[_TEXT_KEY])
            for page_index, page in enumerate(blocks)
            for index, block in enumerate(page)
            if _TEXT_KEY in block
        ]
        if read:
            key = ("text-layer",)
            batches[key] = {
                "images": [None] * len(read),
                "queries": [],
                "figure_token_maps": [{} for _ in read],
                "vlm_block_ids": [block_id for block_id, _text in read],
                "vlm_results": [{"result": text} for _block_id, text in read],
                "curr_vlm_block_idx": 0,
            }
            for block_id, _text in read:
                ids[block_id] = key
        return assemble(self, blocks, batches, ids, *args)

    pipeline_class.get_layout_parsing_results = get_layout_parsing_results
    pipeline_class._paddleocr_vl_collect_page_vlm_entries_core = collect_page_vlm_entries
    pipeline_class._paddleocr_vl_assemble_parsing_results = assemble_parsing_results
