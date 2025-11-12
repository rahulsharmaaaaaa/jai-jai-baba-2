import { GoogleGenerativeAI } from '@google/generative-ai'

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
        const client = this.getNextClient()
        const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' })

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

        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
        }
      }
    }

    throw lastError || new Error('All API keys failed')
  }

  async verifyExtraction(imageData: string, extractedCode: string): Promise<number> {
    try {
      const client = this.getNextClient()
      const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' })

      const verificationPrompt = `You are an expert verifier checking if question extraction is PERFECT.

Compare the original image with the extracted JSON below:

${extractedCode}

VERIFICATION CRITERIA (all must be met for 95+):
1. Question text is word-for-word accurate
2. ALL mathematical expressions are in proper KaTeX format
3. ALL diagrams/tables are accurately represented in SVG or KaTeX array
4. ALL options are complete and accurate (if MCQ/MSQ)
5. Question structure is complete (no missing parts)
6. A student cannot tell the difference between original and extracted version

SCORING GUIDE:
- 95-100: PERFECT extraction, indistinguishable from original
- 85-94: Minor formatting issues (small KaTeX errors, slightly inaccurate SVG)
- 75-84: Missing elements or noticeable errors (incomplete options, wrong math)
- Below 75: Major problems (missing questions, wrong content)

CRITICAL: Be strict. If anything is missing or incorrect, score below 95.

Return ONLY this JSON format (no explanation):
{"score": 95}

Analyze the image carefully and compare with extracted JSON.
see after you see the image it will have 1-5 questions so scan this completely extract it's question statement and give code of it's KaTeX such that it can be render using katex library and if it have any diagram then give it's svg code here is an example have both question statement and option as example 
In the given figure, the numbers associated with the rectangle, triangle, and circle are 1, 2, and 3 respectively.  

Which one among the given options is the most appropriate combination of  \mathbf{P}, \mathbf{Q}, and \mathbf{R}?

<svg width="600" height="400" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
<style>
.set { fill: none; stroke: black; stroke-width: 2; }
.label { font-family: sans-serif; font-size: 20px; }
</style>

<rect x="50" y="100" width="300" height="200" class="set" id="Rectangle_R" />
<polygon points="350,50 550,320 150,320" class="set" id="Triangle_T" />
<circle cx="400" cy="220" r="120" class="set" id="Circle_C" />

<text x="100" y="200" class="label">1</text>
<text x="450" y="100" class="label">2</text>
<text x="350" y="350" class="label">3</text>
<text x="200" y="220" class="label">4</text>

<text x="330" y="150" class="label">R</text>
<text x="330" y="250" class="label">P</text>
<text x="400" y="250" class="label">Q</text>
</svg>

options = [
"P = 6; Q = 5; R = 3",
"P = 5; Q = 6; R = 3",
"P = 3; Q = 6; R = 6",
"P = 5; Q = 3; R = 6"
]


"Make sure that you save question statment (if it have a diagram or any image material save this as svg code) and if it have any KaTeX (like maths something then use proper begin statement and all to render that)
if you find a table like structure strictly make it like 
\[
\begin{array}{|c|l|c|l|}
\hline
\textbf{Column-I} & & \textbf{Column-II} & \\ 
\hline
P. & \text{This house is in a mess.} & 1. & \text{Alright, I won't bring it up during our conversations.} \\ 
\hline
Q. & \text{I am not happy with the marks given to me.} & 2. & \text{Well, you can easily look it up.} \\ 
\hline
R. & \text{Politics is a subject I avoid talking about.} & 3. & \text{No problem, let me clear it up for you.} \\ 
\hline
S. & \text{I don't know what this word means.} & 4. & \text{Don't worry, I will take it up with your teacher.} \\ 
\hline
\end{array}
\]

same for matrix and all use these functions instead of using normally ||| no proper Latex "`

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

      const jsonMatch = text.match(/\{\s*"score"\s*:\s*(\d+)\s*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const score = parsed.score || 0
        console.log('Parsed verification score:', score)
        return score
      }

      const numberMatch = text.match(/score["\s:]*(\d+)/)
      if (numberMatch) {
        const score = parseInt(numberMatch[1])
        console.log('Extracted score from text:', score)
        return score
      }

      console.log('No score found in verification response')
      return 0
    } catch (error) {
      console.error('Verification failed:', error)
      return 0
    }
  }
}
