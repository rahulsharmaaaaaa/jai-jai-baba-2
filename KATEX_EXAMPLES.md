# KaTeX Format Examples for Questions

## Matching Question (Column-I to Column-II)

### Example Question

**Question Statement (question_statement column):**

```
Column-I has statements made by Shanthala; and, Column-II has responses given by Kanishk.

$$\begin{array}{|c|l|c|l|}
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
\end{array}$$

Identify the option that has the correct match between Column-I and Column-II.
```

**Options (options column):**

```json
[
  "P-3; Q-4; R-1; S-2",
  "P-3; Q-4; R-1; S-2",
  "P-3; Q-4; R-1; S-2",
  "P-3; Q-4; R-1; S-2"
]
```

## Key Points

1. **Use `\text{}` for non-mathematical text** - Ensures proper rendering of statements
2. **Use `\textbf{}` for bold headers** - Makes Column-I and Column-II stand out
3. **Use `|c|l|c|l|` for columns** - c = centered, l = left-aligned
4. **Use `\hline` for horizontal lines** - Creates table borders
5. **Use `&` to separate columns** - Required in array environment
6. **Use `\\` to end rows** - Required in array environment
7. **Use `$$...$$` for display mode** - Renders the entire table as a mathematical expression

## Rendering Output

When rendered with KaTeX, this produces a clean, professional table with:
- Centered column headers
- Left-aligned text entries
- Proper borders and spacing
- Easy-to-read format for matching questions

## Other Table Examples

### Simple Matrix Table

```latex
$$\begin{array}{|c|c|c|}
\hline
\textbf{X} & \textbf{Y} & \textbf{Z} \\
\hline
1 & 2 & 3 \\
\hline
4 & 5 & 6 \\
\hline
\end{array}$$
```

### Data Table with Numbers

```latex
$$\begin{array}{|l|r|r|}
\hline
\textbf{Name} & \textbf{Value} & \textbf{Percentage} \\
\hline
\text{Item A} & 100 & 25\% \\
\hline
\text{Item B} & 200 & 50\% \\
\hline
\text{Item C} & 100 & 25\% \\
\hline
\end{array}$$
```

## Do NOT Use

- ❌ HTML `<table>` tags - Use KaTeX arrays instead
- ❌ Excalidraw JSON - Tables don't need visual diagrams
- ❌ SVG for tables - SVG is only for actual diagrams
- ❌ Markdown tables - Not rendered in KaTeX

## Testing

To test KaTeX rendering, you can:
1. Visit https://katex.org/
2. Paste the LaTeX code
3. See instant rendering
4. Adjust formatting as needed
