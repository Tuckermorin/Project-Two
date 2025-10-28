# Trading Journal Feature

## Overview

The Trading Journal feature has been implemented to allow users to document their trading thoughts, reflections, and insights. All entries are automatically embedded for semantic similarity search, enabling future AI analysis to identify patterns, trends, and psychological insights.

## Database Schema

### Table: `journal_entries`

Located in: [supabase/migrations/20251028_create_journal_entries.sql](supabase/migrations/20251028_create_journal_entries.sql)

**Columns:**
- `id` (UUID) - Primary key
- `user_id` (UUID) - Foreign key to auth.users
- `title` (TEXT) - Entry title (required)
- `content` (TEXT) - Full journal content (required)
- `week_of` (DATE) - Optional week starting date for weekly reflections
- `tags` (TEXT[]) - Array of tags (e.g., 'mindset', 'strategy', 'risk-management')
- `mood` (TEXT) - Emotional state (e.g., 'confident', 'anxious', 'neutral', 'frustrated', 'excited')
- `content_embedding` (VECTOR(1536)) - OpenAI text-embedding-3-small embedding for semantic search
- `related_trade_ids` (UUID[]) - Array of trade IDs mentioned in the entry
- `created_at` (TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp (auto-updated via trigger)

**Indexes:**
- Primary key on `id`
- HNSW vector index on `content_embedding` for fast similarity search
- B-tree indexes on `user_id`, `created_at`, `week_of`, and `mood`
- GIN indexes on `tags` and `related_trade_ids` arrays

**Row Level Security (RLS):**
- Users can only view, insert, update, and delete their own journal entries
- All operations are scoped by `auth.uid() = user_id`

### Database Functions

1. **`match_journal_entries(query_embedding, ...)`**
   - Finds similar journal entries using vector similarity search
   - Supports filtering by user, date range, and similarity threshold
   - Returns entries sorted by cosine similarity

2. **`analyze_journal_patterns(p_user_id, p_since_date)`**
   - Analyzes journaling patterns over time
   - Returns statistics: total entries, avg length, mood distribution, tag frequency, consistency score
   - Consistency score measures how regularly the user journals (0-100%)

3. **`get_journal_summary_context(p_user_id, p_since_date, p_max_entries)`**
   - Prepares recent journal entries for AI summarization
   - Returns context needed for GPT-4 to analyze patterns and provide insights

### Views

1. **`v_journal_entries_recent`**
   - Recent entries (90 days) with computed stats
   - Shows entry length, related trades count, and embedding status

2. **`v_journal_writing_streak`**
   - Tracks user journaling consistency
   - Shows weeks with entries, max entries per week, avg entries per week

## API Endpoints

### 1. `/api/journal` (GET, POST, PATCH, DELETE)

**GET** - Fetch journal entries
- Query params: `limit`, `offset`, `weekOf`
- Returns: Array of journal entries for authenticated user

**POST** - Create new journal entry
- Body: `{ title, content, weekOf?, tags?, mood?, relatedTradeIds? }`
- Automatically generates OpenAI embedding for semantic search
- Returns: Created entry object

**PATCH** - Update existing journal entry
- Body: `{ id, title?, content?, weekOf?, tags?, mood?, relatedTradeIds? }`
- Regenerates embedding if title or content changed
- Returns: Updated entry object

**DELETE** - Delete journal entry
- Query param: `id`
- Returns: Success status

### 2. `/api/journal/insights` (GET, POST)

**GET** - Get journal pattern analysis
- Query param: `sinceDays` (default: 90)
- Returns: Statistics about journaling patterns, mood distribution, tag frequency, consistency score

**POST** - Semantic search for similar entries
- Body: `{ query, matchThreshold?, matchCount?, startDate?, endDate? }`
- Uses vector similarity to find entries matching the query text
- Returns: Array of similar entries with similarity scores

### 3. `/api/journal/summarize` (POST)

**POST** - Generate AI summary of journal history
- Body: `{ sinceDays?, maxEntries? }`
- Uses GPT-4 to analyze journal entries and provide insights
- Returns: Structured analysis covering:
  - Key recurring themes
  - Emotional patterns and triggers
  - Trading psychology insights
  - Identified strengths
  - Areas for improvement
  - Actionable recommendations

## Frontend Implementation

### Page: `/journal` ([src/app/journal/page.tsx](src/app/journal/page.tsx))

**Features:**
1. **Entry Form**
   - Title and content fields (required)
   - Week of date picker (optional)
   - Mood selector dropdown with predefined options
   - Tags input (comma-separated)
   - Save/Cancel actions with loading states

2. **Entry List**
   - Display all journal entries sorted by date
   - Show title, date, mood badge, and tags
   - Edit and delete actions for each entry
   - Expandable content with proper formatting

3. **Insights Panel**
   - Toggle-able insights section
   - Shows total entries, consistency score, avg length, top mood
   - Displays most common tags
   - Can be hidden/shown on demand

4. **Statistics Card**
   - Total entries count
   - Average character length
   - Consistency score (0-100%)
   - Mood distribution with visual progress bars

**State Management:**
- Uses React hooks (useState, useEffect)
- Fetches entries on mount
- Auto-refreshes analysis after create/update/delete operations

## Embedding Strategy

### Current Implementation
- Uses **OpenAI text-embedding-3-small** (1536 dimensions)
- Embeds combined title + content for semantic search
- Stored in PostgreSQL vector column with HNSW index

### Why OpenAI instead of Ollama?
- **HNSW Index Limitation**: Supabase pgvector with HNSW indexes has a 2000-dimension limit
- **Ollama qwen3-embedding**: Uses 4096 dimensions (too large for HNSW)
- **OpenAI text-embedding-3-small**: Uses 1536 dimensions (works with HNSW)
- **Performance**: HNSW provides much faster similarity search than sequential scans

### Future Considerations
If switching to higher-dimensional embeddings (like qwen3 4096d):
1. Use IVFFlat index instead of HNSW (supports higher dimensions)
2. Or use sequential scans with composite indexes for filtering
3. Or submit Supabase ticket to increase VECTOR_MAX_DIM

## Future AI Features

### Planned Enhancements

1. **Automated Pattern Recognition**
   - Identify recurring emotional patterns before/after trades
   - Detect behavioral biases (e.g., overtrading when frustrated, revenge trading)
   - Correlate mood/mindset with trade outcomes

2. **Periodic AI Insights**
   - Weekly/monthly automated summaries
   - Trend analysis: "You've been more confident this month"
   - Warning flags: "Detected pattern of impulsive entries after losses"

3. **Trade-Journal Correlation**
   - Link journal entries to specific trades
   - Analyze how journaled thoughts predicted outcomes
   - Identify when trader instincts were accurate vs. biased

4. **Semantic Search UI**
   - Search journal history by natural language queries
   - "Show me entries where I was anxious"
   - "Find reflections about risk management"

5. **Coaching Suggestions**
   - AI-driven recommendations based on journal analysis
   - "You tend to overtrade when market volatility is high"
   - "Your best trades happen when you journal the night before"

## Testing the Feature

### Manual Testing Steps

1. **Navigate to Journal**
   - Go to `/journal` in your browser
   - Should see empty state if no entries

2. **Create Entry**
   - Click "New Entry" button
   - Fill in title, content
   - Optionally select mood, add tags, set week
   - Click "Save Entry"
   - Should see entry appear in list

3. **View Insights**
   - After creating 2-3 entries, click "Show Insights"
   - Should see statistics panel with consistency score, mood distribution

4. **Edit Entry**
   - Click edit icon on an entry
   - Modify content
   - Save changes
   - Should see updated content

5. **Delete Entry**
   - Click delete icon
   - Confirm deletion
   - Entry should be removed

### API Testing with curl

```bash
# Get entries
curl -X GET http://localhost:3000/api/journal \
  -H "Cookie: your-auth-cookie"

# Create entry
curl -X POST http://localhost:3000/api/journal \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "title": "Week of Jan 15 - Market Volatility",
    "content": "This week was challenging. High volatility made it difficult to stick to my strategy.",
    "mood": "anxious",
    "tags": ["mindset", "volatility"]
  }'

# Get insights
curl -X GET http://localhost:3000/api/journal/insights?sinceDays=90 \
  -H "Cookie: your-auth-cookie"
```

## Files Changed/Created

### Database
- ✅ `supabase/migrations/20251028_create_journal_entries.sql` - Main migration

### API Routes
- ✅ `src/app/api/journal/route.ts` - CRUD operations
- ✅ `src/app/api/journal/insights/route.ts` - Pattern analysis and semantic search
- ✅ `src/app/api/journal/summarize/route.ts` - AI summarization endpoint

### Frontend
- ✅ `src/app/journal/page.tsx` - Updated with full backend integration

### Documentation
- ✅ `JOURNAL_FEATURE.md` - This file

## Next Steps

1. **Test with Real Users**
   - Collect feedback on UI/UX
   - Monitor embedding generation performance
   - Track database query performance

2. **Implement AI Summarization**
   - Test GPT-4 analysis quality
   - Iterate on prompts for better insights
   - Add caching for expensive AI calls

3. **Add Advanced Features**
   - Semantic search UI component
   - Trade-journal linkage interface
   - Periodic AI insights (scheduled job)

4. **Performance Optimization**
   - Monitor vector search performance
   - Consider adding more composite indexes
   - Implement pagination for large entry lists

5. **Mobile Optimization**
   - Ensure responsive design works well
   - Test touch interactions
   - Optimize for smaller screens

## Notes

- **Privacy**: All journal entries are private and scoped to individual users via RLS
- **Embeddings**: Generated automatically on save, can be regenerated on edit
- **Deletion**: Cascade deletes ensure orphaned data is cleaned up
- **Consistency**: Trigger ensures updated_at is always current
- **Scalability**: HNSW index provides O(log n) similarity search performance
