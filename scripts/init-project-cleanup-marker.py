"""Create the local cleanup identity once after verifying the data root and database binding."""
import argparse
from pathlib import Path
from uuid import UUID

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("data_root", type=Path, help="Verified, mounted VEHICSIM_DATA_ROOT")
parser.add_argument("storage_id", type=UUID, help="Existing UUID from project_local_storage in the intended database")
args = parser.parse_args()
if not args.data_root.is_dir():
    parser.error("data root must already exist and be the verified mounted location")
run_root = args.data_root / "runs"
if not run_root.is_dir():
    parser.error("runs directory must already exist and be the verified mounted location")
markers = [args.data_root / ".vsos-storage-id", run_root / ".vsos-storage-id"]
for marker in markers:
    if marker.is_symlink() or (marker.exists() and (
        not marker.is_file() or marker.read_text(encoding="ascii").strip() != str(args.storage_id)
    )):
        parser.error(f"existing marker does not match the database binding: {marker}")
for marker in markers:
    if not marker.exists():
        with marker.open("x", encoding="ascii") as out:
            out.write(str(args.storage_id))
print("Both markers match; keep each on its verified storage with this database.")
