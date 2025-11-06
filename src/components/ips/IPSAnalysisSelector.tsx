"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface IPSForAnalysis {
  id: string
  name: string
  description?: string
  total_trades: number
  win_rate: number
  created_at: string
  is_active: boolean
}

interface IPSAnalysisSelectorProps {
  isOpen: boolean
  onClose: () => void
  ipsList: any[]
}

export function IPSAnalysisSelector({ isOpen, onClose, ipsList }: IPSAnalysisSelectorProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [eligibleIPS, setEligibleIPS] = useState<IPSForAnalysis[]>([])
  const [ineligibleIPS, setIneligibleIPS] = useState<IPSForAnalysis[]>([])

  useEffect(() => {
    if (isOpen) {
      checkEligibility()
    }
  }, [isOpen, ipsList])

  const checkEligibility = async () => {
    try {
      setLoading(true)

      // Fetch trade counts and deployment dates for each IPS
      const eligible: IPSForAnalysis[] = []
      const ineligible: IPSForAnalysis[] = []

      for (const ips of ipsList) {
        // Fetch trades for this IPS
        const tradesRes = await fetch(`/api/trades?ips_id=${ips.id}&status=closed`)
        const tradesData = tradesRes.ok ? await tradesRes.json() : { data: [] }
        const trades = tradesData.data || []

        // Calculate deployment duration
        const createdDate = new Date(ips.created_at)
        const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

        // Check eligibility: 25+ trades AND 14+ days deployment
        const isEligible = trades.length >= 25 && daysSinceCreation >= 14

        const ipsData: IPSForAnalysis = {
          id: ips.id,
          name: ips.name,
          description: ips.description,
          total_trades: trades.length,
          win_rate: ips.win_rate || 0,
          created_at: ips.created_at,
          is_active: ips.is_active,
        }

        if (isEligible) {
          eligible.push(ipsData)
        } else {
          ineligible.push(ipsData)
        }
      }

      setEligibleIPS(eligible)
      setIneligibleIPS(ineligible)
    } catch (error) {
      console.error('Error checking IPS eligibility:', error)
      toast.error('Failed to load IPS data')
    } finally {
      setLoading(false)
    }
  }

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }

  const handleAnalyze = () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one IPS to analyze')
      return
    }

    const idsParam = Array.from(selectedIds).join(',')
    router.push(`/ips/analysis?ids=${idsParam}`)
    onClose()
  }

  const getDaysDeployed = (createdAt: string) => {
    const created = new Date(createdAt)
    return Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Select IPSs for Analysis
          </DialogTitle>
          <DialogDescription>
            Choose one or more Investment Policy Statements to analyze. Requires at least 25 closed trades and 14 days of deployment.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Eligible IPSs */}
            {eligibleIPS.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Ready for Analysis ({eligibleIPS.length})
                </h3>
                <div className="space-y-3">
                  {eligibleIPS.map((ips) => (
                    <Card
                      key={ips.id}
                      className={`cursor-pointer transition-all ${
                        selectedIds.has(ips.id)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                          : 'hover:border-gray-400'
                      }`}
                      onClick={() => toggleSelection(ips.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedIds.has(ips.id)}
                            onCheckedChange={() => toggleSelection(ips.id)}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-semibold">{ips.name}</h4>
                              {ips.is_active && (
                                <Badge variant="default" className="text-xs">Active</Badge>
                              )}
                            </div>
                            {ips.description && (
                              <p className="text-sm text-muted-foreground mb-2">{ips.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs">
                              <div>
                                <span className="text-muted-foreground">Trades: </span>
                                <span className="font-semibold">{ips.total_trades}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Win Rate: </span>
                                <span className="font-semibold text-green-600">
                                  {Math.round(ips.win_rate)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Days Active: </span>
                                <span className="font-semibold">{getDaysDeployed(ips.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Ineligible IPSs */}
            {ineligibleIPS.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  Not Yet Eligible ({ineligibleIPS.length})
                </h3>
                <div className="space-y-3">
                  {ineligibleIPS.map((ips) => {
                    const daysDeployed = getDaysDeployed(ips.created_at)
                    const needsMoreTrades = ips.total_trades < 25
                    const needsMoreDays = daysDeployed < 14

                    return (
                      <Card key={ips.id} className="opacity-60">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-semibold">{ips.name}</h4>
                                {ips.is_active && (
                                  <Badge variant="outline" className="text-xs">Active</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-xs mb-2">
                                <div>
                                  <span className="text-muted-foreground">Trades: </span>
                                  <span className={needsMoreTrades ? 'text-red-600 font-semibold' : ''}>
                                    {ips.total_trades}/25
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Days Active: </span>
                                  <span className={needsMoreDays ? 'text-red-600 font-semibold' : ''}>
                                    {daysDeployed}/14
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {needsMoreTrades && `Need ${25 - ips.total_trades} more closed trades. `}
                                {needsMoreDays && `Need ${14 - daysDeployed} more days of deployment.`}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {eligibleIPS.length === 0 && ineligibleIPS.length === 0 && !loading && (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No IPSs Available</h3>
                <p className="text-sm text-muted-foreground">
                  Create an IPS and execute some trades to enable analysis.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={selectedIds.size === 0 || loading}
          >
            {selectedIds.size === 0
              ? 'Select IPS to Analyze'
              : `Analyze ${selectedIds.size} IPS${selectedIds.size > 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
