import { LINE_OA_ID } from '../shared/print-request.js';
import { syncSets } from './sets.js';
const examples = [
 ['Dreamscape postcards','ภาพแฟนตาซีเต็มใบ ให้โลกในจินตนาการมีที่อยู่','postcard','dream-postcards.webp','50% 50%'],
 ['Pocket character club','คาแรกเตอร์ใบเล็ก จัดเป็นคอลเลกชันสะสม','collectible','character-cards.webp','50% 50%'],
 ['Neon after hours','แสงสีในโลกดิจิทัล สู่คอลเลกชันเมืองยามค่ำ','collectible','neon-cards.webp','50% 50%'],
 ['A little woodland','สวนเล็กในจินตนาการ สำหรับคนอยากเก็บทุกลาย','postcard','botanical-cards.webp','50% 50%'],
 ['A note from the artist','การ์ดแถมและข้อความขอบคุณในทุกแพ็ก','extra','thank-you-cards.webp','50% 50%'],
 ['Your artist alley','จับคู่หลายรูปแบบให้บูธมีเรื่องราวเดียวกัน','extra','creator-hero.webp','50% 50%']
];
const gallery = document.querySelector('#gallery');
for (const [title, description, category, image, position] of examples) {
 const card = document.createElement('article'); card.dataset.category = category;
 const button = document.createElement('button'); button.type='button'; button.setAttribute('aria-label',`ดูภาพ ${title}`);
 const img = document.createElement('img'); img.src=`assets/${image}`; img.alt=description; img.loading='lazy'; img.style.objectPosition=position;
 const h = document.createElement('h3'); h.textContent=title;
 const p = document.createElement('p'); p.textContent=description;
 button.append(img,h,p); card.append(button); gallery.append(card);
 button.addEventListener('click',()=>{document.querySelector('#artImage').src=img.src;document.querySelector('#artImage').alt=description;document.querySelector('#artTitle').textContent=title;document.querySelector('#artDialog').showModal();});
}
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 gallery.querySelectorAll('article').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter);
}));
const materials=[
 ['อาร์ตด้าน 300 แกรม','ผิวเรียบ สำหรับภาพวาดและรายละเอียด เป็นจุดเริ่มต้นสำหรับการ์ดขายเป็นคอลเลกชัน','material-art-matte-300.png'],
 ['อาร์ตด้าน 250 แกรม','น้ำหนักเบาลง สำหรับการ์ดแนบสินค้าและงานแจก ลองเทียบสัมผัสกับ 300 แกรมก่อนเลือก','material-art-matte-250.png'],
 ['การ์ดขาว 300 แกรม','พื้นขาวสำหรับงานเส้นและข้อความ หากต้องการเซ็นชื่อควรทดลองปากกากับผิวจริง','material-white-card-300.png'],
 ['คราฟท์ 300 แกรม','ให้พื้นสีน้ำตาลเป็นส่วนหนึ่งของภาพ สีวัสดุมีผลกับสีพิมพ์ เหมาะกับงานที่ออกแบบเผื่อไว้','material-kraft-300.png'],
 ['PET ขาวด้าน 275 ไมครอน','แผ่นสังเคราะห์สำหรับคอลเลกชันอีกสัมผัส ดูตัวอย่างจริงเพื่อเทียบผิวและความยืดหยุ่น','material-pet-white-275.png'],
 ['PET ขุ่นไข 250 ไมครอน','เล่นกับพื้นที่ว่างและความโปร่งแสง ให้ทีมงานตรวจวิธีพิมพ์และการรองขาวก่อนผลิต','material-pet-translucent-250.png']
];
for (const [name,description,file] of materials){
 const article=document.createElement('article'); const img=document.createElement('img');img.src=`../business-card/assets/${file}`;img.alt=name;img.loading='lazy';
 const h=document.createElement('h3');h.textContent=name;const p=document.createElement('p');p.textContent=description;article.append(img,h,p);document.querySelector('#materialGrid').append(article);
 const option=document.createElement('option');option.textContent=name;document.querySelector('#materialSelect').append(option);
}
const form=document.querySelector('#briefForm');
const total=()=>{document.querySelector('#total').textContent=`รวม ${Number(form.elements.designs.value||0)*Number(form.elements.quantity.value||0)} ใบ · ทีมงานยืนยันขั้นต่ำและราคาอีกครั้ง`;};
form.addEventListener('input',total);total();
// the sets may be replaced by the ones from Set Studio, so the click is handled on the page, not on each button
document.addEventListener('click',event=>{const b=event.target.closest('.choose-plan');if(!b)return;form.elements.plan.value=b.dataset.plan;document.querySelector('#brief').scrollIntoView();form.elements.plan.focus({preventScroll:true});});
syncSets({grid:document.querySelector('#setGrid'),form});
form.addEventListener('submit',event=>{event.preventDefault();const d=new FormData(form);const text=`ขอใบเสนอราคา งานการ์ด / โปสการ์ด\nแผน: ${d.get('plan')}\nขนาด: ${d.get('size')}\nวัสดุ: ${d.get('material')}\n${d.get('designs')} แบบ × ${d.get('quantity')} ใบ = ${Number(d.get('designs'))*Number(d.get('quantity'))} ใบ\nวันที่ต้องใช้: ${d.get('date')||'ยังไม่กำหนด'}\nไฟล์: ${d.get('file')||'ส่งภายหลัง'}\nเพิ่มเติม: ${d.get('note')||'-'}`;
document.querySelector('#briefText').value=text;document.querySelector('#lineLink').href=`https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(text)}`;document.querySelector('#copyStatus').textContent='';document.querySelector('#briefDialog').showModal();});
document.querySelector('#copyBrief').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.querySelector('#briefText').value);document.querySelector('#copyStatus').textContent='คัดลอกแล้ว เปิด LINE แล้ววางข้อความได้เลย';}catch{document.querySelector('#briefText').select();document.querySelector('#copyStatus').textContent='เลือกข้อความแล้ว กรุณาคัดลอกจากช่องด้านบน';}});
document.querySelectorAll('dialog').forEach(dialog=>{dialog.querySelector('.close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});});
