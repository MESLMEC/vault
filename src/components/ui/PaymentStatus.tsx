'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  AlertCircle,
  RotateCcw,
  Copy,
  Download,
  Receipt,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  User,
  Calendar,
  X
} from 'lucide-react';
import { cn, copyToClipboard } from '../../lib/utils';
import { motionTransitions } from '../../lib/motion-tokens';

export type PaymentLifecycleStatus =
  | 'processing'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'refunded';

export interface PaymentReceiptItem {
  name: string;
  quantity?: number;
  price: string | number;
}

export interface PaymentStatusProps {
  /** Optional logo element or image URL */
  logo?: React.ReactNode;
  /** Current payment status */
  status?: PaymentLifecycleStatus;
  /** Member or payer name */
  name?: string;
  /** Formatted payment amount (e.g. "৳100" or 100) */
  amount?: string | number;
  /** Currency code or symbol */
  currency?: string;
  /** Unique transaction reference ID */
  transactionId?: string;
  /** Transaction date */
  date?: string | Date;
  /** Authorized by label */
  authorizedBy?: string;
  /** Optional custom title */
  title?: string;
  /** Optional custom subtitle (note: purchase confirmation is omitted) */
  description?: string;
  /** Custom error message when status is 'failed' */
  errorMessage?: string;
  /** Refund reason or note when status is 'refunded' */
  refundReason?: string;
  /** Itemized summary items for receipt view */
  items?: PaymentReceiptItem[];
  /** Merchant or organization title */
  merchantName?: string;
  /** Retry payment handler */
  onRetry?: () => void;
  /** Change payment method handler */
  onChangePaymentMethod?: () => void;
  /** Custom handler when downloading receipt */
  onDownloadReceipt?: () => void;
  /** Custom handler when viewing receipt */
  onViewReceipt?: () => void;
  /** Close callback */
  onClose?: () => void;
  /** Custom class name */
  className?: string;
}

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  logo,
  status = 'success',
  name = 'Lab Member',
  amount = '100',
  currency = '৳',
  transactionId = 'tx_9842a8d11c7f',
  date = 'Today at 3:42 PM',
  authorizedBy = 'Treasurer (Mechatronics and Embedded System Lab)',
  title,
  description = 'Mechatronics and Embedded System Lab (MESL)',
  errorMessage = "Payment couldn't be completed. Request was refused.",
  refundReason = 'Refunded to member account.',
  items,
  merchantName = 'Mechatronics and Embedded System Lab',
  onRetry,
  onChangePaymentMethod,
  onDownloadReceipt,
  onViewReceipt,
  onClose,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [showReceiptDetails, setShowReceiptDetails] = useState(false);

  const formattedAmount =
    typeof amount === 'number'
      ? `${currency}${amount.toLocaleString()}`
      : String(amount).startsWith(currency)
      ? String(amount)
      : `${currency}${amount}`;

  const formattedDate =
    date instanceof Date
      ? date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : date;

  const handleCopyId = () => {
    copyToClipboard(transactionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (onDownloadReceipt) {
      onDownloadReceipt();
    } else {
      const receiptText = `========================================
OFFICIAL RECEIPT
Mechatronics and Embedded System Lab (MESL)
========================================
Transaction ID : ${transactionId}
Date & Time    : ${formattedDate}
Member Name    : ${name}
Amount Paid    : ${formattedAmount}
Authorized By  : ${authorizedBy}
Status         : ${status.toUpperCase()}
${items && items.length > 0 ? `\nBreakdown:\n${items.map((i) => `- ${i.name}${i.quantity ? ` (${i.quantity}x)` : ''}: ${i.price}`).join('\n')}` : ''}
========================================
`;
      const blob = new Blob([receiptText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${transactionId}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      className={cn(
        'w-full max-w-md mx-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-7 text-left font-sans text-zinc-900 dark:text-zinc-100 shadow-2xl transition-all select-none relative',
        className
      )}
    >
      {/* Optional Close Button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex flex-col items-center text-center">
        {/* Status Indicator Badge or Logo with Status Badge */}
        {logo ? (
          <div className="relative mb-5">
            {typeof logo === 'string' ? (
              <div className="w-16 h-16 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white shadow-md flex items-center justify-center p-0.5">
                <img src={logo} alt="Organization Logo" className="w-full h-full object-contain rounded-full" />
              </div>
            ) : (
              logo
            )}
            {status === 'success' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 500, damping: 25 }}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-white shadow"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </motion.div>
            )}
            {status === 'failed' && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-white shadow">
                <AlertCircle className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            )}
          </div>
        ) : (
          <div className="relative mb-5">
            {status === 'processing' && (
              <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center relative">
                <motion.div
                  className="absolute inset-0 rounded-full border border-zinc-400/40 border-t-zinc-800 dark:border-t-white"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
                <CreditCard className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
              </div>
            )}

            {status === 'verifying' && (
              <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center relative">
                <motion.div
                  className="absolute inset-1 rounded-full border border-sky-400/40 border-t-sky-500"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <ShieldCheck className="w-6 h-6 text-sky-500" />
              </div>
            )}

            {status === 'success' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={motionTransitions.springSnappy}
                className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 relative"
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M20 6L9 17l-5-5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
                  />
                </svg>
              </motion.div>
            )}

            {status === 'failed' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={motionTransitions.springSnappy}
                className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400"
              >
                <AlertCircle className="w-7 h-7" />
              </motion.div>
            )}

            {status === 'refunded' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={motionTransitions.springSnappy}
                className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400"
              >
                <RotateCcw className="w-6 h-6" />
              </motion.div>
            )}
          </div>
        )}

        {/* Heading and Subtext */}
        <h3 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {title || (
            status === 'processing' ? 'Processing Payment' :
            status === 'verifying' ? 'Verifying Transaction' :
            status === 'success' ? 'Payment Successful' :
            status === 'failed' ? "Payment Couldn't Be Completed" :
            'Payment Refunded'
          )}
        </h3>

        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs leading-relaxed">
          {status === 'processing' && 'Communicating with vault ledger...'}
          {status === 'verifying' && 'Confirming treasury authorization...'}
          {status === 'success' && description}
          {status === 'failed' && errorMessage}
          {status === 'refunded' && refundReason}
        </p>

        {/* Amount Pill */}
        <div className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">Amount</span>
          <span className="text-sm font-semibold font-mono text-zinc-900 dark:text-zinc-100">
            {formattedAmount}
          </span>
        </div>
      </div>

      {/* Transaction Details Staggered Card */}
      <AnimatePresence mode="wait">
        {(status === 'success' || status === 'refunded') && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={motionTransitions.springGentle}
            className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5 text-xs"
          >
            {/* Member Name */}
            <div className="flex items-center justify-between py-1">
              <span className="text-zinc-500 dark:text-zinc-400">Name</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                {name}
              </span>
            </div>

            {/* Date & Time */}
            <div className="flex items-center justify-between py-1">
              <span className="text-zinc-500 dark:text-zinc-400">Date & Time</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                {formattedDate}
              </span>
            </div>

            {/* Transaction ID */}
            <div className="flex items-center justify-between py-1">
              <span className="text-zinc-500 dark:text-zinc-400">Trx ID</span>
              <button
                type="button"
                onClick={handleCopyId}
                className="inline-flex items-center gap-1 font-mono text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors focus-ring px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                title="Copy Transaction ID"
              >
                <span>{transactionId}</span>
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-400" />}
              </button>
            </div>

            {/* Amount */}
            <div className="flex items-center justify-between py-1">
              <span className="text-zinc-500 dark:text-zinc-400">Amount</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formattedAmount}</span>
            </div>

            {/* Authorized By */}
            <div className="flex items-start justify-between py-1 gap-2">
              <span className="text-zinc-500 dark:text-zinc-400 shrink-0">Authorized by</span>
              <span className="text-zinc-900 dark:text-zinc-100 text-right font-medium text-[11px] leading-tight flex items-center gap-1.5 justify-end">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                {authorizedBy}
              </span>
            </div>

            {/* Receipt Actions */}
            <div className="pt-4 mt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
              {items && items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowReceiptDetails(!showReceiptDetails);
                    onViewReceipt?.();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors focus-ring cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{showReceiptDetails ? 'Hide Details' : 'View Receipt'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors focus-ring cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Download Receipt</span>
              </button>
            </div>

            {/* Unfolding Receipt Item Breakdown */}
            <AnimatePresence>
              {showReceiptDetails && items && items.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={motionTransitions.springGentle}
                  className="overflow-hidden pt-2 space-y-1.5 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <p className="text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-500 tracking-wider mb-1">
                    Itemized Breakdown
                  </p>
                  {items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                      <span>
                        {item.quantity ? `${item.quantity}x ` : ''}
                        {item.name}
                      </span>
                      <span className="font-mono text-zinc-900 dark:text-zinc-100">{item.price}</span>
                    </div>
                  ))}
                  <div className="pt-2 mt-1 border-t border-zinc-200 dark:border-zinc-800 flex justify-between font-medium text-xs text-zinc-900 dark:text-zinc-100">
                    <span>Total Paid</span>
                    <span className="font-mono">{formattedAmount}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={motionTransitions.springGentle}
            className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 space-y-2"
          >
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium text-xs sm:text-sm transition-all focus-ring shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            )}

            {onChangePaymentMethod && (
              <button
                type="button"
                onClick={onChangePaymentMethod}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white font-medium text-xs transition-colors focus-ring cursor-pointer"
              >
                <span>Change Payment Method</span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PaymentStatus;
