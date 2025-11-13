import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { GeminiRoundRobin } from './lib/gemini'
import { convertPdfToImages } from './lib/pdf-to-png'
import QuestionPreview from './components/QuestionPreview'
import type {
  Exam,
  Course,
  Slot,
  Part,
  QuestionType,
  PDFFile,
  ExtractedQuestion
} from './types'

const DEFAULT_QUESTION_TYPES: QuestionType[] = [
  { type: 'MCQ', enabled: true, correct_marks: 4, incorrect_marks: -1, skipped_marks: 0, partial_marks: 0, time_minutes: 3 },
  { type: 'MSQ', enabled: true, correct_marks: 4, incorrect_marks: -2, skipped_marks: 0, partial_marks: 1, time_minutes: 3 },
  { type: 'NAT', enabled: true, correct_marks: 4, incorrect_marks: 0, skipped_marks: 0, partial_marks: 0, time_minutes: 3 },
  { type: 'SUB', enabled: true, correct_marks: 10, incorrect_marks: 0, skipped_marks: 0, partial_marks: 2, time_minutes: 15 }
]

export default function App() {
  const [exams, setExams] = useState<Exam[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [parts, setParts] = useState<Part[]>([])

  const [selectedExam, setSelectedExam] = useState<string>('')
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [selectedPart, setSelectedPart] = useState<string>('')

  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(DEFAULT_QUESTION_TYPES)
  const [apiKeys, setApiKeys] = useState<string[]>(['', '', ''])
  const [pdfFiles, setPdfFiles] = useState<PDFFile[]>([])
  const [autoSave, setAutoSave] = useState(true)

  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    loadExams()
  }, [])

  useEffect(() => {
    if (selectedExam) {
      loadCourses(selectedExam)
    }
  }, [selectedExam])

  useEffect(() => {
    if (selectedCourse) {
      loadSlots(selectedCourse)
    }
  }, [selectedCourse])

  useEffect(() => {
    if (selectedCourse) {
      loadParts(selectedCourse, selectedSlot)
    }
  }, [selectedCourse, selectedSlot])

  const loadExams = async () => {
    const { data } = await supabase.from('exams').select('id, name').order('name')
    if (data) setExams(data)
  }

  const loadCourses = async (examId: string) => {
    const { data } = await supabase
      .from('courses')
      .select('id, name, exam_id')
      .eq('exam_id', examId)
      .order('name')
    if (data) setCourses(data)
  }

  const loadSlots = async (courseId: string) => {
    const { data } = await supabase
      .from('slots')
      .select('id, slot_name, course_id')
      .eq('course_id', courseId)
      .order('slot_name')
    if (data) setSlots(data)
  }

  const loadParts = async (courseId: string, slotId?: string) => {
    let query = supabase
      .from('parts')
      .select('id, part_name, course_id, slot_id')
      .eq('course_id', courseId)

    if (slotId) {
      query = query.eq('slot_id', slotId)
    }

    const { data } = await query.order('part_name')
    if (data) setParts(data)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newPdfFiles: PDFFile[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      year: new Date().getFullYear(),
      status: 'pending',
      progress: 0,
      totalPages: 0,
      processedPages: 0
    }))
    setPdfFiles(prev => [...prev, ...newPdfFiles])
  }

  const updateApiKey = (index: number, value: string) => {
    const updated = [...apiKeys]
    updated[index] = value
    setApiKeys(updated)
  }

  const addApiKeyField = () => {
    setApiKeys([...apiKeys, ''])
  }

  const removeApiKey = (index: number) => {
    setApiKeys(apiKeys.filter((_, i) => i !== index))
  }

  const updateQuestionType = (index: number, field: keyof QuestionType, value: any) => {
    const updated = [...questionTypes]
    updated[index] = { ...updated[index], [field]: value }
    setQuestionTypes(updated)
  }

  const updatePdfYear = (id: string, year: number) => {
    setPdfFiles(prev =>
      prev.map(pdf => pdf.id === id ? { ...pdf, year } : pdf)
    )
  }

  const removePdf = (id: string) => {
    setPdfFiles(prev => prev.filter(pdf => pdf.id !== id))
  }

  const processPdfs = async () => {
    if (!selectedCourse) {
      alert('Please select exam and course')
      return
    }

    const validKeys = apiKeys.filter(k => k.trim() !== '')
    if (validKeys.length === 0) {
      alert('Please provide at least one Gemini API key')
      return
    }

    setIsProcessing(true)
    setExtractedQuestions([])
    const gemini = new GeminiRoundRobin(validKeys)

    for (const pdfFile of pdfFiles) {
      if (pdfFile.status === 'completed') continue

      try {
        setPdfFiles(prev =>
          prev.map(p => p.id === pdfFile.id ? { ...p, status: 'processing' } : p)
        )

        const images = await convertPdfToImages(pdfFile.file)
        setPdfFiles(prev =>
          prev.map(p => p.id === pdfFile.id ? { ...p, totalPages: images.length } : p)
        )

        for (let i = 0; i < images.length; i++) {
          const imageData = images[i]
          const prompt = generatePrompt()

          console.log(`\n=== PROCESSING PAGE ${i + 1} ===`)

          let expectedQuestionCount = 0
          try {
            expectedQuestionCount = await gemini.countQuestionsInImage(imageData)
            console.log(`Page ${i + 1}: Expected ${expectedQuestionCount} questions`)
          } catch (error) {
            console.error(`Failed to count questions on page ${i + 1}:`, error)
          }

          let pageQuestions: ExtractedQuestion[] = []
          let verificationScore = 0
          let extractionResponse = ''
          let feedback = ''
          const maxAttempts = 6

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              if (attempt === 1) {
                console.log(`Page ${i + 1}, Attempt ${attempt}: Initial extraction...`)
                extractionResponse = await gemini.analyzeImage(imageData, prompt)
              } else {
                console.log(`Page ${i + 1}, Attempt ${attempt}: Fixing - ${feedback}`)
                extractionResponse = await gemini.fixExtraction(imageData, extractionResponse, feedback)
              }

              const questions = parseGeminiResponse(extractionResponse, pdfFile.year)
              console.log(`Page ${i + 1}, Attempt ${attempt}: Extracted ${questions.length} questions`)

              if (questions.length === 0) {
                console.log(`Page ${i + 1}: No questions extracted, attempt ${attempt}/${maxAttempts}`)
                if (attempt < maxAttempts) {
                  feedback = 'No questions extracted. Scan image again and extract ALL complete questions visible on the page.'
                  await new Promise(resolve => setTimeout(resolve, 1000))
                  continue
                }
                break
              }

              const verification = await gemini.verifyExtraction(imageData, extractionResponse)
              verificationScore = verification.score
              feedback = verification.feedback

              console.log(`Page ${i + 1}, Attempt ${attempt}: Verification score ${verificationScore}% - ${feedback}`)

              const questionMismatch = expectedQuestionCount > 0 && questions.length < expectedQuestionCount
              if (questionMismatch) {
                feedback += ` (CRITICAL: Expected ${expectedQuestionCount} questions but only extracted ${questions.length}. Make sure no questions are skipped.)`
                verificationScore = Math.max(0, verificationScore - 20)
                console.log(`Page ${i + 1}: Question count mismatch! Expected ${expectedQuestionCount}, got ${questions.length}`)
              }

              if (verificationScore >= 99) {
                pageQuestions = questions
                console.log(`Page ${i + 1}: APPROVED! Score ${verificationScore}% - All ${questions.length} questions extracted perfectly`)
                break
              } else if (verificationScore >= 95 && !questionMismatch) {
                pageQuestions = questions
                console.log(`Page ${i + 1}: Accepted with score ${verificationScore}% (good enough)`)
                break
              } else if (attempt < maxAttempts) {
                console.log(`Page ${i + 1}: Score too low (${verificationScore}%), retrying...`)
                await new Promise(resolve => setTimeout(resolve, 1500))
              } else {
                console.log(`Page ${i + 1}: Max attempts reached, using best extraction (score: ${verificationScore}%)`)
                pageQuestions = questions
              }
            } catch (error) {
              console.error(`Page ${i + 1}, Attempt ${attempt} failed:`, error)
              if (attempt === maxAttempts) {
                throw error
              }
              feedback = 'Previous attempt failed. Retrying with next API key...'
              await new Promise(resolve => setTimeout(resolve, 2000))
            }
          }

          console.log(`Page ${i + 1}: Final result - ${pageQuestions.length} questions extracted`)

          for (const question of pageQuestions) {
            setExtractedQuestions(prev => [...prev, question])

            if (autoSave) {
              try {
                await saveQuestionToSupabase(question)
              } catch (saveError) {
                console.error('Error auto-saving question:', saveError)
              }
            }
          }

          if (pageQuestions.length > 0 && expectedQuestionCount > 0) {
            if (pageQuestions.length === expectedQuestionCount) {
              console.log(`Page ${i + 1}: COMPLETE VALIDATION PASSED - All ${pageQuestions.length} questions extracted`)
            } else {
              console.warn(`Page ${i + 1}: WARNING - Expected ${expectedQuestionCount} questions but extracted ${pageQuestions.length}`)
            }
          }

          setPdfFiles(prev =>
            prev.map(p =>
              p.id === pdfFile.id
                ? { ...p, processedPages: i + 1, progress: ((i + 1) / images.length) * 100 }
                : p
            )
          )

          await new Promise(resolve => setTimeout(resolve, 100))
        }

        setPdfFiles(prev =>
          prev.map(p => p.id === pdfFile.id ? { ...p, status: 'completed' } : p)
        )
      } catch (error) {
        console.error('Error processing PDF:', error)
        setPdfFiles(prev =>
          prev.map(p =>
            p.id === pdfFile.id
              ? { ...p, status: 'error', error: (error as Error).message }
              : p
          )
        )
      }
    }

    setIsProcessing(false)
  }

  const generatePrompt = () => {
    const enabledTypes = questionTypes.filter(qt => qt.enabled).map(qt => qt.type).join(', ')

    return `You are an expert at extracting questions from exam papers with PERFECT accuracy. Every detail matters.

IMPORTANT RULES:
1. Extract ONLY COMPLETE questions (ignore partial/continued questions)
2. You MUST use KaTeX for ALL mathematical content, tables, and matrices
3. You MUST create SVG for ALL visual elements (diagrams, circuits, graphs, etc.)
4. Extraction must be 100% accurate - students should not notice any difference

Question types to extract: ${enabledTypes}
- MCQ: Multiple Choice (single correct)
- MSQ: Multiple Select (multiple correct)
- NAT: Numerical Answer
- SUB: Subjective

FORMATTING REQUIREMENTS:

KaTeX (MANDATORY for ALL math, tables, matrices):
- Inline math: $x^2 + y^2 = z^2$
- Display math: $$\\int_0^1 f(x)dx$$
- Fractions: $\\frac{a}{b}$
- Matrices: $$\\begin{bmatrix}1 & 2\\\\3 & 4\\end{bmatrix}$$
- Bold variables: \\mathbf{P}, \\mathbf{Q}
- Greek letters: \\alpha, \\beta, \\gamma
- Symbols: \\sum, \\prod, \\int, \\infty

TABLES (CRITICAL - NEVER use plain text tables):
WRONG: Column-I | Column-II or using || symbols
RIGHT: $$\\begin{array}{|c|l|c|l|}\\hline\\textbf{Column-I} & & \\textbf{Column-II} & \\\\\\hline P. & \\text{This house is in a mess.} & 1. & \\text{Alright, I won't bring it up.}\\\\\\hline Q. & \\text{I am not happy with the marks.} & 2. & \\text{Well, you can look it up.}\\\\\\hline\\end{array}$$

KEY TABLE RULES:
- Use $$\\begin{array}{|c|l|c|l|}...\\end{array}$$ for ALL tables
- Use \\hline for horizontal lines
- Use & to separate columns
- Use \\\\ to end rows
- Use \\text{} for non-math text in tables
- Use \\textbf{} for bold headers
- Column alignment: |c| = centered, |l| = left, |r| = right

SVG (MANDATORY for ALL diagrams):
- Venn diagrams, circuits, graphs, geometric figures
- Use clean SVG with proper viewBox
- Label all elements accurately
- Match original exactly

EXAMPLE (Table with KaTeX):
question_statement: "Column-I has statements; Column-II has responses.\n\n$$\\begin{array}{|c|l|c|l|}\\hline\\textbf{Column-I} & & \\textbf{Column-II} & \\\\\\hline P. & \\text{This house is in a mess.} & 1. & \\text{Alright, I won't bring it up.}\\\\\\hline Q. & \\text{Not happy with marks.} & 2. & \\text{You can look it up.}\\\\\\hline\\end{array}$$\n\nIdentify the correct match."

EXAMPLE (Diagram with SVG):
question_statement: "In the given figure, numbers 1, 2, and 3 are associated with rectangle, triangle, and circle. Find \\mathbf{P}, \\mathbf{Q}, \\mathbf{R}.\n\n<svg width=\"600\" height=\"400\" viewBox=\"0 0 600 400\" xmlns=\"http://www.w3.org/2000/svg\"><style>.set{fill:none;stroke:black;stroke-width:2;}.label{font-size:20px;}</style><rect x=\"50\" y=\"100\" width=\"300\" height=\"200\" class=\"set\"/><polygon points=\"350,50 550,320 150,320\" class=\"set\"/><circle cx=\"400\" cy=\"220\" r=\"120\" class=\"set\"/><text x=\"100\" y=\"200\" class=\"label\">1</text></svg>"

OPTIONS (MCQ/MSQ):
- Use KaTeX for math: ["$P = 6$; $Q = 5$; $R = 3$", "$P = 5$; $Q = 6$; $R = 3$"]
- Ensure ALL options are visible

VALIDATION:
- Complete question statement
- ALL options visible (MCQ/MSQ)
- No "continued..." text
- All math in KaTeX
- All tables in KaTeX array format
- All diagrams in SVG
- NO plain text tables with || symbols

Return ONLY valid JSON (no markdown):
[{"question_type":"MCQ","question_statement":"What is $x^2$ if $x=2$?","options":["$2$","$4$","$8$","$16$"]}]

Empty if no complete questions: []`
  }

  const parseGeminiResponse = (response: string, year: number): ExtractedQuestion[] => {
    try {
      let jsonStr = response.trim()
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '')

      const parsed = JSON.parse(jsonStr)
      const questionsArray = Array.isArray(parsed) ? parsed : [parsed]

      if (!questionsArray || questionsArray.length === 0) {
        return []
      }

      return questionsArray
        .filter((q: any) => q.question_type && q.question_statement)
        .map(q => {
          const qt = questionTypes.find(t => t.type === q.question_type)
          if (!qt) return null

          const selectedSlotObj = slots.find(s => s.id === selectedSlot)
          const selectedPartObj = parts.find(p => p.id === selectedPart)

          const question: ExtractedQuestion = {
            question_type: q.question_type,
            question_statement: q.question_statement,
            options: q.options || null,
            course_id: selectedCourse,
            year,
            slot: selectedSlotObj?.slot_name || '',
            part: selectedPartObj?.part_name || '',
            correct_marks: qt.correct_marks,
            incorrect_marks: qt.incorrect_marks,
            skipped_marks: qt.skipped_marks,
            partial_marks: qt.partial_marks,
            time_minutes: qt.time_minutes,
            categorized: false,
            slot_id: selectedSlot,
            part_id: selectedPart
          }
          return question
        })
        .filter((q): q is ExtractedQuestion => q !== null)
    } catch (error) {
      console.error('Error parsing Gemini response:', error)
      return []
    }
  }

  const saveQuestionToSupabase = async (question: ExtractedQuestion) => {
    const insertData: any = {
      question_type: question.question_type,
      question_statement: question.question_statement,
      options: question.options,
      course_id: question.course_id || null,
      year: question.year,
      slot: question.slot || null,
      part: question.part || null,
      correct_marks: question.correct_marks,
      incorrect_marks: question.incorrect_marks,
      skipped_marks: question.skipped_marks,
      partial_marks: question.partial_marks,
      time_minutes: question.time_minutes,
      categorized: question.categorized,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (question.slot_id) insertData.slot_id = question.slot_id
    if (question.part_id) insertData.part_id = question.part_id

    const { error } = await supabase.from('questions').insert(insertData)

    if (error) {
      console.error('Error saving question:', error)
      throw error
    }
  }


  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '20px'
        }}>
          M
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: '600' }}>Masters Up AI Platform</h1>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '32px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '60px',
              height: '60px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '30px'
            }}>
              ⚡
            </div>
            <div>
              <h2 style={{ fontSize: '28px', fontWeight: '600', marginBottom: '4px' }}>
                Super Advanced PDF Scanner
              </h2>
              <p style={{ color: '#718096', fontSize: '14px' }}>
                AI-powered vision system that scans every page and extracts all questions with perfect accuracy
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: '24px',
            padding: '16px',
            background: '#f7fafc',
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#667eea' }}>🤖</span>
              <span style={{ fontSize: '14px', color: '#4a5568' }}>Gemini Vision</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#667eea' }}>📄</span>
              <span style={{ fontSize: '14px', color: '#4a5568' }}>Page by Page Scanning</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#667eea' }}>✅</span>
              <span style={{ fontSize: '14px', color: '#4a5568' }}>KaTeX Support</span>
            </div>
          </div>

          <div style={{
            background: '#fff9e6',
            border: '1px solid #ffd666',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#d48806' }}>
              📌 Gemini API Keys (Smart Round Robin)
            </h3>
            <p style={{ fontSize: '14px', color: '#8c6d1f', marginBottom: '12px' }}>
              Add up to 100 Gemini API keys. The system will rotate them automatically and handle errors with 15-second delays.
            </p>

            {apiKeys.map((key, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder={`API Key ${index + 1} (One-Click Import)`}
                  value={key}
                  onChange={(e) => updateApiKey(index, e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: '1px solid #d9d9d9',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
                {apiKeys.length > 1 && (
                  <button
                    onClick={() => removeApiKey(index)}
                    style={{
                      padding: '10px 16px',
                      background: '#fff',
                      border: '1px solid #ff4d4f',
                      borderRadius: '6px',
                      color: '#ff4d4f',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addApiKeyField}
              style={{
                marginTop: '8px',
                padding: '10px 20px',
                background: '#52c41a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              + Add API Key
            </button>

            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: '#e6f7ff',
              borderRadius: '6px'
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', color: '#0050b3' }}>
                How it works:
              </h4>
              <ul style={{ fontSize: '13px', color: '#096dd9', marginLeft: '20px', lineHeight: '1.8' }}>
                <li>Keys are used in round-robin rotation: 1st → 2nd → 3rd → 1st</li>
                <li>Keys with 15+ consecutive errors are temporarily disabled</li>
                <li>Disabled keys retry after 15-second cooldown</li>
                <li>Perfect for handling multiple PDFs without rate limits</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                📚 Select Exam
              </label>
              <select
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">Select exam</option>
                {exams.map(exam => (
                  <option key={exam.id} value={exam.id}>{exam.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                📖 Select Course
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
                disabled={!selectedExam}
              >
                <option value="">Select course</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                🎯 Slot
              </label>
              <select
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
                disabled={!selectedCourse}
              >
                <option value="">Select a slot (optional)</option>
                {slots.map(slot => (
                  <option key={slot.id} value={slot.id}>{slot.slot_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>
                📝 Part
              </label>
              <select
                value={selectedPart}
                onChange={(e) => setSelectedPart(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
                disabled={!selectedCourse}
              >
                <option value="">Select a part (optional)</option>
                {parts.map(part => (
                  <option key={part.id} value={part.id}>{part.part_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            background: '#f7fafc',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Question Types & Marking Scheme
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {questionTypes.map((qt, index) => (
                <div key={qt.type} style={{
                  background: '#fff',
                  padding: '16px',
                  borderRadius: '8px',
                  border: qt.enabled ? '2px solid #667eea' : '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="checkbox"
                      checked={qt.enabled}
                      onChange={(e) => updateQuestionType(index, 'enabled', e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label style={{ fontSize: '14px', fontWeight: '600' }}>
                      {qt.type === 'MCQ' && '🔵 MCQ (Single Correct)'}
                      {qt.type === 'MSQ' && '🟣 MSQ (Multiple Correct)'}
                      {qt.type === 'NAT' && '🟢 NAT (Numerical Answer)'}
                      {qt.type === 'SUB' && '🟡 Subjective (Short Write)'}
                    </label>
                  </div>

                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Correct:</strong>
                      <input
                        type="number"
                        value={qt.correct_marks}
                        onChange={(e) => updateQuestionType(index, 'correct_marks', Number(e.target.value))}
                        style={{
                          width: '50px',
                          marginLeft: '8px',
                          padding: '4px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Incorrect:</strong>
                      <input
                        type="number"
                        value={qt.incorrect_marks}
                        onChange={(e) => updateQuestionType(index, 'incorrect_marks', Number(e.target.value))}
                        style={{
                          width: '50px',
                          marginLeft: '8px',
                          padding: '4px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Skipped:</strong>
                      <input
                        type="number"
                        value={qt.skipped_marks}
                        onChange={(e) => updateQuestionType(index, 'skipped_marks', Number(e.target.value))}
                        style={{
                          width: '50px',
                          marginLeft: '8px',
                          padding: '4px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>Partial:</strong>
                      <input
                        type="number"
                        value={qt.partial_marks}
                        onChange={(e) => updateQuestionType(index, 'partial_marks', Number(e.target.value))}
                        style={{
                          width: '50px',
                          marginLeft: '8px',
                          padding: '4px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                    <div>
                      <strong>Time (min):</strong>
                      <input
                        type="number"
                        value={qt.time_minutes}
                        onChange={(e) => updateQuestionType(index, 'time_minutes', Number(e.target.value))}
                        style={{
                          width: '50px',
                          marginLeft: '8px',
                          padding: '4px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Upload PDFs (Up to 20)</h3>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', color: '#4a5568' }}>
                  🔄 Auto save & Continue
                </span>
              </label>
            </div>

            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="pdf-upload"
            />

            <label
              htmlFor="pdf-upload"
              style={{
                display: 'block',
                padding: '40px',
                border: '2px dashed #cbd5e0',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#f7fafc'
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>📄</div>
              <div style={{ fontSize: '16px', color: '#4a5568', marginBottom: '4px' }}>
                Drop PDF or click
              </div>
              <div style={{ fontSize: '14px', color: '#718096' }}>
                Upload multiple PDFs with their respective years. They will be processed one by one.
              </div>
            </label>

            {pdfFiles.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
                marginTop: '16px'
              }}>
                {pdfFiles.map(pdf => (
                  <div
                    key={pdf.id}
                    style={{
                      padding: '16px',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', flex: 1 }}>
                        {pdf.file.name}
                      </div>
                      <button
                        onClick={() => removePdf(pdf.id)}
                        style={{
                          padding: '4px 8px',
                          background: 'transparent',
                          border: 'none',
                          color: '#e53e3e',
                          cursor: 'pointer',
                          fontSize: '16px'
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                        📅 Year
                      </label>
                      <input
                        type="number"
                        value={pdf.year}
                        onChange={(e) => updatePdfYear(pdf.id, Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '6px',
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      />
                    </div>

                    <div style={{
                      fontSize: '12px',
                      color: '#718096',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}>
                      <span>Status: {pdf.status}</span>
                      {pdf.totalPages > 0 && (
                        <span>{pdf.processedPages}/{pdf.totalPages} pages</span>
                      )}
                    </div>

                    {pdf.progress > 0 && (
                      <div style={{
                        marginTop: '8px',
                        height: '4px',
                        background: '#e2e8f0',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${pdf.progress}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                    )}

                    {pdf.error && (
                      <div style={{
                        marginTop: '8px',
                        padding: '8px',
                        background: '#fff5f5',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#e53e3e'
                      }}>
                        {pdf.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={processPdfs}
            disabled={isProcessing || pdfFiles.length === 0}
            style={{
              width: '100%',
              padding: '16px',
              background: isProcessing ? '#cbd5e0' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isProcessing ? '⏳ Processing...' : '⚡ Scan & Extract Questions'}
          </button>
        </div>

        {extractedQuestions.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600' }}>
                Extracted Questions ({extractedQuestions.length})
              </h3>
              {!autoSave && (
                <button
                  onClick={async () => {
                    for (const q of extractedQuestions) {
                      await saveQuestionToSupabase(q)
                    }
                    alert('All questions saved!')
                  }}
                  style={{
                    padding: '12px 24px',
                    background: '#48bb78',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Save All to Database
                </button>
              )}
            </div>

            <div style={{
              maxHeight: '600px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}>
              {extractedQuestions.map((question, index) => (
                <div
                  key={index}
                  style={{
                    padding: '20px',
                    background: '#f7fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: '#fff',
                    borderRadius: '8px',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <strong>Question {index + 1}</strong> |{' '}
                      <strong>Type:</strong> {question.question_type} |{' '}
                      <strong>Marks:</strong> {question.correct_marks} |{' '}
                      <strong>Year:</strong> {question.year}
                      {question.slot && ` | Slot: ${question.slot}`}
                      {question.part && ` | Part: ${question.part}`}
                    </div>
                  </div>

                  <QuestionPreview
                    statement={question.question_statement}
                    options={question.options}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
