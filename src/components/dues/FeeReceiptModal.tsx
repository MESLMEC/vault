import React, { useState } from 'react';
import { LedgerEntryView, Member, MemberStanding } from '../../lib/db/types';
import { formatDate, formatDateTime } from '../../lib/utils';
import { PaymentStatus, PaymentReceiptItem } from '../ui/PaymentStatus';
import meslLogo from '../../assets/mesl-logo.png';
import { SettleModal } from '../ui/SettleModal';

interface FeeReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: LedgerEntryView | null;
  member?: Member | null;
  standing?: MemberStanding | null;
}

export const FeeReceiptModal: React.FC<FeeReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
  member,
  standing,
}) => {
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !transaction) return null;

  const rawAmount = transaction.lines.reduce((s, l) => s + l.amount, 0);
  const amount = Math.abs(rawAmount);
  const memberName = transaction.member_name || member?.name || standing?.who_name || 'Lab Member';
  const memberBatch = member?.batch ? ` (Batch ${member.batch})` : '';
  const whoPaid = `${memberName}${memberBatch}`;
  const receiptId = `MESL-${String(transaction.id).padStart(5, '0')}`;
  const dateFormatted = transaction.occurred_on ? formatDate(transaction.occurred_on) : 'Today';
  const dateTimeFormatted = transaction.recorded_at ? formatDateTime(transaction.recorded_at) : dateFormatted;

  const receiptItems: PaymentReceiptItem[] = [
    {
      name: transaction.note || 'Member Weekly Fee Payment',
      quantity: 1,
      price: `৳${amount.toLocaleString()}`,
    },
    ...(standing && standing.balance !== undefined
      ? [
          {
            name:
              standing.balance >= 0
                ? 'Account Standing: In Advance / Settled'
                : `Overdue Dues: ${standing.weeks_overdue || 1} week(s) behind`,
            price:
              standing.balance >= 0
                ? `৳${Math.abs(standing.balance).toLocaleString()} credit`
                : `৳${Math.abs(standing.balance).toLocaleString()} owed`,
          },
        ]
      : []),
  ];

  const handleDownloadImage = async () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Preload lab logo
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = meslLogo;
      await new Promise<void>((resolve) => {
        if (logoImg.complete && logoImg.naturalWidth > 0) {
          resolve();
        } else {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => resolve();
        }
      });

      const scale = 3;
      const width = 420;
      const hasBreakdown = receiptItems && receiptItems.length > 1;
      const breakdownBoxHeight = hasBreakdown ? 28 + receiptItems.length * 20 : 0;
      const height = 500 + (hasBreakdown ? breakdownBoxHeight + 14 : 0);

      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      // Helper vector icon drawers
      const drawUserIcon = (cx: number, cy: number, color = '#525252') => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy - 2.5, 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 5, 5, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.restore();
      };

      const drawCalendarIcon = (cx: number, cy: number, color = '#525252') => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.roundRect(cx - 6, cy - 5, 12, 11, 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 7);
        ctx.lineTo(cx - 3, cy - 5);
        ctx.moveTo(cx + 3, cy - 7);
        ctx.lineTo(cx + 3, cy - 5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 1);
        ctx.lineTo(cx + 6, cy - 1);
        ctx.stroke();
        ctx.restore();
      };

      const drawCopyIcon = (cx: number, cy: number, color = '#6B6B6B') => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy + 2);
        ctx.lineTo(cx - 4, cy - 4);
        ctx.lineTo(cx + 2, cy - 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(cx - 2, cy - 2, 7, 7, 1.5);
        ctx.stroke();
        ctx.restore();
      };

      const drawShieldCheckIcon = (cx: number, cy: number, color = '#34D399') => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 6.5);
        ctx.lineTo(cx + 5.5, cy - 4);
        ctx.lineTo(cx + 5.5, cy);
        ctx.quadraticCurveTo(cx + 5.5, cy + 5.5, cx, cy + 7);
        ctx.quadraticCurveTo(cx - 5.5, cy + 5.5, cx - 5.5, cy);
        ctx.lineTo(cx - 5.5, cy - 4);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 2.8, cy);
        ctx.lineTo(cx - 0.5, cy + 2.5);
        ctx.lineTo(cx + 3, cy - 1.8);
        ctx.stroke();
        ctx.restore();
      };

      // Card Background (EasyUI dark modal aesthetic)
      ctx.fillStyle = '#0E0E0E';
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 20);
      ctx.fill();

      ctx.strokeStyle = '#1F1F1F';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Centered Lab Logo Emblem
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(210, 68, 32, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.drawImage(logoImg, 210 - 32, 68 - 32, 64, 64);
        ctx.restore();

        // Subtle dark border ring
        ctx.strokeStyle = '#262626';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(210, 68, 32, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Emerald Checkmark Badge at bottom-right of logo
      ctx.beginPath();
      ctx.arc(232, 90, 11, 0, Math.PI * 2);
      ctx.fillStyle = '#10B981';
      ctx.fill();
      ctx.strokeStyle = '#0E0E0E';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(232 - 4.5, 90 + 0.5);
      ctx.lineTo(232 - 1, 90 + 3.8);
      ctx.lineTo(232 + 4.5, 90 - 3);
      ctx.strokeStyle = '#0E0E0E';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Heading
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText('Payment Successful', 210, 134);

      // Subtitle
      ctx.font = '13px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText('Mechatronics and Embedded System Lab', 210, 156);

      // Amount Pill (centered)
      const amountText = `৳${amount.toLocaleString()}`;
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      const labelW = ctx.measureText('Amount').width;
      ctx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      const valW = ctx.measureText(amountText).width;
      const pillW = labelW + valW + 36;
      const pillH = 30;
      const pillX = 210 - pillW / 2;
      const pillY = 176;

      ctx.fillStyle = '#141414';
      ctx.strokeStyle = '#1F1F1F';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 15);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#6B6B6B';
      ctx.fillText('Amount', pillX + 14, pillY + 19);

      ctx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText(amountText, pillX + 14 + labelW + 8, pillY + 19);

      // Divider Line 1
      ctx.strokeStyle = '#1F1F1F';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(28, 226);
      ctx.lineTo(width - 28, 226);
      ctx.stroke();

      // Row 1: Name
      ctx.textAlign = 'left';
      ctx.font = '12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText('Name', 28, 254);

      ctx.textAlign = 'right';
      ctx.font = '500 13px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText(whoPaid, 392, 254);
      const nameW = ctx.measureText(whoPaid).width;
      drawUserIcon(392 - nameW - 12, 250);

      // Row 2: Date & Time
      ctx.textAlign = 'left';
      ctx.font = '12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText('Date & Time', 28, 290);

      ctx.textAlign = 'right';
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText(dateTimeFormatted, 392, 290);
      const dateW = ctx.measureText(dateTimeFormatted).width;
      drawCalendarIcon(392 - dateW - 12, 286);

      // Row 3: Trx ID
      ctx.textAlign = 'left';
      ctx.font = '12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText('Trx ID', 28, 326);

      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      const trxW = ctx.measureText(receiptId).width;
      const badgeW = trxW + 28;
      const badgeH = 22;
      const badgeX = 392 - badgeW;
      const badgeY = 313;

      ctx.fillStyle = '#141414';
      ctx.strokeStyle = '#1F1F1F';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText(receiptId, badgeX + 7, badgeY + 15);
      drawCopyIcon(badgeX + badgeW - 10, badgeY + 11);

      // Row 4: Amount
      ctx.textAlign = 'left';
      ctx.font = '12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText('Amount', 28, 362);

      ctx.textAlign = 'right';
      ctx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#34D399';
      ctx.fillText(amountText, 392, 362);

      // Row 5: Authorized by
      ctx.textAlign = 'left';
      ctx.font = '12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#A1A1A1';
      ctx.fillText('Authorized by', 28, 398);

      ctx.textAlign = 'right';
      ctx.font = '500 12px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#FAFAFA';
      ctx.fillText('Treasurer', 392, 398);
      const authW = ctx.measureText('Treasurer').width;
      drawShieldCheckIcon(392 - authW - 12, 394);

      let curY = 422;

      // Optional Itemized Breakdown Box (when items exist)
      if (hasBreakdown) {
        const bH = 26 + receiptItems.length * 20;
        ctx.fillStyle = '#050505';
        ctx.strokeStyle = '#1F1F1F';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(28, curY, width - 56, bH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillStyle = '#6B6B6B';
        ctx.fillText('ITEMIZED BREAKDOWN', 40, curY + 17);

        receiptItems.forEach((item, idx) => {
          const rowY = curY + 36 + idx * 20;
          ctx.textAlign = 'left';
          ctx.font = '11px Inter, sans-serif';
          ctx.fillStyle = '#A1A1A1';
          const itemName = item.name.length > 36 ? item.name.slice(0, 34) + '...' : item.name;
          ctx.fillText(itemName, 40, rowY);

          ctx.textAlign = 'right';
          ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = '#FAFAFA';
          ctx.fillText(String(item.price), width - 40, rowY);
        });
        curY += bH + 16;
      }

      // Divider Line 2
      ctx.strokeStyle = '#1F1F1F';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(28, curY);
      ctx.lineTo(width - 28, curY);
      ctx.stroke();

      // Official Footer Record
      ctx.textAlign = 'center';
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = '#525252';
      ctx.fillText('AUTHORIZED TREASURY RECORD • MESL VAULT', 210, curY + 28);

      ctx.font = '11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#3F3F3F';
      ctx.fillText('Mechatronics and Embedded System Lab', 210, curY + 44);

      // Trigger download
      const imageUri = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `receipt-${receiptId.toLowerCase()}-${memberName.toLowerCase().replace(/\s+/g, '_')}.png`;
      downloadLink.href = imageUri;
      downloadLink.click();
    } catch (e) {
      console.error('Error generating receipt image:', e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SettleModal
      open={isOpen}
      onClose={onClose}
      hideCloseButton={true}
      containerClassName="z-[70]"
      zIndex={70}
      className="p-0 border-none bg-transparent shadow-none max-w-md"
    >
      <PaymentStatus
        status="success"
        logo={meslLogo}
        name={whoPaid}
        amount={amount}
        currency="৳"
        transactionId={receiptId}
        date={dateTimeFormatted}
        authorizedBy="Treasurer"
        description="Mechatronics and Embedded System Lab"
        items={receiptItems}
        onDownloadReceipt={handleDownloadImage}
        onClose={onClose}
        className="w-full max-w-md shadow-2xl"
      />
    </SettleModal>
  );
};
export default FeeReceiptModal;
