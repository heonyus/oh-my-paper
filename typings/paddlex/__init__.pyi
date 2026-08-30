from collections.abc import Iterable, Sequence
from typing import Protocol, TypedDict

class LayoutBoxPayload(TypedDict):
    label: str
    score: float
    coordinate: tuple[float, float, float, float]

class LayoutResultPayload(TypedDict):
    boxes: list[LayoutBoxPayload]

class LayoutEnvelopePayload(TypedDict):
    res: LayoutResultPayload

class LayoutPrediction(Protocol):
    @property
    def json(self) -> LayoutEnvelopePayload: ...

class LayoutModel(Protocol):
    def predict(self, input: Sequence[str], batch_size: int = 1) -> Iterable[LayoutPrediction]: ...

def create_model(model_name: str, *, engine: str, device: str) -> LayoutModel: ...
