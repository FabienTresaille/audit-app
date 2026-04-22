import sqlite3
import os
from server.config import DB_PATH


def get_db():
    """Get a database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize database tables."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_name TEXT NOT NULL,
            copil_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            total_tickets INTEGER DEFAULT 0,
            recategorized_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            error_message TEXT
        );

        CREATE TABLE IF NOT EXISTS ticket_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            analysis_id INTEGER NOT NULL,
            ticket_number TEXT,
            dit_no_interne TEXT,
            dit_etat TEXT,
            description TEXT,
            resolution TEXT,
            old_category TEXT,
            new_category TEXT,
            old_contract TEXT,
            new_contract TEXT,
            old_delay TEXT,
            new_delay TEXT,
            was_recategorized INTEGER DEFAULT 0,
            ai_reasoning TEXT,
            FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ticket_results_analysis
        ON ticket_results(analysis_id);

        CREATE INDEX IF NOT EXISTS idx_analyses_client
        ON analyses(client_name);
    """)

    conn.commit()
    conn.close()
