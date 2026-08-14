from datetime import datetime
from sqlalchemy import String, Text, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Book(Base):
    __tablename__ = "books"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    author: Mapped[str] = mapped_column(String(200), default="Unknown author")
    format: Mapped[str] = mapped_column(String(20))
    filename: Mapped[str] = mapped_column(String(500))
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    chapters: Mapped[list["Chapter"]] = relationship(cascade="all, delete-orphan", order_by="Chapter.position")
    progress: Mapped["Progress | None"] = relationship(cascade="all, delete-orphan")
    highlights: Mapped[list["Highlight"]] = relationship(cascade="all, delete-orphan")
    bookmarks: Mapped[list["Bookmark"]] = relationship(cascade="all, delete-orphan")

class Chapter(Base):
    __tablename__ = "chapters"
    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(300))
    position: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)

class Progress(Base):
    __tablename__ = "progress"
    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), unique=True)
    chapter_index: Mapped[int] = mapped_column(Integer, default=0)
    locator: Mapped[str] = mapped_column(String(500), default="")
    percentage: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Highlight(Base):
    __tablename__ = "highlights"
    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    chapter_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    anchor: Mapped[str] = mapped_column(String(1000))
    color: Mapped[str] = mapped_column(String(30), default="yellow")
    note: Mapped[str] = mapped_column(Text, default="")

class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")

class Bookmark(Base):
    __tablename__ = "bookmarks"
    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    chapter_index: Mapped[int] = mapped_column(Integer)
    locator: Mapped[str] = mapped_column(String(500))
    label: Mapped[str] = mapped_column(String(300), default="Bookmark")
