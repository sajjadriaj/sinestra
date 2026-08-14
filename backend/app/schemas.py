from pydantic import BaseModel

class ProgressIn(BaseModel):
    chapter_index: int = 0
    locator: str = ""
    percentage: float = 0
class HighlightIn(BaseModel):
    chapter_index: int
    text: str
    anchor: str
    color: str = "yellow"
    note: str = ""
class NoteIn(BaseModel):
    note: str | None = None
    color: str = ""
class BookmarkIn(BaseModel):
    chapter_index: int
    locator: str
    label: str = "Bookmark"
class SettingsIn(BaseModel):
    api_key: str | None = None  # None = leave unchanged, "" = clear
    model: str = ""
class AskIn(BaseModel):
    question: str
    selected_text: str = ""
    chapter_index: int = 0
    spoiler_protection: bool = True
