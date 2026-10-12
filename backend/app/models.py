"""The API's board invariants, shared by manual and assistant writes."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Identifier = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,100}$")]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(max_length=5000)]
FIXED_COLUMNS = ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Card(StrictModel):
    id: Identifier
    title: Title
    details: Details


class Column(StrictModel):
    id: Identifier
    title: Title
    cardIds: list[Identifier] = Field(max_length=500)


class Board(StrictModel):
    revision: int = Field(ge=0)
    columns: list[Column] = Field(min_length=5, max_length=5)
    cards: dict[Identifier, Card] = Field(max_length=500)

    @model_validator(mode="after")
    def validate_membership(self) -> Self:
        if [column.id for column in self.columns] != FIXED_COLUMNS:
            raise ValueError("The five fixed columns must retain their IDs and order.")
        ids = [card_id for column in self.columns for card_id in column.cardIds]
        if len(ids) != len(set(ids)) or set(ids) != set(self.cards):
            raise ValueError("Each card must belong to exactly one column.")
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("Card IDs must match their dictionary keys.")
        if set(self.cards) & set(FIXED_COLUMNS):
            raise ValueError("Card and column IDs must be distinct.")
        return self


class BoardWrite(StrictModel):
    board: Board


class Login(StrictModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=100)


class ChatEntry(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=5000)


class AIRequest(StrictModel):
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    revision: int = Field(ge=0)
    conversation: list[ChatEntry] = Field(default_factory=list, max_length=20)
