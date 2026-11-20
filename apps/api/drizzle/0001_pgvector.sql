-- pgvector must exist before the law_articles embedding column and HNSW index.
CREATE EXTENSION IF NOT EXISTS vector;
