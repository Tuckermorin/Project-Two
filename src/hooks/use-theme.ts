"use client"

import { useEffect, useState } from 'react'

export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState(true)

  useEffect(() => {
    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'light') {
      setIsDarkMode(false)
      document.body.classList.add('light-mode')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.body.classList.remove('light-mode')
    }
  }, [])

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const newIsDarkMode = !prev
      if (newIsDarkMode) {
        document.body.classList.remove('light-mode')
        document.documentElement.classList.add('dark')
        localStorage.setItem('theme', 'dark')
      } else {
        document.body.classList.add('light-mode')
        document.documentElement.classList.remove('dark')
        localStorage.setItem('theme', 'light')
      }
      return newIsDarkMode
    })
  }

  return { isDarkMode, toggleTheme }
}
