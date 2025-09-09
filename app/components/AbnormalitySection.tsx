import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';

type DiscrepancyItem = {
  name?: string;
  name_in_invoice?: string;
  name_in_delivery?: string;
  invoice_qty?: string;
  delivery_qty?: string;
  status?: string;
};

type MissingItem = {
  name: string;
  invoice_qty?: string;
  delivery_qty?: string;
};

type CrossVerificationData = {
  matched_items: Array<any>;
  missing_in_invoice: Array<MissingItem>;
  missing_in_delivery: Array<MissingItem>;
  discrepancies: Array<DiscrepancyItem>;
};

interface AbnormalitySectionProps {
  crossVerification: CrossVerificationData;
  invoiceId?: string;
  deliveryNoteNumber?: string;
}

const AbnormalitySection: React.FC<AbnormalitySectionProps> = ({
  crossVerification,
  invoiceId,
  deliveryNoteNumber
}) => {
  // Check if there are any abnormalities
  const hasAbnormalities = 
    crossVerification.missing_in_invoice?.length > 0 ||
    crossVerification.missing_in_delivery?.length > 0 ||
    crossVerification.discrepancies?.length > 0;
  
  if (!hasAbnormalities) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
        <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
        <p className="text-green-700">No abnormalities detected between invoice and delivery note.</p>
      </div>
    );
  }
  
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
      <div className="flex items-center mb-4">
        <AlertCircle className="h-6 w-6 text-amber-600 mr-2" />
        <h3 className="text-lg font-medium text-amber-800">
          Abnormalities Detected
        </h3>
      </div>
      
      {invoiceId && deliveryNoteNumber && (
        <div className="mb-4 text-amber-700 text-sm">
          <p>Comparing: Invoice <span className="font-medium">{invoiceId}</span> with Delivery Note <span className="font-medium">{deliveryNoteNumber}</span></p>
        </div>
      )}
      
      {/* Missing Items Section */}
      {crossVerification.missing_in_invoice?.length > 0 && (
        <div className="mb-5">
          <h4 className="font-medium text-amber-800 mb-2 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Items Missing in Invoice
          </h4>
          <div className="bg-white rounded-md border border-amber-200 overflow-hidden">
            <table className="min-w-full divide-y divide-amber-200">
              <thead className="bg-amber-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Item Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Delivery Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {crossVerification.missing_in_invoice.map((item, index) => (
                  <tr key={`missing-invoice-${index}`}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.delivery_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Missing in Delivery Note */}
      {crossVerification.missing_in_delivery?.length > 0 && (
        <div className="mb-5">
          <h4 className="font-medium text-amber-800 mb-2 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Items Missing in Delivery Note
          </h4>
          <div className="bg-white rounded-md border border-amber-200 overflow-hidden">
            <table className="min-w-full divide-y divide-amber-200">
              <thead className="bg-amber-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Item Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Invoice Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {crossVerification.missing_in_delivery.map((item, index) => (
                  <tr key={`missing-delivery-${index}`}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.invoice_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Discrepancies */}
      {crossVerification.discrepancies?.length > 0 && (
        <div className="mb-5">
          <h4 className="font-medium text-amber-800 mb-2 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            Item Discrepancies
          </h4>
          <div className="bg-white rounded-md border border-amber-200 overflow-hidden">
            <table className="min-w-full divide-y divide-amber-200">
              <thead className="bg-amber-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Discrepancy Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-700 tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {crossVerification.discrepancies.map((item, index) => (
                  <tr key={`discrepancy-${index}`}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                      {item.name || `${item.name_in_invoice || ""} / ${item.name_in_delivery || ""}`}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                      {item.status === "quantity_mismatch" ? "Quantity Mismatch" : 
                       item.status === "name_format_different" ? "Name Format Different" : 
                       item.status}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                      {item.status === "quantity_mismatch" ? (
                        <>Invoice: <span className="font-medium">{item.invoice_qty}</span> vs Delivery: <span className="font-medium">{item.delivery_qty}</span></>
                      ) : item.status === "name_format_different" ? (
                        <>Invoice: <span className="font-medium">{item.name_in_invoice}</span> vs Delivery: <span className="font-medium">{item.name_in_delivery}</span></>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Summary */}
      <div className="mt-4 p-3 bg-white rounded-md border border-amber-200">
        <p className="text-sm text-amber-800">
          <span className="font-medium">Summary:</span> {crossVerification.matched_items?.length || 0} items matched, {
            (crossVerification.missing_in_invoice?.length || 0) + 
            (crossVerification.missing_in_delivery?.length || 0) + 
            (crossVerification.discrepancies?.length || 0)
          } abnormalities detected
        </p>
      </div>
    </div>
  );
};

export default AbnormalitySection;