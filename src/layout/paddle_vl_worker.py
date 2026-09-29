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
# uv run src/layout/paddle_vl_worker.py [--vlm-backend vllm-server --vlm-server-url URL --vlm-model NAME]
# Loads PaddleOCR-VL once, then answers one JSON request per stdin line with JSON lines on stdout.
# The VLM server API key comes from OH_MY_PAPER_VLM_API_KEY.

import json
import os
import sys
import traceback
from contextlib import closing
from hashlib import file_digest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Final, TextIO, get_args

import paddle_vl_text_layer
import pypdfium2 as pdfium
import typer
from paddle_vl_page_parser import (
    PREDICT_OPTIONS,
    RENDER_SCALE,
    ParserInputError,
    VlmBackend,
    create_pipeline,
    parsed_page,
)
from pydantic import BaseModel, ConfigDict, Field, ValidationError

BACKENDS: Final = get_args(VlmBackend)


class ParseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=64)
    pdfPath: Path
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    pages: tuple[int, ...] = Field(min_length=1, max_length=64)
    outputDir: Path


def protocol_stream() -> TextIO:
    """Keep the real stdout for protocol lines and send library output to stderr."""
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    return protocol


def send(stream: TextIO, message: dict[str, Any]) -> None:
    stream.write(json.dumps(message) + "\n")
    stream.flush()


def render_pages(
    document: pdfium.PdfDocument, pages: tuple[int, ...], directory: Path
) -> dict[str, tuple[int, int, int]]:
    """Render each page to a PNG, keyed by file name, with its page number and size."""
    rendered: dict[str, tuple[int, int, int]] = {}
    for page_number in pages:
        if page_number > len(document):
            raise ParserInputError("invalid_page")
        target = directory / f"page-{page_number}.png"
        with (
            closing(document[page_number - 1]) as page,
            closing(page.render(scale=RENDER_SCALE)) as bitmap,
            bitmap.to_pil() as image,
        ):
            image.save(target, format="PNG")
            rendered[target.name] = (page_number, image.width, image.height)
    return rendered


def input_name(result_json: Any) -> str:
    payload = result_json.get("res", result_json)
    return Path(str(payload["input_path"])).name


def parse_pages(pipeline: Any, request: ParseRequest, stream: TextIO) -> None:
    with request.pdfPath.open("rb") as source:
        if file_digest(source, "sha256").hexdigest() != request.sourceHash:
            raise ParserInputError("source_hash_mismatch")
    request.outputDir.mkdir(parents=True, exist_ok=True)
    with (
        TemporaryDirectory(prefix="ohmypaper-paddle-worker-") as temporary,
        pdfium.PdfDocument(request.pdfPath) as document,
    ):
        directory = Path(temporary)
        rendered = render_pages(document, request.pages, directory)
        images = [str(directory / name) for name in rendered]
        text_layers = {name: page_number for name, (page_number, _, _) in rendered.items()}
        with paddle_vl_text_layer.text_layers(document, text_layers, RENDER_SCALE):
            # Queues let layout detection of later pages overlap recognition of earlier
            # ones; predict_iter hands over each page when it is done, not all at the end.
            for result in pipeline.predict_iter(images, use_queues=True, **PREDICT_OPTIONS):
                page_number, width, height = rendered[input_name(result.json)]
                page = parsed_page(result.json, request.sourceHash, page_number, width, height)
                target = request.outputDir / f"page-{page_number}.json"
                partial = request.outputDir / f"page-{page_number}.json.partial"
                partial.write_text(page.model_dump_json(), encoding="utf-8")
                partial.replace(target)
                send(stream, {"event": "page", "id": request.id, "pageNumber": page_number})


def main(vlm_backend: str = "native", vlm_server_url: str = "", vlm_model: str = "") -> None:
    """Serve page-parse requests from stdin until it closes."""
    if vlm_backend not in BACKENDS:
        raise typer.BadParameter(f"--vlm-backend must be one of {', '.join(BACKENDS)}")
    stream = protocol_stream()
    paddle_vl_text_layer.install()
    pipeline = create_pipeline(
        vlm_backend,  # pyright: ignore[reportArgumentType]
        vlm_server_url,
        vlm_model,
        os.environ.get("OH_MY_PAPER_VLM_API_KEY", ""),
    )
    # Layout detection runs page by page, so recognition of the first page starts after one
    # page's layout rather than after the whole request's.
    pipeline.paddlex_pipeline.layout_det_model.batch_sampler.batch_size = 1
    send(stream, {"event": "ready"})
    for raw in sys.stdin.buffer:
        line = raw.decode("utf-8").strip()
        if not line:
            continue
        try:
            request = ParseRequest.model_validate_json(line)
        except ValidationError:
            traceback.print_exc()
            send(stream, {"event": "failed", "id": "", "reason": "invalid_request"})
            continue
        try:
            parse_pages(pipeline, request, stream)
        except Exception as error:  # noqa: BLE001 - report the failure and keep serving
            traceback.print_exc()
            reason = str(error) if isinstance(error, ParserInputError) else "execution_failed"
            send(stream, {"event": "failed", "id": request.id, "reason": reason})
        else:
            send(stream, {"event": "done", "id": request.id})


if __name__ == "__main__":
    typer.run(main)
