# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "paddleocr[doc-parser]==3.7.0",
#   "pydantic>=2.13,<3",
#   "pypdfium2>=5.13,<6",
#   "typer>=0.27,<1",
# ]
# ///
# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUntypedBaseClass=false
"""Run bounded, offline PP-StructureV3 enrichment for selected PDF regions."""

import json
import os
from contextlib import closing
from hashlib import file_digest
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Final, Literal

import pypdfium2 as pdfium
import typer
from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION: Final = "1.0.0"
MODEL: Final = "PP-StructureV3"
MODEL_VERSION: Final = "paddleocr-3.7.0"
ORIGIN: Final = "local_pp_structure_v3"
SCALE: Final = 2
type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]


class Bounds(BaseModel):
    model_config = ConfigDict(frozen=True)

    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class Target(BaseModel):
    model_config = ConfigDict(frozen=True)

    pageNumber: int = Field(gt=0)
    kind: Literal["scanned", "low_text", "table", "formula", "chart", "low_confidence"]
    bounds: Bounds | None = None
    confidence: float = Field(ge=0, le=1)
    sourceTextStrength: Literal["strong", "weak", "none"]


class Request(BaseModel):
    model_config = ConfigDict(frozen=True)

    schemaVersion: Literal["1.0.0"]
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    pdfPath: Path
    targets: tuple[Target, ...] = Field(min_length=1, max_length=8)


