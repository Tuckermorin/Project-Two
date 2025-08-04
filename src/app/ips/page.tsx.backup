"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Settings, CheckCircle, ArrowLeft } from 'lucide-react'
import { IPSBuilderForm } from '@/components/ips/ips-builder-form'

export default function IPSPage() {
  // TODO: This will come from database later
  const [hasExistingIPS, setHasExistingIPS] = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)

  if (showBuilder) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button 
            variant="outline" 
            onClick={() => setShowBuilder(false)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to IPS Overview
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">IPS Builder</h1>
          <p className="text-gray-600 mt-2">
            Configure your trading rules and risk parameters
          </p>
        </div>
        
        <IPSBuilderForm />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Investment Policy Statement</h1>
        <p className="text-gray-600 mt-2">
          Define your trading rules and criteria for consistent decision-making
        </p>
      </div>

      {!hasExistingIPS ? (
        // No IPS exists - show creation flow
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <FileText className="h-12 w-12 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">Create Your IPS</CardTitle>
              <p className="text-gray-600">
                Set up your trading rules based on your risk tolerance and strategy preferences
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Put Credit Spreads</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• IV & Delta criteria</li>
                    <li>• DTE preferences (7 vs 14)</li>
                    <li>• Premium targets</li>
                    <li>• Risk management rules</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Long Calls</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Strike selection</li>
                    <li>• Premium limits</li>
                    <li>• Time value requirements</li>
                    <li>• Exit strategies</li>
                  </ul>
                </div>
              </div>
              
              <div className="text-center">
                <Button size="lg" onClick={() => setShowBuilder(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Build My IPS
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        // IPS exists - show summary and edit options
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <CardTitle>Active IPS Configuration</CardTitle>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Risk Management</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Max Position Size:</span>
                      <span>5%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Open Positions:</span>
                      <span>3</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Collateral/Trade:</span>
                      <span>$300</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-3">PCS Criteria</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Min IV:</span>
                      <span>40%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delta Range:</span>
                      <span>0.10-0.25</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Min Premium:</span>
                      <span>20%</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-3">Trade Management</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Target Profit:</span>
                      <span>75%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avoid Earnings:</span>
                      <span>Yes</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Roll Early DTE:</span>
                      <span>3 days</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex gap-4">
                <Button variant="outline" onClick={() => setShowBuilder(true)}>
                  <Settings className="h-4 w-4 mr-2" />
                  Edit IPS
                </Button>
                <Button variant="outline">View Full Details</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}