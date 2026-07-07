import numpy as np
from typing import List, Dict, Any, Optional
from google import genai
from backend.config import settings
from backend.database import get_user_chunks_with_embeddings

def get_client() -> Optional[genai.Client]:
    """Get initialized Gemini client if API key is present."""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception:
        return None

import time

EMBEDDING_MODEL = "models/gemini-embedding-001"

def _embed_with_retry(client, text: str, max_retries: int = 3) -> Optional[List[float]]:
    """Embed a single text with retry and exponential backoff for rate limits."""
    for attempt in range(max_retries):
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text
            )
            if hasattr(response, "embeddings") and response.embeddings:
                return response.embeddings[0].values
            return None
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower() or "limit" in str(e).lower():
                sleep_time = 2 ** attempt
                print(f"  Rate limited, waiting {sleep_time}s... (attempt {attempt+1}/{max_retries})")
                time.sleep(sleep_time)
            else:
                print(f"  Embedding failed: {e}")
                return None
    return None

def get_embedding(text: str) -> Optional[List[float]]:
    """Generate embedding for a single text."""
    client = get_client()
    if not client:
        return None
    return _embed_with_retry(client, text)

def _embed_batch_with_retry(client, batch_texts: List[str], max_retries: int = 2) -> Optional[List[List[float]]]:
    """Helper to embed a batch with retry logic, completely skipping sequential processing."""
    import time
    for attempt in range(max_retries):
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=batch_texts
            )
            if hasattr(response, 'embeddings') and response.embeddings:
                return [emb.values for emb in response.embeddings]
            return None
        except Exception as e:
            err_msg = str(e).lower()
            if "429" in err_msg or "quota" in err_msg or "limit" in err_msg:
                # If we hit a hard quota limit, don't even retry, just return None immediately to fallback to BM25
                if "quota exceeded" in err_msg:
                    return None
                time.sleep(1) # Small sleep for generic rate limits
            else:
                return None
    return None

def get_embeddings_batch(texts: List[str]) -> List[Optional[List[float]]]:
    """Generate embeddings for a batch of texts using highly optimized batched API calls."""
    client = get_client()
    if not client or not texts:
        return [None] * len(texts)
        
    results = []
    total = len(texts)
    print(f"  Embedding {total} chunks in fast batches...")
    
    # Gemini API supports up to 100 chunks per request! This gives a 20x speedup.
    batch_size = 100 
    try:
        for i in range(0, total, batch_size):
            batch_texts = texts[i:i+batch_size]
            
            # Embed the whole batch at once
            batch_embs = _embed_batch_with_retry(client, batch_texts)
            
            if batch_embs and len(batch_embs) == len(batch_texts):
                results.extend(batch_embs)
            else:
                # If the batch completely fails (e.g., quota exceeded), fill with None
                # DO NOT fall back to sequential processing, as that causes massive delays.
                # The search system will gracefully fall back to BM25 for these chunks.
                results.extend([None] * len(batch_texts))
                
            print(f"  Progress: {min(i+batch_size, total)}/{total}")
            
            # Respect Google Free Tier rate limit (15 Requests Per Minute)
            import time
            time.sleep(4.5)
            
    except Exception as e:
        print(f"  Batch embedding crashed entirely: {e}")
    finally:
        while len(results) < len(texts):
            results.append(None)
    return results

