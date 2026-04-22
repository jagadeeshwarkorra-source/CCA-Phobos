#!/bin/bash
set -e

# Create DB from CSV if it doesn't exist
if [ ! -f src/data/drp.db ]; then
    echo ">>> Initialising database from mock_data.csv..."
    python scripts/csv_to_sqlite.py
    echo ">>> Database ready."
fi

# Create empty scenarios file if it doesn't exist
if [ ! -f src/data/scenarios.json ]; then
    echo ">>> Creating empty scenarios.json..."
    echo "[]" > src/data/scenarios.json
fi

# Start the server
echo ">>> Starting server..."
gunicorn -k uvicorn.workers.UvicornWorker -w 2 --bind 0.0.0.0:8000 main:app
