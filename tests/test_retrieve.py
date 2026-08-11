"""Unit tests cho Node 2 (retrieve)."""

from unittest.mock import MagicMock, patch

from src.agents.nodes.retrieve import retrieve_node


@patch("src.agents.nodes.retrieve.get_chroma_client")
def test_retrieve_happy_path(mock_get_chroma, capsys):
    """Test case 1: Mock ChromaDB trả về 3 kịch bản mẫu hợp lệ."""
    mock_client = MagicMock()
    mock_collection = MagicMock()
    mock_get_chroma.return_value = mock_client
    mock_client.get_collection.return_value = mock_collection

    # Mock query result với 3 ví dụ mẫu
    mock_collection.query.return_value = {
        "documents": [
            [
                "Kịch bản 1: Xe máy tạt đầu ô tô ở đường thẳng",
                "Kịch bản 2: Xe máy phanh gấp trên đường cao tốc",
                "Kịch bản 3: Ô tô lấn làn giao lộ",
            ]
        ],
        "metadatas": [
            [
                {"title": "Mẫu 1: Xe máy tạt đầu"},
                {"title": "Mẫu 2: Phanh gấp"},
                {"title": "Mẫu 3: Lấn làn"},
            ]
        ],
        "ids": [["sc_ex_001", "sc_ex_002", "sc_ex_003"]],
    }

    state = {
        "parsed_intent": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "motorcycle",
            "maneuver": "cut_in",
        }
    }

    result = retrieve_node(state, k=3)

    # Kiểm tra query text được ghép đúng
    mock_collection.query.assert_called_once_with(
        query_texts=["Đường đô thị thẳng, Trời quang, Xe máy, Tạt đầu"],
        n_results=3,
    )

    assert "retrieved_examples" in result
    assert "examples" in result
    assert len(result["retrieved_examples"]) == 3
    assert result["retrieved_examples"][0]["id"] == "sc_ex_001"
    assert result["retrieved_examples"][0]["title"] == "Mẫu 1: Xe máy tạt đầu"

    # Kiểm tra log console output
    captured = capsys.readouterr()
    assert "[NODE 2 OUTPUT] Retrieved Examples Count: 3" in captured.out


@patch("src.agents.nodes.retrieve.get_chroma_client")
def test_retrieve_empty_or_missing_db(mock_get_chroma, capsys):
    """Test case 2: ChromaDB rỗng/chưa khởi tạo/gặp lỗi -> Node 2 trả về [] an toàn."""
    mock_get_chroma.side_effect = RuntimeError("ChromaDB collection 'scenarios' does not exist")

    state = {
        "parsed_intent": {
            "road_type": "highway",
            "weather": "rain",
            "actor_type": "car",
            "maneuver": "lane_drift",
        }
    }

    # Không văng exception
    result = retrieve_node(state)

    assert result["retrieved_examples"] == []
    assert result["examples"] == []

    captured = capsys.readouterr()
    assert "[NODE 2 OUTPUT] Retrieved Examples Count: 0" in captured.out


def test_retrieve_with_invalid_intent(capsys):
    """Test case 3: parsed_intent là None/rỗng -> Node 2 xử lý an toàn không văng exception."""
    # State rỗng
    result_empty = retrieve_node({})
    assert result_empty["retrieved_examples"] == []
    assert result_empty["examples"] == []

    # State parsed_intent = None
    result_none = retrieve_node({"parsed_intent": None})
    assert result_none["retrieved_examples"] == []
    assert result_none["examples"] == []

    # State parsed_intent dict rỗng
    result_dict_empty = retrieve_node({"parsed_intent": {}})
    assert result_dict_empty["retrieved_examples"] == []
    assert result_dict_empty["examples"] == []

    captured = capsys.readouterr()
    assert "[NODE 2 OUTPUT] Retrieved Examples Count: 0" in captured.out
