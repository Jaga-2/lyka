import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from app.database import engine, Base
from app.main import ensure_conversation_workflow_columns
# Import all models to ensure they register on Base
import app.models

print("Ensuring all tables are created in database...")
Base.metadata.create_all(bind=engine)
print("Running conversation and CRM schema workflow column additions...")
ensure_conversation_workflow_columns()
print("Migrations completed successfully!")
