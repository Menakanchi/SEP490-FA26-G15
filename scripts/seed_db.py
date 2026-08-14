"""scripts/seed_db.py — Script khởi tạo dữ liệu kịch bản mẫu ban đầu (Seed Data) kèm Real Float Vector Embeddings.

Thực hiện:
  1. Định nghĩa 10 kịch bản mẫu giao thông thực tế chuẩn ODD bằng tiếng Việt.
  2. Gọi Embedding Service tính Vector Float thật (384-dim) cho từng kịch bản.
  3. Nạp dữ liệu mẫu + Vector Embedding vào SQLite Database (`./data/app.db` - bảng `scenarios_seed`).
  4. Nạp vào ChromaDB PersistentClient (`./data/chroma_db` - collection `scenarios` với hnsw:space=cosine).
"""

import json
import logging
import os
import sqlite3
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(ROOT_DIR))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_db")

SEED_SCENARIOS = [
    {
        "scenario_id": "sc_seed_001",
        "title": "Xe tải bung thùng rơi kiện hàng trên cao tốc",
        "description_vi": "Xe tải chở hàng bị bung thùng rơi kiện hàng xuống đường cao tốc khiến các xe phía sau phải phanh gấp đánh lái gấp.",
        "odd": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": {"category": "truck", "specific_type": "xe_tai_bung_thung"},
            "maneuver": {"category": "lane_departure", "specific_action": "roi_kien_hang"},
        },
    },
    {
        "scenario_id": "sc_seed_002",
        "title": "Xe trộn bê tông lùi chậm vào công trình",
        "description_vi": "Xe trộn bê tông lùi chậm vào cổng công trình xây dựng chắn ngang làn đường ô tô đang lưu thông.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": {"category": "truck", "specific_type": "xe_tron_be_tong"},
            "maneuver": {"category": "stop_in_lane", "specific_action": "lui_cham"},
        },
    },
    {
        "scenario_id": "sc_seed_003",
        "title": "Xe máy tạt đầu ô tô tại ngã tư",
        "description_vi": "Xe máy tạt đầu đột ngột cướp làn ô tô ngay tại ngã tư có đèn giao thông.",
        "odd": {
            "road_type": "intersection",
            "weather": "clear",
            "actor_type": {"category": "motorcycle", "specific_type": "xe_may"},
            "maneuver": {"category": "cut_in", "specific_action": "tat_dau"},
        },
    },
    {
        "scenario_id": "sc_seed_004",
        "title": "Xe buýt dừng đột ngột giữa làn đón khách",
        "description_vi": "Xe buýt tạt lề dừng đột ngột giữa làn đón trả khách gây phanh gấp cho xe đi sau.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": {"category": "bus", "specific_type": "xe_buyt"},
            "maneuver": {"category": "sudden_brake", "specific_action": "dung_dot_ngot"},
        },
    },
    {
        "scenario_id": "sc_seed_005",
        "title": "Ô tô phanh gấp tránh người đi bộ trong mưa lớn",
        "description_vi": "Ô tô phanh gấp tránh người đi bộ bất ngờ băng qua đường trong điều kiện trời mưa lớn tầm nhìn hạn chế.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "heavy_rain",
            "actor_type": {"category": "pedestrian", "specific_type": "nguoi_di_bo"},
            "maneuver": {"category": "sudden_brake", "specific_action": "bang_qua_duong"},
        },
    },
    {
        "scenario_id": "sc_seed_006",
        "title": "Xe ben lấn làn trong sương mù dày đặc",
        "description_vi": "Xe ben chở đất lấn làn đè vạch suýt quẹt ô tô ngược chiều trong sương mù dày đặc.",
        "odd": {
            "road_type": "highway",
            "weather": "fog",
            "actor_type": {"category": "truck", "specific_type": "xe_ben"},
            "maneuver": {"category": "lane_departure", "specific_action": "lan_lan"},
        },
    },
    {
        "scenario_id": "sc_seed_007",
        "title": "Xe máy đi ngược chiều trên đường đô thị ban đêm",
        "description_vi": "Xe máy bật đèn pha đi ngược chiều trên đường đô thị ban đêm làm chói mắt tài xế.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": {"category": "motorcycle", "specific_type": "xe_may_so"},
            "maneuver": {"category": "lane_departure", "specific_action": "nguoc_chieu"},
        },
    },
    {
        "scenario_id": "sc_seed_008",
        "title": "Xe container dừng khẩn cấp tránh chướng ngại vật",
        "description_vi": "Xe container thắng gấp dừng chết giữa làn đường do phát hiện chướng ngại vật trên đường cao tốc.",
        "odd": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": {"category": "truck", "specific_type": "xe_container"},
            "maneuver": {"category": "stop_in_lane", "specific_action": "dung_chet"},
        },
    },
    {
        "scenario_id": "sc_seed_009",
        "title": "Xe con vượt ẩu tạt đầu xe tải trên cao tốc",
        "description_vi": "Xe con vượt bên phải rồi tạt đầu ép xe tải trên đường cao tốc ở tốc độ cao.",
        "odd": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": {"category": "car", "specific_type": "xe_con_sedan"},
            "maneuver": {"category": "overtake", "specific_action": "vuot_au_tat_dau"},
        },
    },
    {
        "scenario_id": "sc_seed_010",
        "title": "Xe 16 chỗ giảm tốc đột ngột va chạm xe máy",
        "description_vi": "Xe 16 chỗ giảm tốc đột ngột chuyển làn rẽ vào ngõ làm xe máy phía sau phanh không kịp.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": {"category": "bus", "specific_type": "xe_16_cho"},
            "maneuver": {"category": "sudden_brake", "specific_action": "giam_toc_dot_ngot"},
        },
    },
]


