"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Calendar, Edit, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface JournalEntry {
  id: string
  title: string
  content: string
  weekOf: string
  createdAt: string
}

export default function JournalPage() {
  // TODO: This will come from a store later
  const [entries, setEntries] = useState<JournalEntry[]>([])
  
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    weekOf: ''
  })

  const handleSave = () => {
    if (!formData.title || !formData.content) return

    if (editingEntry) {
      // Update existing entry
      setEntries(entries.map(entry => 
        entry.id === editingEntry.id 
          ? { ...entry, ...formData }
          : entry
      ))
    } else {
      // Create new entry
      const newEntry: JournalEntry = {
        id: Date.now().toString(),
        ...formData,
        createdAt: new Date().toISOString()
      }
      setEntries([newEntry, ...entries])
    }

    // Reset form
    setFormData({ title: '', content: '', weekOf: '' })
    setShowForm(false)
    setEditingEntry(null)
  }

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setFormData({
      title: entry.title,
      content: entry.content,
      weekOf: entry.weekOf
    })
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    setEntries(entries.filter(entry => entry.id !== id))
  }

  const getWeekDateRange = (weekOf: string) => {
    if (!weekOf) return ''
    const date = new Date(weekOf)
    const endDate = new Date(date)
    endDate.setDate(date.getDate() + 6)
    
    return `${formatDate(date)} - ${formatDate(endDate)}`
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trading Journal</h1>
            <p className="text-gray-600 mt-2">
              Weekly reflections and trading insights
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Entry Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {editingEntry ? 'Edit Entry' : 'New Journal Entry'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Week Of (Monday)
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
                Title
              </label>
              <Input
                placeholder="e.g., Week of Jan 15 - Market Volatility"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Content
              </label>
              <Textarea
                placeholder="What did you learn this week? Key trades, market observations, strategy adjustments..."
                rows={6}
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleSave} 
                disabled={!formData.title || !formData.content}
              >
                {editingEntry ? 'Update Entry' : 'Save Entry'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowForm(false)
                  setEditingEntry(null)
                  setFormData({ title: '', content: '', weekOf: '' })
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
              Start documenting your weekly trading insights and learnings
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
                  <div>
                    <CardTitle className="text-lg">{entry.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        {getWeekDateRange(entry.weekOf)}
                      </span>
                      <Badge variant="outline">
                        {formatDate(entry.createdAt)}
                      </Badge>
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
      {entries.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Journal Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
                <p className="text-sm text-gray-600">Total Entries</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(entries.reduce((sum, entry) => sum + entry.content.length, 0) / entries.length)}
                </p>
                <p className="text-sm text-gray-600">Avg Characters</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {entries.length > 0 ? Math.ceil((new Date().getTime() - new Date(entries[entries.length - 1].createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7)) : 0}
                </p>
                <p className="text-sm text-gray-600">Weeks Tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}