import { FeedbackComment, FeedbackTag, PageView } from '@flowkit/types/index'
import { useFeedback } from '@flowkit-features/feedback/context/FeedbackContext'
import { useNavigation } from '@flowkit-shared/contexts/DashboardContext'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

type ViewMode = 'wall' | 'add-comment'

export interface CommentFilter {
  pageId: string | null
  tags: Set<FeedbackTag>
  filterForCurrentPage: boolean
}

async function captureElementAsDataURL(element: HTMLElement): Promise<string> {
  const width = element.offsetWidth || 390
  const height = element.offsetHeight || 844

  let styles = ''
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const sheet = document.styleSheets[i]
      const rules = sheet.cssRules
      if (rules) {
        for (let j = 0; j < rules.length; j++) {
          styles += rules[j].cssText + '\n'
        }
      }
    } catch {
      // cross-origin stylesheet — browser blocks cssRules access, skip silently
    }
  }

  const clone = element.cloneNode(true) as HTMLElement
  clone.style.transform = 'none'
  clone.style.transformOrigin = 'unset'

  const html = new XMLSerializer().serializeToString(clone)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width: 100%; height: 100%; position: relative; overflow: hidden; margin: 0; padding: 0;">
          <style>
            ${styles}
          </style>
          ${html}
        </div>
      </foreignObject>
    </svg>
  `

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const pngUrl = canvas.toDataURL('image/png')
          resolve(pngUrl)
        } else {
          reject(new Error('Failed to get 2d context'))
        }
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      reject(new Error('Failed to render mockup SVG to canvas'))
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

interface FeedbackTabContextType {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  showExportModal: boolean
  setShowExportModal: (show: boolean) => void
  showImportModal: boolean
  setShowImportModal: (show: boolean) => void
  showFilterPanel: boolean
  setShowFilterPanel: (show: boolean) => void
  filter: CommentFilter
  setFilter: Dispatch<SetStateAction<CommentFilter>>

  // Add Comment Form State
  selectedPage: string
  setSelectedPage: (page: string) => void
  selectedPageLabel: string
  setSelectedPageLabel: (label: string) => void
  textInput: string
  setTextInput: (text: string) => void
  selectedTags: FeedbackTag[]
  setSelectedTags: Dispatch<SetStateAction<FeedbackTag[]>>
  tagInput: string
  setTagInput: (text: string) => void
  includeScreenshot: boolean
  setIncludeScreenshot: (include: boolean) => void
  isCapturing: boolean

  // Actions
  handleAddComment: () => Promise<void>

  // Computed values
  filteredGroupedComments: Record<string, FeedbackComment[]>
  allTags: Set<FeedbackTag>
  hasActiveFilters: boolean
  views: PageView[]

  // Export states
  exportReviewerName: string
  setExportReviewerName: (name: string) => void
  exportIncludeScreenshots: boolean
  setExportIncludeScreenshots: (include: boolean) => void
  cloudKey: string
  setCloudKey: (key: string) => void
  providedKey: string
  exportStatus: 'idle' | 'uploading' | 'success' | 'error'
  exportError: string
  exportShareUrl: string
  cloudExportEnabled: boolean
  handleExport: () => void
  handleLocalExport: (format: 'md' | 'json') => void
  resetExport: () => void

  // Import states
  importStatus: 'idle' | 'success' | 'error'
  setImportStatus: (status: 'idle' | 'success' | 'error') => void
  importErrorMessage: string
  importedCount: number
  importedReviewer: string
  importedDuplicates: number
  importedTotalAfter: number
  handleImportFile: (file: File) => Promise<void>
  handleImportText: (text: string) => Promise<void>
  importReadKey: string
  setImportReadKey: (key: string) => void
  handleImportFromCloud: (binUrl: string) => Promise<void>
}

export const FeedbackTabContext = createContext<FeedbackTabContextType | null>(null)

export function FeedbackTabProvider({
  children,
  views,
}: {
  children: ReactNode
  views: PageView[]
}) {
  const {
    comments,
    addComment,
    exportAndDownload,
    lastReviewerName,
    setLastReviewerName,
    importCommentsFromText,
    cloudExportEnabled,
    cloudKey,
    setCloudKey,
    providedKey,
    importReadKey,
    setImportReadKey,
    pushJson,
    pullFromBin,
  } = useFeedback()
  const { activeViewId } = useNavigation()

  const [viewMode, setViewMode] = useState<ViewMode>('wall')
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [filter, setFilter] = useState<CommentFilter>({
    pageId: null,
    tags: new Set(),
    filterForCurrentPage: false,
  })

  const [selectedPage, setSelectedPage] = useState('')
  const [selectedPageLabel, setSelectedPageLabel] = useState('')

  // Reset page selection to the active page whenever the add-comment form opens.
  useEffect(() => {
    if (viewMode !== 'add-comment') return
    const id = activeViewId.replace('-play', '')
    const label = views.find(v => v.id === id)?.label ?? ''
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPage(id)
    setSelectedPageLabel(label)
  }, [viewMode, activeViewId, views])
  const [textInput, setTextInput] = useState('')
  const [selectedTags, setSelectedTags] = useState<FeedbackTag[]>([])
  const [tagInput, setTagInput] = useState('')

  const [exportReviewerName, setExportReviewerName] = useState(lastReviewerName)

  // Scoped captures & formatting states
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importErrorMessage, setImportErrorMessage] = useState('')
  const [importedCount, setImportedCount] = useState(0)
  const [importedReviewer, setImportedReviewer] = useState('')
  const [importedDuplicates, setImportedDuplicates] = useState(0)
  const [importedTotalAfter, setImportedTotalAfter] = useState(0)

  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [isCapturing, setIsCapturing] = useState(false)

  const [exportStatus, setExportStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>(
    'idle'
  )
  const [exportError, setExportError] = useState('')
  const [exportShareUrl, setExportShareUrl] = useState('')

  const [exportIncludeScreenshots, setExportIncludeScreenshots] = useState(true)

  const handleAddComment = async () => {
    if (!textInput.trim() || !selectedPage) return

    let screenshotUrl: string | undefined = undefined
    const cleanActiveId = activeViewId.replace('-play', '')

    if (includeScreenshot && selectedPage === cleanActiveId) {
      setIsCapturing(true)
      try {
        const mockupEl = document.querySelector('#mockup-container')
          ?.firstElementChild as HTMLElement
        if (mockupEl) {
          screenshotUrl = await captureElementAsDataURL(mockupEl)
        }
      } catch (err) {
        console.warn('Gracefully skipped screenshot capture:', err)
      } finally {
        setIsCapturing(false)
      }
    }

    addComment(selectedPage, selectedPageLabel, selectedTags, textInput.trim(), 'Me', screenshotUrl)
    setTextInput('')
    setSelectedTags([])
    setTagInput('')
    setSelectedPage('')
    setSelectedPageLabel('')
    setViewMode('wall')
  }

  const handleExport = async () => {
    if (!exportReviewerName.trim()) return
    setExportStatus('uploading')
    setExportError('')
    setExportShareUrl('')
    try {
      const { json } = await exportAndDownload(
        exportReviewerName.trim(),
        'json',
        exportIncludeScreenshots,
        { download: false }
      )
      setLastReviewerName(exportReviewerName.trim())
      const dateStr = new Date().toISOString().split('T')[0]
      const { shareUrl } = await pushJson(`wireframe-feedback-${dateStr}`, json!)
      setExportShareUrl(shareUrl)
      await navigator.clipboard.writeText(shareUrl).catch(() => {})
      setExportStatus('success')
    } catch (err: unknown) {
      setExportError((err as Error).message || 'Upload failed. Please try again.')
      setExportStatus('error')
    }
  }

  const resetExport = () => {
    setExportStatus('idle')
    setExportError('')
    setExportShareUrl('')
  }

  const handleLocalExport = async (format: 'md' | 'json') => {
    if (!exportReviewerName.trim()) return
    await exportAndDownload(exportReviewerName.trim(), format, exportIncludeScreenshots)
    setLastReviewerName(exportReviewerName.trim())
    setShowExportModal(false)
  }

  const handleImportFromCloud = async (binUrl: string) => {
    const json = await pullFromBin(binUrl)
    const file = new File([json], 'cloud-import.json', { type: 'application/json' })
    await handleImportFile(file)
  }

  const handleImportText = async (text: string) => {
    try {
      const { reviewer, added, duplicates } = await importCommentsFromText(text)
      setImportedCount(added)
      setImportedDuplicates(duplicates)
      setImportedReviewer(reviewer)
      setImportedTotalAfter(comments.length + added)
      setImportStatus('success')
    } catch (err: unknown) {
      setImportErrorMessage((err as Error).message || 'Failed to parse feedback.')
      setImportStatus('error')
    }
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      await handleImportText(text)
    } catch (err: unknown) {
      setImportErrorMessage((err as Error).message || 'Failed to read file.')
      setImportStatus('error')
    }
  }

  // Compute filters
  // Compute filters
  const effectivePageId = filter.filterForCurrentPage
    ? activeViewId.replace('-play', '')
    : filter.pageId
  const filteredComments = comments.filter(c => {
    if (effectivePageId && c.pageId !== effectivePageId) return false
    if (filter.tags.size > 0) return c.tags.some(tag => filter.tags.has(tag))
    return true
  })

  const grouped = filteredComments.reduce(
    (acc, comment) => {
      if (!acc[comment.pageId]) acc[comment.pageId] = []
      acc[comment.pageId].push(comment)
      return acc
    },
    {} as Record<string, typeof comments>
  )
  // Sort groups by page label, comments within each group by timestamp ascending
  const filteredGroupedComments = Object.fromEntries(
    Object.entries(grouped)
      .sort(([, a], [, b]) => (a[0].pageLabel || '').localeCompare(b[0].pageLabel || ''))
      .map(([id, cs]) => [id, [...cs].sort((a, b) => a.timestamp.localeCompare(b.timestamp))])
  )

  const allTags = new Set(comments.flatMap(c => c.tags))
  const hasActiveFilters = !!filter.pageId || filter.tags.size > 0

  return (
    <FeedbackTabContext.Provider
      value={{
        viewMode,
        setViewMode,
        showExportModal,
        setShowExportModal,
        showImportModal,
        setShowImportModal,
        showFilterPanel,
        setShowFilterPanel,
        filter,
        setFilter,
        selectedPage,
        setSelectedPage,
        selectedPageLabel,
        setSelectedPageLabel,
        textInput,
        setTextInput,
        selectedTags,
        setSelectedTags,
        tagInput,
        setTagInput,
        includeScreenshot,
        setIncludeScreenshot,
        isCapturing,
        handleAddComment,
        filteredGroupedComments,
        allTags,
        hasActiveFilters,
        views,
        exportReviewerName,
        setExportReviewerName,
        exportIncludeScreenshots,
        setExportIncludeScreenshots,
        cloudKey,
        setCloudKey,
        providedKey,
        exportStatus,
        exportError,
        exportShareUrl,
        cloudExportEnabled,
        handleExport,
        handleLocalExport,
        resetExport,
        importStatus,
        setImportStatus,
        importErrorMessage,
        importedCount,
        importedReviewer,
        importedDuplicates,
        importedTotalAfter,
        handleImportFile,
        handleImportText,
        importReadKey,
        setImportReadKey,
        handleImportFromCloud,
      }}
    >
      {children}
    </FeedbackTabContext.Provider>
  )
}

export function useFeedbackTabContext() {
  const ctx = useContext(FeedbackTabContext)
  if (!ctx) {
    throw new Error('useFeedbackTabContext must be used within a FeedbackTabProvider')
  }
  return ctx
}
