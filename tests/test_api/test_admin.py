import pytest


@pytest.mark.asyncio
async def test_reviewer_approval_emails_temp_password_but_never_returns_it(client, monkeypatch, caplog):
    """Mật khẩu tạm chỉ đi tới email chính chủ — không nằm trong JSON, không nằm trong log.

    Đăng ký / đăng nhập đã chuyển sang ``/auth/*`` mới (test_auth.py); luồng
    duyệt reviewer của Forge cũ còn lại ở ``/admin`` nên vẫn canh chỗ rò này.
    """
    emailed: dict = {}

    def _fake_send(to_email, recipient_name, username, temp_password):
        emailed.update(to=to_email, temp_password=temp_password)
        return True

    monkeypatch.setattr("src.api.routes.send_reviewer_approval_email", _fake_send)

    created = await client.post(
        "/api/v1/admin/users",
        json={
            "username": "reviewer_qa",
            "name": "Lê Văn QA",
            "email": "reviewer_qa@vinfast.vn",
            "role": "reviewer",
            "status": "pending_approval",
        },
    )
    assert created.status_code == 200

    with caplog.at_level("INFO"):
        appr_res = await client.post("/api/v1/admin/users/reviewer_qa/approve")
    assert appr_res.status_code == 200
    user_data = appr_res.json()["user"]
    assert user_data["status"] == "active"
    assert "temp_password" not in user_data

    assert emailed["to"] == "reviewer_qa@vinfast.vn"
    assert emailed["temp_password"].startswith("Pass_")
    assert emailed["temp_password"] not in appr_res.text
    assert emailed["temp_password"] not in caplog.text


@pytest.mark.asyncio
async def test_admin_stats_and_crud(client):
    """Test Admin Stats API & CRUD User endpoints."""
    # 1. Stats
    stats_res = await client.get("/api/v1/admin/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "users" in stats
    assert "scenarios" in stats
    assert stats["users"]["total"] >= 1

    # 2. Create User via Admin CRUD
    create_res = await client.post(
        "/api/v1/admin/users",
        json={
            "username": "new_creator",
            "name": "New Creator User",
            "email": "new_creator@forge.ai",
            "role": "creator",
            "status": "active",
            "password": "creator_pass_123",
        },
    )
    assert create_res.status_code == 200
    assert create_res.json()["user"]["username"] == "new_creator"

    # 3. Update User
    update_res = await client.put(
        "/api/v1/admin/users/new_creator",
        json={"name": "Updated Creator Name", "role": "reviewer"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["user"]["name"] == "Updated Creator Name"
    assert update_res.json()["user"]["role"] == "reviewer"

    # 4. Delete User
    del_res = await client.delete("/api/v1/admin/users/new_creator")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True
