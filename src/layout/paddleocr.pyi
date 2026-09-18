from collections.abc import Mapping, Sequence
from typing import Protocol

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]


class PredictionResult(Protocol):
    @property
    def json(self) -> Mapping[str, JsonValue]: ...


class PredictionPipeline(Protocol):
    def predict(self, input: str) -> Sequence[PredictionResult]: ...


class PPStructureV3:
    def __init__(self, **kwargs: bool | str) -> None: ...
    def predict(self, input: str) -> Sequence[PredictionResult]: ...


class PaddleOCRVL:
    def __init__(self, **kwargs: bool | str | Sequence[str]) -> None: ...
    def predict(
        self, input: str, **kwargs: bool | float | str | Sequence[str]
    ) -> Sequence[PredictionResult]: ...
