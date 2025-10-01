// src/components/ips/ips-exit-watch-config.tsx
"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Eye,
  Plus,
  Trash2,
  AlertTriangle,
  DollarSign,
  Percent
} from 'lucide-react'

export interface ExitStrategies {
  profit: {
    enabled: boolean
    type: 'percentage' | 'dollar'
    value: number
    description: string
  }
  loss: {
    enabled: boolean
    type: 'percentage' | 'dollar'
    value: number
    description: string
  }
  time: {
    enabled: boolean
    daysBeforeExpiration: number
    description: string
  }
}

export interface WatchRule {
  id: string
  type: 'price' | 'percentage' | 'factor'
  factorId?: string
  factorName?: string
  operator: 'gt' | 'lt' | 'gte' | 'lte'
  value: number
  description: string
}

export interface WatchCriteria {
  enabled: boolean
  rules: WatchRule[]
}

interface IPSExitWatchConfigProps {
  exitStrategies?: ExitStrategies
  watchCriteria?: WatchCriteria
  availableFactors?: Array<{ id: string; name: string }>
  onChange: (exitStrategies: ExitStrategies, watchCriteria: WatchCriteria) => void
}

const defaultExitStrategies: ExitStrategies = {
  profit: {
    enabled: true,
    type: 'percentage',
    value: 50,
    description: 'Exit at 50% of max profit'
  },
  loss: {
    enabled: true,
    type: 'percentage',
    value: 200,
    description: 'Exit at 200% of credit received'
  },
  time: {
    enabled: false,
    daysBeforeExpiration: 0,
    description: 'Exit N days before expiration'
  }
}

const defaultWatchCriteria: WatchCriteria = {
  enabled: false,
  rules: []
}

