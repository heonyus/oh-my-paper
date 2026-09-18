# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "paddleocr[doc-parser]==3.7.0",
#   "paddlepaddle==3.2.1",
#   "pydantic>=2.13,<3",
#   "pypdfium2>=5.13,<6",
#   "typer>=0.27,<1",
# ]
# ///
# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUntypedBaseClass=false
# ─── How to run ───
# uv run src/layout/paddle_vl_page_parser.py INPUT.pdf SOURCE_HASH PAGE OUTPUT.json

from contextlib import closing
from functools import partial
from hashlib import file_digest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Final, Literal

import pypdfium2 as pdfium
import typer
from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION: Final = "1.0.0"
PARSER: Final = "PaddleOCR-VL-1.6"
CONFIG_VERSION: Final = "page-v1"
RENDER_SCALE: Final = 2

BlockLabel = Literal[
    "doc_title",
    "paragraph_title",
    "text",
    "list",
    "code",
    "equation",
    "image",
    "table",
    "chart",
    "figure_title",
    "table_title",
    "header",
    "footer",
    "page_number",
    "aside_text",
    "footnote",
    "unknown",
]

LABELS: Final[dict[str, BlockLabel]] = {
    "doc_title": "doc_title",
    "paragraph_title": "paragraph_title",
    "title": "paragraph_title",
    "text": "text",
    "content": "text",
    "abstract": "text",
    "reference": "text",
    "reference_content": "text",
    "list": "list",
    "algorithm": "code",
    "code": "code",
    "display_formula": "equation",
    "inline_formula": "equation",
    "equation": "equation",
    "image": "image",
    "header_image": "header",
    "footer_image": "footer",
    "table": "table",
    "chart": "chart",
    "figure_title": "figure_title",
    "table_title": "table_title",
    "header": "header",
    "footer": "footer",
    "number": "page_number",
    "page_number": "page_number",
    "aside_text": "aside_text",
    "footnote": "footnote",
    "vision_footnote": "footnote",
}

EXCLUDED: Final[frozenset[BlockLabel]] = frozenset(
    {
        "image",
        "table",
        "chart",
        "figure_title",
        "table_title",
        "header",
        "footer",
        "page_number",
        "aside_text",
        "footnote",
        "unknown",
    }
)


class RawBlock(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    block_bbox: tuple[float, float, float, float]
    block_label: str
    block_content: str = ""
    block_id: int = Field(ge=0)
    block_order: int | None = Field(default=None, ge=0)


class RawPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    parsing_res_list: tuple[RawBlock, ...] = ()


class RawEnvelope(RawPayload):
    res: RawPayload | None = None


class Bounds(BaseModel):
    model_config = ConfigDict(frozen=True)

    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class ParsedBlock(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    label: BlockLabel
    order: int = Field(ge=0)
    bounds: Bounds
    content: str = Field(max_length=40_000)
    contentFormat: Literal["text", "markdown", "latex", "html", "none"]
    translationPolicy: Literal["include", "exclude"]


class ParsedPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    schemaVersion: Literal["1.0.0"] = "1.0.0"
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    parser: Literal["PaddleOCR-VL-1.6"] = "PaddleOCR-VL-1.6"
    configVersion: Literal["page-v1"] = "page-v1"
    pageNumber: int = Field(gt=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    blocks: tuple[ParsedBlock, ...]


class ParserInputError(RuntimeError):
    """Raised when the requested PDF page cannot be parsed safely."""


def render_page(pdf_path: Path, page_number: int, target: Path) -> tuple[int, int]:
    with pdfium.PdfDocument(pdf_path) as document:
        if page_number > len(document):
            raise ParserInputError("invalid_page")
        with (
            closing(document[page_number - 1]) as page,
            closing(page.render(scale=RENDER_SCALE)) as bitmap,
            bitmap.to_pil() as image,
        ):
            image.save(target, format="PNG")
            return image.width, image.height


def content_format(
    label: BlockLabel,
) -> Literal["text", "markdown", "latex", "html", "none"]:
    match label:
        case "equation":
            return "latex"
        case "table":
            return "html"
        case "image" | "chart" | "unknown":
            return "none"
        case _:
            return "markdown"


def convert_blocks(
    page_number: int, raw: tuple[RawBlock, ...]
) -> tuple[ParsedBlock, ...]:
    ordered = sorted(
        raw,
        key=lambda block: (
            block.block_order
            if block.block_order is not None
            else 1_000_000 + block.block_id,
            block.block_id,
        ),
    )
    converted: list[ParsedBlock] = []
    for order, block in enumerate(ordered):
        x1, y1, x2, y2 = block.block_bbox
        label = LABELS.get(block.block_label.lower(), "unknown")
        converted.append(
            ParsedBlock(
                id=f"page:{page_number}:block:{block.block_id}",
                label=label,
                order=order,
                bounds=Bounds(x=x1, y=y1, width=x2 - x1, height=y2 - y1),
                content=block.block_content.strip()[:40_000],
                contentFormat=content_format(label),
                translationPolicy="exclude" if label in EXCLUDED else "include",
            )
        )
    return tuple(converted)


def main(
    pdf_path: Path,
    source_hash: str,
    page_number: int,
    output_path: Path,
    vlm_server_url: str = "",
    vlm_model: str = "",
    vlm_api_key: str = "",
) -> None:
    """Parse one PDF page through the complete local PaddleOCR-VL pipeline."""
    with pdf_path.open("rb") as source:
        if file_digest(source, "sha256").hexdigest() != source_hash:
            raise ParserInputError("source_hash_mismatch")
    with TemporaryDirectory(prefix="scourgify-paddle-page-") as temporary:
        image_path = Path(temporary) / f"page-{page_number}.png"
        width, height = render_page(pdf_path, page_number, image_path)
        from paddleocr import PaddleOCRVL

        pipeline_factory = partial(
            PaddleOCRVL,
            pipeline_version="v1.6",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_layout_detection=True,
            use_chart_recognition=False,
            use_seal_recognition=False,
            use_ocr_for_image_block=False,
            format_block_content=True,
            merge_layout_blocks=True,
            markdown_ignore_labels=[],
        )
        pipeline = (
            pipeline_factory(
                vl_rec_backend="mlx-vlm-server",
                vl_rec_server_url=vlm_server_url,
                vl_rec_api_model_name=vlm_model,
                vl_rec_api_key=vlm_api_key,
            )
            if vlm_server_url and vlm_model
            else pipeline_factory()
        )
        result = next(
            iter(
                pipeline.predict(
                    str(image_path),
                    layout_shape_mode="rect",
                    use_queues=False,
                    temperature=0.0,
                    format_block_content=True,
                    merge_layout_blocks=True,
                    markdown_ignore_labels=[],
                )
            )
        )
        envelope = RawEnvelope.model_validate(result.json)
        payload = envelope.res or RawPayload(parsing_res_list=envelope.parsing_res_list)
        page = ParsedPage(
            sourceHash=source_hash,
            pageNumber=page_number,
            width=width,
            height=height,
            blocks=convert_blocks(page_number, payload.parsing_res_list),
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(page.model_dump_json(), encoding="utf-8")


if __name__ == "__main__":
    typer.run(main)
