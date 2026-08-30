# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "paddleocr[doc-parser]==3.7.0",
#   "pydantic>=2.13,<3",
#   "pypdfium2>=5.13,<6",
#   "torch>=2.13,<3",
#   "torchvision>=0.28,<1",
#   "transformers>=5.8,<6",
#   "typer>=0.27,<1",
# ]
# ///
# ─── How to run ───
# uv run src/layout/pp_structure_layout.py INPUT.pdf OUTPUT.json

from contextlib import closing
from hashlib import file_digest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Final, Literal

import pypdfium2 as pdfium
import typer
from paddlex import create_model
from pydantic import BaseModel, ConfigDict, Field

RENDER_SCALE: Final = 2
MIN_SCORE: Final = 0.5
TARGET_LABELS: Final = frozenset(
    {"table", "chart", "image", "paragraph_title", "doc_title", "figure_title"}
)


class RawLayoutBox(BaseModel):
    model_config = ConfigDict(frozen=True)

    label: str
    score: float = Field(ge=0, le=1)
    coordinate: tuple[float, float, float, float]


class RawLayoutResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    boxes: tuple[RawLayoutBox, ...]


class RawEnvelope(BaseModel):
    model_config = ConfigDict(frozen=True)

    res: RawLayoutResult


class LayoutBox(BaseModel):
    model_config = ConfigDict(frozen=True)

    label: str
    score: float
    x: float
    y: float
    width: float
    height: float


class LayoutPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    pageNumber: int = Field(gt=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    boxes: tuple[LayoutBox, ...]


class LayoutDocument(BaseModel):
    model_config = ConfigDict(frozen=True)

    version: int = Field(default=2, ge=2, le=2)
    model: Literal["PP-DocLayout_plus-L"] = "PP-DocLayout_plus-L"
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    pages: tuple[LayoutPage, ...]


def render_pages(pdf_path: Path, directory: Path) -> tuple[tuple[Path, int, int], ...]:
    rendered: list[tuple[Path, int, int]] = []
    with pdfium.PdfDocument(pdf_path) as document:
        for index in range(len(document)):
            with closing(document[index]) as page, closing(
                page.render(scale=RENDER_SCALE)
            ) as bitmap, bitmap.to_pil() as image:
                image_path = directory / f"page-{index + 1}.png"
                image.save(image_path, format="PNG")
                rendered.append((image_path, image.width, image.height))
    return tuple(rendered)


def convert_box(box: RawLayoutBox) -> LayoutBox | None:
    if box.label not in TARGET_LABELS or box.score < MIN_SCORE:
        return None
    x1, y1, x2, y2 = box.coordinate
    if x2 <= x1 or y2 <= y1:
        return None
    return LayoutBox(
        label=box.label,
        score=box.score,
        x=x1,
        y=y1,
        width=x2 - x1,
        height=y2 - y1,
    )


def main(pdf_path: Path, output_path: Path) -> None:
    """Run the PP-StructureV3 layout detector once and save page-local boxes."""
    with TemporaryDirectory(prefix="scourgify-layout-") as temporary:
        rendered = render_pages(pdf_path, Path(temporary))
        model = create_model("PP-DocLayout_plus-L", engine="transformers", device="cpu")
        predictions = model.predict([str(item[0]) for item in rendered], batch_size=1)
        pages: list[LayoutPage] = []
        for page_number, (rendered_page, result) in enumerate(
            zip(rendered, predictions, strict=True),
            start=1,
        ):
            _, width, height = rendered_page
            raw = RawEnvelope.model_validate(result.json)
            boxes = tuple(
                converted
                for box in raw.res.boxes
                if (converted := convert_box(box)) is not None
            )
            pages.append(
                LayoutPage(pageNumber=page_number, width=width, height=height, boxes=boxes)
            )
    with pdf_path.open("rb") as source:
        source_hash = file_digest(source, "sha256").hexdigest()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        LayoutDocument(sourceHash=source_hash, pages=tuple(pages)).model_dump_json(),
        encoding="utf-8",
    )


if __name__ == "__main__":
    typer.run(main)
