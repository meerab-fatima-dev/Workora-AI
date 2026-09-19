"""
Lightweight RAG for Workora AI.

Embeddings: scikit-learn HashingVectorizer (384 dimensions). This is feature-hash
keyword matching, NOT a neural embedding model. It finds passages that share words
with the question. No downloads and no API cost.

Storage and search: pgvector in Neon, using real cosine-distance search.
"""
from sqlalchemy.orm import Session
from sklearn.feature_extraction.text import HashingVectorizer
from models import KnowledgeDocument, KnowledgeChunk

_vectorizer = HashingVectorizer(
    n_features=384,
    alternate_sign=False,
    norm="l2",
    stop_words="english",
)


def embed(text: str) -> list[float] | None:
    """Turns text into a 384-number vector. Returns None if the text has no usable words."""
    vec = _vectorizer.transform([text]).toarray()[0]
    if not vec.any():
        return None
    return vec.tolist()


def split_into_chunks(text: str, size: int = 120, overlap: int = 20) -> list[str]:
    """Splits text into overlapping chunks of about `size` words."""
    words = text.split()
    if not words:
        return []
    chunks = []
    step = max(size - overlap, 1)
    for start in range(0, len(words), step):
        piece = words[start:start + size]
        if piece:
            chunks.append(" ".join(piece))
        if start + size >= len(words):
            break
    return chunks


def add_document(db: Session, user_id: int, title: str, content: str) -> KnowledgeDocument:
    """Saves a document and stores an embedding for each of its chunks."""
    doc = KnowledgeDocument(user_id=user_id, title=title, content=content)
    db.add(doc)
    db.commit()
    db.refresh(doc)

    for chunk in split_into_chunks(content):
        vector = embed(chunk)
        if vector is None:
            continue
        db.add(KnowledgeChunk(document_id=doc.id, chunk_text=chunk, embedding=vector))
    db.commit()
    return doc


def search_knowledge(db: Session, user_id: int, query: str, k: int = 3) -> list[dict]:
    """Finds the k passages most similar to the query, only from this user's documents."""
    query_vector = embed(query)
    if query_vector is None:
        return []

    distance = KnowledgeChunk.embedding.cosine_distance(query_vector)
    rows = (
        db.query(KnowledgeChunk, KnowledgeDocument.title, distance.label("distance"))
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .filter(KnowledgeDocument.user_id == user_id)
        .order_by(distance)
        .limit(k)
        .all()
    )

    results = []
    for chunk, title, dist in rows:
        similarity = 1 - float(dist)
        if similarity <= 0:
            continue
        results.append({
            "title": title,
            "text": chunk.chunk_text,
            "similarity": round(similarity, 3),
        })
    return results


def delete_document(db: Session, user_id: int, doc_id: int) -> bool:
    """Deletes one of this user's documents and its chunks."""
    doc = db.query(KnowledgeDocument).filter(
        KnowledgeDocument.id == doc_id, KnowledgeDocument.user_id == user_id
    ).first()
    if not doc:
        return False
    db.query(KnowledgeChunk).filter(KnowledgeChunk.document_id == doc.id).delete()
    db.delete(doc)
    db.commit()
    return True