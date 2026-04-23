'use client'

import { useRef, useState, useEffect, type RefObject } from 'react'

export function useInView(threshold = 0.3, delay = 300): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const current = ref.current
    const timer = setTimeout(() => {
      const obs = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) setVisible(true)
      }, { threshold })
      if (current) obs.observe(current)
    }, delay)
    return () => clearTimeout(timer)
  }, [threshold, delay])
  return [ref, visible]
}
