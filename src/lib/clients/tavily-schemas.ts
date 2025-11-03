/**
 * Zod schemas for Tavily API response validation
 * Ensures API contract compliance and catches breaking changes early
 */

import { z } from "zod";

/**
 * Search API Response Schema
 */
export const TavilySearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  content: z.string().optional().nullable(),
  snippet: z.string().optional().nullable(),
  score: z.number().min(0).max(1),
  published_date: z.string().optional().nullable(), // Only present with topic:"news"
  raw_content: z.string().optional().nullable(), // Tavily sometimes returns null instead of omitting
});

export const TavilySearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(TavilySearchResultSchema),
  answer: z.string().optional().nullable(), // Tavily sometimes returns null
  response_time: z.number().optional(),
  images: z.array(z.string()).optional(),
  follow_up_questions: z.array(z.string()).optional().nullable(), // Sometimes present
});

/**
 * Extract API Response Schema
 */
export const TavilyExtractResultSchema = z.object({
  url: z.string().url(),
  raw_content: z.string().optional(),
  content: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

export const TavilyExtractResponseSchema = z.object({
  results: z.array(TavilyExtractResultSchema),
  failed_results: z.array(z.any()).optional(),
});

/**
 * Map API Response Schema
 */
export const TavilyMapResultSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

export const TavilyMapResponseSchema = z.object({
  results: z.array(TavilyMapResultSchema),
});

/**
 * Crawl API Response Schema
 */
export const TavilyCrawlResultSchema = z.object({
  url: z.string().url(),
  content: z.string().optional(),
  raw_content: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

export const TavilyCrawlResponseSchema = z.object({
  results: z.array(TavilyCrawlResultSchema),
  failed_results: z.array(z.any()).optional(),
});

/**
 * Error Response Schema
 */
export const TavilyErrorResponseSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});

/**
 * Validation helpers
 */
export function validateSearchResponse(data: unknown) {
  try {
    return {
      success: true as const,
      data: TavilySearchResponseSchema.parse(data),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof z.ZodError ? error.errors : String(error),
    };
  }
}

export function validateExtractResponse(data: unknown) {
  try {
    return {
      success: true as const,
      data: TavilyExtractResponseSchema.parse(data),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof z.ZodError ? error.errors : String(error),
    };
  }
}

export function validateMapResponse(data: unknown) {
  try {
    return {
      success: true as const,
      data: TavilyMapResponseSchema.parse(data),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof z.ZodError ? error.errors : String(error),
    };
  }
}

export function validateCrawlResponse(data: unknown) {
  try {
    return {
      success: true as const,
      data: TavilyCrawlResponseSchema.parse(data),
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof z.ZodError ? error.errors : String(error),
    };
  }
}

/**
 * Specific validation: topic:"news" MUST have published_date
 */
export function validateNewsResponse(data: unknown, topic?: string) {
  const baseValidation = validateSearchResponse(data);

  if (!baseValidation.success) {
    return baseValidation;
  }

  // If topic is "news", ensure published_date exists on results
  if (topic === "news") {
    const resultsWithoutDate = baseValidation.data.results.filter(
      r => !r.published_date
    );

    if (resultsWithoutDate.length > 0) {
      return {
        success: false as const,
        error: `topic:"news" requires published_date but ${resultsWithoutDate.length} results lack it`,
      };
    }
  }

  return baseValidation;
}

// Type exports
export type TavilySearchResult = z.infer<typeof TavilySearchResultSchema>;
export type TavilySearchResponse = z.infer<typeof TavilySearchResponseSchema>;
export type TavilyExtractResult = z.infer<typeof TavilyExtractResultSchema>;
export type TavilyExtractResponse = z.infer<typeof TavilyExtractResponseSchema>;
export type TavilyMapResult = z.infer<typeof TavilyMapResultSchema>;
export type TavilyMapResponse = z.infer<typeof TavilyMapResponseSchema>;
export type TavilyCrawlResult = z.infer<typeof TavilyCrawlResultSchema>;
export type TavilyCrawlResponse = z.infer<typeof TavilyCrawlResponseSchema>;
