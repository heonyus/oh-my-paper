# pyright: reportMissingImports=false, reportMissingModuleSource=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownLambdaType=false, reportUntypedBaseClass=false, reportUnnecessaryComparison=false

import re
from typing import Final, Literal, assert_never

from pydantic import BaseModel, ConfigDict, Field

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

MOVABLE: Final[frozenset[BlockLabel]] = frozenset(
    {"image", "table", "chart", "equation", "figure_title", "table_title", "footnote"}
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
    configVersion: Literal["page-v2"] = "page-v2"
    pageNumber: int = Field(gt=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    blocks: tuple[ParsedBlock, ...]


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
        case (
            "doc_title"
            | "paragraph_title"
            | "text"
            | "list"
            | "code"
            | "figure_title"
            | "table_title"
            | "header"
            | "footer"
            | "page_number"
            | "aside_text"
            | "footnote"
        ):
            return "markdown"
        case unreachable:
            assert_never(unreachable)


def block_label(block: RawBlock) -> BlockLabel:
    label = LABELS.get(block.block_label.lower(), "unknown")
    if label == "figure_title" and re.match(
        r"^\s*table\s+[0-9]+", block.block_content, re.IGNORECASE
    ):
        return "table_title"
    return label


def source_order(block: RawBlock) -> tuple[int, int]:
    return (
        block.block_order
        if block.block_order is not None
        else 1_000_000 + block.block_id,
        block.block_id,
    )


def equation_number(
    equation: RawBlock,
    raw: tuple[RawBlock, ...],
    page_right: float,
) -> RawBlock | None:
    _x1, y1, x2, y2 = equation.block_bbox
    middle_y = (y1 + y2) / 2
    candidates = [
        block
        for block in raw
        if block_label(block) == "unknown"
        and re.fullmatch(r"\([0-9]+\)", block.block_content.strip())
        and block.block_bbox[0] >= x2
        and block.block_bbox[0] - x2 <= page_right * 0.25
        and abs((block.block_bbox[1] + block.block_bbox[3]) / 2 - middle_y) <= y2 - y1
    ]
    return min(candidates, key=lambda block: block.block_bbox[0], default=None)


def insert_movable(
    fixed: list[ParsedBlock], movable: list[ParsedBlock]
) -> list[ParsedBlock]:
    merged = fixed.copy()
    for block in sorted(movable, key=lambda item: (item.bounds.y, item.bounds.x)):
        bottom = block.bounds.y + block.bounds.height
        index = next(
            (
                position
                for position, item in enumerate(merged)
                if item.bounds.y >= bottom
            ),
            len(merged),
        )
        merged.insert(index, block)
    return merged


def convert_blocks(
    page_number: int, raw: tuple[RawBlock, ...]
) -> tuple[ParsedBlock, ...]:
    page_right = max((block.block_bbox[2] for block in raw), default=1)
    used_numbers: set[int] = set()
    converted: list[ParsedBlock] = []
    for block in sorted(raw, key=source_order):
        if block.block_id in used_numbers:
            continue
        x1, y1, x2, y2 = block.block_bbox
        label = block_label(block)
        content = block.block_content.strip()[:40_000]
        if label == "equation":
            number = equation_number(block, raw, page_right)
            if number:
                used_numbers.add(number.block_id)
                x2 = max(x2, number.block_bbox[2])
                y2 = max(y2, number.block_bbox[3])
                content = f"{content} {number.block_content.strip()}"
        converted.append(
            ParsedBlock(
                id=f"page:{page_number}:block:{block.block_id}",
                label=label,
                order=0,
                bounds=Bounds(x=x1, y=y1, width=x2 - x1, height=y2 - y1),
                content=content,
                contentFormat=content_format(label),
                translationPolicy="exclude" if label in EXCLUDED else "include",
            )
        )
    fixed = [block for block in converted if block.label not in MOVABLE]
    movable = [block for block in converted if block.label in MOVABLE]
    ordered = insert_movable(fixed, movable)
    return tuple(
        block.model_copy(
            update={"id": f"page:{page_number}:block:{order}", "order": order}
        )
        for order, block in enumerate(ordered)
    )
