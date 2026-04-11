"""
SQL migration runner.

Executes raw .sql migration scripts against the database while keeping
the SQLAlchemy ORM models as the source of truth for application code.

Usage:
    # Apply migrations (up)
    python -m backend.app.db.migrate up

    # Rollback migrations (down)
    python -m backend.app.db.migrate down

    # Check current migration status
    python -m backend.app.db.migrate status

How it works:
    1. A `schema_migrations` tracking table records which migrations have run.
    2. `up` reads every NNN_*_up.sql file not yet applied, executes it, and
       logs the version.
    3. `down` rolls back the most recent migration using its _down.sql file.
    4. The ORM models in backend/app/models/ stay in sync with the SQL —
       they are the application-level representation of the same schema.

This approach gives you:
    - Version-controlled, reviewable SQL migrations
    - ORM convenience for application queries
    - Explicit up/down scripts for CI and production deploys
"""

import sys
import os
from pathlib import Path
from sqlalchemy import text
from backend.app.db.session import engine


MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _ensure_tracking_table(conn):
    """Create the schema_migrations table if it doesn't exist."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     VARCHAR   PRIMARY KEY,
            applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.commit()


def _applied_versions(conn) -> set:
    """Return set of already-applied migration versions."""
    rows = conn.execute(text("SELECT version FROM schema_migrations")).fetchall()
    return {row[0] for row in rows}


def _discover_migrations(direction: str) -> list[tuple[str, Path]]:
    """
    Find all migration files for the given direction (up/down).
    Returns sorted list of (version, filepath) tuples.
    """
    pattern = f"*_{direction}.sql"
    files = sorted(MIGRATIONS_DIR.glob(pattern))
    result = []
    for f in files:
        # Extract version from filename: "001_initial_schema_up.sql" → "001"
        version = f.name.split("_")[0]
        result.append((version, f))
    return result


def migrate_up():
    """Apply all pending up migrations in order."""
    with engine.connect() as conn:
        _ensure_tracking_table(conn)
        applied = _applied_versions(conn)

        migrations = _discover_migrations("up")
        pending = [(v, f) for v, f in migrations if v not in applied]

        if not pending:
            print("Nothing to migrate — all migrations already applied.")
            return

        for version, filepath in pending:
            print(f"Applying migration {version}: {filepath.name}")
            sql = filepath.read_text()
            # Execute each statement separately (split on semicolons)
            for statement in sql.split(";"):
                statement = statement.strip()
                if statement and not statement.startswith("--"):
                    conn.execute(text(statement))
            conn.execute(
                text("INSERT INTO schema_migrations (version) VALUES (:v)"),
                {"v": version},
            )
            conn.commit()
            print(f"  ✓ Applied {version}")

    print("All migrations applied.")


def migrate_down():
    """Roll back the most recently applied migration."""
    with engine.connect() as conn:
        _ensure_tracking_table(conn)
        applied = _applied_versions(conn)

        if not applied:
            print("Nothing to roll back — no migrations have been applied.")
            return

        latest = sorted(applied)[-1]

        # Find the corresponding down file
        down_files = _discover_migrations("down")
        down_map = {v: f for v, f in down_files}

        if latest not in down_map:
            print(f"ERROR: No down migration found for version {latest}")
            sys.exit(1)

        filepath = down_map[latest]
        print(f"Rolling back migration {latest}: {filepath.name}")
        sql = filepath.read_text()
        for statement in sql.split(";"):
            statement = statement.strip()
            if statement and not statement.startswith("--"):
                conn.execute(text(statement))
        conn.execute(
            text("DELETE FROM schema_migrations WHERE version = :v"),
            {"v": latest},
        )
        conn.commit()
        print(f"  ✓ Rolled back {latest}")


def migrate_status():
    """Show which migrations have been applied."""
    with engine.connect() as conn:
        _ensure_tracking_table(conn)
        applied = _applied_versions(conn)
        all_migrations = _discover_migrations("up")

        print(f"{'Version':<10} {'File':<40} {'Status'}")
        print("-" * 65)
        for version, filepath in all_migrations:
            status = "applied" if version in applied else "pending"
            print(f"{version:<10} {filepath.name:<40} {status}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("up", "down", "status"):
        print("Usage: python -m backend.app.db.migrate [up|down|status]")
        sys.exit(1)

    command = sys.argv[1]
    if command == "up":
        migrate_up()
    elif command == "down":
        migrate_down()
    elif command == "status":
        migrate_status()
