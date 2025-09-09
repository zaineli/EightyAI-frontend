import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';

interface CsvViewerProps {
  url: string;
  title?: string;
}

const CsvViewer: React.FC<CsvViewerProps> = ({ url, title = "Ledger Data" }) => {
  const [data, setData] = useState<string[][]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(0);
  const rowsPerPage = 10;

  useEffect(() => {
    const fetchCsv = async () => {
      try {
        setLoading(true);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch CSV data');
        }
        
        const csvText = await response.text();
        const rows = csvText.split('\n').map(row => row.split(','));
        
        setData(rows);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load CSV data');
        setLoading(false);
      }
    };

    fetchCsv();
  }, [url]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-60 bg-white rounded-lg border border-gray-200">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-60 bg-white rounded-lg border border-red-200">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  const headers = data.length > 0 ? data[0] : [];
  const rows = data.slice(1);
  const pageCount = Math.ceil(rows.length / rowsPerPage);
  const displayRows = rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handlePrevPage = () => {
    setPage(prev => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setPage(prev => Math.min(pageCount - 1, prev + 1));
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center">
          <FileSpreadsheet className="h-5 w-5 text-blue-600 mr-2" />
          <h3 className="font-medium text-gray-800">{title}</h3>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center space-x-2">
            <button 
              onClick={handlePrevPage} 
              disabled={page === 0}
              className={`p-1 rounded-full ${page === 0 ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm text-gray-500">
              {page + 1} / {pageCount}
            </span>
            <button 
              onClick={handleNextPage} 
              disabled={page === pageCount - 1}
              className={`p-1 rounded-full ${page === pageCount - 1 ? 'text-gray-300' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {headers.map((header, i) => (
                <th 
                  key={`header-${i}`} 
                  className="px-3 py-2 text-left text-xs font-medium tracking-wider bg-gray-50 text-gray-700"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.map((cell, cellIndex) => (
                  <td 
                    key={`cell-${rowIndex}-${cellIndex}`} 
                    className={`px-3 py-2 whitespace-nowrap text-sm ${
                      headers[cellIndex] === 'Anomaly Type' && cell.trim() !== '' ? 
                      'text-amber-700 bg-amber-50 font-medium' : 'text-gray-600'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-gray-50 border-t border-gray-200 text-center text-xs text-gray-500">
        Showing rows {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, rows.length)} of {rows.length}
      </div>
    </div>
  );
};

export default CsvViewer;