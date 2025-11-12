# PDF Question Scanner

AI-powered system that extracts questions from PDF files using Gemini 2.0 Flash and saves them to Supabase.

## Features

- PDF to PNG conversion with page-by-page processing
- Multiple Gemini API key support with round-robin rotation
- Automatic question extraction with KaTeX and SVG support
- AI-powered verification system with 95% accuracy threshold
- Up to 6 retry attempts per page for perfect extraction
- Real-time preview of extracted questions
- Auto-save functionality
- Support for MCQ, MSQ, NAT, and SUB question types
- Customizable marking schemes

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Usage

1. Add Gemini API keys
2. Select exam, course, slot, and part
3. Configure question types and marking schemes
4. Upload PDF files with their respective years
5. Click "Scan & Extract Questions"
6. Questions are automatically saved to Supabase

## Question Format

Questions are saved with KaTeX for mathematical expressions and inline SVG for diagrams.

### Format Priority

1. **KaTeX** (preferred for):
   - Mathematical expressions: `$x^2$`, `$$\int_0^1 f(x)dx$$`
   - Matrices: `$$\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}$$`
   - Tables using array environment
   - Bold variables: `\mathbf{P}`, `\mathbf{Q}`

2. **SVG** (only for actual diagrams):
   - Venn diagrams, circuits, graphs
   - Geometric figures
   - Complex visual elements that cannot be represented with KaTeX

### Example Output

For a question with a Venn diagram:

```
question_statement: "In the given figure, the numbers associated with the rectangle, triangle, and circle are 1, 2, and 3 respectively. Which one among the given options is the most appropriate combination of \mathbf{P}, \mathbf{Q}, and \mathbf{R}?\n\n<svg>...</svg>"

options: ["P = 6; Q = 5; R = 3", "P = 5; Q = 6; R = 3", "P = 3; Q = 6; R = 6", "P = 5; Q = 3; R = 6"]
```

## Verification System

The system includes a 2-step extraction process:

1. **Extraction**: Gemini extracts questions from the page
2. **Verification**: A second Gemini call verifies accuracy (0-100 score)
3. **Approval**: Only questions scoring 95% or higher are saved
4. **Retry**: Up to 6 attempts per page to achieve 95% accuracy
5. **Fallback**: After 6 attempts, uses the best extraction available

This ensures students won't notice any difference between the original and extracted questions.
