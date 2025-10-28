"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Calendar, Edit, Trash2, Loader2, Sparkles, TrendingUp } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/components/auth/auth-provider'

interface JournalEntry {
  id: string
  title: string
  content: string
  week_of: string | null
  tags: string[] | null
  mood: string | null
  created_at: string
  updated_at: string
}

interface JournalAnalysis {
  total_entries: number
  avg_entry_length: number
  most_common_mood: string | null
  mood_distribution: Record<string, number>
  most_common_tags: string[]
  tag_frequency: Record<string, number>
  entries_by_week: Record<string, number>
  consistency_score: number
}

export default function JournalPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    weekOf: '',
    mood: '',
    tags: ''
  })
  const [analysis, setAnalysis] = useState<JournalAnalysis | null>(null)
  const [showInsights, setShowInsights] = useState(false)

  // Fetch journal entries on mount
  useEffect(() => {
    if (user) {
      fetchEntries()
      fetchAnalysis()
    }
  }, [user])

  const fetchEntries = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/journal')
      if (response.ok) {
        const data = await response.json()
        setEntries(data.entries || [])
      } else {
        console.error('Failed to fetch journal entries')
      }
    } catch (error) {
      console.error('Error fetching journal entries:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalysis = async () => {
    try {
      const response = await fetch('/api/journal/insights?sinceDays=90')
      if (response.ok) {
        const data = await response.json()
        setAnalysis(data.analysis)
      }
    } catch (error) {
      console.error('Error fetching journal analysis:', error)
    }
  }

  const handleSave = async () => {
    if (!formData.title || !formData.content) return

    try {
      setSaving(true)

      if (editingEntry) {
        // Update existing entry
        const response = await fetch('/api/journal', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingEntry.id,
            title: formData.title,
            content: formData.content,
            weekOf: formData.weekOf || null,
            mood: formData.mood || null,
            tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [],
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setEntries(entries.map(entry =>
            entry.id === editingEntry.id ? data.entry : entry
          ))
        }
      } else {
        // Create new entry
        const response = await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            content: formData.content,
            weekOf: formData.weekOf || null,
            mood: formData.mood || null,
            tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [],
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setEntries([data.entry, ...entries])
        }
      }

      // Reset form
      setFormData({ title: '', content: '', weekOf: '', mood: '', tags: '' })
      setShowForm(false)
      setEditingEntry(null)

      // Refresh analysis
      fetchAnalysis()
    } catch (error) {
      console.error('Error saving journal entry:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setFormData({
      title: entry.title,
      content: entry.content,
      weekOf: entry.week_of || '',
      mood: entry.mood || '',
      tags: entry.tags ? entry.tags.join(', ') : ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this journal entry?')) return

    try {
      const response = await fetch(`/api/journal?id=${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setEntries(entries.filter(entry => entry.id !== id))
        fetchAnalysis()
      }
    } catch (error) {
      console.error('Error deleting journal entry:', error)
    }
  }

  const getWeekDateRange = (weekOf: string) => {
    if (!weekOf) return ''
    const date = new Date(weekOf)
    const endDate = new Date(date)
    endDate.setDate(date.getDate() + 6)
    
    return `${formatDate(date)} - ${formatDate(endDate)}`
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading journal entries...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trading Journal</h1>
            <p className="text-gray-600 mt-2">
              Document your trading thoughts, insights, and reflections
            </p>
          </div>
          <div className="flex gap-2">
            {entries.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowInsights(!showInsights)}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                {showInsights ? 'Hide' : 'Show'} Insights
              </Button>
            )}
            <Button onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-2" />
              New Entry
            </Button>
          </div>
        </div>
      </div>

      {/* AI Insights Panel */}
      {showInsights && analysis && (
        <Card className="mb-6 border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Journal Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {analysis.total_entries}
                </p>
                <p className="text-sm text-gray-600">Total Entries</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {Math.round(analysis.consistency_score)}%
                </p>
                <p className="text-sm text-gray-600">Consistency</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {Math.round(analysis.avg_entry_length)}
                </p>
                <p className="text-sm text-gray-600">Avg Length</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {analysis.most_common_mood || 'N/A'}
                </p>
                <p className="text-sm text-gray-600">Top Mood</p>
              </div>
            </div>
            {analysis.most_common_tags && analysis.most_common_tags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Most Common Tags:</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.most_common_tags.slice(0, 5).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Entry Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {editingEntry ? 'Edit Entry' : 'New Journal Entry'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Week Of (Optional)
                </label>
                <Input
                  type="date"
                  value={formData.weekOf}
                  onChange={(e) => setFormData({...formData, weekOf: e.target.value})}
                />
                {formData.weekOf && (
                  <p className="text-xs text-gray-500 mt-1">
                    Week: {getWeekDateRange(formData.weekOf)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mood (Optional)
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.mood}
                  onChange={(e) => setFormData({...formData, mood: e.target.value})}
                >
                  <option value="">Select mood...</option>
                  <option value="confident">Confident</option>
                  <option value="excited">Excited</option>
                  <option value="neutral">Neutral</option>
                  <option value="anxious">Anxious</option>
                  <option value="frustrated">Frustrated</option>
                  <option value="disciplined">Disciplined</option>
                  <option value="uncertain">Uncertain</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <Input
                placeholder="e.g., Week of Jan 15 - Market Volatility Reflections"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (Optional, comma-separated)
              </label>
              <Input
                placeholder="e.g., mindset, strategy, risk-management"
                value={formData.tags}
                onChange={(e) => setFormData({...formData, tags: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Content
              </label>
              <Textarea
                placeholder="What did you learn this week? Key trades, market observations, strategy adjustments, emotional patterns..."
                rows={8}
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!formData.title || !formData.content || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingEntry ? 'Update Entry' : 'Save Entry'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false)
                  setEditingEntry(null)
                  setFormData({ title: '', content: '', weekOf: '', mood: '', tags: '' })
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journal Entries */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Journal Entries</h3>
            <p className="text-gray-500 mb-6">
              Start documenting your trading insights, reflections, and learnings
            </p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Write Your First Entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{entry.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {entry.week_of ? getWeekDateRange(entry.week_of) : formatDate(entry.created_at)}
                        </span>
                      </div>
                      {entry.mood && (
                        <Badge variant="outline" className="capitalize">
                          {entry.mood}
                        </Badge>
                      )}
                      {entry.tags && entry.tags.length > 0 && (
                        entry.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(entry)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{entry.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {entries.length > 0 && analysis && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Journal Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{analysis.total_entries}</p>
                <p className="text-sm text-gray-600">Total Entries</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(analysis.avg_entry_length)}
                </p>
                <p className="text-sm text-gray-600">Avg Characters</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(analysis.consistency_score)}%
                </p>
                <p className="text-sm text-gray-600">Consistency Score</p>
              </div>
            </div>
            {analysis.mood_distribution && Object.keys(analysis.mood_distribution).length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-3">Mood Distribution:</p>
                <div className="space-y-2">
                  {Object.entries(analysis.mood_distribution)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([mood, count]) => (
                      <div key={mood} className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 capitalize w-24">{mood}:</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full"
                            style={{
                              width: `${(Number(count) / analysis.total_entries) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-600 w-8 text-right">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}