import os
import uuid
import logging
from dotenv import load_dotenv
from datetime import datetime as dt
import openpyxl
from agents import Agent, Runner, function_tool, AsyncOpenAI, OpenAIChatCompletionsModel
from sqlalchemy.orm import Session
from models import Task, Project, Event, ApprovalRequest, UserMemory

load_dotenv()

logger = logging.getLogger("workora.agent")

client = AsyncOpenAI(
    api_key=os.getenv("APINEX_API_KEY"),
    base_url=os.getenv("APINEX_BASE_URL"),
)

# Ordered list of free APInex models. The first is the primary model in normal use.
# If a model call fails (quota exceeded, subscription error, etc.), the next model
# in this list is tried automatically, silently, without the user noticing.
# Reorder this list any time by just changing the order of the strings below.
MODEL_FALLBACK_LIST = [
    "free/glm-5.3-flash",
    "free/gemini-3.8-flash",
    "free/deepseek-v4-pro-0813",
    "free/gemini-3.1-pro",
    "free/gpt-5.6-luna",
    "free/deepseek-v4-flash-0731",
    "free/qwen-3.8-max",
    "free/muse-spark-1.3",
]


def build_tools(user_id: int):
    """Builds the tool list for ONE specific user, so every tool saves data under that user."""

    @function_tool
    def create_task_tool(title: str, priority: str = "normal", due_date: str = "") -> str:
        """Creates a new task with the given title, priority (low, normal, or high), and an optional due_date as an ISO 8601 datetime string, e.g. 2026-09-19T00:00:00. Leave due_date empty if the user didn't specify a date."""
        from database import SessionLocal
        db: Session = SessionLocal()
        parsed_due = None
        if due_date:
            try:
                parsed_due = dt.fromisoformat(due_date)
            except ValueError:
                parsed_due = None
        try:
            task = Task(user_id=user_id, title=title, priority=priority, due_date=parsed_due)
            db.add(task)
            db.commit()
            db.refresh(task)
            task_id = task.id
        finally:
            db.close()
        when = f", due {parsed_due.strftime('%Y-%m-%d')}" if parsed_due else ""
        return f"Created task '{title}' with priority {priority}{when} (id={task_id})"

    @function_tool
    def create_project_tool(name: str) -> str:
        """Creates a new project with the given name."""
        from database import SessionLocal
        db: Session = SessionLocal()
        try:
            project = Project(user_id=user_id, name=name)
            db.add(project)
            db.commit()
            db.refresh(project)
            project_id = project.id
        finally:
            db.close()
        return f"Created project '{name}' (id={project_id})"

    @function_tool
    def create_event_tool(title: str, event_time: str) -> str:
        """Creates a calendar event. event_time must be an ISO 8601 datetime string, e.g. 2026-09-17T15:00:00."""
        from database import SessionLocal
        db: Session = SessionLocal()
        try:
            parsed_time = dt.fromisoformat(event_time)
        except ValueError:
            parsed_time = None
        try:
            event = Event(user_id=user_id, title=title, event_time=parsed_time)
            db.add(event)
            db.commit()
            db.refresh(event)
            event_id = event.id
        finally:
            db.close()
        when = parsed_time.strftime("%Y-%m-%d %H:%M") if parsed_time else "unspecified time"
        return f"Scheduled event '{title}' for {when} (id={event_id})"

    @function_tool
    def draft_email_tool(recipient: str, subject: str, body: str) -> str:
        """Creates a draft email that requires human approval before sending. Does not send anything automatically."""
        from database import SessionLocal
        db: Session = SessionLocal()
        try:
            approval = ApprovalRequest(
                user_id=user_id,
                action_type="send_email",
                recipient=recipient,
                subject=subject,
                body=body,
            )
            db.add(approval)
            db.commit()
        finally:
            db.close()
        return f"I've drafted an email to {recipient} with subject '{subject}'. It's waiting for your approval before sending."

    @function_tool
    def generate_content_tool(topic: str, content_type: str) -> str:
        """Signals that the user wants written content generated, such as an assignment section, summary, or plan."""
        return f"Write a well-structured {content_type} about: {topic}. Return only the finished content, ready to use."

    @function_tool
    def create_spreadsheet_tool(title: str, headers: list[str], rows: list[list[str]]) -> str:
        """Creates a downloadable Excel spreadsheet. headers is a list of column names. rows is a list of rows, where each row is a list of string values matching the headers."""
        os.makedirs("generated_files", exist_ok=True)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = title[:31]
        ws.append(headers)
        for row in rows:
            ws.append(row)
        filename = f"{uuid.uuid4().hex[:8]}_{title.replace(' ', '_')}.xlsx"
        filepath = os.path.join("generated_files", filename)
        wb.save(filepath)
        return f"Created spreadsheet '{title}'. Download it at http://127.0.0.1:8000/files/{filename}"

    @function_tool
    def remember_preference_tool(fact: str) -> str:
        """Saves a fact or preference about the user permanently, so it's remembered in all future conversations. Use this when the user shares a lasting preference, not a one-time task detail."""
        from database import SessionLocal
        db: Session = SessionLocal()
        try:
            memory = UserMemory(user_id=user_id, content=fact)
            db.add(memory)
            db.commit()
        finally:
            db.close()
        return f"Got it, I'll remember: {fact}"

    @function_tool
    def search_knowledge_base_tool(query: str) -> str:
        """Searches the user's saved knowledge base (their own notes and documents) for passages relevant to the query. Use this whenever the user asks a question that may be answered by their own saved notes or documents."""
        from database import SessionLocal
        from rag import search_knowledge
        db: Session = SessionLocal()
        try:
            results = search_knowledge(db, user_id, query, k=3)
        finally:
            db.close()
        if not results:
            return "No relevant passages were found in the user's knowledge base."
        parts = [f"[From '{r['title']}' (match {r['similarity']})]: {r['text']}" for r in results]
        return "Relevant passages from the user's knowledge base:\n\n" + "\n\n".join(parts)

    @function_tool
    def save_to_knowledge_base_tool(title: str, content: str) -> str:
        """Saves a document or note into the user's knowledge base so it can be searched later. Use this when the user asks to save, store, or add something to their knowledge base."""
        from database import SessionLocal
        from rag import add_document
        db: Session = SessionLocal()
        try:
            doc = add_document(db, user_id, title, content)
            doc_id = doc.id
        finally:
            db.close()
        return f"Saved '{title}' to the knowledge base (id={doc_id})."

    return [
        create_task_tool,
        create_project_tool,
        create_event_tool,
        draft_email_tool,
        generate_content_tool,
        create_spreadsheet_tool,
        remember_preference_tool,
        search_knowledge_base_tool,
        save_to_knowledge_base_tool,
    ]


