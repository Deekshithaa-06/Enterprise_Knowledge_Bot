import sqlite3
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from backend.config import settings

def get_db_connection():
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys for cascade deletes
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")

    # Create tables if they do not exist

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            file_type TEXT NOT NULL,
            upload_time TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, file_hash)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            page_number TEXT,
            section_heading TEXT,
            embedding TEXT,
            FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            citations TEXT,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks(doc_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_user_id ON documents(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id)")

    conn.commit()
    conn.close()

# --- User Management ---
def create_user(username: str, hashed_password: str, role: str = "user") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    try:
        cursor.execute("INSERT INTO users (username, hashed_password, role, created_at) VALUES (?, ?, ?, ?)",
                       (username, hashed_password, role, created_at))
        user_id = cursor.lastrowid
        conn.commit()
        return user_id
    except sqlite3.IntegrityError:
        raise ValueError("Username already exists")
    finally:
        conn.close()

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_users() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.role, u.created_at, 
               (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) as document_count
        FROM users u 
        ORDER BY u.created_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_user_data(user_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

# --- Document Management ---
def add_document(user_id: int, filename: str, file_hash: str, file_type: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    upload_time = datetime.now().isoformat()
    try:
        cursor.execute(
            "INSERT INTO documents (user_id, filename, file_hash, file_type, upload_time, status) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, filename, file_hash, file_type, upload_time, "processing")
        )
        doc_id = cursor.lastrowid
        conn.commit()
        return doc_id
    except sqlite3.IntegrityError:
        cursor.execute("SELECT id FROM documents WHERE user_id = ? AND file_hash = ?", (user_id, file_hash))
        row = cursor.fetchone()
        if row:
            return row["id"]
        raise
    finally:
        conn.close()

def update_document_status(doc_id: int, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE documents SET status = ? WHERE id = ?", (status, doc_id))
    conn.commit()
    conn.close()

def get_document_by_hash(user_id: int, file_hash: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE user_id = ? AND file_hash = ?", (user_id, file_hash))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_document_by_id(doc_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_documents(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE user_id = ? ORDER BY upload_time DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def delete_document(doc_id: int, user_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM documents WHERE id = ? AND user_id = ?", (doc_id, user_id))
    if not cursor.fetchone():
        conn.close()
        raise PermissionError("Not authorized to delete this document")
        
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()

def add_document_chunks(chunks: List[Dict[str, Any]]):
    conn = get_db_connection()
    cursor = conn.cursor()
    records = []
    for c in chunks:
        emb_str = json.dumps(c["embedding"]) if c.get("embedding") else None
        records.append((c["doc_id"], c["chunk_index"], c["text"], c.get("page_number"), c.get("section_heading"), emb_str))
        
    cursor.executemany(
        "INSERT INTO document_chunks (doc_id, chunk_index, text, page_number, section_heading, embedding) VALUES (?, ?, ?, ?, ?, ?)",
        records
    )
    conn.commit()
    conn.close()

def get_user_chunks_with_embeddings(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.doc_id, c.chunk_index, c.text, c.page_number, c.section_heading, c.embedding, d.filename
        FROM document_chunks c
        JOIN documents d ON c.doc_id = d.id
        WHERE d.status = 'active' AND d.user_id = ?
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        item = dict(r)
        item["embedding"] = json.loads(item["embedding"]) if item["embedding"] else []
        result.append(item)
    return result

# --- Conversations & Messages ---
def create_conversation(user_id: int, title: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    cursor.execute("INSERT INTO conversations (user_id, title, created_at) VALUES (?, ?, ?)", (user_id, title, created_at))
    conv_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return conv_id

def get_user_conversations(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_conversation_by_id(conv_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations WHERE id = ? AND user_id = ?", (conv_id, user_id))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def add_message(conv_id: int, role: str, text: str, citations: Optional[List[Dict]] = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    cit_str = json.dumps(citations) if citations else None
    cursor.execute("INSERT INTO messages (conversation_id, role, text, timestamp, citations) VALUES (?, ?, ?, ?, ?)",
                   (conv_id, role, text, timestamp, cit_str))
    msg_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return msg_id

def get_conversation_messages(conv_id: int, user_id: int) -> List[Dict[str, Any]]:
    if not get_conversation_by_id(conv_id, user_id):
        raise PermissionError("Not authorized")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC", (conv_id,))
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        item = dict(r)
        item["citations"] = json.loads(item["citations"]) if item["citations"] else None
        result.append(item)
    return result

def delete_conversation(conv_id: int, user_id: int):
    if not get_conversation_by_id(conv_id, user_id):
        raise PermissionError("Not authorized")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()
    conn.close()
