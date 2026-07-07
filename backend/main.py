import shutil
import mimetypes
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm

from backend.config import settings
from backend.database import (
    init_db,
    create_user, get_all_users, delete_user_data,
    add_document, update_document_status, get_user_documents,
    delete_document, get_document_by_hash, add_document_chunks, get_document_by_id,
    create_conversation, get_user_conversations, get_conversation_by_id,
    add_message, get_conversation_messages, delete_conversation
)
from backend.document_processor import calculate_file_hash, process_document
from backend.vector_store import get_embeddings_batch, search_similar_chunks
from backend.gemini_service import generate_answer_from_context
from backend.auth import get_current_user, create_access_token, verify_password, get_password_hash

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    conversation_id: Optional[int] = None

class SettingsRequest(BaseModel):
    api_key: str

class RegisterRequest(BaseModel):
    username: str
    password: str

@app.on_event("startup")
def startup_event():
    init_db()

# --- AUTH & USER ENDPOINTS ---

@app.post("/api/auth/register")
def register_user(req: RegisterRequest):
    from backend.database import create_user, get_user_by_username
    from backend.auth import get_password_hash
    if get_user_by_username(req.username):
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # All users registering via the web are forced to 'user' role for security.
    user_id = create_user(req.username, get_password_hash(req.password), role="user")
    return {"status": "success", "user_id": user_id, "username": req.username}

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    from backend.database import get_user_by_username
    user = get_user_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user["id"], "username": user["username"], "role": user["role"]}}

@app.get("/api/auth/users")
def list_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return get_all_users()

