CREATE TABLE IF NOT EXISTS conferences (
    id INTEGER PRIMARY KEY,
    short_name TEXT NOT NULL,
    year INTEGER NOT NULL,
    full_name TEXT,
    location TEXT,
    published_date TEXT,
    UNIQUE(short_name, year)
);

CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    conference_id INTEGER NOT NULL REFERENCES conferences(id),
    title TEXT NOT NULL,
    authors TEXT NOT NULL DEFAULT '[]',
    abstract TEXT,
    pdf_url TEXT,
    supp_url TEXT,
    arxiv_url TEXT,
    bibtex TEXT,
    pages TEXT,
    track TEXT,
    detail_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_conference ON papers(conference_id);
CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title);
