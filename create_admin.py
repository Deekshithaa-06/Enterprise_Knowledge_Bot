import sys
import sqlite3
from getpass import getpass
from backend.config import settings
from backend.auth import get_password_hash
from backend.database import get_db_connection

def drop_old_tables():
    print("Migrating Database Schema for V4 Multi-Tenant...")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS document_chunks")
    cursor.execute("DROP TABLE IF EXISTS documents")
    cursor.execute("DROP TABLE IF EXISTS messages")
    cursor.execute("DROP TABLE IF EXISTS conversations")
    cursor.execute("DROP TABLE IF EXISTS users")
    conn.commit()
    conn.close()
    print("Old tables dropped successfully.")

def main():
    print("========================================")
    print("  Knowledge Bot V4 - Admin Setup Tool")
    print("========================================")
    print("WARNING: Creating an admin account right now will reset the database and clear all old documents.")
    confirm = input("Are you sure you want to proceed? (y/n): ")
    
    if confirm.lower() != 'y':
        print("Operation cancelled.")
        sys.exit(0)
        
    drop_old_tables()
    
    # Initialize the new tables
    from backend.database import init_db
    init_db()
    
    username = input("Enter Admin Username: ").strip()
    if not username:
        print("Username cannot be empty.")
        sys.exit(1)
        
    password = getpass("Enter Admin Password: ")
    if not password:
        print("Password cannot be empty.")
        sys.exit(1)
        
    hashed_pw = get_password_hash(password)
    
    from backend.database import create_user
    try:
        user_id = create_user(username, hashed_pw, role="admin")
        print(f"\nSuccess! Admin account '{username}' created successfully (ID: {user_id}).")
        print("You can now log in to the web interface using these credentials.")
    except Exception as e:
        print(f"\nError creating admin account: {e}")

if __name__ == "__main__":
    main()
