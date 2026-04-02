import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Try project root first (knowledge/), then relative to dist (dist/knowledge/)
const ROOT_KNOWLEDGE = join(__dirname, "..", "..", "knowledge");
const DIST_KNOWLEDGE = join(__dirname, "..", "knowledge");
const KNOWLEDGE_DIR = existsSync(ROOT_KNOWLEDGE) ? ROOT_KNOWLEDGE : DIST_KNOWLEDGE;

interface KnowledgeCard {
  type: string;
  title: string;
  content: string;
  tags: string[];
  categories: string[];
  ingredients: string[];
  relevance_to_shishka: string;
  page_ref: string;
}

interface BookKnowledge {
  book_id: string;
  book_title: string;
  author: string;
  cards: KnowledgeCard[];
}

// Lazy-loaded cache
let knowledgeCache: BookKnowledge[] | null = null;

function loadKnowledge(): BookKnowledge[] {
  if (knowledgeCache) return knowledgeCache;

  knowledgeCache = [];
  try {
    const files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = readFileSync(join(KNOWLEDGE_DIR, file), "utf-8");
      knowledgeCache.push(JSON.parse(raw));
    }
  } catch {
    // knowledge dir may not exist yet
  }
  return knowledgeCache;
}

// Force reload (call after adding new files)
export function reloadKnowledge() {
  knowledgeCache = null;
}

export const searchKnowledgeSchema = {
  name: "search_knowledge",
  description:
    "Search the culinary knowledge base extracted from 193+ cookbooks. Returns knowledge cards: ratios, techniques, hacks, pairings, chemistry, substitutions, concepts. Use when you need culinary expertise for menu planning, recipe development, or answering food science questions.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          "Search term — matches against card titles, content, tags, ingredients, and categories",
      },
      type: {
        type: "string",
        enum: [
          "ratio",
          "technique",
          "hack",
          "chemistry",
          "concept",
          "pairing",
          "substitution",
        ],
        description: "Filter by card type (optional)",
      },
      ingredient: {
        type: "string",
        description: "Filter by ingredient name (optional)",
      },
      relevance: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Filter by Shishka relevance (optional)",
      },
      limit: {
        type: "number",
        description: "Max results (default: 10)",
      },
    },
    required: ["query"],
  },
};

export async function searchKnowledge(args: {
  query: string;
  type?: string;
  ingredient?: string;
  relevance?: string;
  limit?: number;
}) {
  const books = loadKnowledge();
  const maxResults = args.limit || 10;
  const queryLower = args.query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length >= 2);

  const scored: {
    card: KnowledgeCard;
    book_id: string;
    book_title: string;
    author: string;
    score: number;
  }[] = [];

  for (const book of books) {
    if (!Array.isArray(book.cards)) continue; // skip non-book files (e.g. manifest)

    for (const card of book.cards) {
      // Defensive: ensure array fields are actually arrays
      const ingredients = Array.isArray(card.ingredients) ? card.ingredients : [];
      const tags = Array.isArray(card.tags) ? card.tags : [];
      const categories = Array.isArray(card.categories) ? card.categories : [];

      // Type filter
      if (args.type && card.type !== args.type) continue;

      // Relevance filter
      if (args.relevance && card.relevance_to_shishka !== args.relevance)
        continue;

      // Ingredient filter
      if (args.ingredient) {
        const ingLower = args.ingredient.toLowerCase();
        if (
          !ingredients.some((i) => i.toLowerCase().includes(ingLower))
        )
          continue;
      }

      // Score by keyword matching
      let score = 0;
      const searchable = [
        card.title,
        card.content,
        ...tags,
        ...categories,
        ...ingredients,
      ]
        .join(" ")
        .toLowerCase();

      for (const word of queryWords) {
        if (searchable.includes(word)) score += 1;
        // Bonus for title match
        if (card.title.toLowerCase().includes(word)) score += 2;
        // Bonus for tag match
        if (tags.some((t) => t.toLowerCase().includes(word))) score += 1;
      }

      // Relevance bonus
      if (card.relevance_to_shishka === "high") score += 2;
      else if (card.relevance_to_shishka === "medium") score += 1;

      if (score > 0) {
        scored.push({
          card,
          book_id: book.book_id,
          book_title: book.book_title,
          author: book.author,
          score,
        });
      }
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, maxResults);

  const totalBooks = books.length;
  const totalCards = books.reduce((s, b) => s + (Array.isArray(b.cards) ? b.cards.length : 0), 0);

  return {
    query: args.query,
    filters: {
      type: args.type || "all",
      ingredient: args.ingredient || "any",
      relevance: args.relevance || "any",
    },
    knowledge_base_stats: {
      books_indexed: totalBooks,
      total_cards: totalCards,
    },
    results_count: results.length,
    results: results.map((r) => ({
      score: r.score,
      type: r.card.type,
      title: r.card.title,
      content: r.card.content,
      tags: Array.isArray(r.card.tags) ? r.card.tags : [],
      categories: Array.isArray(r.card.categories) ? r.card.categories : [],
      ingredients: Array.isArray(r.card.ingredients) ? r.card.ingredients : [],
      relevance: r.card.relevance_to_shishka,
      source: `${r.book_id} — ${r.book_title} by ${r.author} (p. ${r.card.page_ref})`,
    })),
  };
}
