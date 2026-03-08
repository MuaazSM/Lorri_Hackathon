import { useRef, useState, useEffect } from 'react'

export function useInView(threshold = 0.3, delay = 300) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      const obs = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) setVisible(true)
      }, { threshold })
      if (ref.current) obs.observe(ref.current)
    }, delay)
    return () => clearTimeout(timer)
  }, [])
  return [ref, visible]
}