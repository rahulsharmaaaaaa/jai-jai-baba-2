import { GoogleGenerativeAI } from '@google/generative-ai'

async function waitForNetwork(maxWaitSeconds: number = 300): Promise<void> {
  const startTime = Date.now()
  const maxWaitMs = maxWaitSeconds * 1000

  while (Date.now() - startTime < maxWaitMs) {
    if (navigator.onLine) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return
    }
    console.log('Network offline, waiting for connection...')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  throw new Error('Network connection timeout after ' + maxWaitSeconds + ' seconds')
}

function isNetworkError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || ''
  return (
    errorMessage.includes('fetch') ||
    errorMessage.includes('network') ||
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('load failed') ||
    !navigator.onLine
  )
}

export class GeminiRoundRobin {
  private apiKeys: string[]
  private currentIndex: number = 0
  private clients: GoogleGenerativeAI[]

  constructor(apiKeys: string[]) {
    this.apiKeys = apiKeys.filter(key => key.trim() !== '')
    this.clients = this.apiKeys.map(key => new GoogleGenerativeAI(key))
  }

  getNextClient(): GoogleGenerativeAI {
    if (this.clients.length === 0) {
      throw new Error('No valid API keys provided')
    }
    const client = this.clients[this.currentIndex]
    this.currentIndex = (this.currentIndex + 1) % this.clients.length
    return client
  }

