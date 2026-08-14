from io import BytesIO

def upload_text(client, title="Pride and Prejudice"):
    body = b"CHAPTER 1\nIt is a truth universally acknowledged.\n\nCHAPTER 2\nMr Bennet was among the earliest of those who waited on Mr Bingley."
    response = client.post("/api/books", files={"file": (f"{title}.txt", BytesIO(body), "text/plain")})
    assert response.status_code == 201
    return response.json()

def test_upload_lists_and_reads_text_book(client):
    book = upload_text(client)
    assert book["title"] == "Pride and Prejudice"
    assert len(book["chapters"]) == 2
    assert client.get("/api/books").json()[0]["id"] == book["id"]

def test_progress_annotations_search_and_bookmark(client):
    book = upload_text(client)
    book_id = book["id"]
    progress = client.put(f"/api/books/{book_id}/progress", json={"chapter_index": 1, "locator": "p:2", "percentage": 51}).json()
    assert progress["percentage"] == 51
    highlight = client.post(f"/api/books/{book_id}/highlights", json={"chapter_index": 0, "text": "truth universally", "anchor": "quote:truth", "color": "yellow", "note": "Opening claim"}).json()
    assert highlight["note"] == "Opening claim"
    assert client.get(f"/api/books/{book_id}/search", params={"q": "Bingley"}).json()[0]["chapter_index"] == 1
    assert client.post(f"/api/books/{book_id}/bookmarks", json={"chapter_index": 1, "locator": "p:2", "label": "Chapter 2"}).status_code == 201

def test_spoiler_protection_filters_future_chapters(client):
    book = upload_text(client)
    answer = client.post(f"/api/books/{book['id']}/ask", json={"question": "Who waited on Bingley?", "selected_text": "", "chapter_index": 0, "spoiler_protection": True}).json()
    assert all(source["chapter_index"] <= 0 for source in answer["sources"])
    unrestricted = client.post(f"/api/books/{book['id']}/ask", json={"question": "Who waited on Bingley?", "selected_text": "", "chapter_index": 0, "spoiler_protection": False}).json()
    assert any(source["chapter_index"] == 1 for source in unrestricted["sources"])

def test_openrouter_key_switches_ask_off_mock_and_reports_failures(client, monkeypatch):
    import httpx
    from app import main

    book = upload_text(client)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assert client.post(f"/api/books/{book['id']}/ask", json={"question": "Who waited on Bingley?"}).json()["mock"] is True

    saved = client.put("/api/settings", json={"api_key": "sk-or-v1-test", "model": "some/model:free"}).json()
    assert saved == {"configured": True, "key_hint": "…test", "from_env": False, "model": "some/model:free"}

    sent = {}
    def fake_post(url, **kwargs):
        sent.update(url=url, **kwargs)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Mr Bennet did."}}]}, request=httpx.Request("POST", url))
    monkeypatch.setattr(main.httpx, "post", fake_post)
    answer = client.post(f"/api/books/{book['id']}/ask", json={"question": "Who waited on Bingley?"}).json()
    assert answer["answer"] == "Mr Bennet did." and "mock" not in answer
    assert sent["headers"]["Authorization"] == "Bearer sk-or-v1-test" and sent["json"]["model"] == "some/model:free"

    # an upstream failure must surface as a readable answer, never a 500
    monkeypatch.setattr(main.httpx, "post", lambda url, **kw: httpx.Response(429, json={"error": {"message": "Rate limit exceeded"}}, request=httpx.Request("POST", url)))
    failed = client.post(f"/api/books/{book['id']}/ask", json={"question": "Who waited on Bingley?"})
    assert failed.status_code == 200 and failed.json()["error"] is True
    assert "429" in failed.json()["answer"] and "Rate limit exceeded" in failed.json()["answer"]

def test_highlights_survive_reload_and_export_as_markdown(client):
    book = upload_text(client)
    saved = client.post(f"/api/books/{book['id']}/highlights", json={"chapter_index": 0, "text": "truth universally acknowledged", "anchor": "quote:truth"}).json()
    client.put(f"/api/highlights/{saved['id']}", json={"note": "The famous opening."})
    reloaded = client.get(f"/api/books/{book['id']}").json()["highlights"]
    assert [h["text"] for h in reloaded] == ["truth universally acknowledged"] and reloaded[0]["note"] == "The famous opening."
    export = client.get(f"/api/books/{book['id']}/export.md")
    assert "> truth universally acknowledged" in export.text and "The famous opening." in export.text
    assert client.delete(f"/api/highlights/{saved['id']}").status_code == 204
    assert client.get(f"/api/books/{book['id']}").json()["highlights"] == []

def test_dossier_names_only_what_has_been_read(client):
    body = ("CHAPTER 1\n" + "Bingley called on the house. Bingley smiled at the door, then Bingley left. "
            "See Figure 1. Figure 2 and Figure 3 follow, and Figure 4 closes it. "
            "Later Bingley wrote to the house, and the house wrote back to Bingley.\n\n"
            "CHAPTER 2\n" + "Wickham lied. Wickham lied again. Wickham was believed by everyone, and Wickham knew it. Wickham left.")
    book = client.post("/api/books", files={"file": ("Emma.txt", BytesIO(body.encode()), "text/plain")}).json()
    early = client.get(f"/api/books/{book['id']}/dossier", params={"chapter_index": 0}).json()
    assert any("Bingley" in e["name"] for e in early) and not any("Wickham" in e["name"] for e in early)
    assert not any("House" in e["name"] for e in early)   # "house" is common in lowercase — never a proper noun
    assert not any("Figure" in e["name"] for e in early)  # cross-reference labels are always followed by a number
    assert all(e["chapter_index"] <= 0 and e["first"] for e in early)
    assert any("Wickham" in e["name"] for e in client.get(f"/api/books/{book['id']}/dossier", params={"chapter_index": 1}).json())

def test_deleting_book_removes_it(client):
    book = upload_text(client)
    assert client.delete(f"/api/books/{book['id']}").status_code == 204
    assert client.get("/api/books").json() == []
