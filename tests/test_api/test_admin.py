import pytest


@pytest.mark.asyncio
async def test_reviewer_registration_and_admin_approval_flow(client):
    """Test trọn vẹn luồng: Đăng ký Reviewer không mật khẩu -> Admin Approve cấp mật khẩu -> Login thành công."""
    # 1. Register Reviewer (No password provided)
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "reviewer_qa",
            "name": "Lê Văn QA",
            "email": "reviewer_qa@vinfast.vn",
            "role": "reviewer",
            "reason": "Kỹ sư Thẩm định kịch bản VinFast ADAS",
        },
    )
    assert reg_res.status_code == 200
    assert reg_res.json()["status"] == "pending_approval"

    # 2. Login before approval should fail with HTTP 403 (Pending Approval)
    login_fail = await client.post(
        "/api/v1/auth/login",
        json={"username": "reviewer_qa", "password": "any_password"},
    )
    assert login_fail.status_code == 403
    assert "Chờ duyệt" in login_fail.json()["detail"]

    # 3. Admin approves reviewer request
    appr_res = await client.post("/api/v1/admin/users/reviewer_qa/approve")
    assert appr_res.status_code == 200
    user_data = appr_res.json()["user"]
    assert user_data["status"] == "active"
    temp_pass = user_data["temp_password"]
    assert temp_pass and temp_pass.startswith("Pass_")

    # 4. Login after approval with generated temp_password succeeds
    login_ok = await client.post(
        "/api/v1/auth/login",
        json={"username": "reviewer_qa", "password": temp_pass},
    )
    assert login_ok.status_code == 200
    assert login_ok.json()["user"]["username"] == "reviewer_qa"
    assert login_ok.json()["user"]["role"] == "reviewer"


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
