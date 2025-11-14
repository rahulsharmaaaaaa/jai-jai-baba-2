import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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

async function initializeWorkerWithRetry(maxRetries: number = 50): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await waitForNetwork()

      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

      await pdfjsLib.getDocument({ data: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }).promise.catch(() => null)

      console.log('PDF worker initialized successfully')
      return
    } catch (error) {
      console.error(`Worker initialization attempt ${attempt}/${maxRetries} failed:`, error)

      if (attempt < maxRetries) {
        const waitTime = Math.min(5000, 2000 * attempt)
        console.log(`Retrying in ${waitTime/1000} seconds...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  throw new Error('Failed to initialize PDF worker after maximum retries')
}

export async function convertPdfToImages(file: File): Promise<string[]> {
  await initializeWorkerWithRetry()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    await waitForNetwork()

    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 })

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not get canvas context')

    canvas.height = viewport.height
    canvas.width = viewport.width

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise

    const imageData = canvas.toDataURL('image/png')
    images.push(imageData.split(',')[1])
  }

  return images
}