@app.delete("/api/auth/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if current_user["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    delete_user_data(user_id)
    return {"status": "success"}

# --- SETTINGS ---
@app.get("/api/settings")
def get_settings():
    has_key = len(settings.GEMINI_API_KEY) > 0
    return {"has_api_key": has_key}

@app.post("/api/settings")
def save_settings(req: SettingsRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if not req.api_key.strip():
        raise HTTPException(status_code=400, detail="API Key cannot be empty.")
    settings.set_api_key(req.api_key.strip())
    return {"status": "success", "message": "API Key saved successfully."}

# --- DOCUMENT ENDPOINTS ---

def process_uploaded_document_task(doc_id: int, file_path: Path, file_type: str):
    try:
        chunks_data = process_document(file_path, file_type)
        if not chunks_data:
            update_document_status(doc_id, "error")
            return
            
        texts = [c["text"] for c in chunks_data]
        embeddings = get_embeddings_batch(texts)
        
        db_chunks = []
        for idx, chunk in enumerate(chunks_data):
            emb = embeddings[idx]
            db_chunks.append({
                "doc_id": doc_id,
                "chunk_index": idx,
                "text": chunk["text"],
                "page_number": chunk.get("page_number"),
                "section_heading": chunk.get("section_heading"),
                "embedding": emb
            })
            
        add_document_chunks(db_chunks)
        update_document_status(doc_id, "active")
    except Exception as e:
        print(f"Error processing document task (ID {doc_id}): {e}")
        update_document_status(doc_id, "error")

@app.post("/api/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    filename = file.filename
    suffix = Path(filename).suffix.lower()
    allowed_suffixes = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.csv', '.txt', '.md']
    if suffix not in allowed_suffixes:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{suffix}'")
        
    file_bytes = await file.read()
    file_hash = calculate_file_hash(file_bytes)
    
    existing_docs = get_user_documents(current_user["id"])
    existing_doc = next((d for d in existing_docs if d["file_hash"] == file_hash or d["filename"] == filename), None)
    
    if existing_doc:
        if existing_doc["status"] == "active":
            raise HTTPException(status_code=409, detail=f"'{filename}' already indexed.")
        elif existing_doc["status"] == "processing":
            raise HTTPException(status_code=409, detail=f"'{filename}' is currently processing.")
        else:
            delete_document(existing_doc["id"], current_user["id"])
            
    dest_path = settings.UPLOAD_DIR / f"{current_user['id']}_{filename}"
    with open(dest_path, "wb") as buffer:
        buffer.write(file_bytes)
        
    doc_id = add_document(current_user["id"], filename, file_hash, suffix)
    background_tasks.add_task(process_uploaded_document_task, doc_id, dest_path, suffix)
    
    return {"status": "success", "doc_id": doc_id, "filename": filename}

@app.get("/api/documents")
def list_documents(current_user: dict = Depends(get_current_user)):
    return get_user_documents(current_user["id"])

@app.delete("/api/documents/{doc_id}")
def remove_document(doc_id: int, current_user: dict = Depends(get_current_user)):
    try:
        delete_document(doc_id, current_user["id"])
        return {"status": "success", "message": "Document deleted"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not authorized")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/{doc_id}/open")
def open_document(doc_id: int, token: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    # Note: When opening in a new tab, the JWT header isn't sent.
    # The frontend adds ?token=... to the URL which we could manually verify here,
    # but to make things easy, we'll verify it.
    
    # If a query token was provided instead of a header (which happens on window.open)
    if token:
        from backend.auth import get_current_user, SECRET_KEY, ALGORITHM
        from jose import jwt, JWTError
        from backend.database import get_user_by_username
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username = payload.get("sub")
            user = get_user_by_username(username)
            if user:
                current_user = user
            else:
                raise HTTPException(status_code=401, detail="Invalid token")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")

    doc = get_document_by_id(doc_id)
    if not doc or doc["user_id"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Document not found")
        
    file_path = settings.UPLOAD_DIR / f"{current_user['id']}_{doc['filename']}"
    if not file_path.exists():
        file_path = settings.UPLOAD_DIR / doc['filename']
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
            
    media_type, _ = mimetypes.guess_type(file_path.name)
    return FileResponse(
        path=file_path,
        filename=doc["filename"],
        media_type=media_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{doc["filename"]}"'}
    )

# --- CONVERSATION & QUERY ---
@app.get("/api/conversations")
def get_conversations(current_user: dict = Depends(get_current_user)):
    return get_user_conversations(current_user["id"])

@app.get("/api/conversations/{conv_id}/messages")
def get_messages(conv_id: int, current_user: dict = Depends(get_current_user)):
    try:
        return get_conversation_messages(conv_id, current_user["id"])
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not authorized")

@app.delete("/api/conversations/{conv_id}")
def del_conversation(conv_id: int, current_user: dict = Depends(get_current_user)):
    try:
        delete_conversation(conv_id, current_user["id"])
        return {"status": "success"}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Not authorized")

@app.post("/api/query")
def query_knowledge_base(req: QueryRequest, current_user: dict = Depends(get_current_user)):
    query = req.query
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    retrieved_chunks = search_similar_chunks(query, current_user["id"], top_k=req.top_k)
    
    result = generate_answer_from_context(query, retrieved_chunks)
    
    grouped_citations = {}
    for cit in result.get("citations", []):
        doc = cit.get("doc_name", "Unknown Document")
        page = cit.get("page_or_section", "Unknown Page")
        excerpt = cit.get("excerpt", "")
        clean_page = page.replace("Page ", "").strip()
        
        if doc not in grouped_citations:
            grouped_citations[doc] = {"doc_name": doc, "pages": [clean_page], "excerpts": [excerpt], "doc_id": None}
        else:
            if clean_page not in grouped_citations[doc]["pages"]:
                grouped_citations[doc]["pages"].append(clean_page)
            grouped_citations[doc]["excerpts"].append(excerpt)
            
    final_citations = []
    for doc, cit in grouped_citations.items():
        matching = next((c for c in retrieved_chunks if c.get("filename") == doc), None)
        cit["doc_id"] = matching.get("doc_id") if matching else None
        pages_str = "Page " + ", ".join(cit["pages"])
        combined_excerpt = "\n\n...\n\n".join(cit["excerpts"])
        final_citations.append({
            "doc_name": cit["doc_name"], "page_or_section": pages_str, 
            "excerpt": combined_excerpt, "doc_id": cit["doc_id"]
        })
        
    conv_id = req.conversation_id
    if not conv_id:
        title = " ".join(query.split()[:5]) + "..."
        conv_id = create_conversation(current_user["id"], title)
        
    add_message(conv_id, "user", query)
    add_message(conv_id, "bot", result.get("answer"), citations=final_citations)
    
    return {
        "conversation_id": conv_id,
        "query": query,
        "answer": result.get("answer"),
        "citations": final_citations,
        "chart": result.get("chart"),
        "retrieved_chunks": [
            {
                "filename": chunk["filename"],
                "text": chunk["text"],
                "page_number": chunk.get("page_number"),
                "section_heading": chunk.get("section_heading"),
                "score": chunk.get("similarity_score", 0.0)
            } for chunk in retrieved_chunks
        ]
    }