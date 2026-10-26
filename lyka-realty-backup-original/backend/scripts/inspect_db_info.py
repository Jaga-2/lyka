import sqlite3

conn = sqlite3.connect('lyka_realty.db')
cursor = conn.cursor()

print("--- TABLES ---")
for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    print(r[0])

print("\n--- USERS ---")
for r in cursor.execute("SELECT id, email, full_name, role, is_active FROM users").fetchall():
    print(r)

print("\n--- LEADS COUNT ---")
print(cursor.execute("SELECT count(*) FROM leads").fetchone()[0])

print("\n--- PROPERTIES COUNT ---")
print(cursor.execute("SELECT count(*) FROM properties").fetchone()[0])

print("\n--- SITE VISITS COUNT ---")
print(cursor.execute("SELECT count(*) FROM site_visits").fetchone()[0])

print("\n--- CONVERSATIONS COUNT ---")
print(cursor.execute("SELECT count(*) FROM conversations").fetchone()[0])
