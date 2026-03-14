import os

import psycopg
from dotenv import load_dotenv


def test():
    load_dotenv()
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL is not set")
        return
    try:
        with psycopg.connect(dsn) as conn:
            row = conn.execute("SELECT id, name FROM suppliers LIMIT 1;").fetchone()
            print("Row:", row)
    except Exception as exc:  # noqa: BLE001
        print("Error:", exc)


if __name__ == "__main__":
    test()
