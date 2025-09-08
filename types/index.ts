// types/index.ts

export interface FileItem {
  id: number;
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  total_files: number;
  system_prompt: string;
  user_prompt: string;
  last_updated?: string;
  error?: string;
}

export interface ProcessedFile {
  original_filename: string;
  stored_filename: string;
  file_number: number;
  ocr_result?: OCRResult;
}

export interface OCRResult {
  file_id: string;
  original_filename: string;
  stored_filename: string;
  total_pages: number;
  pages: OCRPageResult[];
  full_text: string;
  total_words: number;
  processing_timestamp: string;
}

export interface OCRPageResult {
  page_number: number;
  text: string;
  word_count: number;
  words_with_positions: WordPosition[];
  average_confidence: number;
}

export interface WordPosition {
  text: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LLMAnalysis {
  job_id: string;
  model_used: string;
  system_prompt: string;
  user_prompt: string;
  response: string;
  processing_timestamp: string;
  total_tokens: number;
  prompt_tokens: number;
  context_length: number;
}

export interface JobResult {
  job_id: string;
  status: string;
  completed_at: string;
  total_files: number;
  successfully_processed: number;
  failed_files: number;
  processed_files: ProcessedFile[];
  llm_analysis: LLMAnalysis;
}

export interface Job {
  job_id: string;
  status: string;
  created_at: string;
  total_files: number;
  last_updated?: string;
}

export interface JobResponse {
  job_id: string;
  status: string;
  message: string;
  files_processed: number;
  created_at: string;
}

export interface APIError {
  detail: string;
}

export interface UploadResponse {
  job_id: string;
  status: string;
  message: string;
  files_processed: number;
  created_at: string;
}

export interface OllamaHealthCheck {
  status: 'healthy' | 'model_missing' | 'error';
  ollama_running: boolean;
  model_name: string;
  model_available: boolean;
  available_models: string[];
  message?: string;
}

// API Response types
export interface JobsListResponse {
  jobs: Job[];
}

export interface DeleteJobResponse {
  message: string;
}