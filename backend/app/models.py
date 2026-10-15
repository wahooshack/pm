"""The API's request and board invariants, shared by manual and assistant writes."""

from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_TITLE, MAX_DETAILS, MAX_CARDS, MAX_COLUMNS, MAX_LABELS = 200, 5000, 500, 20, 10
Identifier = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,100}$")]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TITLE)]
Details = Annotated[str, StringConstraints(max_length=MAX_DETAILS)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Username = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_.-]{2,31}$")]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=100)]
BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Priority = Literal["low", "medium", "high"]
Role = Literal["owner", "editor", "viewer"]
DEFAULT_COLUMNS = [("col-backlog", "Backlog"), ("col-discovery", "Discovery"), ("col-progress", "In Progress"),
                   ("col-review", "Review"), ("col-done", "Done")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Card(StrictModel):
    id: Identifier
    title: Title
    details: Details
    dueDate: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")] | None = None
    priority: Priority | None = None
    labels: list[Label] = Field(default_factory=list, max_length=MAX_LABELS)
    assignee: Username | None = None

    @model_validator(mode="after")
    def validate_fields(self) -> Self:
        if self.dueDate is not None:
            date.fromisoformat(self.dueDate)
        if len({label.lower() for label in self.labels}) != len(self.labels):
            raise ValueError("Labels must be unique.")
        return self


class Column(StrictModel):
    id: Identifier
    title: Title
    cardIds: list[Identifier] = Field(max_length=MAX_CARDS)


class Board(StrictModel):
    id: int | None = None
    name: BoardName = "Board"
    role: Role | None = None  # Reported on reads; writes derive it from the session.
    revision: int = Field(ge=0)
    columns: list[Column] = Field(min_length=1, max_length=MAX_COLUMNS)
    cards: dict[Identifier, Card] = Field(max_length=MAX_CARDS)

    @model_validator(mode="after")
    def validate_membership(self) -> Self:
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("Column IDs must be unique.")
        ids = [card_id for column in self.columns for card_id in column.cardIds]
        if len(ids) != len(set(ids)) or set(ids) != set(self.cards):
            raise ValueError("Each card must belong to exactly one column.")
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("Card IDs must match their dictionary keys.")
        if set(self.cards) & set(column_ids):
            raise ValueError("Card and column IDs must be distinct.")
        return self


class BoardWrite(StrictModel):
    board: Board


class BoardCreate(StrictModel):
    name: BoardName


class Login(StrictModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=100)


class Register(StrictModel):
    username: Username
    displayName: DisplayName
    password: Password


class ProfileUpdate(StrictModel):
    displayName: DisplayName


class PasswordChange(StrictModel):
    currentPassword: str = Field(max_length=100)
    newPassword: Password


class AdminUserUpdate(StrictModel):
    isActive: bool | None = None
    isAdmin: bool | None = None
    password: Password | None = None


class MemberAdd(StrictModel):
    username: str = Field(max_length=100)
    role: Literal["editor", "viewer"]


class ChatEntry(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=5000)


class AIRequest(StrictModel):
    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    revision: int = Field(ge=0)
    conversation: list[ChatEntry] = Field(default_factory=list, max_length=20)
