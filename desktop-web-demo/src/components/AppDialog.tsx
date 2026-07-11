import { useEffect, useRef, type FormEventHandler, type ReactNode } from 'react'

type AppDialogProps = {
  children: ReactNode
  className: string
  backdropClassName?: string
  labelledBy?: string
  label?: string
  onClose: () => void
  as?: 'div' | 'form'
  onSubmit?: FormEventHandler<HTMLFormElement>
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex="0"]',
].join(', ')

export default function AppDialog({
  children,
  className,
  backdropClassName,
  labelledBy,
  label,
  onClose,
  as = 'div',
  onSubmit,
}: AppDialogProps) {
  const surfaceRef = useRef<HTMLDivElement | HTMLFormElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.classList.add('has-open-dialog')
    const focusTimer = window.setTimeout(() => {
      surfaceRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus()
    }, 0)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = surfaceRef.current
        ? Array.from(surfaceRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        : []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('has-open-dialog')
      previouslyFocused?.focus()
    }
  }, [])

  const sharedProps = {
    className,
    role: 'dialog',
    'aria-modal': true as const,
    'aria-labelledby': labelledBy,
    'aria-label': label,
  }

  return (
    <div
      className={['modal-backdrop', backdropClassName].filter(Boolean).join(' ')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {as === 'form' ? (
        <form
          {...sharedProps}
          ref={(node) => { surfaceRef.current = node }}
          onSubmit={onSubmit}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children}
        </form>
      ) : (
        <div
          {...sharedProps}
          ref={(node) => { surfaceRef.current = node }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  )
}
