import React from 'react';
import { useParams, Link } from 'react-router-dom';

export default function TestTaker() {
  const { testId } = useParams();

  return (
    <div className="page-container">
      <div className="mb-4">
        <Link to="/" className="text-blue-500 hover:underline">&larr; Zpět</Link>
      </div>
      <h1 className="text-3xl font-bold mb-4">Test: {testId}</h1>
      <p>Tato sekce se připravuje...</p>
    </div>
  );
}