  async analyzeImage(imageData: string, prompt: string, retries = 3): Promise<string> {
    let lastError: Error | null = null

    for (let i = 0; i < retries && i < this.clients.length; i++) {
      try {
        await waitForNetwork()

        const client = this.getNextClient()
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' })

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: imageData,
              mimeType: 'image/png'
            }
          }
        ])

        const response = await result.response
        const text = response.text()

        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from Gemini')
        }

        return text
      } catch (error) {
        lastError = error as Error
        console.error(`API key ${i + 1} failed:`, error)

        if (isNetworkError(error)) {
          console.log('Network error detected, waiting for connection...')
          await waitForNetwork()
          i--
          continue
        }

        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
        }
      }
    }

    throw lastError || new Error('All API keys failed')
  }

  async verifyExtraction(imageData: string, extractedCode: string): Promise<{ score: number, feedback: string }> {
    try {
      await waitForNetwork()

      const client = this.getNextClient()
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const verificationPrompt = `You are an expert verifier checking if question extraction is PERFECT.

Compare the original image with the extracted JSON below:

${extractedCode}

VERIFICATION CRITERIA (all must be met for 95+):
1. Question text is word-for-word accurate
2. ALL mathematical expressions are in proper KaTeX format ($$...$$)
3. ALL tables MUST use KaTeX array format: $$\\begin{array}{|c|l|}\\hline...\\end{array}$$
4. ALL matrices MUST use KaTeX: $$\\begin{bmatrix}...\\end{bmatrix}$$
5. ALL diagrams/visual elements are accurately represented in SVG
6. ALL options are complete and accurate (if MCQ/MSQ)
7. Question structure is complete (no missing parts)
8. NO plain text tables with || or similar - ONLY KaTeX arrays

SCORING GUIDE:
- 99-100: PERFECT extraction, indistinguishable from original
- 85-94: Minor formatting issues (small KaTeX errors, slightly inaccurate SVG)
- 75-84: Missing elements or noticeable errors (incomplete options, wrong math)
- Below 75: Major problems (missing questions, wrong content, plain text tables)

CRITICAL: Be strict. If you see plain text tables (||) instead of KaTeX arrays, score below 99.

Return ONLY this JSON format (no explanation):
{"score": 99, "feedback": "Tables should use KaTeX array format instead of plain text"}

The feedback should be specific about what needs fixing to reach 99+ score.`

      const result = await model.generateContent([
        verificationPrompt,
        {
          inlineData: {
            data: imageData,
            mimeType: 'image/png'
          }
        }
      ])

      const response = await result.response
      const text = response.text().trim()

      console.log('Verification response:', text)

      const jsonMatch = text.match(/\{\s*"score"\s*:\s*(\d+)\s*,\s*"feedback"\s*:\s*"([^"]+)"\s*\}/)
      if (jsonMatch) {
        const score = parseInt(jsonMatch[1]) || 0
        const feedback = jsonMatch[2] || ''
        console.log('Parsed verification score:', score, 'Feedback:', feedback)
        return { score, feedback }
      }

      const simpleJsonMatch = text.match(/\{\s*"score"\s*:\s*(\d+)\s*\}/)
      if (simpleJsonMatch) {
        const score = parseInt(simpleJsonMatch[1]) || 0
        console.log('Parsed verification score:', score)
        return { score, feedback: 'Needs improvement' }
      }

      const numberMatch = text.match(/score["\s:]*(\d+)/)
      if (numberMatch) {
        const score = parseInt(numberMatch[1])
        console.log('Extracted score from text:', score)
        return { score, feedback: 'Needs improvement' }
      }

      console.log('No score found in verification response')
      return { score: 0, feedback: 'Verification failed' }
    } catch (error) {
      console.error('Verification failed:', error)

      if (isNetworkError(error)) {
        console.log('Network error in verification, waiting...')
        await waitForNetwork()
        return this.verifyExtraction(imageData, extractedCode)
      }

      return { score: 0, feedback: 'Verification error' }
    }
  }

  async countQuestionsInImage(imageData: string): Promise<number> {
    try {
      await waitForNetwork()

      const client = this.getNextClient()
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const countPrompt = `Count the TOTAL number of complete questions on this page.

Include all question types: MCQ, MSQ, NAT, subjective, matching, assertion-reason, etc.

IMPORTANT:
- Count ONLY complete questions (not partial/continued from previous page)
- Do NOT count headers, instructions, or non-question text
- If a question spans multiple parts, count it as ONE question

Return ONLY a JSON number (no explanation):
{"count": 5}`

      const result = await model.generateContent([
        countPrompt,
        {
          inlineData: {
            data: imageData,
            mimeType: 'image/png'
          }
        }
      ])

      const response = await result.response
      const text = response.text().trim()

      console.log('Question count response:', text)

      const match = text.match(/"count"\s*:\s*(\d+)/)
      if (match) {
        const count = parseInt(match[1])
        console.log('Total questions on page:', count)
        return count
      }

      console.log('Could not parse question count')
      return 0
    } catch (error) {
      console.error('Question count failed:', error)

      if (isNetworkError(error)) {
        console.log('Network error in count, waiting...')
        await waitForNetwork()
        return this.countQuestionsInImage(imageData)
      }

      return 0
    }
  }

  async fixExtraction(imageData: string, previousCode: string, feedback: string): Promise<string> {
    try {
      await waitForNetwork()

      const client = this.getNextClient()
      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const fixPrompt = `You previously extracted questions from an image, but the extraction needs improvement.

PREVIOUS EXTRACTION:
${previousCode}

VERIFICATION FEEDBACK:
${feedback}

CRITICAL FORMATTING RULES:

1. TABLES (matching questions, data tables, etc.):
   WRONG: Using || or plain text
   RIGHT: $$\\begin{array}{|c|l|c|l|}\\hline\\textbf{Column-I} & & \\textbf{Column-II} & \\\\\\hline P. & \\text{Statement} & 1. & \\text{Response}\\\\\\hline\\end{array}$$

2. MATRICES:
   WRONG: Plain text or brackets
   RIGHT: $$\\begin{bmatrix}1 & 2\\\\3 & 4\\end{bmatrix}$$

3. MATH EXPRESSIONS:
   WRONG: x^2 or plain text
   RIGHT: $x^2$ (inline) or $$\\int_0^1 f(x)dx$$ (display)

4. DIAGRAMS:
   Use complete SVG with proper viewBox, labels, and styling

5. OPTIONS:
   Use KaTeX for math in options: ["$P = 6$; $Q = 5$; $R = 3$"]

Fix ONLY the issues mentioned in the feedback. Return the COMPLETE corrected JSON with ALL questions.

Return ONLY valid JSON (no markdown):
[{"question_type":"MCQ","question_statement":"...","options":[...]}]`

      const result = await model.generateContent([
        fixPrompt,
        {
          inlineData: {
            data: imageData,
            mimeType: 'image/png'
          }
        }
      ])

      const response = await result.response
      const text = response.text()

      if (!text || text.trim().length === 0) {
        throw new Error('Empty response from Gemini fix')
      }

      return text
    } catch (error) {
      console.error('Fix extraction failed:', error)

      if (isNetworkError(error)) {
        console.log('Network error in fix, waiting...')
        await waitForNetwork()
        return this.fixExtraction(imageData, previousCode, feedback)
      }

      throw error
    }
  }
}
