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
from hashlib import file_digest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Final, Literal

import pypdfium2 as pdfium
import typer
from paddle_vl_blocks import (
    ParsedPage,
    RawEnvelope,
    RawPayload,
    convert_blocks,
)

SCHEMA_VERSION: Final = "1.0.0"
PARSER: Final = "PaddleOCR-VL-1.6"
CONFIG_VERSION: Final = "page-v3"
RENDER_SCALE: Final = 2
PREDICT_OPTIONS: Final[dict[str, Any]] = {
    "layout_shape_mode": "rect",
    "temperature": 0.0,
    "format_block_content": True,
    "merge_layout_blocks": True,
    "markdown_ignore_labels": [],
}

VlmBackend = Literal["native", "mlx-vlm-server", "vllm-server"]


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


def create_pipeline(
    backend: VlmBackend = "native",
    server_url: str = "",
    model: str = "",
    api_key: str = "",
) -> Any:
    """Build the PaddleOCR-VL pipeline, optionally recognizing text through a local VLM server."""
    from paddleocr import PaddleOCRVL

    options: dict[str, Any] = {
        "pipeline_version": "v1.6",
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_layout_detection": True,
        "use_chart_recognition": False,
        "use_seal_recognition": False,
        "use_ocr_for_image_block": False,
        "format_block_content": True,
        "merge_layout_blocks": True,
        "markdown_ignore_labels": [],
    }
    if backend != "native":
        # Naming the served model up front keeps the client from querying the server while
        # the pipeline loads, so the server may still be starting.
        options |= {
            "vl_rec_backend": backend,
            "vl_rec_server_url": server_url,
            "vl_rec_api_model_name": model,
            "vl_rec_api_key": api_key,
        }
    return PaddleOCRVL(**options)


def parsed_page(
    result_json: Any, source_hash: str, page_number: int, width: int, height: int
) -> ParsedPage:
    envelope = RawEnvelope.model_validate(result_json)
    payload = envelope.res or RawPayload(parsing_res_list=envelope.parsing_res_list)
    return ParsedPage(
        sourceHash=source_hash,
        pageNumber=page_number,
        width=width,
        height=height,
        blocks=convert_blocks(page_number, payload.parsing_res_list),
    )


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
    with TemporaryDirectory(
        prefix="ohmypaper-paddle-page-", ignore_cleanup_errors=True
    ) as temporary:
        image_path = Path(temporary) / f"page-{page_number}.png"
        width, height = render_page(pdf_path, page_number, image_path)
        pipeline = (
            create_pipeline("mlx-vlm-server", vlm_server_url, vlm_model, vlm_api_key)
            if vlm_server_url and vlm_model
            else create_pipeline()
        )
        result = next(
            iter(pipeline.predict(str(image_path), use_queues=False, **PREDICT_OPTIONS))
        )
        page = parsed_page(result.json, source_hash, page_number, width, height)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(page.model_dump_json(), encoding="utf-8")


if __name__ == "__main__":
    typer.run(main)