class RawBox(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    label: str
    score: float = Field(ge=0, le=1)
    coordinate: tuple[float, float, float, float]


class RawLayout(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    boxes: tuple[RawBox, ...] = ()


class RawOcr(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    rec_texts: tuple[str, ...] = ()
    rec_scores: tuple[float, ...] = ()
    rec_boxes: tuple[tuple[float, float, float, float], ...] = ()


class RawPayload(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    layout_det_res: RawLayout | None = None
    overall_ocr_res: RawOcr | None = None


class RawEnvelope(RawPayload):
    res: RawPayload | None = None


def unavailable(request: Request, detail: str) -> dict[str, JsonValue]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "unavailable",
        "sourceHash": request.sourceHash,
        "reason": "local_enrichment_unavailable",
        "detail": detail,
        "requestedTargetCount": len(request.targets),
    }


def model_cache_ready(targets: tuple[Target, ...]) -> bool:
    cache_root = Path(os.environ.get("PADDLE_PDX_CACHE_HOME", Path.home() / ".paddlex"))
    model_root = cache_root / "official_models"
    names = {"PP-DocLayout_plus-L", "PP-OCRv5_server_det", "PP-OCRv5_server_rec"}
    kinds = {target.kind for target in targets}
    if "table" in kinds:
        names.update({"PP-LCNet_x1_0_table_cls", "SLANeXt_wired", "SLANet_plus"})
    if "formula" in kinds:
        names.add("PP-FormulaNet-L")
    if "chart" in kinds:
        names.add("PP-Chart2Table")
    return all(any(model_root.glob(f"{name}*")) for name in names)


def render_targets(
    request: Request, directory: Path
) -> tuple[tuple[Target, Path], ...]:
    rendered: list[tuple[Target, Path]] = []
    with pdfium.PdfDocument(request.pdfPath) as document:
        for index, target in enumerate(request.targets):
            if target.pageNumber > len(document):
                continue
            with (
                closing(document[target.pageNumber - 1]) as page,
                closing(page.render(scale=SCALE)) as bitmap,
                bitmap.to_pil() as image,
            ):
                output = directory / f"target-{index}.png"
                if target.bounds is None:
                    image.save(output, format="PNG")
                else:
                    bounds = target.bounds
                    crop = (
                        int(bounds.x * SCALE),
                        int(bounds.y * SCALE),
                        int((bounds.x + bounds.width) * SCALE),
                        int((bounds.y + bounds.height) * SCALE),
                    )
                    image.crop(crop).save(output, format="PNG")
                rendered.append((target, output))
    return tuple(rendered)


def bounds_from_coordinate(
    coordinate: tuple[float, float, float, float], target: Target
) -> Bounds | None:
    x1, y1, x2, y2 = coordinate
    if x2 <= x1 or y2 <= y1:
        return None
    origin_x = target.bounds.x if target.bounds is not None else 0
    origin_y = target.bounds.y if target.bounds is not None else 0
    return Bounds(
        x=origin_x + x1 / SCALE,
        y=origin_y + y1 / SCALE,
        width=(x2 - x1) / SCALE,
        height=(y2 - y1) / SCALE,
    )


def record(
    record_kind: str,
    index: int,
    target_index: int,
    target: Target,
    bounds: Bounds,
    text: str | None,
    confidence: float,
) -> dict[str, JsonValue]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": f"local:{record_kind}:{target_index}:{index}",
        "kind": record_kind,
        "targetKind": target.kind,
        "pageNumber": target.pageNumber,
        "bounds": bounds.model_dump(),
        "text": text,
        "confidence": max(0, min(1, confidence)),
        "origin": ORIGIN,
        "model": MODEL,
        "modelVersion": MODEL_VERSION,
        "sourceTextPolicy": "preserve_source"
        if target.sourceTextStrength == "strong"
        else "ocr_fallback",
    }


def extract_records(
    result: RawPayload, target: Target, target_index: int
) -> list[dict[str, JsonValue]]:
    records: list[dict[str, JsonValue]] = []
    for index, box in enumerate(
        result.layout_det_res.boxes if result.layout_det_res else ()
    ):
        label = box.label.lower()
        if target.kind == "table" and "table" not in label:
            continue
        if target.kind == "formula" and "formula" not in label:
            continue
        if target.kind == "chart" and not {"chart", "figure", "image"}.intersection(
            {label}
        ):
            continue
        bounds = bounds_from_coordinate(box.coordinate, target)
        if bounds is not None:
            record_kind = (
                "table"
                if "table" in label
                else "formula"
                if "formula" in label
                else "layout"
            )
            records.append(
                record(
                    record_kind, index, target_index, target, bounds, None, box.score
                )
            )
    ocr = result.overall_ocr_res
    if ocr is not None:
        for index, (text, coordinate, confidence) in enumerate(
            zip(ocr.rec_texts, ocr.rec_boxes, ocr.rec_scores, strict=False)
        ):
            if not text.strip():
                continue
            bounds = bounds_from_coordinate(coordinate, target)
            if bounds is not None:
                records.append(
                    record(
                        "ocr",
                        index,
                        target_index,
                        target,
                        bounds,
                        text[:4_000],
                        confidence,
                    )
                )
    return records


def run(request: Request) -> dict[str, JsonValue]:
    if not request.pdfPath.is_file():
        return unavailable(request, "execution_failed")
    with request.pdfPath.open("rb") as source:
        if file_digest(source, "sha256").hexdigest() != request.sourceHash:
            return unavailable(request, "execution_failed")
    if not model_cache_ready(request.targets):
        return unavailable(request, "model_unavailable")
    from paddleocr import PPStructureV3

    kinds = {target.kind for target in request.targets}
    pipeline = PPStructureV3(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        use_seal_recognition=False,
        use_table_recognition="table" in kinds,
        use_formula_recognition="formula" in kinds,
        use_chart_recognition="chart" in kinds,
        lang="en",
        ocr_version="PP-OCRv5",
    )
    with TemporaryDirectory(prefix="scourgify-enrichment-") as temporary:
        rendered = render_targets(request, Path(temporary))
        records: list[JsonValue] = []
        for target_index, (target, image_path) in enumerate(rendered):
            result = next(iter(pipeline.predict(str(image_path))))
            envelope = RawEnvelope.model_validate(result.json)
            payload = envelope.res or envelope
            records.extend(extract_records(payload, target, target_index))
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "ready",
        "sourceHash": request.sourceHash,
        "model": MODEL,
        "modelVersion": MODEL_VERSION,
        "records": records[:256],
    }


def main(input_path: Path, output_path: Path) -> None:
    """Parse one bounded request and write one validated local result."""
    try:
        request = Request.model_validate_json(input_path.read_text(encoding="utf-8"))
        result = run(request)
    except (OSError, ValueError, ImportError, RuntimeError, KeyError):
        result: dict[str, JsonValue] = {
            "status": "unavailable",
            "reason": "local_enrichment_unavailable",
            "detail": "execution_failed",
            "schemaVersion": SCHEMA_VERSION,
            "sourceHash": "0" * 64,
            "requestedTargetCount": 1,
        }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    typer.run(main)
