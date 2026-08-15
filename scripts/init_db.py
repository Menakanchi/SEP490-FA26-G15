"""Create the persistence schema from an empty database."""

from src.config import get_settings
from src.services.persistence import ScenarioRepository, make_engine


def main() -> None:
    settings = get_settings()
    repository = ScenarioRepository(make_engine(settings.database_url))
    repository.create_schema()
    print(f"Initialized persistence schema at {settings.database_url}")


if __name__ == "__main__":
    main()
