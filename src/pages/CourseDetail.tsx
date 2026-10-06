import React from 'react';
import { useParams, Link } from 'react-router-dom';

export default function CourseDetail() {
  const { courseId } = useParams();

  return (
    <div className="page-container">
      <div className="mb-4">
        <Link to="/courses" className="text-blue-500 hover:underline">&larr; Zpět na kurzy</Link>
      </div>
      <h1 className="text-3xl font-bold mb-4">Detail kurzu: {courseId}</h1>
      <p>Tato sekce se připravuje...</p>
    </div>
  );
}
