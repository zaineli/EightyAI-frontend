import ResultSection from "@/components/ResultSection";
import DocumentUploader from "../components/DocumentUploader";

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Document Management System
          </h1>
          <p className="text-gray-600">
            Upload and store your PDF and document files securely
          </p>
        </div>
        
        <DocumentUploader />
        <ResultSection />
      </div>
    </div>
  );
}