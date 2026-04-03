-- Migration 037: Add ocr_text column to receipt_jobs
-- Phase 4.17: Two-Stage OCR Pipeline (Google Cloud Vision + gpt-4o-mini)
-- Stores raw GCV OCR output for debugging when LLM misinterprets text.

ALTER TABLE receipt_jobs ADD COLUMN IF NOT EXISTS ocr_text TEXT;
COMMENT ON COLUMN receipt_jobs.ocr_text IS 'Raw OCR text from Google Cloud Vision (Stage 1). Stored for debugging misparses.';
