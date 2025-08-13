// src/components/debug-ips.tsx
'use client';

import { useState } from 'react';

export function DebugIPS() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  
  async function testCreate() {
    try {
      const response = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Debug Test IPS',
          description: 'Testing from browser',
          factors: []
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data);
        setResult(null);
      } else {
        setResult(data);
        setError(null);
      }
    } catch (e: any) {
      setError({ message: e.message });
      setResult(null);
    }
  }
  
  return (
    <div className="p-4 border rounded">
      <button 
        onClick={testCreate}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Test IPS Creation
      </button>
      
      {result && (
        <pre className="mt-4 p-2 bg-green-50 text-green-900">
          Success: {JSON.stringify(result, null, 2)}
        </pre>
      )}
      
      {error && (
        <pre className="mt-4 p-2 bg-red-50 text-red-900">
          Error: {JSON.stringify(error, null, 2)}
        </pre>
      )}
    </div>
  );
}