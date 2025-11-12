import { useEffect, useRef } from 'react'
import katex from 'katex'

interface QuestionPreviewProps {
  statement: string
  options?: string[] | null
}

export default function QuestionPreview({ statement, options }: QuestionPreviewProps) {
  const statementRef = useRef<HTMLDivElement>(null)
  const optionsRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (statementRef.current) {
      renderContent(statementRef.current, statement)
    }
  }, [statement])

  useEffect(() => {
    if (options) {
      options.forEach((option, index) => {
        const ref = optionsRefs.current[index]
        if (ref) {
          renderContent(ref, option)
        }
      })
    }
  }, [options])

  const renderContent = (element: HTMLElement, content: string) => {
    try {
      const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i)

      if (svgMatch) {
        const parts = content.split(svgMatch[0])
        const beforeDiagram = parts[0] || ''
        const afterDiagram = parts[1] || ''

        const beforeEl = document.createElement('div')
        renderKatex(beforeEl, beforeDiagram)

        const diagramEl = document.createElement('div')
        diagramEl.style.margin = '20px 0'
        diagramEl.style.padding = '20px'
        diagramEl.style.background = '#fff'
        diagramEl.style.border = '1px solid #e2e8f0'
        diagramEl.style.borderRadius = '8px'
        diagramEl.innerHTML = svgMatch[0]

        const afterEl = document.createElement('div')
        renderKatex(afterEl, afterDiagram)

        element.innerHTML = ''
        element.appendChild(beforeEl)
        element.appendChild(diagramEl)
        element.appendChild(afterEl)
      } else {
        renderKatex(element, content)
      }
    } catch (e) {
      element.textContent = content
    }
  }

  const renderKatex = (element: HTMLElement, text: string) => {
    const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[\s\S]+?\$|\\text\{[^}]+\}|\\[a-zA-Z]+)/g)
    element.innerHTML = ''

    parts.forEach(part => {
      if (!part) return

      const span = document.createElement('span')
      try {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          katex.render(part.slice(2, -2), span, { displayMode: true, throwOnError: false })
        } else if (part.startsWith('$') && part.endsWith('$')) {
          katex.render(part.slice(1, -1), span, { displayMode: false, throwOnError: false })
        } else if (part.startsWith('\\')) {
          katex.render(part, span, { displayMode: false, throwOnError: false })
        } else {
          span.textContent = part
        }
      } catch (e) {
        span.textContent = part
      }
      element.appendChild(span)
    })
  }


  return (
    <div style={{
      padding: '20px',
      background: '#fff',
      borderRadius: '8px',
      border: '1px solid #e2e8f0'
    }}>
      <div
        ref={statementRef}
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          marginBottom: options && options.length > 0 ? '16px' : '0'
        }}
      />

      {options && options.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          {options.map((_, index) => (
            <div
              key={index}
              ref={el => optionsRefs.current[index] = el}
              style={{
                padding: '12px',
                marginBottom: '8px',
                background: '#f7fafc',
                borderRadius: '6px',
                border: '1px solid #e2e8f0'
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