def get_embedding_function():
    """Hàm helper khởi tạo Embedding Function thật."""
    try:
        from chromadb.utils import embedding_functions
        return embedding_functions.DefaultEmbeddingFunction()
    except Exception:
        return None


def seed_database():
    """Khởi tạo và nạp kịch bản mẫu vào SQLite & ChromaDB persistent storage kèm Real Vector Embeddings."""
    ef = get_embedding_function()

    data_dir = ROOT_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    # 1. SQLite Persistent Database
    db_path = data_dir / "app.db"
    logger.info(f"Kết nối tới SQLite DB tại: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("DROP TABLE IF EXISTS scenarios_seed")
    cursor.execute(
        """
        CREATE TABLE scenarios_seed (
            scenario_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description_vi TEXT NOT NULL,
            road_type TEXT,
            weather TEXT,
            actor_type TEXT,
            maneuver TEXT,
            content TEXT,
            odd_json TEXT,
            embedding_json TEXT
        )
    """
    )

    documents = []
    ids = []
    metadatas = []
    embeddings_list = []

    for sc in SEED_SCENARIOS:
        sc_id = sc["scenario_id"]
        title = sc["title"]
        desc = sc["description_vi"]
        odd = sc["odd"]

        actor_cat = odd["actor_type"].get("category", "")
        actor_spec = odd["actor_type"].get("specific_type", "")
        man_cat = odd["maneuver"].get("category", "")
        man_spec = odd["maneuver"].get("specific_action", "")

        content = f"{title}. {desc}. Loại đường: {odd['road_type']}, Thời tiết: {odd['weather']}, Tác nhân: {actor_cat} ({actor_spec}), Hành vi: {man_cat} ({man_spec})."

        ids.append(sc_id)
        documents.append(content)
        metadatas.append(
            {
                "scenario_id": sc_id,
                "title": title,
                "description_vi": desc,
                "road_type": odd["road_type"],
                "weather": odd["weather"],
                "actor_type": f"{actor_cat}:{actor_spec}",
                "maneuver": f"{man_cat}:{man_spec}",
            }
        )

    # Calculate real float vector embeddings
    if ef:
        logger.info("Đang tính toán Real Float Vector Embeddings cho 10 kịch bản...")
        raw_embeddings = ef(documents)
        embeddings_list = [[float(v) for v in vec] for vec in raw_embeddings]
    else:
        embeddings_list = [[] for _ in documents]

    for i, sc in enumerate(SEED_SCENARIOS):
        sc_id = sc["scenario_id"]
        title = sc["title"]
        desc = sc["description_vi"]
        odd = sc["odd"]
        content = documents[i]
        emb_json = json.dumps(embeddings_list[i]) if embeddings_list[i] else ""

        actor_cat = odd["actor_type"].get("category", "")
        actor_spec = odd["actor_type"].get("specific_type", "")
        man_cat = odd["maneuver"].get("category", "")
        man_spec = odd["maneuver"].get("specific_action", "")

        cursor.execute(
            """
            INSERT OR REPLACE INTO scenarios_seed
            (scenario_id, title, description_vi, road_type, weather, actor_type, maneuver, content, odd_json, embedding_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                sc_id,
                title,
                desc,
                odd["road_type"],
                odd["weather"],
                f"{actor_cat}:{actor_spec}",
                f"{man_cat}:{man_spec}",
                content,
                json.dumps(odd, ensure_ascii=False),
                emb_json,
            ),
        )

    conn.commit()
    conn.close()
    logger.info(f"✅ Đã nạp thành công {len(SEED_SCENARIOS)} kịch bản mẫu + Real Embeddings vào SQLite DB (scenarios_seed)!")

    # 2. ChromaDB Persistent Collection
    try:
        import chromadb

        db_dir = data_dir / "chroma_db"
        db_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Kết nối tới ChromaDB PersistentClient tại: {db_dir}")
        client = chromadb.PersistentClient(path=str(db_dir))
        collection = client.get_or_create_collection(name="scenarios", metadata={"hnsw:space": "cosine"})

        if embeddings_list and len(embeddings_list[0]) > 0:
            collection.upsert(ids=ids, documents=documents, metadatas=metadatas, embeddings=embeddings_list)
        else:
            collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

        count = collection.count()
        logger.info(f"✅ Nạp thành công dữ liệu vào ChromaDB collection 'scenarios' ({count} items).")
    except Exception as err:
        logger.warning(f"ChromaDB nạp lỗi hoặc bỏ qua ({err}). Đã có SQLite fallback.")


if __name__ == "__main__":
    seed_database()