export function IPSExitWatchConfig({
  exitStrategies: initialExitStrategies,
  watchCriteria: initialWatchCriteria,
  availableFactors = [],
  onChange
}: IPSExitWatchConfigProps) {
  const [exitStrategies, setExitStrategies] = useState<ExitStrategies>(
    initialExitStrategies || defaultExitStrategies
  )
  const [watchCriteria, setWatchCriteria] = useState<WatchCriteria>(
    initialWatchCriteria || defaultWatchCriteria
  )

  // Notify parent of changes
  useEffect(() => {
    onChange(exitStrategies, watchCriteria)
  }, [exitStrategies, watchCriteria])

  const updateExitStrategy = (
    category: 'profit' | 'loss' | 'time',
    field: string,
    value: any
  ) => {
    setExitStrategies(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }))
  }

  const addWatchRule = () => {
    const newRule: WatchRule = {
      id: `rule-${Date.now()}`,
      type: 'percentage',
      operator: 'gte',
      value: 10,
      description: 'New watch rule'
    }
    setWatchCriteria(prev => ({
      ...prev,
      rules: [...prev.rules, newRule]
    }))
  }

  const updateWatchRule = (ruleId: string, field: string, value: any) => {
    setWatchCriteria(prev => ({
      ...prev,
      rules: prev.rules.map(rule =>
        rule.id === ruleId
          ? { ...rule, [field]: value }
          : rule
      )
    }))
  }

  const removeWatchRule = (ruleId: string) => {
    setWatchCriteria(prev => ({
      ...prev,
      rules: prev.rules.filter(rule => rule.id !== ruleId)
    }))
  }

  const getOperatorLabel = (operator: string) => {
    switch (operator) {
      case 'gt': return '>'
      case 'gte': return '≥'
      case 'lt': return '<'
      case 'lte': return '≤'
      default: return operator
    }
  }

  return (
    <div className="space-y-6">
      {/* Exit Strategies Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Exit Strategies
          </CardTitle>
          <CardDescription>
            Define when to exit your positions for profit or loss management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profit Target */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <Label className="text-base font-semibold">Profit Target</Label>
              </div>
              <Switch
                checked={exitStrategies.profit.enabled}
                onCheckedChange={(checked) =>
                  updateExitStrategy('profit', 'enabled', checked)
                }
              />
            </div>

            {exitStrategies.profit.enabled && (
              <div className="space-y-4 pl-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Exit Type</Label>
                    <Select
                      value={exitStrategies.profit.type}
                      onValueChange={(value) =>
                        updateExitStrategy('profit', 'type', value)
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="dollar">Dollar Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>
                      Target Value {exitStrategies.profit.type === 'percentage' ? '(%)' : '($)'}
                    </Label>
                    <Input
                      type="number"
                      value={exitStrategies.profit.value}
                      onChange={(e) =>
                        updateExitStrategy('profit', 'value', parseFloat(e.target.value))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={exitStrategies.profit.description}
                    onChange={(e) =>
                      updateExitStrategy('profit', 'description', e.target.value)
                    }
                    className="mt-1"
                    placeholder="e.g., Exit at 50% of max profit"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stop Loss */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <Label className="text-base font-semibold">Stop Loss</Label>
              </div>
              <Switch
                checked={exitStrategies.loss.enabled}
                onCheckedChange={(checked) =>
                  updateExitStrategy('loss', 'enabled', checked)
                }
              />
            </div>

            {exitStrategies.loss.enabled && (
              <div className="space-y-4 pl-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Exit Type</Label>
                    <Select
                      value={exitStrategies.loss.type}
                      onValueChange={(value) =>
                        updateExitStrategy('loss', 'type', value)
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="dollar">Dollar Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>
                      Loss Threshold {exitStrategies.loss.type === 'percentage' ? '(%)' : '($)'}
                    </Label>
                    <Input
                      type="number"
                      value={exitStrategies.loss.value}
                      onChange={(e) =>
                        updateExitStrategy('loss', 'value', parseFloat(e.target.value))
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={exitStrategies.loss.description}
                    onChange={(e) =>
                      updateExitStrategy('loss', 'description', e.target.value)
                    }
                    className="mt-1"
                    placeholder="e.g., Exit at 200% of credit received"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Time-Based Exit */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <Label className="text-base font-semibold">Time-Based Exit</Label>
              </div>
              <Switch
                checked={exitStrategies.time.enabled}
                onCheckedChange={(checked) =>
                  updateExitStrategy('time', 'enabled', checked)
                }
              />
            </div>

            {exitStrategies.time.enabled && (
              <div className="space-y-4 pl-6">
                <div>
                  <Label>Days Before Expiration</Label>
                  <Input
                    type="number"
                    value={exitStrategies.time.daysBeforeExpiration}
                    onChange={(e) =>
                      updateExitStrategy('time', 'daysBeforeExpiration', parseInt(e.target.value))
                    }
                    className="mt-1"
                    min="0"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={exitStrategies.time.description}
                    onChange={(e) =>
                      updateExitStrategy('time', 'description', e.target.value)
                    }
                    className="mt-1"
                    placeholder="e.g., Exit 0 days before expiration"
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Watch Criteria Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Watch Criteria
          </CardTitle>
          <CardDescription>
            Set up alerts when positions need attention based on specific conditions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable Watch Criteria</Label>
            <Switch
              checked={watchCriteria.enabled}
              onCheckedChange={(checked) =>
                setWatchCriteria(prev => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          {watchCriteria.enabled && (
            <>
              <div className="space-y-3">
                {watchCriteria.rules.map((rule, index) => (
                  <div key={rule.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Rule {index + 1}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWatchRule(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Watch Type</Label>
                        <Select
                          value={rule.type}
                          onValueChange={(value) =>
                            updateWatchRule(rule.id, 'type', value)
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Stock % Change</SelectItem>
                            <SelectItem value="price">Stock Price</SelectItem>
                            <SelectItem value="factor">IPS Factor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {rule.type === 'factor' && (
                        <div>
                          <Label>Factor</Label>
                          <Select
                            value={rule.factorId}
                            onValueChange={(value) => {
                              const factor = availableFactors.find(f => f.id === value)
                              updateWatchRule(rule.id, 'factorId', value)
                              if (factor) {
                                updateWatchRule(rule.id, 'factorName', factor.name)
                              }
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select factor" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableFactors.map(factor => (
                                <SelectItem key={factor.id} value={factor.id}>
                                  {factor.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div>
                        <Label>Condition</Label>
                        <Select
                          value={rule.operator}
                          onValueChange={(value) =>
                            updateWatchRule(rule.id, 'operator', value)
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gt">Greater than ({">"}) </SelectItem>
                            <SelectItem value="gte">Greater or equal (≥)</SelectItem>
                            <SelectItem value="lt">Less than ({"<"})</SelectItem>
                            <SelectItem value="lte">Less or equal (≤)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Threshold Value</Label>
                        <Input
                          type="number"
                          value={rule.value}
                          onChange={(e) =>
                            updateWatchRule(rule.id, 'value', parseFloat(e.target.value))
                          }
                          className="mt-1"
                          step={rule.type === 'percentage' ? '0.1' : '1'}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Description</Label>
                      <Input
                        value={rule.description}
                        onChange={(e) =>
                          updateWatchRule(rule.id, 'description', e.target.value)
                        }
                        className="mt-1"
                        placeholder="e.g., Alert when stock drops more than 10%"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={addWatchRule}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Watch Rule
              </Button>

              {watchCriteria.rules.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No watch rules configured. Click "Add Watch Rule" to create one.</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
