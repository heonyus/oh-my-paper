from src.layout.paddle_vl_blocks import ParsedBlock, RawBlock, convert_blocks


def test_convert_blocks_places_visual_regions_at_their_source_position() -> None:
    raw = (
        RawBlock(
            block_bbox=(200, 600, 1000, 680),
            block_label="text",
            block_content="Body after the figure.",
            block_id=2,
            block_order=0,
        ),
        RawBlock(
            block_bbox=(600, 1480, 620, 1510),
            block_label="page_number",
            block_content="3",
            block_id=5,
            block_order=1,
        ),
        RawBlock(
            block_bbox=(380, 120, 840, 470),
            block_label="image",
            block_content="figure.png",
            block_id=0,
            block_order=9,
        ),
        RawBlock(
            block_bbox=(210, 500, 1010, 550),
            block_label="figure_title",
            block_content="Figure 1: Architecture.",
            block_id=1,
            block_order=10,
        ),
    )

    blocks = convert_blocks(3, raw)

    assert [block.label for block in blocks] == [
        "image",
        "figure_title",
        "text",
        "page_number",
    ]


def test_convert_blocks_repairs_table_caption_and_equation_number() -> None:
    raw = (
        RawBlock(
            block_bbox=(210, 140, 1010, 185),
            block_label="figure_title",
            block_content="Table 2: BLEU and training cost.",
            block_id=0,
            block_order=7,
        ),
        RawBlock(
            block_bbox=(255, 190, 960, 485),
            block_label="table",
            block_content="<table><tr><td>39.92</td></tr></table>",
            block_id=1,
            block_order=8,
        ),
        RawBlock(
            block_bbox=(430, 930, 790, 985),
            block_label="equation",
            block_content="$$Attention(Q,K,V)$$",
            block_id=2,
            block_order=2,
        ),
        RawBlock(
            block_bbox=(985, 945, 1010, 970),
            block_label="unknown",
            block_content="(1)",
            block_id=3,
            block_order=3,
        ),
    )

    blocks = convert_blocks(8, raw)

    assert blocks[0].label == "table_title"
    equation: ParsedBlock = next(block for block in blocks if block.label == "equation")
    assert equation.content.endswith("(1)")
    assert all(block.label != "unknown" for block in blocks)
