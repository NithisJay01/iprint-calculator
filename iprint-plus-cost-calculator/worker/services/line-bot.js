// Customer-facing LINE replies. This stays deterministic: it acknowledges requests and
// collects a complete print brief, while pricing and production commitments remain human-reviewed.

const QUICK_REPLY = items => ({ items: items.map(({ label, text, data }) => ({
  type: 'action', action: { type: data ? 'postback' : 'message', label, ...(data ? { data, displayText: text } : { text }) }
})) });

const HOME = () => ({
  type: 'flex',
  altText: 'ยินดีต้อนรับสู่ iPrint — เลือกบริการที่ต้องการ',
  contents: {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      backgroundColor: '#0A8CFF',
      contents: [
        { type: 'text', text: 'iPrint', color: '#FFFFFF', size: 'xxl', weight: 'bold' },
        { type: 'text', text: 'พิมพ์งานแบบเห็นภาพ', color: '#EAF5FF', size: 'sm', margin: 'sm' }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      contents: [
        { type: 'text', text: 'สวัสดี 👋', size: 'xl', weight: 'bold', color: '#12385E' },
        {
          type: 'text',
          text: 'บอกสิ่งที่อยากพิมพ์ ส่งไฟล์ หรือให้ทีมช่วยออกแบบได้เลย',
          size: 'sm',
          color: '#52677D',
          margin: 'md',
          wrap: true
        },
        { type: 'separator', margin: 'xl', color: '#D8E8F7' },
        {
          type: 'button',
          margin: 'lg',
          height: 'sm',
          style: 'primary',
          color: '#0A8CFF',
          action: { type: 'postback', label: 'ขอใบเสนอราคา', data: 'action=quote', displayText: 'ขอใบเสนอราคา' }
        },
        {
          type: 'button',
          margin: 'sm',
          height: 'sm',
          style: 'secondary',
          action: { type: 'postback', label: 'ส่งไฟล์งาน', data: 'action=artwork', displayText: 'ส่งไฟล์งาน' }
        },
        {
          type: 'button',
          margin: 'sm',
          height: 'sm',
          style: 'secondary',
          action: { type: 'postback', label: 'ต้องการออกแบบ', data: 'action=design', displayText: 'ต้องการออกแบบ' }
        },
        {
          type: 'button',
          margin: 'sm',
          height: 'sm',
          style: 'secondary',
          action: { type: 'postback', label: 'ติดตามสถานะงาน', data: 'action=status', displayText: 'ติดตามสถานะงาน' }
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      backgroundColor: '#F4F9FE',
      contents: [
        {
          type: 'text',
          text: 'เมนูอื่น ๆ เลือกได้จาก Rich Menu ด้านล่าง',
          size: 'xs',
          color: '#5F7489',
          align: 'center',
          wrap: true
        }
      ]
    },
    styles: { footer: { separator: true, separatorColor: '#D8E8F7' } }
  },
  quickReply: QUICK_REPLY([
    { label: 'ขอใบเสนอราคา', text: 'ขอใบเสนอราคา', data: 'action=quote' },
    { label: 'ส่งไฟล์งาน', text: 'ส่งไฟล์งาน', data: 'action=artwork' },
    { label: 'ต้องการออกแบบ', text: 'ต้องการออกแบบ', data: 'action=design' },
    { label: 'ติดตามสถานะ', text: 'ติดตามสถานะงาน', data: 'action=status' },
    { label: 'คุยกับทีมงาน', text: 'คุยกับทีมงาน', data: 'action=staff' }
  ])
});

const REPLIES = {
  quote: 'ขอใบเสนอราคาได้เลย 🧾\nส่งข้อมูลตามนี้ได้ในข้อความเดียว:\n• ประเภทงาน\n• ขนาด\n• จำนวน\n• วัสดุ/เทคนิคพิเศษ\n• วันที่ต้องการรับงาน\n• แนบไฟล์หรือรูปตัวอย่าง (ถ้ามี)\n\nทีมงานจะตรวจรายละเอียดและตอบกลับ',
  artwork: 'ส่งไฟล์งานหรือรูปตัวอย่างมาได้เลย 📎\nโปรดแจ้งประเภทงาน ขนาด จำนวน และวันที่ต้องการรับงานเพิ่มด้วย เพื่อให้ทีมงานตรวจไฟล์และประเมินงานได้ครบถ้วน',
  design: 'ทีมออกแบบช่วยจัดทำงานให้ได้ ✨\nส่งข้อมูลที่ต้องการสื่อสาร เช่น ชื่อแบรนด์, โลโก้, เบอร์โทร/ช่องทางติดต่อ, สีหรือสไตล์ที่ชอบ พร้อมขนาดและจำนวนที่ต้องการ',
  status: 'เช็กสถานะงานได้ 🔎\nส่งเลขออร์เดอร์ หรือชื่อ/เบอร์โทรที่ใช้สั่งงานมาได้เลย ทีมงานจะตรวจสอบและแจ้งความคืบหน้า',
  staff: 'รับเรื่องให้ทีมงานแล้ว 🙌\nพิมพ์รายละเอียดงานหรือคำถามต่อได้เลย ทีมงานจะตรวจและตอบกลับโดยเร็ว'
};

const TICKET_ID_PATTERN = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;

function orderReceipt(event) {
  const text = String(event?.message?.text || '').trim();
  const isCartOrder = text.startsWith('ส่งออร์เดอร์ให้ทีมงานตรวจสอบ');
  const isPreviewRequest = text.startsWith('สอบถามงานนามบัตร รหัส ');
  if (!isCartOrder && !isPreviewRequest) return null;
  const ticketId = text.match(TICKET_ID_PATTERN)?.[0] || '';
  if (!ticketId) return null;
  const quoteNo = isCartOrder ? text.match(/เลขอ้างอิง:\s*([^\n]+)/)?.[1]?.trim() || ticketId : ticketId;
  const trackingUrl = `https://iprint.tchl.online/cart/track.html?id=${encodeURIComponent(ticketId)}`;
  return {
    type: 'text',
    text: `รับทราบ ✅\nทีมงานรับเรื่องตรวจสอบให้ และจะตอบกลับภายใน 24 ชั่วโมง\n\nเลขอ้างอิง: ${quoteNo}\nติดตามสถานะ: ${trackingUrl}`,
    quickReply: QUICK_REPLY([
      { label: 'ติดตามสถานะ', text: 'ติดตามสถานะงาน', data: 'action=status' },
      { label: 'คุยกับทีมงาน', text: 'คุยกับทีมงาน', data: 'action=staff' }
    ])
  };
}

function actionFor(event) {
  const data = String(event?.postback?.data || '');
  const match = data.match(/(?:^|&)action=([a-z]+)/);
  if (match) return match[1];
  const text = String(event?.message?.text || '').trim().toLowerCase();
  if (/^(สวัสดี|hello|hi|เริ่มต้น|start)$/.test(text)) return 'home';
  if (text.includes('ขอใบเสนอราคา')) return 'quote';
  if (/(ออกแบบ|ดีไซน์|designer)/.test(text)) return 'design';
  if (/(ส่งไฟล์|แนบไฟล์|อัปโหลด)/.test(text)) return 'artwork';
  if (/(สถานะ|เช็กงาน|เช็คงาน|เลขออร์เดอร์)/.test(text)) return 'status';
  if (/(พนักงาน|ทีมงาน|แอดมิน|เจ้าหน้าที่)/.test(text)) return 'staff';
  return '';
}

export function lineBotReply(event) {
  if (event?.source?.type !== 'user' || !event?.replyToken) return null;
  const receipt = orderReceipt(event);
  if (receipt) return receipt;
  const action = event.type === 'follow' ? 'home' : actionFor(event);
  if (action === 'home') return HOME();
  if (!REPLIES[action]) return null;
  return { type: 'text', text: REPLIES[action], quickReply: QUICK_REPLY([{ label: 'เมนูหลัก', text: 'เมนูหลัก', data: 'action=home' }]) };
}

export async function replyToLineEvents(events, { accessToken, fetchImpl = fetch }) {
  if (!accessToken) return 0;
  let replies = 0;
  for (const event of events) {
    const message = lineBotReply(event);
    if (!message) continue;
    try {
      const response = await fetchImpl('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyToken: event.replyToken, messages: [message] })
      });
      if (response.ok) replies += 1;
    } catch {
      // A reply failure must never prevent LINE from delivering or archiving a customer message.
    }
  }
  return replies;
}
