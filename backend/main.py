from dotenv import load_dotenv
load_dotenv()  # must run BEFORE importing auth so Google keys are available

import os
import base64
from datetime import datetime as dt
from email.mime.text import MIMEText

import requests
from fastapi import FastAPI, Depends
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import User, Task, Project, Event, ApprovalRequest, UserMemory, KnowledgeDocument
from agent import run_agent
from rag import add_document, search_knowledge, delete_document
from auth import (
    get_google_auth_url,
    exchange_code_for_tokens,
    get_google_user_info,
    refresh_google_access_token,
    create_session_token,
    get_current_user,
    FRONTEND_URL,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request models ----------
class TaskCreate(BaseModel):
    title: str
    priority: str = "normal"
    due_date: str | None = None

class TaskUpdate(BaseModel):
    title: str | None = None
    priority: str | None = None
    status: str | None = None
    due_date: str | None = None

class ProjectCreate(BaseModel):
    name: str
    status: str = "active"

class EventCreate(BaseModel):
    title: str
    event_time: str | None = None

class ChatMessage(BaseModel):
    message: str
    history: list[dict] = []

class KnowledgeCreate(BaseModel):
    title: str
    content: str

class KnowledgeSearch(BaseModel):
    query: str


def parse_dt(value: str | None):
    if not value:
        return None
    try:
        return dt.fromisoformat(value)
    except ValueError:
        return None


# ---------- Public routes ----------
@app.get("/")
def read_root():
    return {"message": "Workora AI backend is running"}

@app.get("/db-check")
def db_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"database": "connected"}


# ---------- Authentication (Google Sign-In + Gmail permissions) ----------
@app.get("/auth/google/login")
def google_login():
    return RedirectResponse(get_google_auth_url())

@app.get("/auth/google/callback")
def google_callback(code: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error=1")

    try:
        tokens = exchange_code_for_tokens(code)
        info = get_google_user_info(tokens["access_token"])
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error=1")

    email = info.get("email")
    if not email:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error=1")

    user = db.query(User).filter(User.email == email).first()
    is_new = user is None
    if is_new:
        user = User(email=email)
        db.add(user)

    user.name = info.get("name")
    user.picture = info.get("picture")
    # Google only sends a refresh token when consent is granted; keep the old one otherwise
    if tokens.get("refresh_token"):
        user.google_refresh_token = tokens["refresh_token"]
    db.commit()
    db.refresh(user)

    # The very first user to sign in adopts all the old pre-login data (rows with no owner)
    if is_new and db.query(User).count() == 1:
        for model in (Task, Project, Event, ApprovalRequest, UserMemory, KnowledgeDocument):
            db.query(model).filter(model.user_id.is_(None)).update(
                {"user_id": user.id}, synchronize_session=False
            )
        db.commit()

    session_token = create_session_token(user)
    return RedirectResponse(f"{FRONTEND_URL}/?token={session_token}")

@app.get("/auth/me")
def auth_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture,
    }