BASE_INSTRUCTIONS = (
    "You are Workora AI, a helpful work assistant. "
    "When the user asks to create a task, use create_task_tool, converting any relative date (like 'tomorrow' or 'next Monday') into a full ISO 8601 datetime for due_date when a date is mentioned. "
    "When the user asks to create a project, use create_project_tool. "
    "When the user asks to schedule a meeting or event, use create_event_tool, converting any relative time (like 'tomorrow at 3pm') into a full ISO 8601 datetime. "
    "When the user asks to draft, write, or send an email, use draft_email_tool to create a draft that requires human approval before sending — never claim it was actually sent. "
    "When the user asks you to write, draft, or generate content such as an assignment section, a summary, or a plan (not a task/project/event/email), use generate_content_tool and then write the actual requested content yourself in your final response. "
    "When the user asks you to create a spreadsheet, table, or Excel file, use create_spreadsheet_tool with sensible headers and rows based on their request. "
    "When the user shares a lasting preference or fact about themselves (not a one-time task), use remember_preference_tool to save it. "
    "When the user asks a question that could be answered from their own saved notes or documents, use search_knowledge_base_tool first and answer using the returned passages, mentioning which document they came from; if nothing relevant is found, say so honestly instead of guessing. "
    "When the user asks you to save, store, or add a note or document to their knowledge base, use save_to_knowledge_base_tool. "
    "Use the conversation history to understand references like 'it', 'that', or follow-up details — the user may complete a request across multiple messages."
)


def get_stored_memories(user_id: int) -> list[str]:
    from database import SessionLocal
    db: Session = SessionLocal()
    try:
        memories = db.query(UserMemory).filter(UserMemory.user_id == user_id).all()
        return [m.content for m in memories]
    finally:
        db.close()


async def run_agent(
    message: str,
    user_id: int,
    history: list[dict] | None = None,
    user_name: str | None = None,
) -> str:
    memories = get_stored_memories(user_id)
    now = dt.now()
    instructions = BASE_INSTRUCTIONS + f"\n\nToday's actual date is {now.strftime('%Y-%m-%d')} ({now.strftime('%A')}). Use this as the real current date for any relative date calculations like 'tomorrow' or 'next week'."

    if user_name:
        instructions += f"\n\nThe user you are helping is named {user_name}."

    if memories:
        memory_text = "\n".join(f"- {m}" for m in memories)
        instructions += f"\n\nKnown facts and preferences about this user, remembered from past conversations:\n{memory_text}"

    tools = build_tools(user_id)

    input_items = []
    if history:
        for h in history:
            input_items.append({"role": h["role"], "content": h["content"]})
    input_items.append({"role": "user", "content": message})

    # Try each model in MODEL_FALLBACK_LIST in order. If one fails (e.g. quota
    # or subscription error), silently move to the next one. The user never
    # sees which model actually answered — only a log entry records it.
    last_error = None
    for index, model_name in enumerate(MODEL_FALLBACK_LIST):
        try:
            model = OpenAIChatCompletionsModel(
                model=model_name,
                openai_client=client,
            )
            dynamic_agent = Agent(
                name="Workora AI",
                instructions=instructions,
                tools=tools,
                model=model,
            )
            result = await Runner.run(dynamic_agent, input_items)
            if index > 0:
                logger.warning(
                    f"Workora AI: primary model unavailable, served this response using "
                    f"fallback model '{model_name}' (attempt {index + 1} of {len(MODEL_FALLBACK_LIST)})."
                )
            return result.final_output
        except Exception as e:
            last_error = e
            logger.warning(
                f"Workora AI: model '{model_name}' failed ({e}). "
                f"Trying next model in fallback list."
            )
            continue

    # Every model in the list failed.
    logger.error(f"Workora AI: all models in fallback list failed. Last error: {last_error}")
    return "Sorry, I'm having trouble reaching any AI model right now. Please try again in a few minutes."