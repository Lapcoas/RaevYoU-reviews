(() => {
 'use strict';
 const $=id=>document.getElementById(id), fab=$('rvChatFab'), panel=$('rvChat');
 if(!fab||!panel)return;
 const msgs=$('rvChatMsgs'), form=$('rvChatForm'), input=$('rvChatText'), send=$('rvChatSend');
 let sb=null,conversation=null,channel=null,busy=false,known=new Set();
 const time=s=>new Date(s).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 function setTheme(light){panel.classList.toggle('light',light);try{localStorage.setItem('rv_chat_theme',light?'light':'dark')}catch(_){}}
 function append(m){
  if(known.has(String(m.id)))return;known.add(String(m.id));
  const empty=msgs.querySelector('.rv-chat-empty');if(empty)empty.remove();
  const el=document.createElement('div');el.className='rv-msg '+(m.sender==='visitor'?'visitor':'admin');el.dataset.id=String(m.id);el.textContent=m.body||'Вложение';
  const tm=document.createElement('time');tm.textContent=time(m.created_at);el.append(tm);msgs.append(el);msgs.scrollTop=msgs.scrollHeight;
 }
 async function init(){
  if(conversation)return;
  const api=window.ReviewsAPI;if(!api)throw new Error('Сервис пока не загружен');
  sb=await api.client();const user=await api.ensureVisitor();
  let q=await sb.from('conversations').select('*').eq('visitor_id',user.id).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data){q=await sb.from('conversations').insert({visitor_id:user.id,alias:'Аноним'}).select('*').single();if(q.error)throw q.error}
  conversation=q.data;
  const r=await sb.from('messages').select('*').eq('conversation_id',conversation.id).order('id',{ascending:true}).limit(300);
  if(r.error)throw r.error;
  msgs.replaceChildren();known.clear();(r.data||[]).forEach(append);
  channel=sb.channel('site-chat-'+conversation.id).on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'conversation_id=eq.'+conversation.id},p=>{
   if(p.eventType==='DELETE'){const el=msgs.querySelector('[data-id="'+p.old.id+'"]');if(el)el.remove();known.delete(String(p.old.id))}
   else if(p.new)append(p.new);
  }).subscribe(status=>{const s=$('rvChatStatus');if(s)s.textContent=status==='SUBSCRIBED'?'На связи · сообщения в реальном времени':'Подключаем чат…'});
 }
 fab.addEventListener('click',async()=>{panel.hidden=!panel.hidden;fab.textContent=panel.hidden?'✉':'×';if(!panel.hidden){try{await init();input.focus()}catch(e){msgs.replaceChildren();const p=document.createElement('p');p.className='rv-chat-empty';p.textContent=e.message||'Не удалось подключить чат. Обновите страницу.';msgs.append(p)}}});
 $('rvChatClose').addEventListener('click',()=>{panel.hidden=true;fab.textContent='✉'});
 $('rvChatTheme').addEventListener('click',()=>setTheme(!panel.classList.contains('light')));
 let light=false;try{light=localStorage.getItem('rv_chat_theme')==='light'}catch(_){}setTheme(light);
 input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px'});
 form.addEventListener('submit',async e=>{
  e.preventDefault();const body=input.value.trim();if(!body||busy)return;
  busy=true;send.disabled=true;
  try{await init();const {data,error}=await sb.from('messages').insert({conversation_id:conversation.id,sender:'visitor',body}).select('*').single();if(error)throw error;append(data);input.value='';input.style.height=''}
  catch(err){const p=document.createElement('p');p.className='rv-chat-empty';p.textContent=err.message||'Не удалось отправить сообщение';msgs.append(p)}
  finally{busy=false;send.disabled=false;input.focus()}
 });
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit()}});
 window.addEventListener('beforeunload',()=>{if(channel&&sb)sb.removeChannel(channel)});
})();