# ---------- Tasks ----------
@app.post("/tasks")
def create_task(task: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_task = Task(
        user_id=current_user.id,
        title=task.title,
        priority=task.priority,
        due_date=parse_dt(task.due_date),
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@app.get("/tasks")
def list_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Task).filter(Task.user_id == current_user.id).all()

@app.get("/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        return {"error": "Task not found"}
    return task

@app.put("/tasks/{task_id}")
def update_task(task_id: int, task_update: TaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        return {"error": "Task not found"}
    if task_update.title is not None:
        task.title = task_update.title
    if task_update.priority is not None:
        task.priority = task_update.priority
    if task_update.status is not None:
        task.status = task_update.status
    if task_update.due_date is not None:
        task.due_date = parse_dt(task_update.due_date)
    db.commit()
    db.refresh(task)
    return task

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        return {"error": "Task not found"}
    db.delete(task)
    db.commit()
    return {"message": "Task deleted"}


# ---------- Projects ----------
@app.post("/projects")
def create_project(project: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_project = Project(user_id=current_user.id, name=project.name, status=project.status)
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

@app.get("/projects")
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Project).filter(Project.user_id == current_user.id).all()

@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == current_user.id).first()
    if not project:
        return {"error": "Project not found"}
    db.delete(project)
    db.commit()
    return {"message": "Project deleted"}


# ---------- Events (Calendar) ----------
@app.post("/events")
def create_event(event: EventCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_event = Event(
        user_id=current_user.id,
        title=event.title,
        event_time=parse_dt(event.event_time),
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@app.get("/events")
def list_events(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Event).filter(Event.user_id == current_user.id).all()

@app.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == current_user.id).first()
    if not event:
        return {"error": "Event not found"}
    db.delete(event)
    db.commit()
    return {"message": "Event deleted"}


# ---------- Approvals (Human-in-the-Loop) ----------
def send_gmail(user: User, to: str, subject: str, body: str) -> None:
    """Sends an email as the logged-in user through the Gmail API."""
    if not user.google_refresh_token:
        raise Exception("No Gmail permission saved. Please log out and sign in with Google again.")

    access_token = refresh_google_access_token(user.google_refresh_token)

    msg = MIMEText(body or "")
    msg["To"] = to
    msg["Subject"] = subject or "(no subject)"
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    resp = requests.post(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"raw": raw},
    )
    if resp.status_code >= 400:
        raise Exception(f"Gmail API error {resp.status_code}: {resp.text}")

@app.get("/approvals")
def list_approvals(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ApprovalRequest).filter(ApprovalRequest.user_id == current_user.id).all()

@app.post("/approvals/{approval_id}/approve")
def approve_request(approval_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    approval = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == approval_id, ApprovalRequest.user_id == current_user.id
    ).first()
    if not approval:
        return {"error": "Approval not found"}
    if approval.status != "pending":
        return {"error": f"This request was already {approval.status}"}

    approval.status = "approved"
    db.commit()
    db.refresh(approval)

    email_sent = False
    email_error = None

    if approval.action_type == "send_email" and approval.recipient:
        try:
            send_gmail(current_user, approval.recipient, approval.subject, approval.body)
            email_sent = True
        except Exception as e:
            email_sent = False
            email_error = str(e)

    return {
        "id": approval.id,
        "action_type": approval.action_type,
        "recipient": approval.recipient,
        "subject": approval.subject,
        "body": approval.body,
        "status": approval.status,
        "email_sent": email_sent,
        "email_error": email_error,
    }

@app.post("/approvals/{approval_id}/reject")
def reject_request(approval_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    approval = db.query(ApprovalRequest).filter(
        ApprovalRequest.id == approval_id, ApprovalRequest.user_id == current_user.id
    ).first()
    if not approval:
        return {"error": "Approval not found"}
    approval.status = "rejected"
    db.commit()
    db.refresh(approval)
    return approval


# ---------- Knowledge base (RAG) ----------
@app.post("/knowledge")
def add_knowledge(item: KnowledgeCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not item.content.strip():
        return {"error": "Content is empty"}
    doc = add_document(db, current_user.id, item.title.strip() or "Untitled", item.content)
    return {"id": doc.id, "title": doc.title}

@app.get("/knowledge")
def list_knowledge(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    docs = db.query(KnowledgeDocument).filter(KnowledgeDocument.user_id == current_user.id).all()
    return [
        {"id": d.id, "title": d.title, "characters": len(d.content or ""), "created_at": d.created_at}
        for d in docs
    ]

@app.post("/knowledge/search")
def search_knowledge_endpoint(body: KnowledgeSearch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return search_knowledge(db, current_user.id, body.query)

@app.delete("/knowledge/{doc_id}")
def delete_knowledge(doc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not delete_document(db, current_user.id, doc_id):
        return {"error": "Document not found"}
    return {"message": "Document deleted"}


# ---------- Files (generated spreadsheets, etc.) ----------
# Public on purpose: opened via a plain download link, and filenames contain a random id.
@app.get("/files/{filename}")
def get_file(filename: str):
    safe_name = os.path.basename(filename)
    filepath = os.path.join("generated_files", safe_name)
    if not os.path.exists(filepath):
        return {"error": "File not found"}
    return FileResponse(filepath, filename=safe_name)


# ---------- Agent ----------
@app.post("/agent/chat")
async def agent_chat(chat: ChatMessage, current_user: User = Depends(get_current_user)):
    response = await run_agent(
        chat.message,
        user_id=current_user.id,
        history=chat.history,
        user_name=current_user.name,
    )
    return {"response": response}