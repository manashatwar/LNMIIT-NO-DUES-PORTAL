#!/bin/sh
set -e

# Wait for Postgres to accept connections before migrating (compose's
# depends_on/healthcheck usually covers this, but this makes the image safe
# to run standalone too).
echo "Waiting for database..."
python - <<'PYEOF'
import os
import sys
import time

import dj_database_url
import psycopg2

cfg = dj_database_url.parse(
    os.environ.get("DATABASE_URL", "postgres://nodues:nodues@localhost:5432/nodues")
)

for attempt in range(30):
    try:
        psycopg2.connect(
            dbname=cfg["NAME"], user=cfg["USER"], password=cfg["PASSWORD"],
            host=cfg["HOST"], port=cfg["PORT"],
        ).close()
        break
    except psycopg2.OperationalError:
        time.sleep(1)
else:
    print("Database never became available", file=sys.stderr)
    sys.exit(1)
PYEOF

python manage.py migrate --noinput

exec "$@"