def keyword_search_fallback(query: str, chunks: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
    """Fallback search using BM25 ranking when embeddings are unavailable."""
    import re
    from collections import Counter
    import numpy as np
    
    if not chunks: return []
    
    def tokenize(text):
        return re.findall(r'\w+', text.lower())
        
    query_tokens = tokenize(query)
    stop_words = {"what", "who", "where", "when", "why", "how", "is", "are", "am", "was", "were", "the", "a", "an", "of", "to", "in", "for", "with", "on", "at", "from", "by", "about", "as", "into", "like", "through", "after", "over", "between", "out", "against", "during", "without", "before", "under", "around", "among"}
    query_tokens = [t for t in query_tokens if t not in stop_words]
    
    if not query_tokens:
        return chunks[:top_k]
        
    N = len(chunks)
    chunk_tokens_list = [tokenize(c["text"]) for c in chunks]
    avgdl = sum(len(ct) for ct in chunk_tokens_list) / N if N else 1
    
    # Calculate Document Frequency (DF)
    df = {}
    for ct in chunk_tokens_list:
        unique_terms = set(ct)
        for t in unique_terms:
            df[t] = df.get(t, 0) + 1
            
    # Calculate IDF
    idf = {}
    for q in set(query_tokens):
        n_q = df.get(q, 0)
        idf[q] = np.log(((N - n_q + 0.5) / (n_q + 0.5)) + 1)
        
    # BM25 Parameters
    k1 = 1.5
    b = 0.75
    
    scores = []
    for i, ct in enumerate(chunk_tokens_list):
        score = 0.0
        term_counts = Counter(ct)
        D = len(ct)
        for q in query_tokens:
            if q in term_counts:
                tf = term_counts[q]
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1 - b + b * (D / avgdl))
                score += idf[q] * (numerator / denominator)
        scores.append((score, chunks[i]))
        
    scores.sort(key=lambda x: x[0], reverse=True)
    
    # Normalize scores between 0 and 1 for the UI
    max_score = max((s for s, c in scores), default=1.0)
    if max_score == 0: max_score = 1.0
    
    result = []
    for score, chunk in scores[:top_k]:
        chunk["similarity_score"] = float(score) / max_score
        result.append(chunk)
        
    return result

def search_similar_chunks(query: str, user_id: int, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Search for the most relevant document chunks based on semantic similarity.
    Isolated to the current user's documents.
    """
    from backend.database import get_user_chunks_with_embeddings
    
    # Fetch ALL active chunks for this user from the database
    chunks = get_user_chunks_with_embeddings(user_id)
    if not chunks:
        return []

    # Separate chunks that have valid embeddings from those that don't
    embedded_chunks = [c for c in chunks if c.get("embedding") and len(c["embedding"]) > 0]

    # Always run a baseline BM25 search across ALL chunks (even ones without embeddings!)
    bm25_results = keyword_search_fallback(query, chunks, top_k=top_k)

    client = get_client()
    if not client or not embedded_chunks:
        print("Falling back entirely to BM25 keyword search.")
        return bm25_results

    query_emb = get_embedding(query)
    if not query_emb:
        print("Failed to get query embedding. Falling back entirely to BM25.")
        return bm25_results

    # Semantic search using numpy cosine similarity (only on embedded chunks)
    semantic_results = []
    try:
        chunk_embs = np.array([c["embedding"] for c in embedded_chunks])
        q_emb = np.array(query_emb)

        # Calculate cosine similarity
        dot_products = np.dot(chunk_embs, q_emb)
        chunk_norms = np.linalg.norm(chunk_embs, axis=1)
        q_norm = np.linalg.norm(q_emb)
        similarities = dot_products / (chunk_norms * q_norm + 1e-9)

        for idx, similarity in enumerate(similarities):
            embedded_chunks[idx]["similarity_score"] = float(similarity)

        embedded_chunks.sort(key=lambda x: x.get("similarity_score", 0), reverse=True)
        semantic_results = embedded_chunks[:top_k]
    except Exception as e:
        print(f"Error during semantic search: {e}. Semantic results skipped.")

    # Hybrid Search: Blend Semantic Results and BM25 Results
    combined_results = []
    seen_ids = set()
    
    # Interleave results, prioritizing Semantic
    max_len = max(len(semantic_results), len(bm25_results))
    for i in range(max_len):
        if i < len(semantic_results):
            c = semantic_results[i]
            if c["id"] not in seen_ids:
                combined_results.append(c)
                seen_ids.add(c["id"])
        if i < len(bm25_results):
            c = bm25_results[i]
            if c["id"] not in seen_ids:
                combined_results.append(c)
                seen_ids.add(c["id"])
                
    return combined_results[:top_k]

