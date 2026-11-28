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
marker = args.data_root / ".vsos-storage-id"
with marker.open("x", encoding="ascii") as out:
    out.write(str(args.storage_id))
print(f"Created {marker}; keep it with this data root and database.")
