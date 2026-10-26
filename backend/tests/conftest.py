import os, shutil, tempfile
from pathlib import Path

_TEST_DIR = Path(tempfile.mkdtemp(prefix="sinestra_test_"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test_sinestra.db'}"
os.environ["UPLOAD_DIR"] = str(_TEST_DIR / "books")

import pytest
from fastapi.testclient import TestClient
from app.database import Base, engine
from app.main import UPLOADS, app

@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    shutil.rmtree(UPLOADS, ignore_errors=True)
    UPLOADS.mkdir(parents=True, exist_ok=True)
    yield

@pytest.fixture
def client():
    return TestClient(app)

