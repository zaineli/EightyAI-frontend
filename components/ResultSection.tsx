'use client';

import React, { useEffect, useState } from "react";

function ResultSection() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setResult(null);

    let interval: NodeJS.Timeout;

    const pollResult = async () => {
      try {
        const res = await fetch("http://localhost:8000/llm-results/");
        if (res.ok) {
          const data = await res.json();
          if (data.response) {
            setResult(data.response);
            setLoading(false);
            clearInterval(interval);
          }
        }
      } catch (err) {
        // handle error if needed
      }
    };

    interval = setInterval(pollResult, 2000);
    pollResult();

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 p-4 bg-gray-50 rounded text-black">
      {loading && !result && <p>Processing... Please wait.</p>}
      {result && (
        <>
          <h2 className="font-bold mb-2">LLM Result</h2>
          <pre className="bg-white p-2 rounded">{result}</pre>
        </>
      )}
    </div>
  );
}

export default ResultSection;