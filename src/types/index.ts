export interface Exam {
  id: string
  name: string
}

export interface Course {
  id: string
  name: string
  exam_id: string
}

export interface Slot {
  id: string
  slot_name: string
  course_id: string
}

export interface Part {
  id: string
  part_name: string
  course_id: string
  slot_id: string
}

export interface QuestionType {
  type: 'MCQ' | 'MSQ' | 'NAT' | 'SUB'
  enabled: boolean
  correct_marks: number
  incorrect_marks: number
  skipped_marks: number
  partial_marks: number
  time_minutes: number
}

export interface PDFFile {
  id: string
  file: File
  year: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  totalPages: number
  processedPages: number
  error?: string
}

export interface ExtractedQuestion {
  question_type: 'MCQ' | 'MSQ' | 'NAT' | 'SUB'
  question_statement: string
  options: string[] | null
  course_id: string
  year: number
  slot: string
  part: string
  correct_marks: number
  incorrect_marks: number
  skipped_marks: number
  partial_marks: number
  time_minutes: number
  categorized: boolean
  slot_id?: string
  part_id?: string
}
